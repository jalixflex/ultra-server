/**
 * Wartune Ultra — Mail System
 */

'use strict';

const { encode } = require('../proto');
const { buildPacket } = require('../packet');
const db = require('../db');

const OPCODES = {
  C_MAIL_LIST:      0x2710,  // 10000
  S_MAIL_LIST:      0x1050,  // 4176
  C_MAIL_READ:      0x2711,  // 10001
  S_MAIL_DETAIL:    0x1051,  // 4177
  C_MAIL_SEND:      0x2712,  // 10002
  S_MAIL_SEND_RSP:  0x1052,  // 4178
  C_MAIL_DELETE:    0x2713,  // 10003
  C_MAIL_CLAIM:     0x2714,  // 10004 — Claim attachments
  S_MAIL_CLAIM_RSP: 0x1053,  // 4179
  S_MAIL_NEW:       0x1054,  // 4180 — New mail notification
};

function initDB() {
  const dbInst = db.getDatabase();
  dbInst.exec(`
    CREATE TABLE IF NOT EXISTS mails (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id   INTEGER DEFAULT 0,
      sender_name TEXT DEFAULT 'System',
      receiver_id INTEGER NOT NULL,
      title       TEXT NOT NULL,
      content     TEXT DEFAULT '',
      is_read     INTEGER DEFAULT 0,
      claimed     INTEGER DEFAULT 0,
      attachments TEXT DEFAULT '[]',
      created_at  TEXT DEFAULT (datetime('now')),
      expires_at  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_mail_receiver ON mails(receiver_id, is_read);
  `);
}

function sendMail(senderId, senderName, receiverId, title, content, attachments = []) {
  const result = db.getDatabase().prepare(`
    INSERT INTO mails (sender_id, sender_name, receiver_id, title, content, attachments, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+30 days'))
  `).run(senderId, senderName, receiverId, title, content, JSON.stringify(attachments));

  return result.lastInsertRowid;
}

function sendSystemMail(receiverId, title, content, attachments = []) {
  return sendMail(0, 'System', receiverId, title, content, attachments);
}

function getMailList(charId, limit = 50) {
  return db.getDatabase()
    .prepare('SELECT id, sender_name, title, is_read, claimed, created_at FROM mails WHERE receiver_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(charId, limit);
}

function getMail(mailId, charId) {
  const mail = db.getDatabase()
    .prepare('SELECT * FROM mails WHERE id = ? AND receiver_id = ?')
    .get(mailId, charId);
  if (mail && !mail.is_read) {
    db.getDatabase().prepare('UPDATE mails SET is_read = 1 WHERE id = ?').run(mailId);
  }
  return mail;
}

function deleteMail(mailId, charId) {
  return db.getDatabase()
    .prepare('DELETE FROM mails WHERE id = ? AND receiver_id = ?')
    .run(mailId, charId);
}

function claimAttachments(mailId, charId) {
  const mail = db.getDatabase()
    .prepare('SELECT * FROM mails WHERE id = ? AND receiver_id = ? AND claimed = 0')
    .get(mailId, charId);
  if (!mail) return { success: false, msg: 'No attachments to claim' };

  const attachments = JSON.parse(mail.attachments || '[]');
  if (attachments.length === 0) return { success: false, msg: 'No attachments' };

  // Process attachments (gold, items, etc.)
  for (const att of attachments) {
    if (att.type === 'gold') {
      db.getDatabase().prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').run(att.amount, charId);
    } else if (att.type === 'balens') {
      db.getDatabase().prepare('UPDATE characters SET balens = balens + ? WHERE id = ?').run(att.amount, charId);
    }
    // Items would go through inventory.addItem
  }

  db.getDatabase().prepare('UPDATE mails SET claimed = 1 WHERE id = ?').run(mailId);
  return { success: true, attachments };
}

function getUnreadCount(charId) {
  const row = db.getDatabase()
    .prepare('SELECT COUNT(*) as cnt FROM mails WHERE receiver_id = ? AND is_read = 0')
    .get(charId);
  return row ? row.cnt : 0;
}

module.exports = {
  OPCODES,
  initDB,
  sendMail, sendSystemMail,
  getMailList, getMail, deleteMail,
  claimAttachments, getUnreadCount,
};
