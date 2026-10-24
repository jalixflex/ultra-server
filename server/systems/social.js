'use strict';

const db = require('../db');

const OPCODES = {
  C_PLAYER_SEARCH:   0x8200,
  S_PLAYER_SEARCH:   0x8210,
  C_PLAYER_PROFILE:  0x8201,
  S_PLAYER_PROFILE:  0x8211,
  C_BLOCK_PLAYER:    0x8202,
  S_BLOCK_PLAYER:    0x8212,
  C_UNBLOCK_PLAYER:  0x8203,
  S_UNBLOCK_PLAYER:  0x8213,
  C_BLOCK_LIST:      0x8204,
  S_BLOCK_LIST:      0x8214,
  C_RECENT_CONTACTS: 0x8205,
  S_RECENT_CONTACTS: 0x8215,
  C_TRADE_REQUEST:   0x8206,
  S_TRADE_REQUEST:   0x8216,
  C_TRADE_CONFIRM:   0x8207,
  S_TRADE_CONFIRM:   0x8217,
  C_TRADE_CANCEL:    0x8208,
  S_TRADE_CANCEL:    0x8218,
};

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS blocked_players (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id    INTEGER NOT NULL REFERENCES characters(id),
      blocked_id INTEGER NOT NULL REFERENCES characters(id),
      blocked_at TEXT DEFAULT (datetime('now')),
      UNIQUE(char_id, blocked_id)
    );
    CREATE TABLE IF NOT EXISTS recent_contacts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id     INTEGER NOT NULL REFERENCES characters(id),
      contact_id  INTEGER NOT NULL REFERENCES characters(id),
      last_contact TEXT DEFAULT (datetime('now')),
      UNIQUE(char_id, contact_id)
    );
    CREATE TABLE IF NOT EXISTS trade_sessions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id   INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      sender_gold    INTEGER DEFAULT 0,
      receiver_gold  INTEGER DEFAULT 0,
      sender_confirmed  INTEGER DEFAULT 0,
      receiver_confirmed INTEGER DEFAULT 0,
      status      TEXT DEFAULT 'pending',
      created_at  TEXT DEFAULT (datetime('now'))
    );
  `);
}

function searchPlayers(query, limit) {
  limit = Math.min(limit || 20, 50);
  const rows = db.getDatabase().prepare(
    `SELECT id, name, grade, class, guild_id, is_online FROM characters WHERE name LIKE ? LIMIT ?`
  ).all(`%${query}%`, limit);

  return {
    success: true,
    players: rows.map(r => ({
      charId: r.id, name: r.name, level: r.grade,
      className: r.class, guildId: r.guild_id, online: !!r.is_online,
    })),
  };
}

function getPlayerProfile(charId, targetId) {
  const target = db.getCharacterById(targetId);
  if (!target) return { success: false, msg: 'Player not found' };

  const isBlocked = db.getDatabase().prepare(
    'SELECT id FROM blocked_players WHERE char_id = ? AND blocked_id = ?'
  ).get(charId, targetId);

  addRecentContact(charId, targetId);

  return {
    success: true,
    profile: {
      charId: target.id,
      name: target.name,
      level: target.grade,
      className: target.class,
      br: target.br || 0,
      guildId: target.guild_id,
      vipLevel: target.vip_level || 0,
      online: !!target.is_online,
      isBlocked: !!isBlocked,
    },
  };
}

function blockPlayer(charId, targetId) {
  if (charId === targetId) return { success: false, msg: 'Cannot block yourself' };
  const target = db.getCharacterById(targetId);
  if (!target) return { success: false, msg: 'Player not found' };

  db.getDatabase().prepare(
    'INSERT OR IGNORE INTO blocked_players (char_id, blocked_id) VALUES (?, ?)'
  ).run(charId, targetId);

  return { success: true, blockedId: targetId, name: target.name };
}

function unblockPlayer(charId, targetId) {
  db.getDatabase().prepare(
    'DELETE FROM blocked_players WHERE char_id = ? AND blocked_id = ?'
  ).run(charId, targetId);
  return { success: true, unblockedId: targetId };
}

function getBlockList(charId) {
  const rows = db.getDatabase().prepare(`
    SELECT b.blocked_id, c.name, c.grade, c.class FROM blocked_players b
    JOIN characters c ON b.blocked_id = c.id WHERE b.char_id = ?
  `).all(charId);
  return {
    success: true,
    blocked: rows.map(r => ({
      charId: r.blocked_id, name: r.name, level: r.grade, className: r.class,
    })),
  };
}

function getRecentContacts(charId) {
  const rows = db.getDatabase().prepare(`
    SELECT rc.contact_id, c.name, c.grade, c.class, c.is_online, rc.last_contact
    FROM recent_contacts rc JOIN characters c ON rc.contact_id = c.id
    WHERE rc.char_id = ? ORDER BY rc.last_contact DESC LIMIT 20
  `).all(charId);
  return {
    success: true,
    contacts: rows.map(r => ({
      charId: r.contact_id, name: r.name, level: r.grade,
      className: r.class, online: !!r.is_online, lastContact: r.last_contact,
    })),
  };
}

function addRecentContact(charId, contactId) {
  if (charId === contactId) return;
  db.getDatabase().prepare(`
    INSERT INTO recent_contacts (char_id, contact_id) VALUES (?, ?)
    ON CONFLICT(char_id, contact_id) DO UPDATE SET last_contact = datetime('now')
  `).run(charId, contactId);
}

function isBlocked(charId, targetId) {
  return !!db.getDatabase().prepare(
    'SELECT id FROM blocked_players WHERE char_id = ? AND blocked_id = ?'
  ).get(targetId, charId);
}

function requestTrade(senderId, receiverId) {
  if (senderId === receiverId) return { success: false, msg: 'Cannot trade with yourself' };
  if (isBlocked(senderId, receiverId)) return { success: false, msg: 'You are blocked by this player' };

  const existing = db.getDatabase().prepare(
    `SELECT id FROM trade_sessions WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)) AND status = 'pending'`
  ).get(senderId, receiverId, receiverId, senderId);
  if (existing) return { success: false, msg: 'Trade already pending' };

  const result = db.getDatabase().prepare(
    'INSERT INTO trade_sessions (sender_id, receiver_id) VALUES (?, ?)'
  ).run(senderId, receiverId);

  return { success: true, tradeId: result.lastInsertRowid };
}

function confirmTrade(charId, tradeId) {
  const trade = db.getDatabase().prepare('SELECT * FROM trade_sessions WHERE id = ? AND status = ?').get(tradeId, 'pending');
  if (!trade) return { success: false, msg: 'Trade not found' };

  if (trade.sender_id === charId) {
    db.getDatabase().prepare('UPDATE trade_sessions SET sender_confirmed = 1 WHERE id = ?').run(tradeId);
  } else if (trade.receiver_id === charId) {
    db.getDatabase().prepare('UPDATE trade_sessions SET receiver_confirmed = 1 WHERE id = ?').run(tradeId);
  } else {
    return { success: false, msg: 'Not your trade' };
  }

  const updated = db.getDatabase().prepare('SELECT * FROM trade_sessions WHERE id = ?').get(tradeId);
  if (updated.sender_confirmed && updated.receiver_confirmed) {
    if (updated.sender_gold > 0) {
      db.getDatabase().prepare('UPDATE characters SET gold = gold - ? WHERE id = ?').run(updated.sender_gold, updated.sender_id);
      db.getDatabase().prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').run(updated.sender_gold, updated.receiver_id);
    }
    if (updated.receiver_gold > 0) {
      db.getDatabase().prepare('UPDATE characters SET gold = gold - ? WHERE id = ?').run(updated.receiver_gold, updated.receiver_id);
      db.getDatabase().prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').run(updated.receiver_gold, updated.sender_id);
    }
    db.getDatabase().prepare("UPDATE trade_sessions SET status = 'completed' WHERE id = ?").run(tradeId);
    return { success: true, completed: true, tradeId };
  }

  return { success: true, completed: false, tradeId };
}

function cancelTrade(charId, tradeId) {
  const trade = db.getDatabase().prepare('SELECT * FROM trade_sessions WHERE id = ? AND status = ?').get(tradeId, 'pending');
  if (!trade) return { success: false, msg: 'Trade not found' };
  if (trade.sender_id !== charId && trade.receiver_id !== charId) return { success: false, msg: 'Not your trade' };

  db.getDatabase().prepare("UPDATE trade_sessions SET status = 'cancelled' WHERE id = ?").run(tradeId);
  return { success: true, tradeId };
}

module.exports = {
  OPCODES,
  initDB,
  searchPlayers, getPlayerProfile, blockPlayer, unblockPlayer,
  getBlockList, getRecentContacts, addRecentContact, isBlocked,
  requestTrade, confirmTrade, cancelTrade,
};
