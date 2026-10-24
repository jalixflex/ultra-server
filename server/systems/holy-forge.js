'use strict';

const db = require('../db');

const OPCODES = {
  C_HOLY_FORGE_INFO:    0x7600,
  S_HOLY_FORGE_INFO:    0x7610,
  C_HOLY_FORGE_UPGRADE: 0x7601,
  S_HOLY_FORGE_UPGRADE: 0x7611,
  C_HOLY_FORGE_ACTIVATE:0x7602,
  S_HOLY_FORGE_ACTIVATE:0x7612,
};

const MIN_LEVEL = 80;

// Holy Forge equipment slots and max levels per advancement tier
const SLOTS = ['weapon', 'helmet', 'armor', 'boots', 'ring', 'necklace', 'shield', 'cape'];

// Each slot has tiers that unlock with class advancement levels
const MAX_TIER = 5;

// Holy Forge upgrade materials
const UPGRADE_COSTS = {
  1:  { holyStones: 5,   gold: 50000,   successRate: 100 },
  2:  { holyStones: 10,  gold: 100000,  successRate: 100 },
  3:  { holyStones: 15,  gold: 200000,  successRate: 90 },
  4:  { holyStones: 25,  gold: 350000,  successRate: 80 },
  5:  { holyStones: 35,  gold: 500000,  successRate: 70 },
  6:  { holyStones: 50,  gold: 750000,  successRate: 60 },
  7:  { holyStones: 70,  gold: 1000000, successRate: 50 },
  8:  { holyStones: 100, gold: 1500000, successRate: 40 },
  9:  { holyStones: 140, gold: 2000000, successRate: 30 },
  10: { holyStones: 200, gold: 3000000, successRate: 20 },
};

// Stat bonuses per slot per level
const SLOT_STATS = {
  weapon:   { attack: 50,  magic_attack: 30 },
  helmet:   { defence: 30, magic_defence: 20, max_hp: 200 },
  armor:    { defence: 40, max_hp: 300 },
  boots:    { defence: 20, magic_defence: 20, max_hp: 150 },
  ring:     { attack: 30,  magic_attack: 40 },
  necklace: { magic_attack: 35, magic_defence: 25 },
  shield:   { defence: 50, max_hp: 250 },
  cape:     { magic_defence: 40, max_hp: 200 },
};

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS holy_forge (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id   INTEGER NOT NULL REFERENCES characters(id),
      slot      TEXT NOT NULL,
      level     INTEGER DEFAULT 0,
      activated INTEGER DEFAULT 0,
      UNIQUE(char_id, slot)
    );
    CREATE TABLE IF NOT EXISTS holy_forge_materials (
      char_id      INTEGER PRIMARY KEY REFERENCES characters(id),
      holy_stones  INTEGER DEFAULT 0
    );
  `);
}

function ensureEntry(charId) {
  db.getDatabase().prepare('INSERT OR IGNORE INTO holy_forge_materials (char_id) VALUES (?)').run(charId);
  for (const slot of SLOTS) {
    db.getDatabase().prepare('INSERT OR IGNORE INTO holy_forge (char_id, slot) VALUES (?, ?)').run(charId, slot);
  }
}

function getInfo(charId) {
  const char = db.getCharacterById(charId);
  if (!char) return { success: false };
  if (char.grade < MIN_LEVEL) return { success: false, msg: `Level ${MIN_LEVEL} required` };

  ensureEntry(charId);
  const slots = db.getDatabase().prepare('SELECT * FROM holy_forge WHERE char_id = ?').all(charId);
  const mats = db.getDatabase().prepare('SELECT * FROM holy_forge_materials WHERE char_id = ?').get(charId);

  return {
    success: true,
    slots: slots.map(s => ({
      slot: s.slot,
      level: s.level,
      activated: !!s.activated,
      maxLevel: 10,
      stats: getSlotStats(s.slot, s.level),
      nextCost: s.level < 10 ? UPGRADE_COSTS[s.level + 1] : null,
    })),
    holyStones: mats ? mats.holy_stones : 0,
  };
}

function getSlotStats(slot, level) {
  const base = SLOT_STATS[slot];
  if (!base || level <= 0) return {};
  const result = {};
  for (const [stat, val] of Object.entries(base)) {
    result[stat] = val * level;
  }
  return result;
}

function upgrade(charId, slot) {
  const char = db.getCharacterById(charId);
  if (!char || char.grade < MIN_LEVEL) return { success: false, msg: `Level ${MIN_LEVEL} required` };
  if (!SLOTS.includes(slot)) return { success: false, msg: 'Invalid slot' };

  ensureEntry(charId);
  const forgeSlot = db.getDatabase().prepare('SELECT * FROM holy_forge WHERE char_id = ? AND slot = ?').get(charId, slot);
  if (forgeSlot.level >= 10) return { success: false, msg: 'Already max level' };

  const nextLevel = forgeSlot.level + 1;
  const cost = UPGRADE_COSTS[nextLevel];
  const mats = db.getDatabase().prepare('SELECT * FROM holy_forge_materials WHERE char_id = ?').get(charId);

  if ((mats?.holy_stones || 0) < cost.holyStones) return { success: false, msg: `Need ${cost.holyStones} Holy Stones` };
  if (char.gold < cost.gold) return { success: false, msg: `Need ${cost.gold} gold` };

  // Deduct costs
  db.getDatabase().prepare('UPDATE holy_forge_materials SET holy_stones = holy_stones - ? WHERE char_id = ?')
    .run(cost.holyStones, charId);
  db.getDatabase().prepare('UPDATE characters SET gold = gold - ? WHERE id = ?').run(cost.gold, charId);

  // Roll success
  const roll = Math.random() * 100;
  if (roll < cost.successRate) {
    db.getDatabase().prepare('UPDATE holy_forge SET level = ? WHERE char_id = ? AND slot = ?')
      .run(nextLevel, charId, slot);
    return {
      success: true, upgraded: true, slot, newLevel: nextLevel,
      stats: getSlotStats(slot, nextLevel),
    };
  }

  return { success: true, upgraded: false, slot, msg: 'Upgrade failed, materials consumed' };
}

function activate(charId, slot) {
  ensureEntry(charId);
  const forgeSlot = db.getDatabase().prepare('SELECT * FROM holy_forge WHERE char_id = ? AND slot = ?').get(charId, slot);
  if (!forgeSlot || forgeSlot.level <= 0) return { success: false, msg: 'Upgrade this slot first' };
  if (forgeSlot.activated) return { success: false, msg: 'Already activated' };

  db.getDatabase().prepare('UPDATE holy_forge SET activated = 1 WHERE char_id = ? AND slot = ?').run(charId, slot);
  return { success: true, slot, activated: true };
}

function addHolyStones(charId, amount) {
  ensureEntry(charId);
  db.getDatabase().prepare('UPDATE holy_forge_materials SET holy_stones = holy_stones + ? WHERE char_id = ?')
    .run(amount, charId);
}

function getHolyForgeBonuses(charId) {
  ensureEntry(charId);
  const slots = db.getDatabase().prepare('SELECT * FROM holy_forge WHERE char_id = ? AND activated = 1').all(charId);
  const bonuses = { attack: 0, defence: 0, max_hp: 0, magic_attack: 0, magic_defence: 0 };

  for (const s of slots) {
    const stats = getSlotStats(s.slot, s.level);
    for (const [stat, val] of Object.entries(stats)) {
      if (bonuses[stat] !== undefined) bonuses[stat] += val;
    }
  }
  return bonuses;
}

module.exports = {
  OPCODES, SLOTS, UPGRADE_COSTS, SLOT_STATS, MIN_LEVEL,
  initDB,
  getInfo, upgrade, activate, addHolyStones, getHolyForgeBonuses,
};
