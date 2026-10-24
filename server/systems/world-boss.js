'use strict';

const db = require('../db');

const OPCODES = {
  C_WORLD_BOSS_INFO:   0x6600,
  S_WORLD_BOSS_INFO:   0x6610,
  C_WORLD_BOSS_ATTACK: 0x6601,
  S_WORLD_BOSS_ATTACK: 0x6611,
  C_WORLD_BOSS_RANK:   0x6602,
  S_WORLD_BOSS_RANK:   0x6612,
};

const BOSSES = [
  { id: 1, name: 'Bloodfang',     baseHp: 5000000,  atk: 500,  def: 200, minLevel: 20,
    schedule: '11:35-12:35', goldReward: 50000, daruReward: 10000, expReward: 20000 },
  { id: 2, name: 'Redoga Drake',  baseHp: 10000000, atk: 800,  def: 350, minLevel: 30,
    schedule: '22:00-23:00', goldReward: 80000, daruReward: 15000, expReward: 35000 },
  { id: 3, name: 'Void Titan',    baseHp: 25000000, atk: 1200, def: 500, minLevel: 50,
    schedule: '20:00-21:00', goldReward: 120000, daruReward: 25000, expReward: 60000 },
];

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS world_boss (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      boss_id     INTEGER NOT NULL,
      current_hp  INTEGER NOT NULL,
      max_hp      INTEGER NOT NULL,
      active      INTEGER DEFAULT 1,
      started_at  TEXT DEFAULT (datetime('now')),
      ended_at    TEXT
    );
    CREATE TABLE IF NOT EXISTS world_boss_damage (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      boss_run  INTEGER NOT NULL,
      char_id   INTEGER NOT NULL REFERENCES characters(id),
      damage    INTEGER DEFAULT 0,
      attacks   INTEGER DEFAULT 0,
      last_attack TEXT DEFAULT (datetime('now')),
      UNIQUE(boss_run, char_id)
    );
  `);
}

function getActiveBoss() {
  return db.getDatabase()
    .prepare('SELECT * FROM world_boss WHERE active = 1 ORDER BY id DESC LIMIT 1')
    .get();
}

function spawnBoss(bossId) {
  const template = BOSSES.find(b => b.id === bossId);
  if (!template) return null;

  // Deactivate current boss
  db.getDatabase().prepare('UPDATE world_boss SET active = 0 WHERE active = 1').run();

  const result = db.getDatabase().prepare(`
    INSERT INTO world_boss (boss_id, current_hp, max_hp) VALUES (?, ?, ?)
  `).run(bossId, template.baseHp, template.baseHp);

  return { id: result.lastInsertRowid, ...template, currentHp: template.baseHp };
}

function getBossInfo(charId) {
  let boss = getActiveBoss();
  if (!boss) {
    // Auto-spawn first boss
    spawnBoss(1);
    boss = getActiveBoss();
  }
  if (!boss) return { active: false };

  const template = BOSSES.find(b => b.id === boss.boss_id);
  const myDmg = db.getDatabase()
    .prepare('SELECT damage, attacks FROM world_boss_damage WHERE boss_run = ? AND char_id = ?')
    .get(boss.id, charId);

  return {
    active: true,
    bossId: boss.boss_id,
    bossName: template.name,
    currentHp: boss.current_hp,
    maxHp: boss.max_hp,
    hpPercent: Math.floor(boss.current_hp / boss.max_hp * 100),
    schedule: template.schedule,
    myDamage: myDmg ? myDmg.damage : 0,
    myAttacks: myDmg ? myDmg.attacks : 0,
  };
}

function attackBoss(charId) {
  const boss = getActiveBoss();
  if (!boss) return { success: false, msg: 'No active boss' };
  if (boss.current_hp <= 0) return { success: false, msg: 'Boss is dead' };

  const char = db.getCharacterById(charId);
  if (!char) return { success: false };

  const template = BOSSES.find(b => b.id === boss.boss_id);
  if (char.grade < template.minLevel) return { success: false, msg: `Level ${template.minLevel} required` };

  // Damage calculation: player attack vs boss defense + random variance
  const baseDmg = Math.max(1, Math.floor(char.attack * char.attack / (char.attack + template.def)));
  const variance = 0.8 + Math.random() * 0.4;
  const crit = Math.random() < 0.15;
  const damage = Math.floor(baseDmg * variance * (crit ? 2.0 : 1.0));

  // Apply damage
  const newHp = Math.max(0, boss.current_hp - damage);
  db.getDatabase().prepare('UPDATE world_boss SET current_hp = ? WHERE id = ?').run(newHp, boss.id);

  // Track player damage
  db.getDatabase().prepare(`
    INSERT INTO world_boss_damage (boss_run, char_id, damage, attacks)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(boss_run, char_id) DO UPDATE SET
      damage = damage + excluded.damage,
      attacks = attacks + 1,
      last_attack = datetime('now')
  `).run(boss.id, charId, damage);

  // Devotion: world_boss task
  const devotion = require('./devotion');
  devotion.completeTask(charId, 'world_boss');

  // Quest progress
  const quest = require('./quest');
  quest.updateProgress(charId, 'world_boss', 'any');

  // Check if boss died
  let killed = false;
  if (newHp <= 0) {
    killed = true;
    db.getDatabase().prepare("UPDATE world_boss SET active = 0, ended_at = datetime('now') WHERE id = ?").run(boss.id);
    distributeRewards(boss.id, boss.boss_id);
    // Spawn next boss
    const nextBossId = boss.boss_id < BOSSES.length ? boss.boss_id + 1 : 1;
    spawnBoss(nextBossId);
  }

  return {
    success: true,
    damage,
    crit,
    bossHp: newHp,
    bossMaxHp: boss.max_hp,
    killed,
  };
}

function distributeRewards(bossRunId, bossId) {
  const template = BOSSES.find(b => b.id === bossId);
  if (!template) return;

  const participants = db.getDatabase()
    .prepare('SELECT * FROM world_boss_damage WHERE boss_run = ? ORDER BY damage DESC')
    .all(bossRunId);

  const totalDmg = participants.reduce((s, p) => s + p.damage, 0) || 1;

  for (let i = 0; i < participants.length; i++) {
    const p = participants[i];
    const ratio = p.damage / totalDmg;
    const rankBonus = i < 3 ? 2.0 : i < 10 ? 1.5 : 1.0;

    const goldReward = Math.floor(template.goldReward * ratio * rankBonus);
    const expReward = Math.floor(template.expReward * ratio * rankBonus);

    db.getDatabase().prepare('UPDATE characters SET gold = gold + ?, exp = exp + ? WHERE id = ?')
      .run(goldReward, expReward, p.char_id);
  }
}

function getRanking(charId) {
  const boss = getActiveBoss();
  if (!boss) return { ranking: [] };

  const rows = db.getDatabase().prepare(`
    SELECT d.*, c.nick_name, c.grade, c.camp
    FROM world_boss_damage d JOIN characters c ON d.char_id = c.id
    WHERE d.boss_run = ?
    ORDER BY d.damage DESC LIMIT 50
  `).all(boss.id);

  return {
    ranking: rows.map((r, i) => ({
      rank: i + 1,
      charId: r.char_id,
      name: r.nick_name,
      level: r.grade,
      damage: r.damage,
      attacks: r.attacks,
    })),
  };
}

module.exports = {
  OPCODES, BOSSES,
  initDB, getBossInfo, attackBoss, getRanking, spawnBoss,
};
