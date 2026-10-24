'use strict';

const db = require('../db');

const OPCODES = {
  C_EUDAEMON_LIST:      0x7300,
  S_EUDAEMON_LIST_RSP:  0x7310,
  C_EUDAEMON_SUMMON:    0x7301,
  S_EUDAEMON_UPDATE:    0x7311,
  C_EUDAEMON_EQUIP:     0x7302,
  C_EUDAEMON_LEVEL_UP:  0x7303,
  C_EUDAEMON_STAR_UP:   0x7304,
  C_EUDAEMON_SKILL:     0x7305,
  C_PATROL_START:       0x7306,
  S_PATROL_UPDATE:      0x7316,
  C_PATROL_COLLECT:     0x7307,
  C_PATROL_LIST:        0x7308,
  S_PATROL_LIST_RSP:    0x7318,
};

const MIN_LEVEL = 70;
const MAX_LEVEL = 80;
const MAX_STARS = 10;
const MAX_SKILL_SLOTS = 4;
const MAX_PATROLS = 3;

const EUDAEMON_TYPES = {
  1: { name: 'Wind Ranger',   gender: 'M', class: 'archer',  hp: 500, atk: 80, def: 30, matk: 20, mdef: 25, hpGrow: 45, atkGrow: 8, defGrow: 3, matkGrow: 2, mdefGrow: 2.5 },
  2: { name: 'Wind Ranger',   gender: 'F', class: 'archer',  hp: 520, atk: 70, def: 35, matk: 25, mdef: 30, hpGrow: 46, atkGrow: 7, defGrow: 3.5, matkGrow: 2.5, mdefGrow: 3 },
  3: { name: 'Battle Oracle',  gender: 'M', class: 'mage',    hp: 400, atk: 30, def: 25, matk: 80, mdef: 40, hpGrow: 35, atkGrow: 3, defGrow: 2.5, matkGrow: 8, mdefGrow: 4 },
  4: { name: 'Battle Oracle',  gender: 'F', class: 'mage',    hp: 420, atk: 25, def: 30, matk: 70, mdef: 50, hpGrow: 37, atkGrow: 2.5, defGrow: 3, matkGrow: 7, mdefGrow: 5 },
  5: { name: 'Iron Will',      gender: 'M', class: 'knight',  hp: 800, atk: 50, def: 60, matk: 20, mdef: 35, hpGrow: 70, atkGrow: 5, defGrow: 6, matkGrow: 2, mdefGrow: 3.5 },
  6: { name: 'Iron Will',      gender: 'F', class: 'knight',  hp: 750, atk: 55, def: 55, matk: 22, mdef: 40, hpGrow: 65, atkGrow: 5.5, defGrow: 5.5, matkGrow: 2.2, mdefGrow: 4 },
};

const SKILLS = {
  1:  { name: 'Strike',      type: 'damage',  stat: 'atk',  multiplier: 1.2,  desc: 'ATK-based damage' },
  2:  { name: 'Shield Bash', type: 'damage',  stat: 'atk',  multiplier: 0.8,  stunChance: 30, desc: 'Damage with stun chance' },
  3:  { name: 'Heal',        type: 'heal',    stat: 'matk', multiplier: 1.5,  desc: 'Restore HP' },
  4:  { name: 'Fireball',    type: 'damage',  stat: 'matk', multiplier: 1.3,  desc: 'MATK-based damage' },
  5:  { name: 'Arrow Rain',  type: 'aoe',     stat: 'atk',  multiplier: 0.7,  desc: 'AoE damage to all enemies' },
  6:  { name: 'Taunt',       type: 'debuff',  effect: 'taunt', duration: 2,    desc: 'Force enemy to target this eudaemon' },
  7:  { name: 'Berserk',     type: 'buff',    effect: 'atk_boost', pct: 25, duration: 3, desc: '+ATK buff' },
  8:  { name: 'Barrier',     type: 'buff',    effect: 'def_boost', pct: 30, duration: 3, desc: '+DEF buff' },
  9:  { name: 'Haste',       type: 'buff',    effect: 'speed_boost', pct: 20, duration: 3, desc: '+Speed buff' },
  10: { name: 'Poison',      type: 'dot',     stat: 'matk', multiplier: 0.3, duration: 3, desc: 'Damage over time' },
  11: { name: 'Silence',     type: 'debuff',  effect: 'silence', duration: 2, chance: 40, desc: 'Prevent enemy skills' },
  12: { name: 'Resurrect',   type: 'revive',  hpPct: 30, cooldown: 1, desc: 'Revive once per battle at 30% HP' },
};

const PATROL_DIFFICULTY = {
  0: { name: 'Normal',    hours: 4,  soulStones: 5,  gold: 10000, exp: 5000 },
  1: { name: 'Hard',      hours: 8,  soulStones: 12, gold: 25000, exp: 12000 },
  2: { name: 'Nightmare', hours: 12, soulStones: 25, gold: 50000, exp: 25000 },
};

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS eudaemons (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id     INTEGER NOT NULL REFERENCES characters(id),
      type_id     INTEGER NOT NULL,
      level       INTEGER DEFAULT 1,
      stars       INTEGER DEFAULT 0,
      exp         INTEGER DEFAULT 0,
      skill_1     INTEGER DEFAULT 0,
      skill_2     INTEGER DEFAULT 0,
      skill_3     INTEGER DEFAULT 0,
      skill_4     INTEGER DEFAULT 0,
      equipped    INTEGER DEFAULT 0,
      created_at  TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS eudaemon_patrols (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id     INTEGER NOT NULL REFERENCES characters(id),
      eudaemon_id INTEGER NOT NULL,
      difficulty  INTEGER DEFAULT 0,
      started_at  TEXT NOT NULL,
      ends_at     TEXT NOT NULL,
      collected   INTEGER DEFAULT 0
    );
  `);
}

function calcStats(typeId, level, stars) {
  const t = EUDAEMON_TYPES[typeId];
  if (!t) return null;
  const starMul = 1 + stars * 0.10;
  return {
    hp:   Math.floor((t.hp + t.hpGrow * (level - 1)) * starMul),
    atk:  Math.floor((t.atk + t.atkGrow * (level - 1)) * starMul),
    def:  Math.floor((t.def + t.defGrow * (level - 1)) * starMul),
    matk: Math.floor((t.matk + t.matkGrow * (level - 1)) * starMul),
    mdef: Math.floor((t.mdef + t.mdefGrow * (level - 1)) * starMul),
  };
}

function formatEudaemon(row) {
  const t = EUDAEMON_TYPES[row.type_id];
  const stats = calcStats(row.type_id, row.level, row.stars);
  const skills = [row.skill_1, row.skill_2, row.skill_3, row.skill_4]
    .filter(s => s > 0)
    .map(s => ({ id: s, ...(SKILLS[s] || {}) }));

  return {
    id: row.id,
    typeId: row.type_id,
    name: t ? t.name : 'Unknown',
    gender: t ? t.gender : '?',
    className: t ? t.class : '?',
    level: row.level,
    stars: row.stars,
    exp: row.exp,
    expToNext: row.level * 100,
    equipped: !!row.equipped,
    stats,
    skills,
  };
}

function getEudaemonList(charId) {
  const rows = db.getDatabase()
    .prepare('SELECT * FROM eudaemons WHERE char_id = ?')
    .all(charId);
  return { eudaemons: rows.map(formatEudaemon) };
}

function summonEudaemon(charId, typeId) {
  const char = db.getCharacterById(charId);
  if (!char) return { success: false, msg: 'Character not found' };
  if (char.grade < MIN_LEVEL) return { success: false, msg: `Level ${MIN_LEVEL} required` };

  const t = EUDAEMON_TYPES[typeId];
  if (!t) return { success: false, msg: 'Invalid eudaemon type' };

  const existing = db.getDatabase()
    .prepare('SELECT COUNT(*) as cnt FROM eudaemons WHERE char_id = ? AND type_id = ?')
    .get(charId, typeId);
  if (existing.cnt > 0) return { success: false, msg: 'Already own this eudaemon type' };

  const result = db.getDatabase()
    .prepare('INSERT INTO eudaemons (char_id, type_id) VALUES (?, ?)')
    .run(charId, typeId);

  const row = db.getDatabase()
    .prepare('SELECT * FROM eudaemons WHERE id = ?')
    .get(result.lastInsertRowid);

  return { success: true, eudaemon: formatEudaemon(row) };
}

function equipEudaemon(charId, eudaemonId) {
  const eud = db.getDatabase()
    .prepare('SELECT * FROM eudaemons WHERE id = ? AND char_id = ?')
    .get(eudaemonId, charId);
  if (!eud) return { success: false, msg: 'Eudaemon not found' };

  // Unequip all first
  db.getDatabase()
    .prepare('UPDATE eudaemons SET equipped = 0 WHERE char_id = ?')
    .run(charId);

  // Equip selected
  db.getDatabase()
    .prepare('UPDATE eudaemons SET equipped = 1 WHERE id = ?')
    .run(eudaemonId);

  return { success: true, eudaemonId };
}

function levelUpEudaemon(charId, eudaemonId) {
  const eud = db.getDatabase()
    .prepare('SELECT * FROM eudaemons WHERE id = ? AND char_id = ?')
    .get(eudaemonId, charId);
  if (!eud) return { success: false, msg: 'Eudaemon not found' };
  if (eud.level >= MAX_LEVEL) return { success: false, msg: 'Max level reached' };

  // Cost: 1 Blood of Zeus per level (tracked as item, simplified as gold cost here)
  const cost = eud.level * 5000;
  const char = db.getCharacterById(charId);
  if (!char || char.gold < cost) return { success: false, msg: `Need ${cost} gold` };

  const expNeeded = eud.level * 100;
  const newExp = eud.exp + 100; // each Blood of Zeus gives 100 exp

  if (newExp >= expNeeded) {
    db.getDatabase().prepare(`
      UPDATE eudaemons SET level = level + 1, exp = ? WHERE id = ?
    `).run(newExp - expNeeded, eudaemonId);
  } else {
    db.getDatabase().prepare('UPDATE eudaemons SET exp = ? WHERE id = ?').run(newExp, eudaemonId);
  }

  db.getDatabase().prepare('UPDATE characters SET gold = gold - ? WHERE id = ?').run(cost, charId);

  const updated = db.getDatabase().prepare('SELECT * FROM eudaemons WHERE id = ?').get(eudaemonId);
  return { success: true, eudaemon: formatEudaemon(updated), goldSpent: cost };
}

function starUpEudaemon(charId, eudaemonId) {
  const eud = db.getDatabase()
    .prepare('SELECT * FROM eudaemons WHERE id = ? AND char_id = ?')
    .get(eudaemonId, charId);
  if (!eud) return { success: false, msg: 'Eudaemon not found' };
  if (eud.stars >= MAX_STARS) return { success: false, msg: 'Max stars reached' };

  // Cost: (stars+1) * 20000 gold + Star Sand (simplified)
  const cost = (eud.stars + 1) * 20000;
  const char = db.getCharacterById(charId);
  if (!char || char.gold < cost) return { success: false, msg: `Need ${cost} gold` };

  // Success chance decreases with stars
  const chance = Math.max(20, 100 - eud.stars * 10);
  const success = Math.random() * 100 < chance;

  db.getDatabase().prepare('UPDATE characters SET gold = gold - ? WHERE id = ?').run(cost, charId);

  if (success) {
    db.getDatabase().prepare('UPDATE eudaemons SET stars = stars + 1 WHERE id = ?').run(eudaemonId);
  }

  const updated = db.getDatabase().prepare('SELECT * FROM eudaemons WHERE id = ?').get(eudaemonId);
  return { success, upgraded: success, eudaemon: formatEudaemon(updated), goldSpent: cost };
}

function learnSkill(charId, eudaemonId, skillId) {
  const eud = db.getDatabase()
    .prepare('SELECT * FROM eudaemons WHERE id = ? AND char_id = ?')
    .get(eudaemonId, charId);
  if (!eud) return { success: false, msg: 'Eudaemon not found' };

  const skill = SKILLS[skillId];
  if (!skill) return { success: false, msg: 'Invalid skill' };

  // Find empty slot
  const slots = [eud.skill_1, eud.skill_2, eud.skill_3, eud.skill_4];
  if (slots.includes(skillId)) return { success: false, msg: 'Skill already learned' };

  let slotIdx = -1;
  for (let i = 0; i < MAX_SKILL_SLOTS; i++) {
    if (slots[i] === 0) { slotIdx = i; break; }
  }
  if (slotIdx === -1) return { success: false, msg: 'All skill slots full' };

  const col = `skill_${slotIdx + 1}`;
  db.getDatabase().prepare(`UPDATE eudaemons SET ${col} = ? WHERE id = ?`).run(skillId, eudaemonId);

  const updated = db.getDatabase().prepare('SELECT * FROM eudaemons WHERE id = ?').get(eudaemonId);
  return { success: true, eudaemon: formatEudaemon(updated) };
}

function startPatrol(charId, eudaemonId, difficulty) {
  const char = db.getCharacterById(charId);
  if (!char) return { success: false, msg: 'Character not found' };

  const eud = db.getDatabase()
    .prepare('SELECT * FROM eudaemons WHERE id = ? AND char_id = ?')
    .get(eudaemonId, charId);
  if (!eud) return { success: false, msg: 'Eudaemon not found' };

  const diff = PATROL_DIFFICULTY[difficulty];
  if (!diff) return { success: false, msg: 'Invalid difficulty' };

  // Check active patrol count
  const activeCount = db.getDatabase()
    .prepare('SELECT COUNT(*) as cnt FROM eudaemon_patrols WHERE char_id = ? AND collected = 0')
    .get(charId);
  if (activeCount.cnt >= MAX_PATROLS) return { success: false, msg: 'Max patrols active' };

  // Check if this eudaemon is already patrolling
  const already = db.getDatabase()
    .prepare('SELECT id FROM eudaemon_patrols WHERE eudaemon_id = ? AND collected = 0')
    .get(eudaemonId);
  if (already) return { success: false, msg: 'Eudaemon already on patrol' };

  const now = new Date();
  const endsAt = new Date(now.getTime() + diff.hours * 3600 * 1000);

  db.getDatabase().prepare(`
    INSERT INTO eudaemon_patrols (char_id, eudaemon_id, difficulty, started_at, ends_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(charId, eudaemonId, difficulty, now.toISOString(), endsAt.toISOString());

  return {
    success: true,
    patrol: {
      eudaemonId,
      difficulty: diff.name,
      hours: diff.hours,
      endsAt: endsAt.toISOString(),
    },
  };
}

function collectPatrol(charId, patrolId) {
  const patrol = db.getDatabase()
    .prepare('SELECT * FROM eudaemon_patrols WHERE id = ? AND char_id = ? AND collected = 0')
    .get(patrolId, charId);
  if (!patrol) return { success: false, msg: 'Patrol not found or already collected' };

  const now = new Date();
  if (now < new Date(patrol.ends_at)) return { success: false, msg: 'Patrol not finished yet' };

  const diff = PATROL_DIFFICULTY[patrol.difficulty];
  if (!diff) return { success: false, msg: 'Invalid patrol data' };

  db.getDatabase().prepare('UPDATE eudaemon_patrols SET collected = 1 WHERE id = ?').run(patrolId);

  // Grant rewards
  db.getDatabase().prepare('UPDATE characters SET gold = gold + ?, exp = exp + ? WHERE id = ?')
    .run(diff.gold, diff.exp, charId);

  return {
    success: true,
    rewards: {
      soulStones: diff.soulStones,
      gold: diff.gold,
      exp: diff.exp,
    },
  };
}

function getPatrolList(charId) {
  const rows = db.getDatabase()
    .prepare('SELECT * FROM eudaemon_patrols WHERE char_id = ? AND collected = 0')
    .all(charId);

  const now = new Date();
  return {
    patrols: rows.map(r => {
      const diff = PATROL_DIFFICULTY[r.difficulty] || {};
      const endsAt = new Date(r.ends_at);
      return {
        id: r.id,
        eudaemonId: r.eudaemon_id,
        difficulty: diff.name || 'Unknown',
        startedAt: r.started_at,
        endsAt: r.ends_at,
        finished: now >= endsAt,
        remainingSec: Math.max(0, Math.floor((endsAt - now) / 1000)),
      };
    }),
    maxPatrols: MAX_PATROLS,
  };
}

function getEudaemonBonuses(charId) {
  const equipped = db.getDatabase()
    .prepare('SELECT * FROM eudaemons WHERE char_id = ? AND equipped = 1')
    .get(charId);
  if (!equipped) return { hp: 0, atk: 0, def: 0, matk: 0, mdef: 0 };

  const stats = calcStats(equipped.type_id, equipped.level, equipped.stars);
  // Eudaemon grants 20% of its stats to the player
  return {
    hp:   Math.floor(stats.hp * 0.20),
    atk:  Math.floor(stats.atk * 0.20),
    def:  Math.floor(stats.def * 0.20),
    matk: Math.floor(stats.matk * 0.20),
    mdef: Math.floor(stats.mdef * 0.20),
  };
}

module.exports = {
  OPCODES, EUDAEMON_TYPES, SKILLS, PATROL_DIFFICULTY,
  MIN_LEVEL, MAX_LEVEL, MAX_STARS, MAX_SKILL_SLOTS, MAX_PATROLS,
  initDB,
  getEudaemonList, summonEudaemon, equipEudaemon,
  levelUpEudaemon, starUpEudaemon, learnSkill,
  startPatrol, collectPatrol, getPatrolList,
  getEudaemonBonuses,
};
