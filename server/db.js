/**
 * Wartune Ultra — SQLite Database Layer
 */

'use strict';

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'data', 'wartune.db');

let db;

function init() {
  const fs = require('fs');
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      username    TEXT UNIQUE NOT NULL,
      password    TEXT NOT NULL,
      site        TEXT DEFAULT 's1',
      created_at  TEXT DEFAULT (datetime('now')),
      last_login  TEXT,
      banned      INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS characters (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id     INTEGER NOT NULL REFERENCES accounts(id),
      nick_name      TEXT NOT NULL,
      sex            INTEGER DEFAULT 1,
      camp           INTEGER DEFAULT 1,
      icon           INTEGER DEFAULT 0,
      job            INTEGER DEFAULT 0,
      grade          INTEGER DEFAULT 1,
      exp            INTEGER DEFAULT 0,
      gold           INTEGER DEFAULT 10000,
      bound_gold     INTEGER DEFAULT 0,
      balens         INTEGER DEFAULT 1000,
      bound_balens   INTEGER DEFAULT 500,
      vip_level      INTEGER DEFAULT 0,
      fighting       INTEGER DEFAULT 100,
      hp             INTEGER DEFAULT 5000,
      max_hp         INTEGER DEFAULT 5000,
      attack         INTEGER DEFAULT 100,
      defence        INTEGER DEFAULT 50,
      magic_attack   INTEGER DEFAULT 80,
      magic_defence  INTEGER DEFAULT 40,
      bag_count      INTEGER DEFAULT 100,
      repute         INTEGER DEFAULT 0,
      active         INTEGER DEFAULT 1,
      is_online      INTEGER DEFAULT 0,
      site           TEXT DEFAULT 's1',
      created_at     TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS player_data (
      char_id    INTEGER NOT NULL REFERENCES characters(id),
      data_key   TEXT NOT NULL,
      data_value TEXT,
      PRIMARY KEY (char_id, data_key)
    );

    CREATE TABLE IF NOT EXISTS login_sessions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id  INTEGER NOT NULL REFERENCES accounts(id),
      char_id     INTEGER DEFAULT 0,
      login_key   TEXT,
      gate_key    TEXT,
      ip          TEXT,
      expired     INTEGER DEFAULT 0,
      created_at  TEXT DEFAULT (datetime('now'))
    );
  `);

  return db;
}

// ─── Account queries ─────────────────────────────
function createAccount(username, password) {
  const stmt = db.prepare('INSERT INTO accounts (username, password) VALUES (?, ?)');
  return stmt.run(username, password);
}

function getAccount(username) {
  return db.prepare('SELECT * FROM accounts WHERE username = ?').get(username);
}

function getAccountById(id) {
  return db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
}

function updateLastLogin(id) {
  db.prepare("UPDATE accounts SET last_login = datetime('now') WHERE id = ?").run(id);
}

function isAccountBanned(id) {
  const row = db.prepare('SELECT banned FROM accounts WHERE id = ?').get(id);
  return row ? row.banned === 1 : false;
}

// ─── Character queries ───────────────────────────
function createCharacter(accountId, nickName, sex, camp, icon, site = 's1') {
  const stmt = db.prepare(`
    INSERT INTO characters (account_id, nick_name, sex, camp, icon, site)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(accountId, nickName, sex, camp, icon, site);
}

function getCharactersByAccount(accountId) {
  return db.prepare('SELECT * FROM characters WHERE account_id = ?').all(accountId);
}

function getCharacterById(id) {
  return db.prepare('SELECT * FROM characters WHERE id = ?').get(id);
}

function setCharOnline(charId, online) {
  db.prepare('UPDATE characters SET is_online = ? WHERE id = ?').run(online ? 1 : 0, charId);
}

function updateCharacter(charId, fields) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const sets = keys.map(k => `${k} = ?`).join(', ');
  const vals = keys.map(k => fields[k]);
  db.prepare(`UPDATE characters SET ${sets} WHERE id = ?`).run(...vals, charId);
}

// ─── Login session queries ───────────────────────
function createLoginSession(accountId, loginKey, ip) {
  // Expire old sessions for this account
  db.prepare('UPDATE login_sessions SET expired = 1 WHERE account_id = ? AND expired = 0').run(accountId);
  const stmt = db.prepare('INSERT INTO login_sessions (account_id, login_key, ip) VALUES (?, ?, ?)');
  return stmt.run(accountId, loginKey, ip);
}

function getLoginSession(accountId, loginKey) {
  return db.prepare(
    'SELECT * FROM login_sessions WHERE account_id = ? AND login_key = ? AND expired = 0'
  ).get(accountId, loginKey);
}

function setSessionCharId(sessionId, charId) {
  db.prepare('UPDATE login_sessions SET char_id = ? WHERE id = ?').run(charId, sessionId);
}

function setGateKey(sessionId, gateKey) {
  db.prepare('UPDATE login_sessions SET gate_key = ? WHERE id = ?').run(gateKey, sessionId);
}

function expireSession(sessionId) {
  db.prepare('UPDATE login_sessions SET expired = 1 WHERE id = ?').run(sessionId);
}

// ─── Player data (EAV) ──────────────────────────
function getPlayerData(charId, key) {
  const row = db.prepare('SELECT data_value FROM player_data WHERE char_id = ? AND data_key = ?').get(charId, key);
  return row ? JSON.parse(row.data_value) : null;
}

function setPlayerData(charId, key, value) {
  db.prepare(`
    INSERT INTO player_data (char_id, data_key, data_value) VALUES (?, ?, ?)
    ON CONFLICT(char_id, data_key) DO UPDATE SET data_value = excluded.data_value
  `).run(charId, key, JSON.stringify(value));
}

function getDatabase() {
  return db;
}

module.exports = {
  init, getDatabase,
  // Accounts
  createAccount, getAccount, getAccountById, updateLastLogin, isAccountBanned,
  // Characters
  createCharacter, getCharactersByAccount, getCharacterById, setCharOnline, updateCharacter,
  // Sessions
  createLoginSession, getLoginSession, setSessionCharId, setGateKey, expireSession,
  // Player data
  getPlayerData, setPlayerData,
};
