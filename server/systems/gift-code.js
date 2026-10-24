'use strict';

const db = require('../db');

const OPCODES = {
  C_REDEEM_CODE:  0x9A00,
  S_REDEEM_RSP:   0x9A10,
};

const DEFAULT_CODES = [
  { code: 'WELCOME2024', rewards: { gold: 10000, balens: 50 }, maxUses: 9999, desc: 'Hoşgeldin paketi' },
  { code: 'WARTUNE',     rewards: { items: [{ itemId: 100003, count: 5 }, { itemId: 100001, count: 10 }] }, maxUses: 9999, desc: 'Başlangıç malzemeleri' },
  { code: 'ULTRA',       rewards: { bound_balens: 100, items: [{ itemId: 3001, count: 1, quality: 2 }] }, maxUses: 9999, desc: 'Ultra bonus' },
];

function initDB() {
  const d = db.getDatabase();
  d.exec(`
    CREATE TABLE IF NOT EXISTS gift_codes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      code        TEXT UNIQUE NOT NULL,
      rewards     TEXT NOT NULL DEFAULT '{}',
      max_uses    INTEGER DEFAULT 1,
      used_count  INTEGER DEFAULT 0,
      expires_at  TEXT DEFAULT NULL,
      created_at  TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS gift_code_usage (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id     INTEGER NOT NULL REFERENCES characters(id),
      code_id     INTEGER NOT NULL REFERENCES gift_codes(id),
      used_at     TEXT DEFAULT (datetime('now')),
      UNIQUE(char_id, code_id)
    );
  `);

  // Seed default codes
  const insert = d.prepare('INSERT OR IGNORE INTO gift_codes (code, rewards, max_uses) VALUES (?, ?, ?)');
  for (const c of DEFAULT_CODES) {
    insert.run(c.code, JSON.stringify(c.rewards), c.maxUses);
  }
}

function createCode(code, rewards, maxUses, expiresAt) {
  try {
    const result = db.getDatabase().prepare(`
      INSERT INTO gift_codes (code, rewards, max_uses, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(code.toUpperCase(), JSON.stringify(rewards), maxUses || 1, expiresAt || null);
    return { success: true, id: result.lastInsertRowid };
  } catch (e) {
    return { success: false, msg: 'Code already exists' };
  }
}

function redeemCode(charId, codeStr) {
  const row = db.getDatabase().prepare('SELECT * FROM gift_codes WHERE code = ?').get(codeStr.toUpperCase());
  if (!row) return { success: false, msg: 'Geçersiz kod' };

  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return { success: false, msg: 'Kodun süresi dolmuş' };
  }
  if (row.used_count >= row.max_uses) {
    return { success: false, msg: 'Kod kullanım limitine ulaşmış' };
  }

  const used = db.getDatabase().prepare(
    'SELECT id FROM gift_code_usage WHERE char_id = ? AND code_id = ?'
  ).get(charId, row.id);
  if (used) return { success: false, msg: 'Bu kodu zaten kullandınız' };

  const rewards = JSON.parse(row.rewards);
  const given = [];

  if (rewards.gold) {
    db.getDatabase().prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').run(rewards.gold, charId);
    given.push({ type: 'gold', amount: rewards.gold });
  }
  if (rewards.balens) {
    db.getDatabase().prepare('UPDATE characters SET balens = balens + ? WHERE id = ?').run(rewards.balens, charId);
    given.push({ type: 'balens', amount: rewards.balens });
  }
  if (rewards.bound_balens) {
    db.getDatabase().prepare('UPDATE characters SET bound_balens = bound_balens + ? WHERE id = ?').run(rewards.bound_balens, charId);
    given.push({ type: 'bound_balens', amount: rewards.bound_balens });
  }
  if (rewards.exp) {
    db.getDatabase().prepare('UPDATE characters SET exp = exp + ? WHERE id = ?').run(rewards.exp, charId);
    given.push({ type: 'exp', amount: rewards.exp });
  }
  if (rewards.items && Array.isArray(rewards.items)) {
    const inventory = require('./inventory');
    for (const item of rewards.items) {
      inventory.addItem(charId, item.itemId, item.count || 1, item.quality || 0);
      given.push({ type: 'item', itemId: item.itemId, count: item.count || 1 });
    }
  }

  db.getDatabase().prepare(
    'INSERT INTO gift_code_usage (char_id, code_id) VALUES (?, ?)'
  ).run(charId, row.id);
  db.getDatabase().prepare(
    'UPDATE gift_codes SET used_count = used_count + 1 WHERE id = ?'
  ).run(row.id);

  return { success: true, rewards: given };
}

function listCodes() {
  return db.getDatabase().prepare('SELECT id, code, rewards, max_uses, used_count, expires_at, created_at FROM gift_codes ORDER BY id DESC').all();
}

function getCodeInfo(code) {
  code = (code || '').trim().toUpperCase();
  const row = db.getDatabase().prepare('SELECT * FROM gift_codes WHERE code = ?').get(code);
  if (!row) return null;
  return {
    code: row.code,
    maxUses: row.max_uses,
    usedCount: row.used_count,
    expiresAt: row.expires_at,
    rewards: JSON.parse(row.rewards || '{}'),
  };
}

module.exports = {
  OPCODES,
  initDB,
  createCode, redeemCode, getCodeInfo, listCodes,
};
