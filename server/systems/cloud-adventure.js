'use strict';

const db = require('../db');

const OPCODES = {
  C_CLOUD_INFO:    0x8500,
  S_CLOUD_INFO:    0x8510,
  C_CLOUD_ROLL:    0x8501,
  S_CLOUD_ROLL:    0x8511,
  C_CLOUD_COLLECT: 0x8502,
  S_CLOUD_COLLECT: 0x8512,
};

const BOARD_SIZE = 40;
const FREE_ROLLS = 3;
const EXTRA_ROLL_COST = 20;

const TILE_TYPES = [
  { type: 'gold',     weight: 25, reward: { gold: 5000 } },
  { type: 'exp',      weight: 20, reward: { exp: 3000 } },
  { type: 'treasure', weight: 10, reward: { gold: 15000, boundBalens: 5 } },
  { type: 'combat',   weight: 15, reward: { gold: 8000, exp: 5000 } },
  { type: 'trap',     weight: 10, reward: { gold: -2000 } },
  { type: 'portal',   weight: 5,  special: 'advance_5' },
  { type: 'empty',    weight: 15, reward: {} },
];

const MILESTONE_REWARDS = {
  1:  { gold: 20000,  exp: 10000,  boundBalens: 10 },
  3:  { gold: 50000,  exp: 30000,  boundBalens: 30 },
  5:  { gold: 100000, exp: 60000,  boundBalens: 60 },
  10: { gold: 250000, exp: 150000, boundBalens: 150 },
};

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS cloud_adventure (
      char_id    INTEGER PRIMARY KEY REFERENCES characters(id),
      position   INTEGER DEFAULT 0,
      laps       INTEGER DEFAULT 0,
      rolls_used INTEGER DEFAULT 0,
      last_date  TEXT DEFAULT '',
      milestones_claimed TEXT DEFAULT '[]'
    );
  `);
}

function ensureEntry(charId) {
  db.getDatabase().prepare('INSERT OR IGNORE INTO cloud_adventure (char_id) VALUES (?)').run(charId);
}

function getCloudInfo(charId) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM cloud_adventure WHERE char_id = ?').get(charId);
  const today = new Date().toISOString().slice(0, 10);
  const rollsUsed = row.last_date === today ? row.rolls_used : 0;
  const claimed = JSON.parse(row.milestones_claimed || '[]');
  return {
    success: true, position: row.position, laps: row.laps, rollsUsed, freeRolls: FREE_ROLLS, extraRollCost: EXTRA_ROLL_COST,
    milestones: Object.entries(MILESTONE_REWARDS).map(([lap, r]) => ({ lap: Number(lap), reward: r, claimed: claimed.includes(Number(lap)), available: row.laps >= Number(lap) })),
  };
}

function rollDice(charId, useExtra) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM cloud_adventure WHERE char_id = ?').get(charId);
  const today = new Date().toISOString().slice(0, 10);
  const rollsUsed = row.last_date === today ? row.rolls_used : 0;

  if (rollsUsed >= FREE_ROLLS && !useExtra) return { success: false, msg: 'No free rolls left' };
  if (rollsUsed >= FREE_ROLLS) {
    const char = db.getCharacterById(charId);
    if (!char || char.balens < EXTRA_ROLL_COST) return { success: false, msg: 'Need ' + EXTRA_ROLL_COST + ' balens' };
    db.getDatabase().prepare('UPDATE characters SET balens = balens - ? WHERE id = ?').run(EXTRA_ROLL_COST, charId);
  }

  const dice = Math.floor(Math.random() * 6) + 1;
  let newPos = row.position + dice;
  let newLaps = row.laps;
  if (newPos >= BOARD_SIZE) { newPos -= BOARD_SIZE; newLaps++; }

  const totalWeight = TILE_TYPES.reduce((s, t) => s + t.weight, 0);
  let roll = Math.random() * totalWeight;
  let tileType = TILE_TYPES[0];
  for (const tt of TILE_TYPES) { roll -= tt.weight; if (roll <= 0) { tileType = tt; break; } }

  const lapMult = 1 + newLaps * 0.2;
  const rewardGiven = {};

  if (tileType.special === 'advance_5') {
    newPos = Math.min(newPos + 5, BOARD_SIZE - 1);
  } else if (tileType.reward) {
    for (const [key, val] of Object.entries(tileType.reward)) {
      const scaled = Math.floor(val * lapMult);
      rewardGiven[key] = scaled;
      if (key === 'gold' && scaled > 0) db.getDatabase().prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').run(scaled, charId);
      if (key === 'gold' && scaled < 0) db.getDatabase().prepare('UPDATE characters SET gold = MAX(0, gold + ?) WHERE id = ?').run(scaled, charId);
      if (key === 'exp') db.getDatabase().prepare('UPDATE characters SET exp = exp + ? WHERE id = ?').run(scaled, charId);
      if (key === 'boundBalens') db.getDatabase().prepare('UPDATE characters SET bound_balens = bound_balens + ? WHERE id = ?').run(scaled, charId);
    }
  }

  db.getDatabase().prepare('UPDATE cloud_adventure SET position = ?, laps = ?, rolls_used = ?, last_date = ? WHERE char_id = ?')
    .run(newPos, newLaps, rollsUsed + 1, today, charId);

  return { success: true, dice, position: newPos, laps: newLaps, tileType: tileType.type, reward: rewardGiven, rollsUsed: rollsUsed + 1 };
}

function collectMilestone(charId, lap) {
  ensureEntry(charId);
  const reward = MILESTONE_REWARDS[lap];
  if (!reward) return { success: false, msg: 'Invalid milestone' };
  const row = db.getDatabase().prepare('SELECT * FROM cloud_adventure WHERE char_id = ?').get(charId);
  if (row.laps < lap) return { success: false, msg: 'Not enough laps' };
  const claimed = JSON.parse(row.milestones_claimed || '[]');
  if (claimed.includes(lap)) return { success: false, msg: 'Already claimed' };

  if (reward.gold) db.getDatabase().prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').run(reward.gold, charId);
  if (reward.exp) db.getDatabase().prepare('UPDATE characters SET exp = exp + ? WHERE id = ?').run(reward.exp, charId);
  if (reward.boundBalens) db.getDatabase().prepare('UPDATE characters SET bound_balens = bound_balens + ? WHERE id = ?').run(reward.boundBalens, charId);

  claimed.push(lap);
  db.getDatabase().prepare('UPDATE cloud_adventure SET milestones_claimed = ? WHERE char_id = ?').run(JSON.stringify(claimed), charId);
  return { success: true, lap, reward };
}

module.exports = { OPCODES, BOARD_SIZE, FREE_ROLLS, MILESTONE_REWARDS, initDB, getCloudInfo, rollDice, collectMilestone };
