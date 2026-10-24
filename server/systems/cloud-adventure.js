'use strict';

const db = require('../db');

const OPCODES = {
  C_CLOUD_INFO:     0x8500,
  S_CLOUD_INFO:     0x8510,
  C_CLOUD_ENTER:    0x8501,
  S_CLOUD_ENTER:    0x8511,
  C_CLOUD_COMPLETE: 0x8502,
  S_CLOUD_COMPLETE: 0x8512,
  C_CLOUD_REWARDS:  0x8503,
  S_CLOUD_REWARDS:  0x8513,
};

const MAX_FLOOR = 50;
const DAILY_TICKETS = 5;
const BOSS_INTERVAL = 10;

const FLOOR_CONFIG = (() => {
  const floors = [];
  for (let i = 1; i <= MAX_FLOOR; i++) {
    const isBoss = i % BOSS_INTERVAL === 0;
    floors.push({
      floor: i,
      isBoss,
      minLevel: 30 + Math.floor((i - 1) / 5) * 2,
      enemyPower: 5000 + i * 800 + (isBoss ? 5000 : 0),
      rewards: {
        gold: 2000 * i + (isBoss ? 10000 : 0),
        exp: 1000 * i + (isBoss ? 5000 : 0),
        cloudTokens: i + (isBoss ? 10 : 0),
      },
      bossName: isBoss ? `Cloud Guardian Lv${i}` : null,
    });
  }
  return floors;
})();

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS cloud_adventure (
      char_id       INTEGER PRIMARY KEY REFERENCES characters(id),
      current_floor INTEGER DEFAULT 1,
      max_floor     INTEGER DEFAULT 0,
      tickets       INTEGER DEFAULT ${DAILY_TICKETS},
      cloud_tokens  INTEGER DEFAULT 0,
      last_reset    TEXT DEFAULT (date('now'))
    );
  `);
}

function ensureEntry(charId) {
  db.getDatabase().prepare('INSERT OR IGNORE INTO cloud_adventure (char_id) VALUES (?)').run(charId);
  checkDailyReset(charId);
}

function checkDailyReset(charId) {
  const row = db.getDatabase().prepare('SELECT last_reset FROM cloud_adventure WHERE char_id = ?').get(charId);
  if (!row) return;
  const today = new Date().toISOString().slice(0, 10);
  if (row.last_reset !== today) {
    db.getDatabase().prepare(
      'UPDATE cloud_adventure SET tickets = ?, current_floor = 1, last_reset = ? WHERE char_id = ?'
    ).run(DAILY_TICKETS, today, charId);
  }
}

function getCloudInfo(charId) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM cloud_adventure WHERE char_id = ?').get(charId);
  const floorData = FLOOR_CONFIG[row.current_floor - 1] || FLOOR_CONFIG[0];

  return {
    success: true,
    currentFloor: row.current_floor,
    maxFloor: row.max_floor,
    tickets: row.tickets,
    maxTickets: DAILY_TICKETS,
    cloudTokens: row.cloud_tokens,
    totalFloors: MAX_FLOOR,
    nextFloor: floorData,
  };
}

function enterFloor(charId) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM cloud_adventure WHERE char_id = ?').get(charId);

  if (row.tickets <= 0) return { success: false, msg: 'No tickets remaining' };
  if (row.current_floor > MAX_FLOOR) return { success: false, msg: 'Already cleared all floors' };

  const char = db.getCharacterById(charId);
  if (!char) return { success: false, msg: 'Character not found' };

  const floorData = FLOOR_CONFIG[row.current_floor - 1];
  if (char.grade < floorData.minLevel) {
    return { success: false, msg: `Level ${floorData.minLevel} required for floor ${row.current_floor}` };
  }

  // Consume ticket
  db.getDatabase().prepare('UPDATE cloud_adventure SET tickets = tickets - 1 WHERE char_id = ?').run(charId);

  // Simulate battle
  const playerPower = char.fighting || 10000;
  const advantage = playerPower / floorData.enemyPower;
  const win = advantage > 0.6 ? Math.random() < Math.min(0.95, advantage * 0.7) : Math.random() < 0.2;

  if (!win) {
    return {
      success: true,
      won: false,
      floor: row.current_floor,
      isBoss: floorData.isBoss,
      enemyPower: floorData.enemyPower,
      msg: floorData.isBoss ? `Defeated by ${floorData.bossName}!` : 'Defeated on this floor',
    };
  }

  return completeFloor(charId, row.current_floor);
}

function completeFloor(charId, floor) {
  const floorData = FLOOR_CONFIG[floor - 1];
  if (!floorData) return { success: false, msg: 'Invalid floor' };

  const row = db.getDatabase().prepare('SELECT * FROM cloud_adventure WHERE char_id = ?').get(charId);
  const newMax = Math.max(row.max_floor, floor);
  const nextFloor = Math.min(floor + 1, MAX_FLOOR + 1);

  db.getDatabase().prepare(
    'UPDATE cloud_adventure SET current_floor = ?, max_floor = ?, cloud_tokens = cloud_tokens + ? WHERE char_id = ?'
  ).run(nextFloor, newMax, floorData.rewards.cloudTokens, charId);

  // Award gold/exp
  const char = db.getCharacterById(charId);
  if (char) {
    db.updateCharacter(charId, {
      gold: char.gold + floorData.rewards.gold,
      exp: char.exp + floorData.rewards.exp,
    });
  }

  return {
    success: true,
    won: true,
    floor,
    isBoss: floorData.isBoss,
    bossName: floorData.bossName,
    rewards: floorData.rewards,
    newMax,
    nextFloor,
    allCleared: nextFloor > MAX_FLOOR,
  };
}

function getFloorRewards(floor) {
  if (floor < 1 || floor > MAX_FLOOR) return null;
  return FLOOR_CONFIG[floor - 1].rewards;
}

function useTicket(charId) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT tickets FROM cloud_adventure WHERE char_id = ?').get(charId);
  if (row.tickets <= 0) return { success: false, msg: 'No tickets' };
  db.getDatabase().prepare('UPDATE cloud_adventure SET tickets = tickets - 1 WHERE char_id = ?').run(charId);
  return { success: true, ticketsLeft: row.tickets - 1 };
}

function resetDaily(charId) {
  ensureEntry(charId);
  const today = new Date().toISOString().slice(0, 10);
  db.getDatabase().prepare(
    'UPDATE cloud_adventure SET tickets = ?, current_floor = 1, last_reset = ? WHERE char_id = ?'
  ).run(DAILY_TICKETS, today, charId);
}

module.exports = {
  OPCODES, MAX_FLOOR, DAILY_TICKETS, BOSS_INTERVAL, FLOOR_CONFIG,
  initDB,
  getCloudInfo, enterFloor, completeFloor, getFloorRewards, useTicket, resetDaily,
};
