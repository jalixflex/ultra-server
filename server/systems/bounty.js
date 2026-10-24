'use strict';

const db = require('../db');

const OPCODES = {
  C_BOUNTY_LIST:    0x6300,
  S_BOUNTY_LIST:    0x6310,
  C_BOUNTY_ACCEPT:  0x6301,
  C_BOUNTY_COMPLETE:0x6302,
  S_BOUNTY_UPDATE:  0x6311,
  C_BOUNTY_REFRESH: 0x6303,
};

const MAX_DAILY = 20;
const FREE_REFRESHES = 2;
const REFRESH_COST_BALENS = 10;

const QUALITY = ['white', 'green', 'blue', 'purple', 'orange'];

const BOUNTY_TEMPLATES = [
  { id: 1,  type: 'kill', target: 'campaign_monsters', name: 'Monster Hunter', count: 10, desc: 'Defeat %d monsters in campaign' },
  { id: 2,  type: 'kill', target: 'campaign_monsters', name: 'Exterminator',   count: 20, desc: 'Defeat %d monsters in campaign' },
  { id: 3,  type: 'campaign', target: 'any',           name: 'Dungeon Run',    count: 1,  desc: 'Complete a campaign stage' },
  { id: 4,  type: 'campaign', target: 'any',           name: 'Dungeon Crawler', count: 3, desc: 'Complete %d campaign stages' },
  { id: 5,  type: 'arena',   target: 'any',            name: 'Arena Fighter',  count: 3,  desc: 'Complete %d arena battles' },
  { id: 6,  type: 'arena',   target: 'any',            name: 'Gladiator',      count: 5,  desc: 'Complete %d arena battles' },
  { id: 7,  type: 'collect',  target: 'gold',          name: 'Gold Collector', count: 5000, desc: 'Collect %d gold' },
  { id: 8,  type: 'harvest', target: 'farm',           name: 'Farmer',         count: 3,  desc: 'Harvest %d farm plots' },
  { id: 9,  type: 'enchant', target: 'any',            name: 'Forgemaster',    count: 2,  desc: 'Enchant %d items' },
  { id: 10, type: 'academy', target: 'any',            name: 'Researcher',     count: 1,  desc: 'Research a technology' },
];

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS bounty (
      char_id        INTEGER PRIMARY KEY REFERENCES characters(id),
      daily_completed INTEGER DEFAULT 0,
      daily_refreshes INTEGER DEFAULT 0,
      last_reset     TEXT DEFAULT '',
      current_bounty INTEGER DEFAULT 0,
      current_quality INTEGER DEFAULT 0,
      current_progress INTEGER DEFAULT 0,
      current_template INTEGER DEFAULT 0
    );
  `);
}

function ensureEntry(charId) {
  db.getDatabase().prepare('INSERT OR IGNORE INTO bounty (char_id) VALUES (?)').run(charId);
  resetDaily(charId);
}

function resetDaily(charId) {
  const today = new Date().toISOString().slice(0, 10);
  const row = db.getDatabase().prepare('SELECT last_reset FROM bounty WHERE char_id = ?').get(charId);
  if (row && row.last_reset !== today) {
    db.getDatabase().prepare(`
      UPDATE bounty SET daily_completed = 0, daily_refreshes = 0, last_reset = ?,
        current_bounty = 0, current_progress = 0, current_template = 0, current_quality = 0
      WHERE char_id = ?
    `).run(today, charId);
  }
}

function getBountyInfo(charId) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM bounty WHERE char_id = ?').get(charId);
  let current = null;
  if (row.current_template > 0) {
    const t = BOUNTY_TEMPLATES.find(b => b.id === row.current_template);
    if (t) {
      current = {
        ...t,
        quality: QUALITY[row.current_quality],
        progress: row.current_progress,
        complete: row.current_progress >= t.count,
      };
    }
  }
  return {
    dailyCompleted: row.daily_completed,
    maxDaily: MAX_DAILY,
    refreshesUsed: row.daily_refreshes,
    freeRefreshes: FREE_REFRESHES,
    current,
  };
}

function generateBounty(charId) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM bounty WHERE char_id = ?').get(charId);
  if (row.daily_completed >= MAX_DAILY) return { success: false, msg: 'Daily limit reached' };
  if (row.current_template > 0) return { success: false, msg: 'Already have active bounty' };

  const template = BOUNTY_TEMPLATES[Math.floor(Math.random() * BOUNTY_TEMPLATES.length)];
  // Quality: weighted random — higher quality = rarer
  const roll = Math.random();
  let quality = 0;
  if (roll > 0.98) quality = 4;      // orange 2%
  else if (roll > 0.90) quality = 3;  // purple 8%
  else if (roll > 0.70) quality = 2;  // blue 20%
  else if (roll > 0.40) quality = 1;  // green 30%
  // else white 40%

  db.getDatabase().prepare(`
    UPDATE bounty SET current_template = ?, current_quality = ?, current_progress = 0
    WHERE char_id = ?
  `).run(template.id, quality, charId);

  return { success: true, bounty: { ...template, quality: QUALITY[quality], progress: 0 } };
}

function refreshBounty(charId) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM bounty WHERE char_id = ?').get(charId);

  if (row.daily_refreshes < FREE_REFRESHES) {
    db.getDatabase().prepare('UPDATE bounty SET daily_refreshes = daily_refreshes + 1, current_template = 0, current_progress = 0 WHERE char_id = ?').run(charId);
  } else {
    const char = db.getCharacterById(charId);
    if (char.balens < REFRESH_COST_BALENS) return { success: false, msg: 'Not enough balens' };
    db.updateCharacter(charId, { balens: char.balens - REFRESH_COST_BALENS });
    db.getDatabase().prepare('UPDATE bounty SET daily_refreshes = daily_refreshes + 1, current_template = 0, current_progress = 0 WHERE char_id = ?').run(charId);
  }

  return generateBounty(charId);
}

function updateBountyProgress(charId, type, target, amount = 1) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM bounty WHERE char_id = ?').get(charId);
  if (row.current_template === 0) return null;

  const t = BOUNTY_TEMPLATES.find(b => b.id === row.current_template);
  if (!t || t.type !== type) return null;
  if (t.target !== 'any' && t.target !== target) return null;

  const newProgress = Math.min(row.current_progress + amount, t.count);
  db.getDatabase().prepare('UPDATE bounty SET current_progress = ? WHERE char_id = ?').run(newProgress, charId);

  return { bountyId: t.id, progress: newProgress, required: t.count, complete: newProgress >= t.count };
}

function completeBounty(charId) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM bounty WHERE char_id = ?').get(charId);
  if (row.current_template === 0) return { success: false, msg: 'No active bounty' };

  const t = BOUNTY_TEMPLATES.find(b => b.id === row.current_template);
  if (!t || row.current_progress < t.count) return { success: false, msg: 'Not complete' };

  // Rewards scale with quality
  const qualityMul = 1 + row.current_quality * 0.5;
  const expReward = Math.floor(200 * qualityMul * (db.getCharacterById(charId)?.grade || 1));
  const goldReward = Math.floor(500 * qualityMul);
  const daruReward = Math.floor(100 * qualityMul);

  db.getDatabase().prepare('UPDATE characters SET exp = exp + ?, gold = gold + ? WHERE id = ?')
    .run(expReward, goldReward, charId);

  db.getDatabase().prepare(`
    UPDATE bounty SET daily_completed = daily_completed + 1, current_template = 0, current_progress = 0
    WHERE char_id = ?
  `).run(charId);

  const quest = require('./quest');
  quest.updateProgress(charId, 'complete_bounty', 'any');
  quest.checkLevelUp(charId);

  return { success: true, rewards: { exp: expReward, gold: goldReward, daru: daruReward }, quality: QUALITY[row.current_quality] };
}

module.exports = {
  OPCODES, MAX_DAILY, BOUNTY_TEMPLATES, QUALITY,
  initDB,
  getBountyInfo, generateBounty, refreshBounty, updateBountyProgress, completeBounty,
};
