'use strict';

const db = require('../db');

const OPCODES = {
  C_SOCIAL_PROFILE:    0x8200,
  S_SOCIAL_PROFILE:    0x8210,
  C_SOCIAL_SEND_GIFT:  0x8201,
  S_SOCIAL_SEND_GIFT:  0x8211,
  C_SOCIAL_BLOCK:      0x8202,
  S_SOCIAL_BLOCK:      0x8212,
  C_SOCIAL_UNBLOCK:    0x8203,
  S_SOCIAL_UNBLOCK:    0x8213,
  C_SOCIAL_BLOCK_LIST: 0x8204,
  S_SOCIAL_BLOCK_LIST: 0x8214,
  C_SOCIAL_SEARCH:     0x8205,
  S_SOCIAL_SEARCH:     0x8215,
  C_SOCIAL_RECOMMEND:  0x8206,
  S_SOCIAL_RECOMMEND:  0x8216,
};

const GIFTS = [
  { id: 'flower',  name: 'Flower',  cost: 1000,   charm: 1 },
  { id: 'rose',    name: 'Rose',    cost: 5000,   charm: 5 },
  { id: 'heart',   name: 'Heart',   cost: 20000,  charm: 20 },
  { id: 'diamond', name: 'Diamond', cost: 100000, charm: 100 },
];

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS social_profile (
      char_id INTEGER PRIMARY KEY REFERENCES characters(id),
      charm   INTEGER DEFAULT 0,
      bio     TEXT DEFAULT '',
      title   TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS social_gifts (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      from_id INTEGER NOT NULL,
      to_id   INTEGER NOT NULL,
      gift_id TEXT NOT NULL,
      sent_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS social_blocks (
      char_id    INTEGER NOT NULL,
      blocked_id INTEGER NOT NULL,
      PRIMARY KEY(char_id, blocked_id)
    );
    CREATE TABLE IF NOT EXISTS social_gift_daily (
      char_id   INTEGER PRIMARY KEY,
      count     INTEGER DEFAULT 0,
      last_date TEXT DEFAULT ''
    );
  `);
}

function ensureProfile(charId) {
  db.getDatabase().prepare('INSERT OR IGNORE INTO social_profile (char_id) VALUES (?)').run(charId);
  db.getDatabase().prepare('INSERT OR IGNORE INTO social_gift_daily (char_id) VALUES (?)').run(charId);
}

function getProfile(charId, targetId) {
  const tid = targetId || charId;
  ensureProfile(tid);
  const char = db.getCharacterById(tid);
  if (!char) return { success: false, msg: 'Player not found' };
  const prof = db.getDatabase().prepare('SELECT * FROM social_profile WHERE char_id = ?').get(tid);
  return { success: true, profile: { id: char.id, name: char.name, class: char.class, level: char.grade, br: char.battle_rating || 0, charm: prof?.charm || 0, bio: prof?.bio || '', online: !!char.is_online } };
}

function sendGift(fromId, toId, giftId) {
  if (fromId === toId) return { success: false, msg: 'Cannot gift yourself' };
  const gift = GIFTS.find(g => g.id === giftId);
  if (!gift) return { success: false, msg: 'Invalid gift' };
  const target = db.getCharacterById(toId);
  if (!target) return { success: false, msg: 'Player not found' };
  const sender = db.getCharacterById(fromId);
  if (!sender || sender.gold < gift.cost) return { success: false, msg: 'Not enough gold' };
  const blocked = db.getDatabase().prepare('SELECT 1 FROM social_blocks WHERE char_id = ? AND blocked_id = ?').get(toId, fromId);
  if (blocked) return { success: false, msg: 'Blocked by this player' };

  ensureProfile(fromId);
  const today = new Date().toISOString().slice(0, 10);
  const daily = db.getDatabase().prepare('SELECT * FROM social_gift_daily WHERE char_id = ?').get(fromId);
  if (daily && daily.last_date === today && daily.count >= 20) return { success: false, msg: 'Daily gift limit reached' };

  db.getDatabase().prepare('UPDATE characters SET gold = gold - ? WHERE id = ?').run(gift.cost, fromId);
  ensureProfile(toId);
  db.getDatabase().prepare('UPDATE social_profile SET charm = charm + ? WHERE char_id = ?').run(gift.charm, toId);
  db.getDatabase().prepare('INSERT INTO social_gifts (from_id, to_id, gift_id) VALUES (?, ?, ?)').run(fromId, toId, giftId);
  if (daily && daily.last_date === today) {
    db.getDatabase().prepare('UPDATE social_gift_daily SET count = count + 1 WHERE char_id = ?').run(fromId);
  } else {
    db.getDatabase().prepare('UPDATE social_gift_daily SET count = 1, last_date = ? WHERE char_id = ?').run(today, fromId);
  }
  return { success: true, gift: gift.name, charm: gift.charm, recipient: target.name };
}

function blockPlayer(charId, targetId) {
  if (charId === targetId) return { success: false, msg: 'Cannot block yourself' };
  db.getDatabase().prepare('INSERT OR IGNORE INTO social_blocks (char_id, blocked_id) VALUES (?, ?)').run(charId, targetId);
  return { success: true };
}

function unblockPlayer(charId, targetId) {
  db.getDatabase().prepare('DELETE FROM social_blocks WHERE char_id = ? AND blocked_id = ?').run(charId, targetId);
  return { success: true };
}

function getBlockList(charId) {
  const rows = db.getDatabase().prepare('SELECT b.blocked_id, c.name FROM social_blocks b JOIN characters c ON c.id = b.blocked_id WHERE b.char_id = ?').all(charId);
  return { success: true, blocked: rows.map(r => ({ id: r.blocked_id, name: r.name })) };
}

function searchPlayers(query, limit) {
  const rows = db.getDatabase().prepare('SELECT id, name, class, grade, battle_rating FROM characters WHERE name LIKE ? LIMIT ?').all('%' + query + '%', limit || 20);
  return { success: true, results: rows };
}

function getRecommendedFriends(charId, limit) {
  const rows = db.getDatabase().prepare(
    `SELECT id, name, class, grade FROM characters WHERE id != ? AND id NOT IN (SELECT friend_id FROM friends WHERE char_id = ?) ORDER BY ABS(grade - (SELECT grade FROM characters WHERE id = ?)) LIMIT ?`
  ).all(charId, charId, charId, limit || 10);
  return { success: true, recommended: rows };
}

module.exports = { OPCODES, GIFTS, initDB, getProfile, sendGift, blockPlayer, unblockPlayer, getBlockList, searchPlayers, getRecommendedFriends };
