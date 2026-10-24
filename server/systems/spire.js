'use strict';

const db = require('../db');

const OPCODES = {
  C_SPIRE_INFO:    0x7800,
  S_SPIRE_INFO:    0x7810,
  C_SPIRE_FIGHT:   0x7801,
  S_SPIRE_FIGHT:   0x7811,
  C_SPIRE_RESET:   0x7802,
  S_SPIRE_RESET:   0x7812,
};

const MIN_LEVEL = 46;
const MAX_FLOOR = 24;
const DAILY_ATTEMPTS = 2;

const FLOOR_BOSSES = {
  4:  { name: 'Shadow Guardian', hpMul: 5, atkMul: 3,   defMul: 2.5, expMul: 8 },
  8:  { name: 'Frost Sentinel',  hpMul: 5, atkMul: 3,   defMul: 2.5, expMul: 10 },
  12: { name: 'Flame Warden',    hpMul: 5, atkMul: 3,   defMul: 2.5, expMul: 13 },
  16: { name: 'Thunder Lord',    hpMul: 5, atkMul: 3,   defMul: 2.5, expMul: 16 },
  20: { name: 'Void Knight',     hpMul: 5, atkMul: 3,   defMul: 2.5, expMul: 20 },
  24: { name: 'Spire Overlord',  hpMul: 5, atkMul: 3,   defMul: 2.5, expMul: 30 },
};

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS spire (
      char_id       INTEGER PRIMARY KEY REFERENCES characters(id),
      current_floor INTEGER DEFAULT 1,
      best_floor    INTEGER DEFAULT 0,
      daily_runs    INTEGER DEFAULT 0,
      daily_resets  INTEGER DEFAULT 0,
      last_reset    TEXT DEFAULT '',
      shadow_crystals INTEGER DEFAULT 0
    );
  `);
}

function ensureEntry(charId) {
  db.getDatabase().prepare('INSERT OR IGNORE INTO spire (char_id) VALUES (?)').run(charId);
  resetDaily(charId);
}

function resetDaily(charId) {
  const today = new Date().toISOString().slice(0, 10);
  const row = db.getDatabase().prepare('SELECT last_reset FROM spire WHERE char_id = ?').get(charId);
  if (row && row.last_reset !== today) {
    db.getDatabase().prepare(`
      UPDATE spire SET daily_runs = 0, daily_resets = 0, current_floor = 1, last_reset = ?
      WHERE char_id = ?
    `).run(today, charId);
  }
}

function getSpireInfo(charId) {
  const char = db.getCharacterById(charId);
  if (!char) return { success: false };
  if (char.grade < MIN_LEVEL) return { success: false, msg: `Level ${MIN_LEVEL} required` };

  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM spire WHERE char_id = ?').get(charId);
  const isBoss = !!FLOOR_BOSSES[row.current_floor];
  const bossInfo = FLOOR_BOSSES[row.current_floor];

  return {
    currentFloor: row.current_floor,
    bestFloor: row.best_floor,
    dailyRuns: row.daily_runs,
    maxDailyRuns: DAILY_ATTEMPTS,
    shadowCrystals: row.shadow_crystals,
    isBoss,
    bossName: bossInfo ? bossInfo.name : null,
    canFight: row.daily_runs < DAILY_ATTEMPTS && row.current_floor <= MAX_FLOOR,
  };
}

function fightFloor(charId) {
  const char = db.getCharacterById(charId);
  if (!char) return { success: false };
  if (char.grade < MIN_LEVEL) return { success: false, msg: `Level ${MIN_LEVEL} required` };

  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM spire WHERE char_id = ?').get(charId);

  if (row.daily_runs >= DAILY_ATTEMPTS) return { success: false, msg: 'No attempts left today' };
  if (row.current_floor > MAX_FLOOR) return { success: false, msg: 'Already cleared all floors' };

  const floor = row.current_floor;
  const isBoss = !!FLOOR_BOSSES[floor];
  const bossTemplate = FLOOR_BOSSES[floor];

  // Scale monster stats by floor
  const baseHp  = 200 + floor * 120;
  const baseAtk = 20  + floor * 15;
  const baseDef = 10  + floor * 8;
  const baseExp = 80  + floor * 40;

  const monsterHp   = isBoss ? Math.floor(baseHp  * bossTemplate.hpMul)  : baseHp;
  const monsterAtk  = isBoss ? Math.floor(baseAtk * bossTemplate.atkMul) : baseAtk;
  const monsterDef  = isBoss ? Math.floor(baseDef * bossTemplate.defMul) : baseDef;
  const monsterName = isBoss ? bossTemplate.name : `Spire Shade Lv${floor}`;

  // Simulate combat
  let playerHp = char.max_hp || char.hp;
  let mHp = monsterHp;
  const rounds = [];
  let roundNum = 0;

  while (mHp > 0 && playerHp > 0 && roundNum < 30) {
    roundNum++;
    const pDmg = Math.max(1, Math.floor(char.attack * char.attack / (char.attack + monsterDef)));
    const crit = Math.random() < 0.12;
    const finalDmg = crit ? Math.floor(pDmg * 1.5) : pDmg;
    mHp -= finalDmg;

    let mDmg = 0;
    if (mHp > 0) {
      mDmg = Math.max(1, Math.floor(monsterAtk * monsterAtk / (monsterAtk + char.defence)));
      playerHp -= mDmg;
    }

    rounds.push({
      round: roundNum,
      playerDmg: finalDmg,
      crit,
      monsterDmg: mDmg,
      playerHp: Math.max(0, playerHp),
      monsterHp: Math.max(0, mHp),
    });
  }

  const won = mHp <= 0;
  let expReward = 0, goldReward = 0, crystalReward = 0;

  if (won) {
    expReward = isBoss ? Math.floor(baseExp * bossTemplate.expMul) : baseExp;
    goldReward = Math.floor(expReward * 0.6);
    crystalReward = isBoss ? 8 : 2;

    db.getDatabase().prepare('UPDATE characters SET exp = exp + ?, gold = gold + ? WHERE id = ?')
      .run(expReward, goldReward, charId);

    const newFloor = floor + 1;
    const newBest = Math.max(row.best_floor, floor);

    db.getDatabase().prepare(`
      UPDATE spire SET current_floor = ?, best_floor = ?, shadow_crystals = shadow_crystals + ?
      WHERE char_id = ?
    `).run(newFloor, newBest, crystalReward, charId);

    try {
      const devotion = require('./devotion');
      devotion.completeTask(charId, 'spire');
    } catch (e) { /* optional integration */ }

    try {
      const quest = require('./quest');
      quest.updateProgress(charId, 'spire_floor', String(floor));
      quest.checkLevelUp(charId);
    } catch (e) { /* optional integration */ }
  }

  // Always count as a run
  db.getDatabase().prepare('UPDATE spire SET daily_runs = daily_runs + 1 WHERE char_id = ?').run(charId);

  return {
    success: true, won, floor,
    isBoss, monsterName,
    rounds: rounds.slice(-5),
    rewards: won ? { exp: expReward, gold: goldReward, shadowCrystals: crystalReward } : null,
    nextFloor: won ? floor + 1 : floor,
  };
}

function resetSpire(charId) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM spire WHERE char_id = ?').get(charId);

  if (row.daily_resets >= 1) return { success: false, msg: 'Only 1 free reset per day' };

  db.getDatabase().prepare('UPDATE spire SET current_floor = 1, daily_resets = daily_resets + 1 WHERE char_id = ?')
    .run(charId);

  return { success: true };
}

module.exports = {
  OPCODES, FLOOR_BOSSES, MAX_FLOOR, MIN_LEVEL, DAILY_ATTEMPTS,
  initDB,
  getSpireInfo, fightFloor, resetSpire,
};
