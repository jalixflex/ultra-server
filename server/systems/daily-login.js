'use strict';

const db = require('../db');

const OPCODES = {
  C_LOGIN_REWARD_INFO:  0x6500,
  S_LOGIN_REWARD_INFO:  0x6510,
  C_LOGIN_REWARD_CLAIM: 0x6501,
  S_LOGIN_REWARD_CLAIM: 0x6511,
};

// 30-day monthly reward calendar
const DAILY_REWARDS = [
  { day: 1,  type: 'gold',   amount: 5000 },
  { day: 2,  type: 'exp',    amount: 1000 },
  { day: 3,  type: 'item',   itemId: 100001, count: 10 },
  { day: 4,  type: 'gold',   amount: 8000 },
  { day: 5,  type: 'balens', amount: 20 },
  { day: 6,  type: 'item',   itemId: 100003, count: 3 },
  { day: 7,  type: 'item',   itemId: 3001, count: 1, quality: 2 },
  { day: 8,  type: 'gold',   amount: 10000 },
  { day: 9,  type: 'exp',    amount: 3000 },
  { day: 10, type: 'item',   itemId: 100002, count: 10 },
  { day: 11, type: 'gold',   amount: 12000 },
  { day: 12, type: 'balens', amount: 30 },
  { day: 13, type: 'item',   itemId: 100001, count: 15 },
  { day: 14, type: 'balens', amount: 100 },
  { day: 15, type: 'gold',   amount: 15000 },
  { day: 16, type: 'exp',    amount: 5000 },
  { day: 17, type: 'item',   itemId: 100003, count: 5 },
  { day: 18, type: 'gold',   amount: 18000 },
  { day: 19, type: 'balens', amount: 40 },
  { day: 20, type: 'item',   itemId: 100002, count: 15 },
  { day: 21, type: 'item',   itemId: 3002, count: 1, quality: 3 },
  { day: 22, type: 'gold',   amount: 20000 },
  { day: 23, type: 'exp',    amount: 8000 },
  { day: 24, type: 'item',   itemId: 100001, count: 20 },
  { day: 25, type: 'balens', amount: 60 },
  { day: 26, type: 'gold',   amount: 25000 },
  { day: 27, type: 'item',   itemId: 100003, count: 8 },
  { day: 28, type: 'balens', amount: 300 },
  { day: 29, type: 'gold',   amount: 30000 },
  { day: 30, type: 'item',   itemId: 3003, count: 1, quality: 4 },
];

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS daily_login (
      char_id       INTEGER PRIMARY KEY REFERENCES characters(id),
      streak        INTEGER DEFAULT 0,
      month_day     INTEGER DEFAULT 0,
      last_login    TEXT DEFAULT '',
      total_logins  INTEGER DEFAULT 0,
      claimed_today INTEGER DEFAULT 0,
      claimed_days  TEXT DEFAULT '[]',
      current_month TEXT DEFAULT ''
    );
  `);
}

function ensureEntry(charId) {
  db.getDatabase().prepare('INSERT OR IGNORE INTO daily_login (char_id) VALUES (?)').run(charId);
}

function onLogin(charId) {
  ensureEntry(charId);
  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7);
  const row = db.getDatabase().prepare('SELECT * FROM daily_login WHERE char_id = ?').get(charId);

  if (row.last_login === today) return { alreadyLoggedIn: true, streak: row.streak };

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const newStreak = row.last_login === yesterday ? row.streak + 1 : 1;

  // Reset calendar on new month
  let claimedDays;
  let monthDay;
  if (row.current_month !== currentMonth) {
    claimedDays = [];
    monthDay = 1;
  } else {
    claimedDays = JSON.parse(row.claimed_days || '[]');
    monthDay = row.month_day + 1;
  }

  db.getDatabase().prepare(`
    UPDATE daily_login SET streak = ?, last_login = ?, total_logins = total_logins + 1,
    claimed_today = 0, month_day = ?, current_month = ?, claimed_days = ?
    WHERE char_id = ?
  `).run(newStreak, today, monthDay, currentMonth, JSON.stringify(claimedDays), charId);

  try { require('./devotion').completeTask(charId, 'login'); } catch (e) { /* ignore */ }

  return { alreadyLoggedIn: false, streak: newStreak, totalLogins: row.total_logins + 1, monthDay };
}

function getDailyInfo(charId) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM daily_login WHERE char_id = ?').get(charId);
  const claimedDays = JSON.parse(row.claimed_days || '[]');
  const todayReward = DAILY_REWARDS.find(r => r.day === row.month_day) || DAILY_REWARDS[0];

  return {
    streak: row.streak,
    totalLogins: row.total_logins,
    monthDay: row.month_day,
    todayReward,
    claimed: row.claimed_today === 1,
    claimedDays,
    calendar: DAILY_REWARDS,
  };
}

// Alias for handlers.js compatibility
function getLoginInfo(charId) { return getDailyInfo(charId); }

function claimDailyReward(charId) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM daily_login WHERE char_id = ?').get(charId);
  const today = new Date().toISOString().slice(0, 10);

  if (row.last_login !== today) return { success: false, msg: 'Login first' };
  if (row.claimed_today === 1) return { success: false, msg: 'Already claimed today' };

  const day = row.month_day || 1;
  const reward = DAILY_REWARDS.find(r => r.day === day) || DAILY_REWARDS[0];

  // Give reward
  giveReward(charId, reward);

  // Mark claimed
  const claimedDays = JSON.parse(row.claimed_days || '[]');
  claimedDays.push(day);
  db.getDatabase().prepare('UPDATE daily_login SET claimed_today = 1, claimed_days = ? WHERE char_id = ?')
    .run(JSON.stringify(claimedDays), charId);

  try { require('./quest').checkLevelUp(charId); } catch (e) { /* ignore */ }

  return { success: true, reward, day, streak: row.streak };
}

// Alias for handlers.js compatibility
function claimReward(charId) { return claimDailyReward(charId); }

function giveReward(charId, reward) {
  switch (reward.type) {
    case 'gold':
      db.getDatabase().prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').run(reward.amount, charId);
      break;
    case 'exp':
      db.getDatabase().prepare('UPDATE characters SET exp = exp + ? WHERE id = ?').run(reward.amount, charId);
      break;
    case 'balens':
      db.getDatabase().prepare('UPDATE characters SET balens = balens + ? WHERE id = ?').run(reward.amount, charId);
      break;
    case 'bound_balens':
      db.getDatabase().prepare('UPDATE characters SET bound_balens = bound_balens + ? WHERE id = ?').run(reward.amount, charId);
      break;
    case 'item':
      try {
        const inventory = require('./inventory');
        inventory.addItem(charId, reward.itemId, reward.count || 1, reward.quality || 0);
      } catch (e) { console.error('[DAILY] item reward error:', e.message); }
      break;
  }
}

module.exports = {
  OPCODES, DAILY_REWARDS,
  initDB,
  onLogin, getDailyInfo, getLoginInfo, claimDailyReward, claimReward,
};
