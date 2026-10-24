'use strict';

const db = require('../db');

const OPCODES = {
  C_ARCH_INFO:    0x8700,
  S_ARCH_INFO:    0x8710,
  C_ARCH_DIG:     0x8701,
  S_ARCH_DIG:     0x8711,
  C_ARCH_COLLECT: 0x8702,
  S_ARCH_COLLECT: 0x8712,
};

const GRID_W = 6;
const GRID_H = 6;
const MAX_DIGS = 20;

const TREASURES = [
  { id: 'gold_s',    name: 'Gold Pouch',       type: 'gold',    amount: 2000,  rarity: 'common',   depth: 1 },
  { id: 'gold_m',    name: 'Gold Chest',       type: 'gold',    amount: 8000,  rarity: 'uncommon', depth: 2 },
  { id: 'gold_l',    name: 'Gold Vault',       type: 'gold',    amount: 25000, rarity: 'rare',     depth: 3 },
  { id: 'exp_s',     name: 'EXP Scroll',       type: 'exp',     amount: 3000,  rarity: 'common',   depth: 1 },
  { id: 'exp_m',     name: 'EXP Tome',         type: 'exp',     amount: 10000, rarity: 'uncommon', depth: 2 },
  { id: 'bbalens_s', name: 'Bound Balen Sack', type: 'bound_balens', amount: 5,  rarity: 'rare',  depth: 2 },
  { id: 'bbalens_m', name: 'Balen Chest',      type: 'bound_balens', amount: 20, rarity: 'epic',  depth: 3 },
  { id: 'frag_a',    name: 'Ancient Coin',     type: 'fragment', setId: 'coins',   rarity: 'uncommon', depth: 1 },
  { id: 'frag_b',    name: 'Ancient Vase',     type: 'fragment', setId: 'relics',  rarity: 'rare',    depth: 2 },
  { id: 'frag_c',    name: 'Ancient Crown',    type: 'fragment', setId: 'relics',  rarity: 'epic',    depth: 3 },
  { id: 'frag_d',    name: 'Ancient Scroll',   type: 'fragment', setId: 'scrolls', rarity: 'rare',    depth: 2 },
  { id: 'frag_e',    name: 'Ancient Ring',     type: 'fragment', setId: 'jewelry', rarity: 'epic',    depth: 3 },
];

const COLLECTIONS = {
  coins:   { name: 'Ancient Coins',   needed: 5, reward: { gold: 100000 } },
  relics:  { name: 'Ancient Relics',  needed: 3, reward: { gold: 50000, boundBalens: 50 } },
  scrolls: { name: 'Ancient Scrolls', needed: 4, reward: { exp: 80000 } },
  jewelry: { name: 'Ancient Jewelry', needed: 3, reward: { gold: 80000, boundBalens: 80 } },
};

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS archaeology (
      char_id   INTEGER PRIMARY KEY REFERENCES characters(id),
      grid      TEXT DEFAULT '',
      digs_left INTEGER DEFAULT ${MAX_DIGS},
      last_date TEXT DEFAULT '',
      found     TEXT DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS arch_fragments (
      char_id INTEGER NOT NULL,
      frag_id TEXT NOT NULL,
      count   INTEGER DEFAULT 0,
      PRIMARY KEY(char_id, frag_id)
    );
    CREATE TABLE IF NOT EXISTS arch_collections (
      char_id   INTEGER NOT NULL,
      set_id    TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      PRIMARY KEY(char_id, set_id)
    );
  `);
}

function ensureEntry(charId) {
  db.getDatabase().prepare('INSERT OR IGNORE INTO archaeology (char_id) VALUES (?)').run(charId);
}

function generateGrid() {
  const grid = Array.from({ length: GRID_H }, () => Array(GRID_W).fill(null));
  const num = 8 + Math.floor(Math.random() * 5);
  for (let i = 0; i < num; i++) {
    let x, y;
    do { x = Math.floor(Math.random() * GRID_W); y = Math.floor(Math.random() * GRID_H); } while (grid[y][x] !== null);
    const depth = y < 2 ? 1 : y < 4 ? 2 : 3;
    const pool = TREASURES.filter(t => t.depth <= depth);
    grid[y][x] = pool[Math.floor(Math.random() * pool.length)].id;
  }
  return grid;
}

function getArchInfo(charId) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM archaeology WHERE char_id = ?').get(charId);
  const today = new Date().toISOString().slice(0, 10);
  if (row.last_date !== today || !row.grid) {
    const grid = generateGrid();
    db.getDatabase().prepare('UPDATE archaeology SET grid = ?, digs_left = ?, last_date = ?, found = ? WHERE char_id = ?')
      .run(JSON.stringify(grid), MAX_DIGS, today, '[]', charId);
    return { success: true, digsLeft: MAX_DIGS, gridSize: { w: GRID_W, h: GRID_H }, found: [], collections: getCollections(charId) };
  }
  return { success: true, digsLeft: row.digs_left, gridSize: { w: GRID_W, h: GRID_H }, found: JSON.parse(row.found || '[]'), collections: getCollections(charId) };
}

function dig(charId, x, y) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM archaeology WHERE char_id = ?').get(charId);
  const today = new Date().toISOString().slice(0, 10);
  if (row.last_date !== today) return { success: false, msg: 'Open archaeology first' };
  if (row.digs_left <= 0) return { success: false, msg: 'No digs left' };
  if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) return { success: false, msg: 'Invalid position' };
  const found = JSON.parse(row.found || '[]');
  if (found.find(f => f.x === x && f.y === y)) return { success: false, msg: 'Already dug here' };

  const grid = JSON.parse(row.grid);
  const tid = grid[y][x];
  let result = { found: false };

  if (tid) {
    const t = TREASURES.find(tr => tr.id === tid);
    if (t) {
      if (t.type === 'gold') db.getDatabase().prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').run(t.amount, charId);
      else if (t.type === 'exp') db.getDatabase().prepare('UPDATE characters SET exp = exp + ? WHERE id = ?').run(t.amount, charId);
      else if (t.type === 'bound_balens') db.getDatabase().prepare('UPDATE characters SET bound_balens = bound_balens + ? WHERE id = ?').run(t.amount, charId);
      else if (t.type === 'fragment') {
        db.getDatabase().prepare('INSERT OR IGNORE INTO arch_fragments (char_id, frag_id) VALUES (?, ?)').run(charId, t.id);
        db.getDatabase().prepare('UPDATE arch_fragments SET count = count + 1 WHERE char_id = ? AND frag_id = ?').run(charId, t.id);
      }
      result = { found: true, treasure: { id: t.id, name: t.name, type: t.type, amount: t.amount, rarity: t.rarity } };
    }
  }

  found.push({ x, y, treasureId: tid || null });
  db.getDatabase().prepare('UPDATE archaeology SET digs_left = digs_left - 1, found = ? WHERE char_id = ?').run(JSON.stringify(found), charId);
  return { success: true, ...result, digsLeft: row.digs_left - 1 };
}

function getCollections(charId) {
  const result = {};
  for (const [setId, col] of Object.entries(COLLECTIONS)) {
    const frags = TREASURES.filter(t => t.setId === setId);
    let total = 0;
    for (const f of frags) {
      const r = db.getDatabase().prepare('SELECT count FROM arch_fragments WHERE char_id = ? AND frag_id = ?').get(charId, f.id);
      total += r ? r.count : 0;
    }
    const comp = db.getDatabase().prepare('SELECT completed FROM arch_collections WHERE char_id = ? AND set_id = ?').get(charId, setId);
    result[setId] = { name: col.name, progress: total, needed: col.needed, completed: !!comp?.completed, reward: col.reward };
  }
  return result;
}

function collectSet(charId, setId) {
  const col = COLLECTIONS[setId];
  if (!col) return { success: false, msg: 'Invalid set' };
  const status = getCollections(charId);
  const s = status[setId];
  if (s.completed) return { success: false, msg: 'Already collected' };
  if (s.progress < s.needed) return { success: false, msg: 'Not enough pieces' };
  if (col.reward.gold) db.getDatabase().prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').run(col.reward.gold, charId);
  if (col.reward.exp) db.getDatabase().prepare('UPDATE characters SET exp = exp + ? WHERE id = ?').run(col.reward.exp, charId);
  if (col.reward.boundBalens) db.getDatabase().prepare('UPDATE characters SET bound_balens = bound_balens + ? WHERE id = ?').run(col.reward.boundBalens, charId);
  db.getDatabase().prepare('INSERT OR REPLACE INTO arch_collections (char_id, set_id, completed) VALUES (?, ?, 1)').run(charId, setId);
  return { success: true, setId, name: col.name, reward: col.reward };
}

module.exports = { OPCODES, GRID_W, GRID_H, MAX_DIGS, TREASURES, COLLECTIONS, initDB, getArchInfo, dig, collectSet };
