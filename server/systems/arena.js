/**
 * Wartune Ultra — Arena / PvP System
 * Single-player arena (ranked) and cross-server battleground.
 */

'use strict';

const db = require('../db');
const battle = require('./battle');

const OPCODES = {
  C_ARENA_INFO:       0x4A38,  // 19000
  S_ARENA_INFO:       0x10D0,  // 4304
  C_ARENA_CHALLENGE:  0x4A39,  // 19001
  S_ARENA_RESULT:     0x10D1,  // 4305
  C_ARENA_RANKING:    0x4A3A,  // 19002
  S_ARENA_RANKING:    0x10D2,  // 4306
  C_ARENA_SHOP:       0x4A3B,  // 19003
  S_ARENA_SHOP:       0x10D3,  // 4307
};

function initDB() {
  const dbInst = db.getDatabase();
  dbInst.exec(`
    CREATE TABLE IF NOT EXISTS arena (
      char_id       INTEGER PRIMARY KEY REFERENCES characters(id),
      rank          INTEGER DEFAULT 9999,
      wins          INTEGER DEFAULT 0,
      losses        INTEGER DEFAULT 0,
      streak        INTEGER DEFAULT 0,
      best_rank     INTEGER DEFAULT 9999,
      honor         INTEGER DEFAULT 0,
      daily_attempts INTEGER DEFAULT 0,
      last_reset    TEXT DEFAULT ''
    );
  `);
}

const MAX_DAILY_ATTEMPTS = 30;

function getArenaInfo(charId) {
  ensureEntry(charId);
  resetDaily(charId);
  return db.getDatabase().prepare('SELECT * FROM arena WHERE char_id = ?').get(charId);
}

function challenge(charId, targetId) {
  if (charId === targetId) return { success: false, msg: 'Cannot challenge yourself' };

  ensureEntry(charId);
  ensureEntry(targetId);
  resetDaily(charId);

  const info = db.getDatabase().prepare('SELECT * FROM arena WHERE char_id = ?').get(charId);
  if (info.daily_attempts >= MAX_DAILY_ATTEMPTS) {
    return { success: false, msg: 'No arena attempts left today' };
  }

  // Run PvP battle simulation
  const result = battle.pvpBattle(charId, targetId);
  if (!result) return { success: false, msg: 'Battle failed' };

  const won = result.won;
  const honorGain = won ? 20 : 5;

  if (won) {
    // Swap ranks if challenger was lower-ranked (higher number)
    const cInfo = db.getDatabase().prepare('SELECT rank FROM arena WHERE char_id = ?').get(charId);
    const tInfo = db.getDatabase().prepare('SELECT rank FROM arena WHERE char_id = ?').get(targetId);

    if (cInfo.rank > tInfo.rank) {
      // Winner takes target's rank
      db.getDatabase().prepare('UPDATE arena SET rank = ? WHERE char_id = ?').run(tInfo.rank, charId);
      db.getDatabase().prepare('UPDATE arena SET rank = ? WHERE char_id = ?').run(cInfo.rank, targetId);
    }

    db.getDatabase().prepare(`
      UPDATE arena SET wins = wins + 1, streak = streak + 1,
        honor = honor + ?, daily_attempts = daily_attempts + 1,
        best_rank = MIN(best_rank, rank) WHERE char_id = ?
    `).run(honorGain, charId);

    db.getDatabase().prepare('UPDATE arena SET losses = losses + 1, streak = 0 WHERE char_id = ?').run(targetId);
  } else {
    db.getDatabase().prepare(`
      UPDATE arena SET losses = losses + 1, streak = 0,
        honor = honor + ?, daily_attempts = daily_attempts + 1 WHERE char_id = ?
    `).run(honorGain, charId);
  }

  return { success: true, won, honor: honorGain, rounds: result.rounds };
}

function getRanking(limit = 50) {
  return db.getDatabase().prepare(`
    SELECT a.*, c.nick_name, c.grade, c.fighting, c.camp
    FROM arena a JOIN characters c ON a.char_id = c.id
    ORDER BY a.rank ASC LIMIT ?
  `).all(limit);
}

function getOpponents(charId) {
  ensureEntry(charId);
  const info = db.getDatabase().prepare('SELECT rank FROM arena WHERE char_id = ?').get(charId);
  const myRank = info.rank;

  // Return players near your rank
  return db.getDatabase().prepare(`
    SELECT a.*, c.nick_name, c.grade, c.fighting, c.camp
    FROM arena a JOIN characters c ON a.char_id = c.id
    WHERE a.char_id != ? AND a.rank BETWEEN ? AND ?
    ORDER BY a.rank ASC LIMIT 10
  `).all(charId, Math.max(1, myRank - 10), myRank + 5);
}

// ─── Helpers ─────────────────────────────
function ensureEntry(charId) {
  db.getDatabase().prepare(`
    INSERT OR IGNORE INTO arena (char_id) VALUES (?)
  `).run(charId);
}

function resetDaily(charId) {
  const today = new Date().toISOString().slice(0, 10);
  const info = db.getDatabase().prepare('SELECT last_reset FROM arena WHERE char_id = ?').get(charId);
  if (info && info.last_reset !== today) {
    db.getDatabase().prepare('UPDATE arena SET daily_attempts = 0, last_reset = ? WHERE char_id = ?').run(today, charId);
  }
}

module.exports = {
  OPCODES, MAX_DAILY_ATTEMPTS,
  initDB,
  getArenaInfo, challenge, getRanking, getOpponents,
};
