'use strict';

const db = require('../db');

const OPCODES = {
  C_GEM_LIST:      0x7B00,
  S_GEM_LIST_RSP:  0x7B10,
  C_GEM_COMBINE:   0x7B01,
  S_GEM_COMBINE:   0x7B11,
};

const MAX_GEM_LEVEL = 12;

const GEM_TYPES = {
  ruby:     { name: 'Ruby',     stat: 'attack',        baseVal: 20 },
  sapphire: { name: 'Sapphire', stat: 'defence',       baseVal: 15 },
  emerald:  { name: 'Emerald',  stat: 'max_hp',        baseVal: 100 },
  amethyst: { name: 'Amethyst', stat: 'magic_attack',  baseVal: 20 },
  topaz:    { name: 'Topaz',    stat: 'magic_defence',  baseVal: 15 },
  diamond:  { name: 'Diamond',  stat: 'crit',          baseVal: 5 },
  opal:     { name: 'Opal',     stat: 'speed',         baseVal: 10 },
  citrine:  { name: 'Citrine',  stat: 'dodge',         baseVal: 5 },
};

function gemStatValue(gemType, level) {
  const t = GEM_TYPES[gemType];
  if (!t || level < 1) return 0;
  return t.baseVal * Math.pow(2, level - 1);
}

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS gems (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id   INTEGER NOT NULL REFERENCES characters(id),
      gem_type  TEXT NOT NULL,
      gem_level INTEGER NOT NULL DEFAULT 1,
      quantity  INTEGER NOT NULL DEFAULT 1,
      UNIQUE(char_id, gem_type, gem_level)
    );
  `);
}

function getGemInventory(charId) {
  const rows = db.getDatabase()
    .prepare('SELECT * FROM gems WHERE char_id = ? AND quantity > 0 ORDER BY gem_type, gem_level')
    .all(charId);

  return {
    gems: rows.map(r => {
      const t = GEM_TYPES[r.gem_type];
      return {
        gemType: r.gem_type,
        name: t ? t.name : r.gem_type,
        level: r.gem_level,
        quantity: r.quantity,
        stat: t ? t.stat : '',
        statValue: gemStatValue(r.gem_type, r.gem_level),
      };
    }),
  };
}

function addGem(charId, gemType, gemLevel, quantity) {
  if (!GEM_TYPES[gemType]) return { success: false, msg: 'Unknown gem type' };
  if (gemLevel < 1 || gemLevel > MAX_GEM_LEVEL) return { success: false, msg: 'Invalid gem level' };
  if (quantity < 1) return { success: false, msg: 'Invalid quantity' };

  db.getDatabase().prepare(`
    INSERT INTO gems (char_id, gem_type, gem_level, quantity)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(char_id, gem_type, gem_level) DO UPDATE SET
      quantity = quantity + excluded.quantity
  `).run(charId, gemType, gemLevel, quantity);

  return { success: true };
}

function combineGems(charId, gemType, gemLevel) {
  if (!GEM_TYPES[gemType]) return { success: false, msg: 'Unknown gem type' };
  if (gemLevel < 1 || gemLevel >= MAX_GEM_LEVEL) return { success: false, msg: 'Cannot combine max level gems' };

  const row = db.getDatabase()
    .prepare('SELECT * FROM gems WHERE char_id = ? AND gem_type = ? AND gem_level = ?')
    .get(charId, gemType, gemLevel);

  if (!row || row.quantity < 4) {
    return { success: false, msg: `Need 4 level ${gemLevel} ${GEM_TYPES[gemType].name} gems (have ${row ? row.quantity : 0})` };
  }

  const newLevel = gemLevel + 1;

  // Remove 4 lower gems
  db.getDatabase()
    .prepare('UPDATE gems SET quantity = quantity - 4 WHERE char_id = ? AND gem_type = ? AND gem_level = ?')
    .run(charId, gemType, gemLevel);

  // Add 1 higher gem
  db.getDatabase().prepare(`
    INSERT INTO gems (char_id, gem_type, gem_level, quantity)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(char_id, gem_type, gem_level) DO UPDATE SET
      quantity = quantity + 1
  `).run(charId, gemType, newLevel);

  // Clean up zero-quantity rows
  db.getDatabase()
    .prepare('DELETE FROM gems WHERE char_id = ? AND quantity <= 0')
    .run(charId);

  const t = GEM_TYPES[gemType];
  return {
    success: true,
    result: {
      gemType,
      name: t.name,
      newLevel,
      stat: t.stat,
      statValue: gemStatValue(gemType, newLevel),
    },
  };
}

function getGemBonuses(charId) {
  const bonuses = { attack: 0, defence: 0, max_hp: 0, magic_attack: 0, magic_defence: 0, crit: 0, speed: 0, dodge: 0 };

  // Gems that are socketed into equipment contribute bonuses.
  // For now, count all gems in inventory as contributing (socketing is in forge.js).
  // A more realistic approach would only count socketed gems, but this provides the stat API.
  const rows = db.getDatabase()
    .prepare('SELECT * FROM gems WHERE char_id = ? AND quantity > 0')
    .all(charId);

  for (const r of rows) {
    const t = GEM_TYPES[r.gem_type];
    if (t && bonuses[t.stat] !== undefined) {
      bonuses[t.stat] += gemStatValue(r.gem_type, r.gem_level) * r.quantity;
    }
  }

  return bonuses;
}

module.exports = {
  OPCODES, GEM_TYPES, MAX_GEM_LEVEL,
  initDB,
  getGemInventory, addGem, combineGems, getGemBonuses, gemStatValue,
};
