/**
 * Wartune Ultra — Blacksmith / Holy Forge System
 * Enchant, socket gems, refine, synthesize equipment.
 */

'use strict';

const db = require('../db');

const OPCODES = {
  C_ENCHANT:       0x55F0,  // 22000
  S_ENCHANT_RSP:   0x1100,  // 4352
  C_SOCKET_GEM:    0x55F1,  // 22001
  S_SOCKET_RSP:    0x1101,  // 4353
  C_REFINE:        0x55F2,  // 22002
  S_REFINE_RSP:    0x1102,  // 4354
  C_SYNTHESIZE:    0x55F3,  // 22003
  S_SYNTHESIZE_RSP:0x1103,  // 4355
  C_RECYCLE:       0x55F4,  // 22004
  S_RECYCLE_RSP:   0x1104,  // 4356
};

// Gem types and levels
const GEM_TYPES = [
  { id: 1, name: 'Attack Gem',   stat: 'attack',        values: [5, 10, 20, 40, 80, 160, 320, 640] },
  { id: 2, name: 'Defence Gem',  stat: 'defence',       values: [3, 6, 12, 24, 48, 96, 192, 384] },
  { id: 3, name: 'HP Gem',       stat: 'hp',            values: [30, 60, 120, 240, 480, 960, 1920, 3840] },
  { id: 4, name: 'MATK Gem',     stat: 'magic_attack',  values: [4, 8, 16, 32, 64, 128, 256, 512] },
  { id: 5, name: 'MDEF Gem',     stat: 'magic_defence', values: [3, 6, 12, 24, 48, 96, 192, 384] },
  { id: 6, name: 'Crit Gem',     stat: 'crit',          values: [10, 20, 40, 80, 160, 320, 640, 1280] },
];

/**
 * Enchant: increase item enhance level. Gold cost, chance of failure at high levels.
 */
function enchantItem(charId, itemDbId) {
  const item = db.getDatabase()
    .prepare('SELECT * FROM items WHERE id = ? AND char_id = ?')
    .get(itemDbId, charId);
  if (!item) return { success: false, msg: 'Item not found' };

  const char = db.getCharacterById(charId);
  const cost = 500 * (item.enhance + 1);
  if (char.gold < cost) return { success: false, msg: 'Not enough gold' };

  db.updateCharacter(charId, { gold: char.gold - cost });

  // Success rate decreases at higher levels
  const successRate = Math.max(0.20, 1.0 - item.enhance * 0.08);
  const succeeded = Math.random() < successRate;

  if (succeeded) {
    db.getDatabase()
      .prepare('UPDATE items SET enhance = enhance + 1 WHERE id = ?')
      .run(itemDbId);

    // Recalc if equipped
    if (item.equip_slot > 0) {
      const inventory = require('./inventory');
      inventory.recalcStats(charId);
    }

    return { success: true, enhance: item.enhance + 1 };
  }

  return { success: false, msg: 'Enchant failed', enhance: item.enhance };
}

/**
 * Socket a gem into an item. Items have up to 4 gem slots.
 */
function socketGem(charId, itemDbId, gemType, gemLevel) {
  const item = db.getDatabase()
    .prepare('SELECT * FROM items WHERE id = ? AND char_id = ?')
    .get(itemDbId, charId);
  if (!item) return { success: false, msg: 'Item not found' };

  const gem = GEM_TYPES.find(g => g.id === gemType);
  if (!gem) return { success: false, msg: 'Unknown gem type' };
  if (gemLevel < 1 || gemLevel > gem.values.length) return { success: false, msg: 'Invalid gem level' };

  const attrs = JSON.parse(item.attrs || '{}');
  const sockets = attrs.sockets || [];
  if (sockets.length >= 4) return { success: false, msg: 'All sockets used' };

  sockets.push({ type: gemType, level: gemLevel, stat: gem.stat, value: gem.values[gemLevel - 1] });
  attrs.sockets = sockets;

  // Recalc item stat bonuses from gems
  const gemBonuses = {};
  for (const s of sockets) {
    gemBonuses[s.stat] = (gemBonuses[s.stat] || 0) + s.value;
  }
  attrs.gemBonuses = gemBonuses;

  db.getDatabase()
    .prepare('UPDATE items SET attrs = ? WHERE id = ?')
    .run(JSON.stringify(attrs), itemDbId);

  if (item.equip_slot > 0) {
    const inventory = require('./inventory');
    inventory.recalcStats(charId);
  }

  return { success: true, sockets };
}

/**
 * Refine: reroll random sub-stats on an equipment piece.
 */
function refineItem(charId, itemDbId) {
  const item = db.getDatabase()
    .prepare('SELECT * FROM items WHERE id = ? AND char_id = ?')
    .get(itemDbId, charId);
  if (!item) return { success: false, msg: 'Item not found' };

  const char = db.getCharacterById(charId);
  const cost = 1000 * (item.quality + 1);
  if (char.gold < cost) return { success: false, msg: 'Not enough gold' };

  db.updateCharacter(charId, { gold: char.gold - cost });

  const attrs = JSON.parse(item.attrs || '{}');
  // Generate random sub-stats
  const possibleStats = ['attack', 'defence', 'hp', 'magic_attack', 'magic_defence', 'crit'];
  const numStats = Math.min(2 + item.quality, 4);
  const substats = {};

  for (let i = 0; i < numStats; i++) {
    const stat = possibleStats[Math.floor(Math.random() * possibleStats.length)];
    const value = Math.floor((10 + Math.random() * 20) * (item.quality + 1));
    substats[stat] = (substats[stat] || 0) + value;
  }

  attrs.substats = substats;
  db.getDatabase()
    .prepare('UPDATE items SET attrs = ? WHERE id = ?')
    .run(JSON.stringify(attrs), itemDbId);

  return { success: true, substats };
}

/**
 * Synthesize: combine 4 gems of same type+level into one of the next level.
 */
function synthesizeGems(charId, gemType, gemLevel) {
  const gem = GEM_TYPES.find(g => g.id === gemType);
  if (!gem) return { success: false };
  if (gemLevel >= gem.values.length) return { success: false, msg: 'Already max level' };

  // Check player has 4 gems of this type+level (stored in player_data)
  const gemInventory = db.getPlayerData(charId, 'gems') || {};
  const key = `${gemType}_${gemLevel}`;
  const count = gemInventory[key] || 0;

  if (count < 4) return { success: false, msg: 'Need 4 gems to synthesize' };

  gemInventory[key] = count - 4;
  const newKey = `${gemType}_${gemLevel + 1}`;
  gemInventory[newKey] = (gemInventory[newKey] || 0) + 1;

  db.setPlayerData(charId, 'gems', gemInventory);

  return { success: true, newGemType: gemType, newGemLevel: gemLevel + 1 };
}

module.exports = {
  OPCODES, GEM_TYPES,
  enchantItem, socketGem, refineItem, synthesizeGems,
};
