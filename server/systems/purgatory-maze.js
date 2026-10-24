'use strict';

const db = require('../db');

const OPCODES = {
  C_MAZE_INFO:  0x8600,
  S_MAZE_INFO:  0x8610,
  C_MAZE_ENTER: 0x8601,
  S_MAZE_ENTER: 0x8611,
  C_MAZE_MOVE:  0x8602,
  S_MAZE_MOVE:  0x8612,
  C_MAZE_EXIT:  0x8603,
  S_MAZE_EXIT:  0x8613,
};

const GRID_SIZE = 10;
const MAX_ENTRIES = 3;
const TILE = { EMPTY: 0, MONSTER: 1, TREASURE: 2, TRAP: 3, HEAL: 4, BOSS: 5, EXIT: 6, FOG: 7 };

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS purgatory_maze (
      char_id     INTEGER PRIMARY KEY REFERENCES characters(id),
      grid        TEXT DEFAULT '',
      revealed    TEXT DEFAULT '[]',
      px          INTEGER DEFAULT 0,
      py          INTEGER DEFAULT 0,
      hp          INTEGER DEFAULT 1000,
      max_hp      INTEGER DEFAULT 1000,
      potions     INTEGER DEFAULT 0,
      tiles_done  INTEGER DEFAULT 0,
      in_maze     INTEGER DEFAULT 0,
      entries     INTEGER DEFAULT 0,
      last_date   TEXT DEFAULT ''
    );
  `);
}

function ensureEntry(charId) {
  db.getDatabase().prepare('INSERT OR IGNORE INTO purgatory_maze (char_id) VALUES (?)').run(charId);
}

function generateMaze() {
  const g = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(TILE.EMPTY));
  for (let y = 0; y < GRID_SIZE; y++) for (let x = 0; x < GRID_SIZE; x++) {
    if (x === 0 && y === 0) continue;
    if (x === GRID_SIZE - 1 && y === GRID_SIZE - 1) { g[y][x] = TILE.EXIT; continue; }
    const r = Math.random() * 100;
    if (r < 20) g[y][x] = TILE.MONSTER;
    else if (r < 30) g[y][x] = TILE.TREASURE;
    else if (r < 38) g[y][x] = TILE.TRAP;
    else if (r < 45) g[y][x] = TILE.HEAL;
    else if (r < 48) g[y][x] = TILE.BOSS;
  }
  return g;
}

function fogGrid(grid, revealed, px, py) {
  const v = JSON.parse(JSON.stringify(grid));
  const revSet = new Set(revealed.map(r => r[0] + ',' + r[1]));
  for (let y = 0; y < GRID_SIZE; y++) for (let x = 0; x < GRID_SIZE; x++) {
    if (!(Math.abs(x - px) <= 1 && Math.abs(y - py) <= 1) && !revSet.has(x + ',' + y)) v[y][x] = TILE.FOG;
  }
  return v;
}

function getMazeInfo(charId) {
  ensureEntry(charId);
  const r = db.getDatabase().prepare('SELECT * FROM purgatory_maze WHERE char_id = ?').get(charId);
  const today = new Date().toISOString().slice(0, 10);
  const entries = r.last_date === today ? r.entries : 0;
  if (r.in_maze && r.grid) {
    const grid = JSON.parse(r.grid);
    const rev = JSON.parse(r.revealed || '[]');
    return { success: true, inMaze: true, grid: fogGrid(grid, rev, r.px, r.py), px: r.px, py: r.py, hp: r.hp, maxHp: r.max_hp, potions: r.potions, tilesExplored: r.tiles_done, entries, maxEntries: MAX_ENTRIES };
  }
  return { success: true, inMaze: false, entries, maxEntries: MAX_ENTRIES };
}

function enterMaze(charId) {
  ensureEntry(charId);
  const r = db.getDatabase().prepare('SELECT * FROM purgatory_maze WHERE char_id = ?').get(charId);
  const today = new Date().toISOString().slice(0, 10);
  const entries = r.last_date === today ? r.entries : 0;
  if (entries >= MAX_ENTRIES) return { success: false, msg: 'No entries left' };
  if (r.in_maze) return { success: false, msg: 'Already in maze' };
  const char = db.getCharacterById(charId);
  const maxHp = Math.max(1000, char?.battle_rating || 1000);
  const grid = generateMaze();
  db.getDatabase().prepare("UPDATE purgatory_maze SET grid = ?, revealed = '[[0,0]]', px = 0, py = 0, hp = ?, max_hp = ?, potions = 0, tiles_done = 1, in_maze = 1, entries = ?, last_date = ? WHERE char_id = ?")
    .run(JSON.stringify(grid), maxHp, maxHp, entries + 1, today, charId);
  return { success: true, grid: fogGrid(grid, [[0,0]], 0, 0), hp: maxHp, maxHp };
}

function moveMaze(charId, dx, dy) {
  ensureEntry(charId);
  const r = db.getDatabase().prepare('SELECT * FROM purgatory_maze WHERE char_id = ?').get(charId);
  if (!r.in_maze) return { success: false, msg: 'Not in maze' };
  if (Math.abs(dx) + Math.abs(dy) !== 1) return { success: false, msg: 'Invalid move' };
  const nx = r.px + dx, ny = r.py + dy;
  if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) return { success: false, msg: 'Out of bounds' };

  const grid = JSON.parse(r.grid);
  const rev = JSON.parse(r.revealed || '[]');
  const tile = grid[ny][nx];
  let hp = r.hp;
  let potions = r.potions;
  let event = { type: 'empty' };
  let mazeComplete = false;

  if (tile === TILE.MONSTER) {
    const dmg = 100 + Math.floor(Math.random() * 300);
    hp = Math.max(0, hp - dmg);
    const gold = 2000 + Math.floor(Math.random() * 8000);
    event = { type: 'monster', damage: dmg, gold };
    db.getDatabase().prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').run(gold, charId);
    grid[ny][nx] = TILE.EMPTY;
  } else if (tile === TILE.TREASURE) {
    const gold = 5000 + Math.floor(Math.random() * 10000);
    event = { type: 'treasure', gold };
    db.getDatabase().prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').run(gold, charId);
    grid[ny][nx] = TILE.EMPTY;
  } else if (tile === TILE.TRAP) {
    const dmg = 100 + Math.floor(Math.random() * 200);
    hp = Math.max(0, hp - dmg);
    event = { type: 'trap', damage: dmg };
    grid[ny][nx] = TILE.EMPTY;
  } else if (tile === TILE.HEAL) {
    const heal = Math.floor(r.max_hp * 0.3);
    hp = Math.min(r.max_hp, hp + heal);
    potions++;
    event = { type: 'heal', healed: heal };
    grid[ny][nx] = TILE.EMPTY;
  } else if (tile === TILE.BOSS) {
    const dmg = 300 + Math.floor(Math.random() * 500);
    hp = Math.max(0, hp - dmg);
    const gold = 20000 + Math.floor(Math.random() * 30000);
    event = { type: 'boss', damage: dmg, gold };
    db.getDatabase().prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').run(gold, charId);
    grid[ny][nx] = TILE.EMPTY;
  } else if (tile === TILE.EXIT) {
    mazeComplete = true;
    const bonus = r.tiles_done * 500;
    event = { type: 'exit', bonus };
    db.getDatabase().prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').run(bonus, charId);
  }

  if (hp <= 0) {
    const partial = r.tiles_done * 200;
    db.getDatabase().prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').run(partial, charId);
    db.getDatabase().prepare('UPDATE purgatory_maze SET in_maze = 0 WHERE char_id = ?').run(charId);
    return { success: true, dead: true, event, partialReward: partial };
  }

  if (!rev.find(p => p[0] === nx && p[1] === ny)) rev.push([nx, ny]);

  if (mazeComplete) {
    db.getDatabase().prepare('UPDATE purgatory_maze SET in_maze = 0 WHERE char_id = ?').run(charId);
  } else {
    db.getDatabase().prepare('UPDATE purgatory_maze SET grid = ?, revealed = ?, px = ?, py = ?, hp = ?, potions = ?, tiles_done = tiles_done + 1 WHERE char_id = ?')
      .run(JSON.stringify(grid), JSON.stringify(rev), nx, ny, hp, potions, charId);
  }

  return { success: true, dead: false, position: { x: nx, y: ny }, hp, potions, event, mazeComplete, grid: fogGrid(grid, rev, nx, ny) };
}

function exitMaze(charId) {
  ensureEntry(charId);
  const r = db.getDatabase().prepare('SELECT * FROM purgatory_maze WHERE char_id = ?').get(charId);
  if (!r.in_maze) return { success: false, msg: 'Not in maze' };
  const partial = r.tiles_done * 200;
  db.getDatabase().prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').run(partial, charId);
  db.getDatabase().prepare('UPDATE purgatory_maze SET in_maze = 0 WHERE char_id = ?').run(charId);
  return { success: true, tilesExplored: r.tiles_done, reward: { gold: partial } };
}

module.exports = { OPCODES, GRID_SIZE, MAX_ENTRIES, TILE, initDB, getMazeInfo, enterMaze, moveMaze, exitMaze };
