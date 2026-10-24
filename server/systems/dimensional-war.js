'use strict';

const db = require('../db');

const OPCODES = {
  C_DIMWAR_INFO:     0x7900,
  S_DIMWAR_INFO:     0x7910,
  C_DIMWAR_ENTER:    0x7901,
  S_DIMWAR_ENTER:    0x7911,
  C_DIMWAR_FIGHT:    0x7902,
  S_DIMWAR_FIGHT:    0x7912,
  C_DIMWAR_COLLECT:  0x7903,
  S_DIMWAR_COLLECT:  0x7913,
};

const MIN_LEVEL = 55;
const MAX_FLOORS = 5;
const ROOMS_PER_FLOOR = 3; // combat, puzzle, boss
const DAILY_ATTEMPTS = 1;

const FLOORS = [
  {
    id: 1, name: 'Shadow Dimension',
    officer: { name: 'Shadow Officer', hpMul: 3, atkMul: 2, defMul: 1.5 },
    boss:    { name: 'Shadow Warden',  hpMul: 6, atkMul: 3, defMul: 2 },
    baseHp: 800, baseAtk: 60, baseDef: 30,
    rewards: { gold: 10000, exp: 8000, shards: 3 },
  },
  {
    id: 2, name: 'Frost Dimension',
    officer: { name: 'Frost Officer', hpMul: 3.5, atkMul: 2.2, defMul: 1.6 },
    boss:    { name: 'Frost Warden',  hpMul: 7,   atkMul: 3.5, defMul: 2.2 },
    baseHp: 1200, baseAtk: 85, baseDef: 45,
    rewards: { gold: 15000, exp: 12000, shards: 5 },
  },
  {
    id: 3, name: 'Flame Dimension',
    officer: { name: 'Flame Officer', hpMul: 4, atkMul: 2.5, defMul: 1.8 },
    boss:    { name: 'Flame Warden',  hpMul: 8, atkMul: 4,   defMul: 2.5 },
    baseHp: 1600, baseAtk: 110, baseDef: 60,
    rewards: { gold: 22000, exp: 18000, shards: 7 },
  },
  {
    id: 4, name: 'Thunder Dimension',
    officer: { name: 'Thunder Officer', hpMul: 4.5, atkMul: 2.8, defMul: 2 },
    boss:    { name: 'Thunder Warden',  hpMul: 9,   atkMul: 4.5, defMul: 3 },
    baseHp: 2200, baseAtk: 140, baseDef: 80,
    rewards: { gold: 30000, exp: 25000, shards: 10 },
  },
  {
    id: 5, name: 'Void Dimension',
    officer: { name: 'Void Officer',        hpMul: 5,  atkMul: 3.2, defMul: 2.5 },
    boss:    { name: 'Dimensional Overlord', hpMul: 12, atkMul: 6,   defMul: 4 },
    baseHp: 3000, baseAtk: 180, baseDef: 100,
    rewards: { gold: 50000, exp: 40000, shards: 15 },
  },
];

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS dim_war (
      char_id       INTEGER PRIMARY KEY REFERENCES characters(id),
      current_floor INTEGER DEFAULT 0,
      current_room  INTEGER DEFAULT 0,
      daily_runs    INTEGER DEFAULT 0,
      last_reset    TEXT DEFAULT '',
      dim_shards    INTEGER DEFAULT 0,
      in_progress   INTEGER DEFAULT 0
    );
  `);
}

function ensureEntry(charId) {
  db.getDatabase().prepare('INSERT OR IGNORE INTO dim_war (char_id) VALUES (?)').run(charId);
  resetDaily(charId);
}

function resetDaily(charId) {
  const today = new Date().toISOString().slice(0, 10);
  const row = db.getDatabase().prepare('SELECT last_reset FROM dim_war WHERE char_id = ?').get(charId);
  if (row && row.last_reset !== today) {
    db.getDatabase().prepare(`
      UPDATE dim_war SET daily_runs = 0, current_floor = 0, current_room = 0,
      in_progress = 0, last_reset = ? WHERE char_id = ?
    `).run(today, charId);
  }
}

function getDimWarInfo(charId) {
  const char = db.getCharacterById(charId);
  if (!char) return { success: false };
  if (char.grade < MIN_LEVEL) return { success: false, msg: `Level ${MIN_LEVEL} required` };

  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM dim_war WHERE char_id = ?').get(charId);

  const currentFloorData = row.current_floor > 0 && row.current_floor <= MAX_FLOORS
    ? FLOORS[row.current_floor - 1] : null;

  return {
    currentFloor: row.current_floor,
    currentRoom: row.current_room,
    floorName: currentFloorData ? currentFloorData.name : null,
    dailyRuns: row.daily_runs,
    maxDailyRuns: DAILY_ATTEMPTS,
    dimShards: row.dim_shards,
    inProgress: !!row.in_progress,
    canEnter: row.daily_runs < DAILY_ATTEMPTS && !row.in_progress,
    floors: FLOORS.map(f => ({ id: f.id, name: f.name })),
  };
}

function enterFloor(charId, floor) {
  const char = db.getCharacterById(charId);
  if (!char) return { success: false };
  if (char.grade < MIN_LEVEL) return { success: false, msg: `Level ${MIN_LEVEL} required` };

  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM dim_war WHERE char_id = ?').get(charId);

  if (row.daily_runs >= DAILY_ATTEMPTS) return { success: false, msg: 'No attempts left today' };
  if (row.in_progress && row.current_floor > 0) {
    // Already in progress — continue from where left off unless explicitly entering floor 1
    if (floor !== 1) return { success: false, msg: 'Already in a run, continue or finish first' };
  }

  if (floor < 1 || floor > MAX_FLOORS) return { success: false, msg: 'Invalid floor' };

  // Can only enter floor 1 to start, or next sequential floor
  if (!row.in_progress && floor !== 1) return { success: false, msg: 'Must start from floor 1' };
  if (row.in_progress && floor !== row.current_floor + 1) return { success: false, msg: 'Must enter the next floor' };

  db.getDatabase().prepare(`
    UPDATE dim_war SET current_floor = ?, current_room = 1, in_progress = 1 WHERE char_id = ?
  `).run(floor, charId);

  const floorData = FLOORS[floor - 1];
  return {
    success: true,
    floor: floorData.id,
    name: floorData.name,
    rooms: ROOMS_PER_FLOOR,
    currentRoom: 1,
  };
}

function fightRoom(charId) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM dim_war WHERE char_id = ?').get(charId);

  if (!row.in_progress || row.current_floor <= 0) return { success: false, msg: 'Not in a dungeon run' };
  if (row.current_room > ROOMS_PER_FLOOR) return { success: false, msg: 'Floor cleared, enter next or collect' };

  const char = db.getCharacterById(charId);
  if (!char) return { success: false };

  const floorData = FLOORS[row.current_floor - 1];
  const room = row.current_room;

  // Room types: 1=combat (officer), 2=puzzle (auto-pass with gold), 3=boss
  let monsterName, monsterHp, monsterAtk, monsterDef;

  if (room === 1) {
    // Combat room — officer
    monsterName = floorData.officer.name;
    monsterHp  = Math.floor(floorData.baseHp  * floorData.officer.hpMul);
    monsterAtk = Math.floor(floorData.baseAtk * floorData.officer.atkMul);
    monsterDef = Math.floor(floorData.baseDef * floorData.officer.defMul);
  } else if (room === 2) {
    // Puzzle room — simplified as easier combat encounter
    monsterName = `${floorData.name} Sentry`;
    monsterHp  = floorData.baseHp;
    monsterAtk = floorData.baseAtk;
    monsterDef = floorData.baseDef;
  } else {
    // Boss room
    monsterName = floorData.boss.name;
    monsterHp  = Math.floor(floorData.baseHp  * floorData.boss.hpMul);
    monsterAtk = Math.floor(floorData.baseAtk * floorData.boss.atkMul);
    monsterDef = Math.floor(floorData.baseDef * floorData.boss.defMul);
  }

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
      round: roundNum, playerDmg: finalDmg, crit, monsterDmg: mDmg,
      playerHp: Math.max(0, playerHp), monsterHp: Math.max(0, mHp),
    });
  }

  const won = mHp <= 0;

  if (won) {
    const nextRoom = room + 1;
    if (nextRoom > ROOMS_PER_FLOOR) {
      // Floor cleared
      if (row.current_floor >= MAX_FLOORS) {
        // All floors done — end run
        db.getDatabase().prepare(`
          UPDATE dim_war SET current_room = ?, in_progress = 0, daily_runs = daily_runs + 1
          WHERE char_id = ?
        `).run(nextRoom, charId);
      } else {
        db.getDatabase().prepare('UPDATE dim_war SET current_room = ? WHERE char_id = ?')
          .run(nextRoom, charId);
      }
    } else {
      db.getDatabase().prepare('UPDATE dim_war SET current_room = ? WHERE char_id = ?')
        .run(nextRoom, charId);
    }

    // Give floor rewards on boss kill
    if (room === ROOMS_PER_FLOOR) {
      const r = floorData.rewards;
      db.getDatabase().prepare('UPDATE characters SET gold = gold + ?, exp = exp + ? WHERE id = ?')
        .run(r.gold, r.exp, charId);
      db.getDatabase().prepare('UPDATE dim_war SET dim_shards = dim_shards + ? WHERE char_id = ?')
        .run(r.shards, charId);
    }
  } else {
    // Failed — end run
    db.getDatabase().prepare('UPDATE dim_war SET in_progress = 0, daily_runs = daily_runs + 1 WHERE char_id = ?')
      .run(charId);
  }

  return {
    success: true, won,
    floor: row.current_floor, room,
    monsterName,
    isBoss: room === ROOMS_PER_FLOOR,
    rounds: rounds.slice(-5),
    rewards: (won && room === ROOMS_PER_FLOOR) ? floorData.rewards : null,
    floorCleared: won && room >= ROOMS_PER_FLOOR,
    dungeonComplete: won && room >= ROOMS_PER_FLOOR && row.current_floor >= MAX_FLOORS,
  };
}

function collectRewards(charId) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM dim_war WHERE char_id = ?').get(charId);

  // Completion bonus for clearing all 5 floors
  if (row.current_floor >= MAX_FLOORS && !row.in_progress) {
    const bonusGold = 20000;
    const bonusExp = 15000;
    const bonusShards = 10;

    db.getDatabase().prepare('UPDATE characters SET gold = gold + ?, exp = exp + ? WHERE id = ?')
      .run(bonusGold, bonusExp, charId);
    db.getDatabase().prepare('UPDATE dim_war SET dim_shards = dim_shards + ? WHERE char_id = ?')
      .run(bonusShards, charId);

    return {
      success: true,
      bonus: { gold: bonusGold, exp: bonusExp, dimShards: bonusShards },
      msg: 'Dimensional War completion bonus collected!',
    };
  }

  return { success: false, msg: 'No completion bonus available' };
}

module.exports = {
  OPCODES, FLOORS, MAX_FLOORS, MIN_LEVEL, DAILY_ATTEMPTS, ROOMS_PER_FLOOR,
  initDB,
  getDimWarInfo, enterFloor, fightRoom, collectRewards,
};
