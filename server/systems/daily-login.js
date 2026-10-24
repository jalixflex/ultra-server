'use strict';

const db = require('../db');

const OPCODES = {
  C_LOGIN_REWARD_INFO:  0x6500,
  S_LOGIN_REWARD_INFO:  0x6510,
  C_LOGIN_REWARD_CLAIM: 0x6501,
  S_LOGIN_REWARD_CLAIM: 0x6511,
};

// 7-day repeating login reward cycle
const LOGIN_REWARDS = [
  { day: 1, rewards: { gold: 5000,  exp: 2000 },                         name: 'Day 1: Gold Bonus' },
  { day: 2, rewards: { bound_balens: 20 },                                name: 'Day 2: Bound Balens' },
  { day: 3, rewards: { gold: 8000,  daru: 500 },                          name: 'Day 3: Gold & Daru' },
  { day: 4, rewards: { exp: 5000 },                                       name: 'Day 4: EXP Bonus' },
  { day: 5, rewards: { gold: 12000, bound_balens: 30 },                   name: 'Day 5: Premium Pack' },
  { day: 6, rewards: { gold: 15000, daru: 1000 },                         name: 'Day 6: Resource Pack' },
  { day: 7, rewards: { gold: 20000, bound_balens: 50, exp: 10000 },       name: 'Day 7: Ultimate Pack' },
];

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS daily_login (
      char_id       INTEGER PRIMARY KEY REFERENCES characters(id),
      streak        INTEGER DEFAULT 0,
      last_login    TEXT DEFAULT '',
      total_logins  INTEGER DEFAULT 0,
      claimed_today INTEGER DEFAULT 0
    );
  `);
}

function ensureEntry(charId) {
  db.getDatabase().prepare('INSERT OR IGNORE INTO daily_login (char_id) VALUES (?)').run(charId);
}

function onLogin(charId) {
  ensureEntry(charId);
  const today = new Date().toISOString().slice(0, 10);
  const row = db.getDatabase().prepare('SELECT * FROM daily_login WHERE char_id = ?').get(charId);

  if (row.last_login === today) return { alreadyLoggedIn: true, streak: row.streak };

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const newStreak = row.last_login === yesterday ? row.streak + 1 : 1;

  db.getDatabase().prepare(`
    UPDATE daily_login SET streak = ?, last_login = ?, total_logins = total_logins + 1, claimed_today = 0
    WHERE char_id = ?
  `).run(newStreak, today, charId);

  // Complete devotion login task
  const devotion = require('./devotion');
  devotion.completeTask(charId, 'login');

  return { alreadyLoggedIn: false, streak: newStreak, totalLogins: row.total_logins + 1 };
}

function getLoginInfo(charId) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM daily_login WHERE char_id = ?').get(charId);
  const dayInCycle = ((row.streak - 1) % 7) + 1;
  const reward = LOGIN_REWARDS.find(r => r.day === dayInCycle);

  return {
    streak: row.streak,
    totalLogins: row.total_logins,
    dayInCycle,
    todayReward: reward,
    claimed: row.claimed_today === 1,
    cycle: LOGIN_REWARDS,
  };
}

function claimReward(charId) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM daily_login WHERE char_id = ?').get(charId);
  const today = new Date().toISOString().slice(0, 10);

  if (row.last_login !== today) return { success: false, msg: 'Login first' };
  if (row.claimed_today === 1) return { success: false, msg: 'Already claimed today' };

  const dayInCycle = ((row.streak - 1) % 7) + 1;
  const reward = LOGIN_REWARDS.find(r => r.day === dayInCycle);
  if (!reward) return { success: false };

  const r = reward.rewards;
  if (r.gold) db.getDatabase().prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').run(r.gold, charId);
  if (r.exp) db.getDatabase().prepare('UPDATE characters SET exp = exp + ? WHERE id = ?').run(r.exp, charId);
  if (r.bound_balens) db.getDatabase().prepare('UPDATE characters SET bound_balens = bound_balens + ? WHERE id = ?').run(r.bound_balens, charId);

  db.getDatabase().prepare('UPDATE daily_login SET claimed_today = 1 WHERE char_id = ?').run(charId);

  const quest = require('./quest');
  quest.checkLevelUp(charId);

  return { success: true, rewards: r, day: dayInCycle, streak: row.streak };
}

module.exports = {
  OPCODES, LOGIN_REWARDS,
  initDB,
  onLogin, getLoginInfo, claimReward,
};
