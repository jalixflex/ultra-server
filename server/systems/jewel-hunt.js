'use strict';

const db = require('../db');

const OPCODES = {
  C_JEWEL_HUNT_INFO:    0x8400,
  S_JEWEL_HUNT_INFO:    0x8410,
  C_JEWEL_HUNT_START:   0x8401,
  S_JEWEL_HUNT_START:   0x8411,
  C_JEWEL_HUNT_MOVE:    0x8402,
  S_JEWEL_HUNT_MOVE:    0x8412,
  C_JEWEL_HUNT_COLLECT: 0x8403,
  S_JEWEL_HUNT_COLLECT: 0x8413,
};

const GRID_SIZE = 8;
const COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'white'];
const GAME_DURATION = 60; // seconds
const OPEN_DAYS = [3, 6]; // Wed, Sat (0=Sun)

const REWARD_TIERS = [
  { minScore: 0,    name: 'Basic',     gold: 5000,   exp: 2000,  boundBalens: 0 },
  { minScore: 500,  name: 'Good',      gold: 15000,  exp: 5000,  boundBalens: 5 },
  { minScore: 1000, name: 'Great',     gold: 30000,  exp: 10000, boundBalens: 15 },
  { minScore: 2000, name: 'Legendary', gold: 60000,  exp: 25000, boundBalens: 30 },
];

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS jewel_hunt (
      char_id     INTEGER PRIMARY KEY REFERENCES characters(id),
      grid        TEXT DEFAULT '',
      score       INTEGER DEFAULT 0,
      started_at  TEXT DEFAULT '',
      finished    INTEGER DEFAULT 1,
      collected   INTEGER DEFAULT 0,
      last_date   TEXT DEFAULT ''
    );
  `);
}

function isOpen() {
  const day = new Date().getDay();
  return OPEN_DAYS.includes(day);
}

function generateGrid() {
  const grid = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    const row = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      row.push(COLORS[Math.floor(Math.random() * COLORS.length)]);
    }
    grid.push(row);
  }
  // Remove initial matches by re-rolling
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      while (hasMatchAt(grid, x, y)) {
        grid[y][x] = COLORS[Math.floor(Math.random() * COLORS.length)];
      }
    }
  }
  return grid;
}

function hasMatchAt(grid, x, y) {
  const c = grid[y][x];
  // Horizontal
  if (x >= 2 && grid[y][x - 1] === c && grid[y][x - 2] === c) return true;
  // Vertical
  if (y >= 2 && grid[y - 1][x] === c && grid[y - 2][x] === c) return true;
  return false;
}

function findAndClearMatches(grid) {
  const matched = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(false));
  let totalCleared = 0;

  // Horizontal
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x <= GRID_SIZE - 3; x++) {
      const c = grid[y][x];
      if (!c) continue;
      let len = 1;
      while (x + len < GRID_SIZE && grid[y][x + len] === c) len++;
      if (len >= 3) {
        for (let i = 0; i < len; i++) matched[y][x + i] = true;
      }
    }
  }
  // Vertical
  for (let x = 0; x < GRID_SIZE; x++) {
    for (let y = 0; y <= GRID_SIZE - 3; y++) {
      const c = grid[y][x];
      if (!c) continue;
      let len = 1;
      while (y + len < GRID_SIZE && grid[y + len][x] === c) len++;
      if (len >= 3) {
        for (let i = 0; i < len; i++) matched[y + i][x] = true;
      }
    }
  }

  // Clear matched
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (matched[y][x]) {
        grid[y][x] = null;
        totalCleared++;
      }
    }
  }

  // Gravity: drop jewels down
  for (let x = 0; x < GRID_SIZE; x++) {
    let writeY = GRID_SIZE - 1;
    for (let y = GRID_SIZE - 1; y >= 0; y--) {
      if (grid[y][x] !== null) {
        grid[writeY][x] = grid[y][x];
        if (writeY !== y) grid[y][x] = null;
        writeY--;
      }
    }
    // Fill top with new jewels
    for (let y = writeY; y >= 0; y--) {
      grid[y][x] = COLORS[Math.floor(Math.random() * COLORS.length)];
    }
  }

  return totalCleared;
}

function ensureEntry(charId) {
  db.getDatabase().prepare('INSERT OR IGNORE INTO jewel_hunt (char_id) VALUES (?)').run(charId);
}

function getJewelHuntInfo(charId) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM jewel_hunt WHERE char_id = ?').get(charId);
  const today = new Date().toISOString().slice(0, 10);
  const playedToday = row.last_date === today && row.collected;

  return {
    isOpen: isOpen(),
    openDays: 'Wed, Sat',
    playedToday,
    score: row.finished ? row.score : 0,
    inProgress: !row.finished && row.started_at !== '',
    grid: (!row.finished && row.grid) ? JSON.parse(row.grid) : null,
    timeLeft: (!row.finished && row.started_at)
      ? Math.max(0, GAME_DURATION - Math.floor((Date.now() - new Date(row.started_at).getTime()) / 1000))
      : 0,
  };
}

function startJewelHunt(charId) {
  if (!isOpen()) return { success: false, msg: 'Jewel Hunt is only open on Wed and Sat' };

  ensureEntry(charId);
  const today = new Date().toISOString().slice(0, 10);
  const row = db.getDatabase().prepare('SELECT * FROM jewel_hunt WHERE char_id = ?').get(charId);
  if (row.last_date === today && row.collected) return { success: false, msg: 'Already played today' };

  const grid = generateGrid();
  const now = new Date().toISOString();

  db.getDatabase().prepare(`
    UPDATE jewel_hunt SET grid = ?, score = 0, started_at = ?, finished = 0, collected = 0, last_date = ?
    WHERE char_id = ?
  `).run(JSON.stringify(grid), now, today, charId);

  return { success: true, grid, timeLimit: GAME_DURATION };
}

function makeMove(charId, fromX, fromY, toX, toY) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM jewel_hunt WHERE char_id = ?').get(charId);
  if (row.finished) return { success: false, msg: 'No active game' };

  // Check time
  const elapsed = (Date.now() - new Date(row.started_at).getTime()) / 1000;
  if (elapsed > GAME_DURATION) {
    db.getDatabase().prepare('UPDATE jewel_hunt SET finished = 1 WHERE char_id = ?').run(charId);
    return { success: false, msg: 'Time is up', score: row.score, finished: true };
  }

  // Validate adjacency
  const dx = Math.abs(fromX - toX);
  const dy = Math.abs(fromY - toY);
  if ((dx + dy) !== 1) return { success: false, msg: 'Invalid move — must swap adjacent jewels' };
  if (fromX < 0 || fromX >= GRID_SIZE || fromY < 0 || fromY >= GRID_SIZE) return { success: false, msg: 'Out of bounds' };
  if (toX < 0 || toX >= GRID_SIZE || toY < 0 || toY >= GRID_SIZE) return { success: false, msg: 'Out of bounds' };

  const grid = JSON.parse(row.grid);

  // Swap
  const tmp = grid[fromY][fromX];
  grid[fromY][fromX] = grid[toY][toX];
  grid[toY][toX] = tmp;

  // Check matches
  let totalScore = 0;
  let cleared = findAndClearMatches(grid);
  if (cleared === 0) {
    // Swap back — invalid move
    grid[toY][toX] = grid[fromY][fromX];
    grid[fromY][fromX] = tmp;
    return { success: false, msg: 'No match — swap reverted' };
  }

  // Chain matches
  while (cleared > 0) {
    const points = cleared * 10 * (cleared >= 5 ? 3 : cleared >= 4 ? 2 : 1);
    totalScore += points;
    cleared = findAndClearMatches(grid);
  }

  const newScore = row.score + totalScore;
  db.getDatabase().prepare('UPDATE jewel_hunt SET grid = ?, score = ? WHERE char_id = ?')
    .run(JSON.stringify(grid), newScore, charId);

  return {
    success: true,
    grid,
    pointsEarned: totalScore,
    totalScore: newScore,
    timeLeft: Math.max(0, GAME_DURATION - Math.floor(elapsed)),
  };
}

function collectJewelReward(charId) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM jewel_hunt WHERE char_id = ?').get(charId);

  // Auto-finish if time up
  if (!row.finished && row.started_at) {
    const elapsed = (Date.now() - new Date(row.started_at).getTime()) / 1000;
    if (elapsed > GAME_DURATION) {
      db.getDatabase().prepare('UPDATE jewel_hunt SET finished = 1 WHERE char_id = ?').run(charId);
    } else {
      return { success: false, msg: 'Game still in progress' };
    }
  }

  if (row.collected) return { success: false, msg: 'Already collected' };
  if (!row.score && row.score !== 0) return { success: false, msg: 'No game to collect' };

  // Find tier
  let tier = REWARD_TIERS[0];
  for (const t of REWARD_TIERS) {
    if (row.score >= t.minScore) tier = t;
  }

  db.getDatabase().prepare('UPDATE characters SET gold = gold + ?, exp = exp + ?, bound_balens = bound_balens + ? WHERE id = ?')
    .run(tier.gold, tier.exp, tier.boundBalens, charId);
  db.getDatabase().prepare('UPDATE jewel_hunt SET collected = 1 WHERE char_id = ?').run(charId);

  return {
    success: true,
    score: row.score,
    tier: tier.name,
    rewards: { gold: tier.gold, exp: tier.exp, boundBalens: tier.boundBalens },
  };
}

module.exports = {
  OPCODES, GRID_SIZE, COLORS, REWARD_TIERS, OPEN_DAYS,
  initDB,
  getJewelHuntInfo, startJewelHunt, makeMove, collectJewelReward,
};
