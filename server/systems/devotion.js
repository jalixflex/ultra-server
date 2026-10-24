'use strict';

const db = require('../db');

const OPCODES = {
  C_DEVOTION_INFO:   0x6400,
  S_DEVOTION_INFO:   0x6410,
  C_DEVOTION_CLAIM:  0x6401,
  S_DEVOTION_CLAIM:  0x6411,
};

const TASKS = [
  { id: 'login',        name: 'First Login',          points: 5, desc: 'Log in today' },
  { id: 'bounty_5',     name: 'Complete 5 Bounties',   points: 5, desc: 'Complete 5 bounty quests' },
  { id: 'world_boss',   name: 'Fight World Boss',      points: 5, desc: 'Deal damage to the World Boss' },
  { id: 'farm_harvest', name: 'Harvest Crops',         points: 5, desc: 'Harvest from your farm once' },
  { id: 'campaign',     name: 'Campaign Clear',        points: 5, desc: 'Complete a campaign stage' },
  { id: 'arena',        name: 'Arena Battle',          points: 5, desc: 'Complete an arena battle' },
  { id: 'guild_donate', name: 'Guild Contribution',    points: 5, desc: 'Donate to your guild' },
  { id: 'chat_world',   name: 'World Chat',            points: 2, desc: 'Send a world chat message' },
  { id: 'mount_whip',   name: 'Train Mount',           points: 5, desc: 'Use a mount whip' },
  { id: 'enchant',      name: 'Enchant Equipment',     points: 5, desc: 'Enchant an item at the blacksmith' },
  { id: 'astral',       name: 'Capture Astral',        points: 5, desc: 'Attempt astral capture' },
  { id: 'catacombs',    name: 'Forgotten Catacombs',   points: 5, desc: 'Clear a catacombs floor' },
];

const REWARD_TIERS = [
  { points: 35,  rewards: { gold: 2000, exp: 1000 }, name: 'Tier 1' },
  { points: 55,  rewards: { gold: 5000, exp: 3000, daru: 500 }, name: 'Tier 2' },
  { points: 75,  rewards: { gold: 10000, exp: 5000, daru: 1000 }, name: 'Tier 3' },
  { points: 95,  rewards: { gold: 20000, exp: 10000, bound_balens: 50 }, name: 'Tier 4' },
  { points: 115, rewards: { gold: 30000, exp: 15000, bound_balens: 100 }, name: 'Tier 5' },
];

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS devotion (
      char_id       INTEGER PRIMARY KEY REFERENCES characters(id),
      points        INTEGER DEFAULT 0,
      tasks_done    TEXT DEFAULT '{}',
      tiers_claimed TEXT DEFAULT '[]',
      last_reset    TEXT DEFAULT ''
    );
  `);
}

function ensureEntry(charId) {
  db.getDatabase().prepare('INSERT OR IGNORE INTO devotion (char_id) VALUES (?)').run(charId);
  resetDaily(charId);
}

function resetDaily(charId) {
  const today = new Date().toISOString().slice(0, 10);
  const row = db.getDatabase().prepare('SELECT last_reset FROM devotion WHERE char_id = ?').get(charId);
  if (row && row.last_reset !== today) {
    db.getDatabase().prepare(`
      UPDATE devotion SET points = 0, tasks_done = '{}', tiers_claimed = '[]', last_reset = ?
      WHERE char_id = ?
    `).run(today, charId);
  }
}

function getDevotionInfo(charId) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM devotion WHERE char_id = ?').get(charId);
  const tasksDone = JSON.parse(row.tasks_done || '{}');
  const tiersClaimed = JSON.parse(row.tiers_claimed || '[]');

  const tasks = TASKS.map(t => ({
    ...t,
    completed: !!tasksDone[t.id],
  }));

  const tiers = REWARD_TIERS.map((t, i) => ({
    ...t,
    unlocked: row.points >= t.points,
    claimed: tiersClaimed.includes(i),
  }));

  return { points: row.points, maxPoints: TASKS.reduce((s, t) => s + t.points, 0), tasks, tiers };
}

function completeTask(charId, taskId) {
  ensureEntry(charId);
  const task = TASKS.find(t => t.id === taskId);
  if (!task) return { success: false };

  const row = db.getDatabase().prepare('SELECT * FROM devotion WHERE char_id = ?').get(charId);
  const tasksDone = JSON.parse(row.tasks_done || '{}');

  if (tasksDone[taskId]) return { success: false, msg: 'Already completed today' };

  tasksDone[taskId] = true;
  const newPoints = row.points + task.points;

  db.getDatabase().prepare('UPDATE devotion SET points = ?, tasks_done = ? WHERE char_id = ?')
    .run(newPoints, JSON.stringify(tasksDone), charId);

  return { success: true, taskId, points: newPoints, earned: task.points };
}

function claimTierReward(charId, tierIndex) {
  ensureEntry(charId);
  if (tierIndex < 0 || tierIndex >= REWARD_TIERS.length) return { success: false, msg: 'Invalid tier' };

  const row = db.getDatabase().prepare('SELECT * FROM devotion WHERE char_id = ?').get(charId);
  const tiersClaimed = JSON.parse(row.tiers_claimed || '[]');

  if (tiersClaimed.includes(tierIndex)) return { success: false, msg: 'Already claimed' };

  const tier = REWARD_TIERS[tierIndex];
  if (row.points < tier.points) return { success: false, msg: 'Not enough devotion points' };

  tiersClaimed.push(tierIndex);
  db.getDatabase().prepare('UPDATE devotion SET tiers_claimed = ? WHERE char_id = ?')
    .run(JSON.stringify(tiersClaimed), charId);

  // Give rewards
  const r = tier.rewards;
  if (r.gold) db.getDatabase().prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').run(r.gold, charId);
  if (r.exp) db.getDatabase().prepare('UPDATE characters SET exp = exp + ? WHERE id = ?').run(r.exp, charId);
  if (r.bound_balens) db.getDatabase().prepare('UPDATE characters SET bound_balens = bound_balens + ? WHERE id = ?').run(r.bound_balens, charId);

  const quest = require('./quest');
  quest.checkLevelUp(charId);

  return { success: true, rewards: r };
}

module.exports = {
  OPCODES, TASKS, REWARD_TIERS,
  initDB,
  getDevotionInfo, completeTask, claimTierReward,
};
