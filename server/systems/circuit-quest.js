'use strict';

const db = require('../db');

const OPCODES = {
  C_CIRCUIT_INFO:     0x7A00,
  S_CIRCUIT_INFO:     0x7A10,
  C_CIRCUIT_ACCEPT:   0x7A01,
  S_CIRCUIT_ACCEPT:   0x7A11,
  C_CIRCUIT_COMPLETE: 0x7A02,
  S_CIRCUIT_COMPLETE: 0x7A12,
  C_CIRCUIT_REFRESH:  0x7A03,
  S_CIRCUIT_REFRESH:  0x7A13,
};

const MIN_LEVEL = 35;
const MAX_DAILY = 20;
const FREE_REFRESHES = 2;
const REFRESH_COST = 5; // balens

const QUALITY_WEIGHTS = [
  { quality: 'white',  weight: 40, rewardMul: 1.0 },
  { quality: 'green',  weight: 30, rewardMul: 1.5 },
  { quality: 'blue',   weight: 15, rewardMul: 2.5 },
  { quality: 'purple', weight: 10, rewardMul: 4.0 },
  { quality: 'orange', weight: 5,  rewardMul: 7.0 },
];

const QUEST_TEMPLATES = [
  { id: 1,  name: 'Kill Forest Beasts',    type: 'kill',    target: 'forest_beast',   count: 10 },
  { id: 2,  name: 'Collect Herbs',         type: 'collect', target: 'herb',           count: 8 },
  { id: 3,  name: 'Deliver Supplies',      type: 'deliver', target: 'supply_depot',   count: 1 },
  { id: 4,  name: 'Scout Enemy Camp',      type: 'scout',   target: 'enemy_camp',     count: 3 },
  { id: 5,  name: 'Rescue Prisoner',       type: 'rescue',  target: 'prisoner',       count: 1 },
  { id: 6,  name: 'Gather Intel',          type: 'collect', target: 'intel_scroll',   count: 5 },
  { id: 7,  name: 'Escort Merchant',       type: 'escort',  target: 'merchant_npc',   count: 1 },
  { id: 8,  name: 'Clear Dungeon',         type: 'kill',    target: 'dungeon_mob',    count: 15 },
  { id: 9,  name: 'Hunt Elite Monster',    type: 'kill',    target: 'elite_monster',  count: 1 },
  { id: 10, name: 'Slay Dragon Spawn',     type: 'kill',    target: 'dragon_spawn',   count: 5 },
];

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS circuit_quest (
      char_id          INTEGER PRIMARY KEY REFERENCES characters(id),
      active_quest_id  INTEGER DEFAULT 0,
      active_quality   TEXT DEFAULT '',
      active_progress  INTEGER DEFAULT 0,
      active_target    INTEGER DEFAULT 0,
      completed_today  INTEGER DEFAULT 0,
      refreshes_today  INTEGER DEFAULT 0,
      last_reset       TEXT DEFAULT ''
    );
  `);
}

function ensureEntry(charId) {
  db.getDatabase().prepare('INSERT OR IGNORE INTO circuit_quest (char_id) VALUES (?)').run(charId);
  resetDaily(charId);
}

function resetDaily(charId) {
  const today = new Date().toISOString().slice(0, 10);
  const row = db.getDatabase().prepare('SELECT last_reset FROM circuit_quest WHERE char_id = ?').get(charId);
  if (row && row.last_reset !== today) {
    db.getDatabase().prepare(`
      UPDATE circuit_quest SET completed_today = 0, refreshes_today = 0,
      active_quest_id = 0, active_quality = '', active_progress = 0, active_target = 0,
      last_reset = ? WHERE char_id = ?
    `).run(today, charId);
  }
}

function rollQuality() {
  const totalWeight = QUALITY_WEIGHTS.reduce((s, q) => s + q.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const q of QUALITY_WEIGHTS) {
    roll -= q.weight;
    if (roll <= 0) return q;
  }
  return QUALITY_WEIGHTS[0];
}

function calculateRewards(charLevel, qualityMul) {
  const baseGold = 500 + charLevel * 50;
  const baseExp  = 300 + charLevel * 40;
  return {
    gold: Math.floor(baseGold * qualityMul),
    exp:  Math.floor(baseExp  * qualityMul),
  };
}

function getCircuitInfo(charId) {
  const char = db.getCharacterById(charId);
  if (!char) return { success: false };
  if (char.grade < MIN_LEVEL) return { success: false, msg: `Level ${MIN_LEVEL} required` };

  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM circuit_quest WHERE char_id = ?').get(charId);

  let activeQuest = null;
  if (row.active_quest_id > 0) {
    const template = QUEST_TEMPLATES.find(t => t.id === row.active_quest_id);
    if (template) {
      const qualityInfo = QUALITY_WEIGHTS.find(q => q.quality === row.active_quality) || QUALITY_WEIGHTS[0];
      activeQuest = {
        questId: template.id,
        name: template.name,
        type: template.type,
        quality: row.active_quality,
        progress: row.active_progress,
        target: row.active_target,
        canComplete: row.active_progress >= row.active_target,
        rewards: calculateRewards(char.grade, qualityInfo.rewardMul),
      };
    }
  }

  return {
    completedToday: row.completed_today,
    maxDaily: MAX_DAILY,
    refreshesToday: row.refreshes_today,
    freeRefreshes: FREE_REFRESHES,
    refreshCost: REFRESH_COST,
    activeQuest,
    hasActiveQuest: !!activeQuest,
  };
}

function acceptCircuitQuest(charId) {
  const char = db.getCharacterById(charId);
  if (!char) return { success: false };
  if (char.grade < MIN_LEVEL) return { success: false, msg: `Level ${MIN_LEVEL} required` };

  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM circuit_quest WHERE char_id = ?').get(charId);

  if (row.active_quest_id > 0) return { success: false, msg: 'Already have an active quest' };

  // Pick random quest and quality
  const template = QUEST_TEMPLATES[Math.floor(Math.random() * QUEST_TEMPLATES.length)];
  const qualityInfo = rollQuality();

  // Scale count slightly by quality
  const targetCount = Math.max(1, Math.floor(template.count * (0.8 + qualityInfo.rewardMul * 0.1)));

  db.getDatabase().prepare(`
    UPDATE circuit_quest SET active_quest_id = ?, active_quality = ?,
    active_progress = 0, active_target = ? WHERE char_id = ?
  `).run(template.id, qualityInfo.quality, targetCount, charId);

  return {
    success: true,
    quest: {
      questId: template.id,
      name: template.name,
      type: template.type,
      quality: qualityInfo.quality,
      progress: 0,
      target: targetCount,
      rewards: calculateRewards(char.grade, qualityInfo.rewardMul),
    },
  };
}

function completeCircuitQuest(charId) {
  const char = db.getCharacterById(charId);
  if (!char) return { success: false };

  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM circuit_quest WHERE char_id = ?').get(charId);

  if (row.active_quest_id <= 0) return { success: false, msg: 'No active quest' };

  // Auto-complete: for server-side simplicity, we simulate completion
  // In a real client flow, the client would send progress updates
  const qualityInfo = QUALITY_WEIGHTS.find(q => q.quality === row.active_quality) || QUALITY_WEIGHTS[0];
  const rewards = calculateRewards(char.grade, qualityInfo.rewardMul);

  db.getDatabase().prepare('UPDATE characters SET gold = gold + ?, exp = exp + ? WHERE id = ?')
    .run(rewards.gold, rewards.exp, charId);

  db.getDatabase().prepare(`
    UPDATE circuit_quest SET active_quest_id = 0, active_quality = '',
    active_progress = 0, active_target = 0, completed_today = completed_today + 1
    WHERE char_id = ?
  `).run(charId);

  // Devotion integration
  try {
    const devotion = require('./devotion');
    devotion.completeTask(charId, 'circuit_quest');
  } catch (e) { /* optional */ }

  try {
    const quest = require('./quest');
    quest.checkLevelUp(charId);
  } catch (e) { /* optional */ }

  return {
    success: true,
    rewards,
    completedToday: row.completed_today + 1,
    maxDaily: MAX_DAILY,
  };
}

function refreshCircuitQuest(charId) {
  const char = db.getCharacterById(charId);
  if (!char) return { success: false };

  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM circuit_quest WHERE char_id = ?').get(charId);

  if (row.active_quest_id <= 0) return { success: false, msg: 'No active quest to refresh' };

  const isFree = row.refreshes_today < FREE_REFRESHES;
  if (!isFree) {
    if (char.balens < REFRESH_COST) return { success: false, msg: `Need ${REFRESH_COST} balens to refresh` };
    db.getDatabase().prepare('UPDATE characters SET balens = balens - ? WHERE id = ?').run(REFRESH_COST, charId);
  }

  // Re-roll quality (potentially better)
  const newQuality = rollQuality();
  const template = QUEST_TEMPLATES.find(t => t.id === row.active_quest_id) || QUEST_TEMPLATES[0];
  const targetCount = Math.max(1, Math.floor(template.count * (0.8 + newQuality.rewardMul * 0.1)));

  db.getDatabase().prepare(`
    UPDATE circuit_quest SET active_quality = ?, active_progress = 0,
    active_target = ?, refreshes_today = refreshes_today + 1 WHERE char_id = ?
  `).run(newQuality.quality, targetCount, charId);

  return {
    success: true,
    newQuality: newQuality.quality,
    quest: {
      questId: template.id,
      name: template.name,
      quality: newQuality.quality,
      target: targetCount,
      rewards: calculateRewards(char.grade, newQuality.rewardMul),
    },
    refreshesUsed: row.refreshes_today + 1,
    freeRefreshes: FREE_REFRESHES,
    balensCost: isFree ? 0 : REFRESH_COST,
  };
}

module.exports = {
  OPCODES, QUEST_TEMPLATES, QUALITY_WEIGHTS, MIN_LEVEL, MAX_DAILY, FREE_REFRESHES, REFRESH_COST,
  initDB,
  getCircuitInfo, acceptCircuitQuest, completeCircuitQuest, refreshCircuitQuest,
};
