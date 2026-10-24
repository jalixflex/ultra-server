'use strict';

const db = require('../db');

const OPCODES = {
  C_MAZE_INFO:     0x8600,
  S_MAZE_INFO:     0x8610,
  C_MAZE_ENTER:    0x8601,
  S_MAZE_ENTER:    0x8611,
  C_MAZE_MOVE:     0x8602,
  S_MAZE_MOVE:     0x8612,
  C_MAZE_FIGHT:    0x8603,
  S_MAZE_FIGHT:    0x8613,
  C_MAZE_BOSS:     0x8604,
  S_MAZE_BOSS:     0x8614,
  C_MAZE_COMPLETE: 0x8605,
  S_MAZE_COMPLETE: 0x8615,
};

const MAX_LAYERS = 5;
const ROOMS_PER_LAYER = 9; // 3×3 grid
const DAILY_ATTEMPTS = 2;

const ROOM_TYPES = ['empty', 'monster', 'treasure', 'trap', 'heal', 'merchant', 'elite', 'boss_gate', 'boss'];

const LAYER_CONFIG = [
  { layer: 1, name: 'Shadow Entrance',  minLevel: 40, basePower: 15000, rewards: { gold: 20000,  exp: 10000, mazeTokens: 5 } },
  { layer: 2, name: 'Burning Corridor',  minLevel: 50, basePower: 30000, rewards: { gold: 40000,  exp: 25000, mazeTokens: 10 } },
  { layer: 3, name: 'Frozen Depths',     minLevel: 60, basePower: 50000, rewards: { gold: 70000,  exp: 50000, mazeTokens: 20 } },
  { layer: 4, name: 'Abyssal Core',      minLevel: 70, basePower: 80000, rewards: { gold: 120000, exp: 80000, mazeTokens: 35 } },
  { layer: 5, name: 'Purgatory Throne',  minLevel: 80, basePower: 120000, rewards: { gold: 200000, exp: 150000, mazeTokens: 50 } },
];

const BOSS_NAMES = [
  'Shadow Warden',
  'Inferno Drake',
  'Frost Lich',
  'Abyssal Behemoth',
  'Purgatory Overlord',
];

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS purgatory_maze (
      char_id        INTEGER PRIMARY KEY REFERENCES characters(id),
      current_layer  INTEGER DEFAULT 0,
      current_room   INTEGER DEFAULT -1,
      maze_seed      INTEGER DEFAULT 0,
      maze_rooms     TEXT DEFAULT '',
      hp_remaining   INTEGER DEFAULT 100,
      attempts_today INTEGER DEFAULT 0,
      best_layer     INTEGER DEFAULT 0,
      maze_tokens    INTEGER DEFAULT 0,
      last_reset     TEXT DEFAULT (date('now'))
    );
  `);
}

function ensureEntry(charId) {
  db.getDatabase().prepare('INSERT OR IGNORE INTO purgatory_maze (char_id) VALUES (?)').run(charId);
  checkDailyReset(charId);
}

function checkDailyReset(charId) {
  const row = db.getDatabase().prepare('SELECT last_reset FROM purgatory_maze WHERE char_id = ?').get(charId);
  if (!row) return;
  const today = new Date().toISOString().slice(0, 10);
  if (row.last_reset !== today) {
    db.getDatabase().prepare(
      'UPDATE purgatory_maze SET attempts_today = 0, last_reset = ? WHERE char_id = ?'
    ).run(today, charId);
  }
}

function generateMazeRooms(seed) {
  const rng = seedRandom(seed);
  const rooms = [];
  for (let i = 0; i < ROOMS_PER_LAYER; i++) {
    if (i === ROOMS_PER_LAYER - 1) {
      rooms.push({ index: i, type: 'boss', cleared: false, visited: false });
    } else if (i === ROOMS_PER_LAYER - 2) {
      rooms.push({ index: i, type: 'boss_gate', cleared: false, visited: false });
    } else {
      const typePool = ['monster', 'monster', 'treasure', 'trap', 'heal', 'merchant', 'elite', 'empty'];
      const type = typePool[Math.floor(rng() * typePool.length)];
      rooms.push({ index: i, type, cleared: false, visited: false });
    }
  }
  // Start room is always empty
  rooms[0].type = 'empty';
  rooms[0].visited = true;
  return rooms;
}

function seedRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function getAdjacentRooms(roomIndex) {
  const row = Math.floor(roomIndex / 3);
  const col = roomIndex % 3;
  const adj = [];
  if (row > 0) adj.push(roomIndex - 3);
  if (row < 2) adj.push(roomIndex + 3);
  if (col > 0) adj.push(roomIndex - 1);
  if (col < 2) adj.push(roomIndex + 1);
  return adj;
}

function getMazeInfo(charId) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM purgatory_maze WHERE char_id = ?').get(charId);
  const inMaze = row.current_layer > 0 && row.current_room >= 0;

  return {
    success: true,
    inMaze,
    currentLayer: row.current_layer,
    currentRoom: row.current_room,
    hpRemaining: row.hp_remaining,
    attemptsToday: row.attempts_today,
    maxAttempts: DAILY_ATTEMPTS,
    bestLayer: row.best_layer,
    mazeTokens: row.maze_tokens,
    layers: LAYER_CONFIG,
    rooms: inMaze && row.maze_rooms ? JSON.parse(row.maze_rooms) : null,
    adjacentRooms: inMaze ? getAdjacentRooms(row.current_room) : [],
  };
}

function enterMaze(charId) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM purgatory_maze WHERE char_id = ?').get(charId);

  if (row.current_layer > 0 && row.current_room >= 0) {
    return { success: false, msg: 'Already in the maze' };
  }
  if (row.attempts_today >= DAILY_ATTEMPTS) {
    return { success: false, msg: 'No attempts remaining today' };
  }

  const char = db.getCharacterById(charId);
  if (!char) return { success: false, msg: 'Character not found' };
  if (char.grade < LAYER_CONFIG[0].minLevel) {
    return { success: false, msg: `Level ${LAYER_CONFIG[0].minLevel} required` };
  }

  const seed = Date.now() + charId;
  const rooms = generateMazeRooms(seed);

  db.getDatabase().prepare(`
    UPDATE purgatory_maze
    SET current_layer = 1, current_room = 0, maze_seed = ?, maze_rooms = ?,
        hp_remaining = 100, attempts_today = attempts_today + 1
    WHERE char_id = ?
  `).run(seed, JSON.stringify(rooms), charId);

  return {
    success: true,
    layer: 1,
    layerName: LAYER_CONFIG[0].name,
    rooms: rooms.map(r => ({
      index: r.index,
      type: r.visited ? r.type : 'unknown',
      cleared: r.cleared,
      visited: r.visited,
    })),
    currentRoom: 0,
    adjacentRooms: getAdjacentRooms(0),
    hpRemaining: 100,
  };
}

function moveRoom(charId, targetRoom) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM purgatory_maze WHERE char_id = ?').get(charId);

  if (row.current_layer <= 0 || row.current_room < 0) {
    return { success: false, msg: 'Not in the maze' };
  }

  const adjacent = getAdjacentRooms(row.current_room);
  if (!adjacent.includes(targetRoom)) {
    return { success: false, msg: 'Room not adjacent' };
  }
  if (targetRoom < 0 || targetRoom >= ROOMS_PER_LAYER) {
    return { success: false, msg: 'Invalid room' };
  }

  const rooms = JSON.parse(row.maze_rooms);
  const room = rooms[targetRoom];
  room.visited = true;

  db.getDatabase().prepare('UPDATE purgatory_maze SET current_room = ?, maze_rooms = ? WHERE char_id = ?')
    .run(targetRoom, JSON.stringify(rooms), charId);

  // Apply room effects
  let hp = row.hp_remaining;
  let event = null;
  let goldGain = 0;

  switch (room.type) {
    case 'trap':
      hp = Math.max(0, hp - 15);
      event = 'You triggered a trap! -15 HP';
      break;
    case 'heal':
      hp = Math.min(100, hp + 25);
      event = 'Found a healing spring! +25 HP';
      break;
    case 'treasure': {
      const layerCfg = LAYER_CONFIG[row.current_layer - 1];
      goldGain = Math.floor(layerCfg.rewards.gold * 0.2);
      event = `Found a treasure chest! +${goldGain} gold`;
      room.cleared = true;
      const char = db.getCharacterById(charId);
      if (char) db.updateCharacter(charId, { gold: char.gold + goldGain });
      break;
    }
    case 'empty':
      event = 'An empty room.';
      break;
    case 'merchant':
      event = 'A wandering merchant offers wares (heal 50 HP for 5000 gold).';
      break;
    case 'boss_gate':
      event = 'The boss chamber lies ahead. Prepare yourself!';
      break;
    default:
      break;
  }

  if (hp <= 0) {
    db.getDatabase().prepare(
      'UPDATE purgatory_maze SET current_layer = 0, current_room = -1, hp_remaining = 0, maze_rooms = ? WHERE char_id = ?'
    ).run(JSON.stringify(rooms), charId);
    return { success: true, moved: true, room: room.type, event: 'You have fallen! Maze run over.', hpRemaining: 0, dead: true };
  }

  db.getDatabase().prepare('UPDATE purgatory_maze SET hp_remaining = ?, maze_rooms = ? WHERE char_id = ?')
    .run(hp, JSON.stringify(rooms), charId);

  return {
    success: true,
    moved: true,
    currentRoom: targetRoom,
    room: room.type,
    cleared: room.cleared,
    event,
    hpRemaining: hp,
    adjacentRooms: getAdjacentRooms(targetRoom),
    goldGain,
  };
}

function fightRoom(charId) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM purgatory_maze WHERE char_id = ?').get(charId);
  if (row.current_layer <= 0) return { success: false, msg: 'Not in the maze' };

  const rooms = JSON.parse(row.maze_rooms);
  const room = rooms[row.current_room];
  if (room.type !== 'monster' && room.type !== 'elite') {
    return { success: false, msg: 'No enemies in this room' };
  }
  if (room.cleared) return { success: false, msg: 'Room already cleared' };

  const char = db.getCharacterById(charId);
  const layerCfg = LAYER_CONFIG[row.current_layer - 1];
  const enemyPower = room.type === 'elite' ? layerCfg.basePower * 1.5 : layerCfg.basePower;
  const playerPower = char ? (char.fighting || 10000) : 10000;

  const ratio = playerPower / enemyPower;
  const win = ratio > 0.5 ? Math.random() < Math.min(0.95, ratio * 0.65) : Math.random() < 0.15;

  let hp = row.hp_remaining;
  if (win) {
    const dmgTaken = Math.floor(10 + Math.random() * 10);
    hp = Math.max(0, hp - dmgTaken);
    room.cleared = true;

    const goldReward = room.type === 'elite'
      ? Math.floor(layerCfg.rewards.gold * 0.4)
      : Math.floor(layerCfg.rewards.gold * 0.15);

    if (char) db.updateCharacter(charId, { gold: char.gold + goldReward });

    db.getDatabase().prepare('UPDATE purgatory_maze SET hp_remaining = ?, maze_rooms = ? WHERE char_id = ?')
      .run(hp, JSON.stringify(rooms), charId);

    return {
      success: true,
      won: true,
      enemyType: room.type,
      hpRemaining: hp,
      rewards: { gold: goldReward },
    };
  }

  const dmgTaken = Math.floor(20 + Math.random() * 20);
  hp = Math.max(0, hp - dmgTaken);

  if (hp <= 0) {
    db.getDatabase().prepare(
      'UPDATE purgatory_maze SET current_layer = 0, current_room = -1, hp_remaining = 0 WHERE char_id = ?'
    ).run(charId);
    return { success: true, won: false, dead: true, msg: 'You have been defeated! Maze run over.' };
  }

  db.getDatabase().prepare('UPDATE purgatory_maze SET hp_remaining = ? WHERE char_id = ?').run(hp, charId);
  return { success: true, won: false, hpRemaining: hp, msg: 'Defeated! Lost HP but survived.' };
}

function getLayerBoss(charId) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM purgatory_maze WHERE char_id = ?').get(charId);
  if (row.current_layer <= 0) return { success: false, msg: 'Not in the maze' };

  const rooms = JSON.parse(row.maze_rooms);
  const room = rooms[row.current_room];
  if (room.type !== 'boss') return { success: false, msg: 'Not at the boss room' };
  if (room.cleared) return { success: false, msg: 'Boss already defeated' };

  const layerIdx = row.current_layer - 1;
  const layerCfg = LAYER_CONFIG[layerIdx];
  const char = db.getCharacterById(charId);
  const bossPower = layerCfg.basePower * 2;
  const playerPower = char ? (char.fighting || 10000) : 10000;

  const ratio = playerPower / bossPower;
  const win = ratio > 0.4 ? Math.random() < Math.min(0.90, ratio * 0.6) : Math.random() < 0.1;

  let hp = row.hp_remaining;
  if (win) {
    const dmgTaken = Math.floor(15 + Math.random() * 15);
    hp = Math.max(1, hp - dmgTaken);
    room.cleared = true;

    const newBest = Math.max(row.best_layer, row.current_layer);
    const tokenReward = layerCfg.rewards.mazeTokens;

    db.getDatabase().prepare(
      'UPDATE purgatory_maze SET hp_remaining = ?, best_layer = ?, maze_tokens = maze_tokens + ?, maze_rooms = ? WHERE char_id = ?'
    ).run(hp, newBest, tokenReward, JSON.stringify(rooms), charId);

    // Gold + exp
    if (char) {
      db.updateCharacter(charId, {
        gold: char.gold + layerCfg.rewards.gold,
        exp: char.exp + layerCfg.rewards.exp,
      });
    }

    // Advance to next layer or complete
    if (row.current_layer < MAX_LAYERS) {
      const nextSeed = Date.now() + charId;
      const nextRooms = generateMazeRooms(nextSeed);
      db.getDatabase().prepare(
        'UPDATE purgatory_maze SET current_layer = ?, current_room = 0, maze_seed = ?, maze_rooms = ? WHERE char_id = ?'
      ).run(row.current_layer + 1, nextSeed, JSON.stringify(nextRooms), charId);

      return {
        success: true, won: true,
        bossName: BOSS_NAMES[layerIdx],
        rewards: layerCfg.rewards,
        hpRemaining: hp,
        nextLayer: row.current_layer + 1,
        nextLayerName: LAYER_CONFIG[row.current_layer].name,
      };
    }

    return completeMaze(charId, hp);
  }

  const dmgTaken = Math.floor(30 + Math.random() * 20);
  hp = Math.max(0, hp - dmgTaken);

  if (hp <= 0) {
    db.getDatabase().prepare(
      'UPDATE purgatory_maze SET current_layer = 0, current_room = -1, hp_remaining = 0 WHERE char_id = ?'
    ).run(charId);
    return { success: true, won: false, dead: true, bossName: BOSS_NAMES[layerIdx], msg: 'The boss defeated you! Maze run over.' };
  }

  db.getDatabase().prepare('UPDATE purgatory_maze SET hp_remaining = ? WHERE char_id = ?').run(hp, charId);
  return { success: true, won: false, bossName: BOSS_NAMES[layerIdx], hpRemaining: hp, msg: 'Boss fight lost but you survived.' };
}

function completeMaze(charId, hp) {
  db.getDatabase().prepare(
    'UPDATE purgatory_maze SET current_layer = 0, current_room = -1, best_layer = ? WHERE char_id = ?'
  ).run(MAX_LAYERS, charId);

  return {
    success: true,
    won: true,
    completed: true,
    bossName: BOSS_NAMES[MAX_LAYERS - 1],
    msg: 'Congratulations! You conquered the Purgatory Maze!',
    hpRemaining: hp,
  };
}

function resetDaily(charId) {
  ensureEntry(charId);
  const today = new Date().toISOString().slice(0, 10);
  db.getDatabase().prepare('UPDATE purgatory_maze SET attempts_today = 0, last_reset = ? WHERE char_id = ?')
    .run(today, charId);
}

module.exports = {
  OPCODES, MAX_LAYERS, ROOMS_PER_LAYER, DAILY_ATTEMPTS, LAYER_CONFIG, BOSS_NAMES,
  initDB,
  getMazeInfo, enterMaze, moveRoom, fightRoom, getLayerBoss, completeMaze, resetDaily,
};
