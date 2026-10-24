'use strict';

const db = require('../db');

const OPCODES = {
  C_CATACOMBS_INFO:   0x6700,
  S_CATACOMBS_INFO:   0x6710,
  C_CATACOMBS_FIGHT:  0x6701,
  S_CATACOMBS_FIGHT:  0x6711,
  C_CATACOMBS_RESET:  0x6702,
};

const MAX_FLOOR = 100;
const DAILY_ATTEMPTS = 2;

// Boss every 5 floors
const FLOOR_BOSSES = {
  5:  { name: 'Bloodthirsty Narosa',  hpMul: 3,  atkMul: 2,   defMul: 2,   expMul: 5 },
  10: { name: 'Lawrence the Wretched', hpMul: 4,  atkMul: 2.5, defMul: 2.5, expMul: 6 },
  15: { name: 'Iron Golem',           hpMul: 5,  atkMul: 3,   defMul: 3,   expMul: 7 },
  20: { name: 'Shadow Assassin',      hpMul: 6,  atkMul: 3.5, defMul: 3,   expMul: 8 },
  25: { name: 'Crystal Guardian',     hpMul: 7,  atkMul: 4,   defMul: 3.5, expMul: 9 },
  30: { name: 'Flame Warden',         hpMul: 8,  atkMul: 4.5, defMul: 4,   expMul: 10 },
  35: { name: 'Frost Giant',          hpMul: 9,  atkMul: 5,   defMul: 4.5, expMul: 12 },
  40: { name: 'Marcoli the Immortal', hpMul: 12, atkMul: 6,   defMul: 5,   expMul: 15 },
  45: { name: 'Void Specter',         hpMul: 13, atkMul: 6.5, defMul: 5.5, expMul: 16 },
  50: { name: 'Demon Lord Krath',     hpMul: 15, atkMul: 7,   defMul: 6,   expMul: 20 },
  55: { name: 'Yılan Kraliçesi',      hpMul: 16, atkMul: 7.5, defMul: 6.5, expMul: 22 },
  60: { name: 'Undying Pharaoh',      hpMul: 18, atkMul: 8,   defMul: 7,   expMul: 25 },
  65: { name: 'Lanetli Şövalye',      hpMul: 20, atkMul: 9,   defMul: 7.5, expMul: 28 },
  70: { name: 'Dragon Skeleton',      hpMul: 22, atkMul: 10,  defMul: 8,   expMul: 30 },
  75: { name: 'Fırtına Devi',         hpMul: 25, atkMul: 11,  defMul: 9,   expMul: 35 },
  80: { name: 'Chaos Emperor',        hpMul: 28, atkMul: 12,  defMul: 10,  expMul: 40 },
  85: { name: 'Karanlık Melek',       hpMul: 32, atkMul: 14,  defMul: 11,  expMul: 45 },
  90: { name: 'Twilight Archon',      hpMul: 35, atkMul: 15,  defMul: 12,  expMul: 50 },
  95: { name: 'Cehennem Bekçisi',     hpMul: 42, atkMul: 18,  defMul: 14,  expMul: 65 },
  100:{ name: 'Abyssal Overlord',     hpMul: 50, atkMul: 20,  defMul: 15,  expMul: 80 },
};

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS catacombs (
      char_id       INTEGER PRIMARY KEY REFERENCES characters(id),
      current_floor INTEGER DEFAULT 1,
      best_floor    INTEGER DEFAULT 0,
      daily_runs    INTEGER DEFAULT 0,
      daily_resets  INTEGER DEFAULT 0,
      last_reset    TEXT DEFAULT '',
      tokens        INTEGER DEFAULT 0
    );
  `);
}

function ensureEntry(charId) {
  db.getDatabase().prepare('INSERT OR IGNORE INTO catacombs (char_id) VALUES (?)').run(charId);
  resetDaily(charId);
}

function resetDaily(charId) {
  const today = new Date().toISOString().slice(0, 10);
  const row = db.getDatabase().prepare('SELECT last_reset FROM catacombs WHERE char_id = ?').get(charId);
  if (row && row.last_reset !== today) {
    db.getDatabase().prepare(`
      UPDATE catacombs SET daily_runs = 0, daily_resets = 0, last_reset = ?, current_floor = 1
      WHERE char_id = ?
    `).run(today, charId);
  }
}

function getInfo(charId) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM catacombs WHERE char_id = ?').get(charId);
  const isBoss = !!FLOOR_BOSSES[row.current_floor];
  const bossInfo = FLOOR_BOSSES[row.current_floor];

  return {
    currentFloor: row.current_floor,
    bestFloor: row.best_floor,
    dailyRuns: row.daily_runs,
    maxDailyRuns: DAILY_ATTEMPTS,
    tokens: row.tokens,
    isBoss,
    bossName: bossInfo ? bossInfo.name : null,
    canFight: row.daily_runs < DAILY_ATTEMPTS && row.current_floor <= MAX_FLOOR,
  };
}

function fightFloor(charId) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM catacombs WHERE char_id = ?').get(charId);

  if (row.daily_runs >= DAILY_ATTEMPTS) return { success: false, msg: 'No attempts left today' };
  if (row.current_floor > MAX_FLOOR) return { success: false, msg: 'Already cleared all floors' };

  const char = db.getCharacterById(charId);
  if (!char) return { success: false };

  const floor = row.current_floor;
  const isBoss = !!FLOOR_BOSSES[floor];
  const bossTemplate = FLOOR_BOSSES[floor];

  // Scale monster stats by floor
  const baseHp = 100 + floor * 80;
  const baseAtk = 15 + floor * 8;
  const baseDef = 5 + floor * 4;
  const baseExp = 50 + floor * 30;

  const monsterHp = isBoss ? Math.floor(baseHp * bossTemplate.hpMul) : baseHp;
  const monsterAtk = isBoss ? Math.floor(baseAtk * bossTemplate.atkMul) : baseAtk;
  const monsterDef = isBoss ? Math.floor(baseDef * bossTemplate.defMul) : baseDef;
  const monsterName = isBoss ? bossTemplate.name : `Catacombs Shade Lv${floor}`;

  // Simulate combat
  let playerHp = char.max_hp || char.hp;
  let mHp = monsterHp;
  const rounds = [];
  let roundNum = 0;

  while (mHp > 0 && playerHp > 0 && roundNum < 30) {
    roundNum++;
    const pDmg = Math.max(1, Math.floor(char.attack * char.attack / (char.attack + monsterDef)));
    const crit = Math.random() < 0.1;
    const finalDmg = crit ? Math.floor(pDmg * 1.5) : pDmg;
    mHp -= finalDmg;

    let mDmg = 0;
    if (mHp > 0) {
      mDmg = Math.max(1, Math.floor(monsterAtk * monsterAtk / (monsterAtk + char.defence)));
      playerHp -= mDmg;
    }

    rounds.push({ round: roundNum, playerDmg: finalDmg, crit, monsterDmg: mDmg, playerHp, monsterHp: Math.max(0, mHp) });
  }

  const won = mHp <= 0;
  let expReward = 0, goldReward = 0, tokenReward = 0;

  if (won) {
    expReward = isBoss ? Math.floor(baseExp * bossTemplate.expMul) : baseExp;
    goldReward = Math.floor(expReward * 0.5);
    tokenReward = isBoss ? 5 : 1;

    db.getDatabase().prepare('UPDATE characters SET exp = exp + ?, gold = gold + ? WHERE id = ?')
      .run(expReward, goldReward, charId);

    const newFloor = floor + 1;
    const newBest = Math.max(row.best_floor, floor);

    db.getDatabase().prepare(`
      UPDATE catacombs SET current_floor = ?, best_floor = ?, tokens = tokens + ?
      WHERE char_id = ?
    `).run(newFloor, newBest, tokenReward, charId);

    // Devotion
    const devotion = require('./devotion');
    devotion.completeTask(charId, 'catacombs');

    const quest = require('./quest');
    quest.updateProgress(charId, 'catacombs_floor', String(floor));
    quest.checkLevelUp(charId);
  }

  // Always count as a run
  db.getDatabase().prepare('UPDATE catacombs SET daily_runs = daily_runs + 1 WHERE char_id = ?').run(charId);

  return {
    success: true, won, floor,
    isBoss, monsterName,
    rounds: rounds.slice(-5), // send last 5 rounds
    rewards: won ? { exp: expReward, gold: goldReward, tokens: tokenReward } : null,
    nextFloor: won ? floor + 1 : floor,
  };
}

function resetFloor(charId) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM catacombs WHERE char_id = ?').get(charId);

  if (row.daily_resets >= 1) return { success: false, msg: 'Only 1 free reset per day' };

  db.getDatabase().prepare('UPDATE catacombs SET current_floor = 1, daily_resets = daily_resets + 1 WHERE char_id = ?')
    .run(charId);

  return { success: true };
}

module.exports = {
  OPCODES, FLOOR_BOSSES, MAX_FLOOR, DAILY_ATTEMPTS,
  initDB,
  getInfo, fightFloor, resetFloor,
};
