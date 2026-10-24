/**
 * Wartune Ultra — Friend System
 */

'use strict';

const db = require('../db');

const OPCODES = {
  C_FRIEND_LIST:      0x2AF8,  // 11000
  S_FRIEND_LIST:      0x1060,  // 4192
  C_FRIEND_ADD:       0x2AF9,  // 11001
  S_FRIEND_ADD_RSP:   0x1061,  // 4193
  C_FRIEND_REMOVE:    0x2AFA,  // 11002
  C_FRIEND_SEARCH:    0x2AFB,  // 11003
  S_FRIEND_SEARCH:    0x1062,  // 4194
};

function initDB() {
  const dbInst = db.getDatabase();
  dbInst.exec(`
    CREATE TABLE IF NOT EXISTS friends (
      char_id    INTEGER NOT NULL,
      friend_id  INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (char_id, friend_id)
    );
  `);
}

function addFriend(charId, friendId) {
  if (charId === friendId) return { success: false, msg: 'Cannot add yourself' };

  const friend = db.getCharacterById(friendId);
  if (!friend) return { success: false, msg: 'Player not found' };

  const existing = db.getDatabase()
    .prepare('SELECT 1 FROM friends WHERE char_id = ? AND friend_id = ?')
    .get(charId, friendId);
  if (existing) return { success: false, msg: 'Already friends' };

  // Mutual friendship
  db.getDatabase().prepare('INSERT OR IGNORE INTO friends (char_id, friend_id) VALUES (?, ?)').run(charId, friendId);
  db.getDatabase().prepare('INSERT OR IGNORE INTO friends (char_id, friend_id) VALUES (?, ?)').run(friendId, charId);

  return { success: true };
}

function removeFriend(charId, friendId) {
  db.getDatabase().prepare('DELETE FROM friends WHERE char_id = ? AND friend_id = ?').run(charId, friendId);
  db.getDatabase().prepare('DELETE FROM friends WHERE char_id = ? AND friend_id = ?').run(friendId, charId);
  return { success: true };
}

function getFriendList(charId) {
  return db.getDatabase().prepare(`
    SELECT c.id, c.nick_name, c.grade, c.fighting, c.is_online, c.vip_level, c.camp
    FROM friends f JOIN characters c ON f.friend_id = c.id
    WHERE f.char_id = ? ORDER BY c.is_online DESC, c.fighting DESC
  `).all(charId);
}

function searchPlayer(query) {
  return db.getDatabase().prepare(`
    SELECT id, nick_name, grade, fighting, is_online, camp
    FROM characters WHERE nick_name LIKE ? LIMIT 20
  `).all(`%${query}%`);
}

module.exports = {
  OPCODES, initDB,
  addFriend, removeFriend, getFriendList, searchPlayer,
};
