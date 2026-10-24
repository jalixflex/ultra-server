/**
 * Wartune Ultra — Astral System
 * Capture, upgrade, and socket astrals for stat boosts.
 * Original: unlocks at level 25, 5 slots + bonus slots at higher levels.
 */

'use strict';

const db = require('../db');

const OPCODES = {
  C_ASTRAL_CAPTURE:   0x3A98,  // 15000
  S_ASTRAL_CAPTURE:   0x1090,  // 4240
  C_ASTRAL_LIST:      0x3A99,  // 15001
  S_ASTRAL_LIST:      0x1091,  // 4241
  C_ASTRAL_EQUIP:     0x3A9A,  // 15002
  S_ASTRAL_EQUIP:     0x1092,  // 4242
  C_ASTRAL_UNEQUIP:   0x3A9B,  // 15003
  C_ASTRAL_UPGRADE:   0x3A9C,  // 15004
  S_ASTRAL_UPGRADE:   0x1093,  // 4243
  C_ASTRAL_SELL:      0x3A9D,  // 15005
};

// Astral colors/rarities
const ASTRAL_COLOR = { WHITE: 0, GREEN: 1, BLUE: 2, PURPLE: 3, ORANGE: 4, RED: 5 };

// Astral templates — stat bonuses per level
const ASTRAL_TYPES = [
  { id: 1,  name: 'Goddess Blessing',    stat: 'hp',            baseValue: 50,  perLevel: 30,  color: ASTRAL_COLOR.GREEN },
  { id: 2,  name: 'Determination',        stat: 'attack',        baseValue: 10,  perLevel: 8,   color: ASTRAL_COLOR.GREEN },
  { id: 3,  name: 'Guardian Angel',       stat: 'defence',       baseValue: 8,   perLevel: 5,   color: ASTRAL_COLOR.GREEN },
  { id: 4,  name: 'Brilliant Star',       stat: 'magic_attack',  baseValue: 10,  perLevel: 7,   color: ASTRAL_COLOR.GREEN },
  { id: 5,  name: 'Mystic Shield',        stat: 'magic_defence', baseValue: 8,   perLevel: 4,   color: ASTRAL_COLOR.GREEN },
  { id: 6,  name: 'Enhanced Determination', stat: 'attack',      baseValue: 25,  perLevel: 15,  color: ASTRAL_COLOR.BLUE },
  { id: 7,  name: 'Will Destroyer',       stat: 'crit',          baseValue: 50,  perLevel: 25,  color: ASTRAL_COLOR.BLUE },
  { id: 8,  name: 'Illusion',             stat: 'dodge',         baseValue: 30,  perLevel: 15,  color: ASTRAL_COLOR.BLUE },
  { id: 9,  name: 'Regeneration',         stat: 'hp_regen',      baseValue: 20,  perLevel: 10,  color: ASTRAL_COLOR.BLUE },
  { id: 10, name: 'Sniper of God',        stat: 'crit_damage',   baseValue: 100, perLevel: 50,  color: ASTRAL_COLOR.PURPLE },
  { id: 11, name: 'Holy Shield',          stat: 'block',         baseValue: 50,  perLevel: 25,  color: ASTRAL_COLOR.PURPLE },
  { id: 12, name: 'Deflection',           stat: 'damage_reduce', baseValue: 20,  perLevel: 10,  color: ASTRAL_COLOR.PURPLE },
  { id: 13, name: 'Goddess of War',       stat: 'attack',        baseValue: 50,  perLevel: 30,  color: ASTRAL_COLOR.ORANGE },
  { id: 14, name: 'Guardian of Zeus',     stat: 'defence',       baseValue: 40,  perLevel: 25,  color: ASTRAL_COLOR.ORANGE },
  { id: 15, name: 'Aegis Major',          stat: 'hp',            baseValue: 200, perLevel: 100, color: ASTRAL_COLOR.RED },
];

const MAX_ASTRAL_SLOTS = 8;

function initDB() {
  const dbInst = db.getDatabase();
  dbInst.exec(`
    CREATE TABLE IF NOT EXISTS astrals (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id   INTEGER NOT NULL REFERENCES characters(id),
      type_id   INTEGER NOT NULL,
      level     INTEGER DEFAULT 1,
      exp       INTEGER DEFAULT 0,
      slot      INTEGER DEFAULT -1,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_astrals_char ON astrals(char_id);
  `);
}

/**
 * Capture (roll) a new astral. Gold cost scales with player level.
 */
function captureAstral(charId, useBalens = false) {
  const char = db.getCharacterById(charId);
  if (!char) return { success: false, msg: 'Character not found' };

  if (!require('./feature-unlock').isFeatureUnlocked(char.grade, 'astral')) {
    return { success: false, msg: 'Astral unlocks at level 25' };
  }

  const goldCost = useBalens ? 0 : 10000 + char.grade * 500;
  const balensCost = useBalens ? 50 : 0;

  if (!useBalens && char.gold < goldCost) return { success: false, msg: 'Not enough gold' };
  if (useBalens && char.balens < balensCost) return { success: false, msg: 'Not enough balens' };

  // Deduct cost
  if (useBalens) {
    db.updateCharacter(charId, { balens: char.balens - balensCost });
  } else {
    db.updateCharacter(charId, { gold: char.gold - goldCost });
  }

  // Roll astral rarity based on balens vs gold
  const roll = Math.random();
  let pool;
  if (useBalens) {
    // Better odds with balens
    if (roll < 0.05)      pool = ASTRAL_TYPES.filter(a => a.color === ASTRAL_COLOR.ORANGE);
    else if (roll < 0.20) pool = ASTRAL_TYPES.filter(a => a.color === ASTRAL_COLOR.PURPLE);
    else if (roll < 0.50) pool = ASTRAL_TYPES.filter(a => a.color === ASTRAL_COLOR.BLUE);
    else                   pool = ASTRAL_TYPES.filter(a => a.color === ASTRAL_COLOR.GREEN);
  } else {
    if (roll < 0.01)      pool = ASTRAL_TYPES.filter(a => a.color === ASTRAL_COLOR.PURPLE);
    else if (roll < 0.10) pool = ASTRAL_TYPES.filter(a => a.color === ASTRAL_COLOR.BLUE);
    else                   pool = ASTRAL_TYPES.filter(a => a.color === ASTRAL_COLOR.GREEN);
  }

  const template = pool[Math.floor(Math.random() * pool.length)];
  const result = db.getDatabase()
    .prepare('INSERT INTO astrals (char_id, type_id, level) VALUES (?, ?, 1)')
    .run(charId, template.id);

  return {
    success: true,
    astral: {
      id: result.lastInsertRowid,
      typeId: template.id,
      name: template.name,
      stat: template.stat,
      color: template.color,
      level: 1,
      value: template.baseValue,
    },
  };
}

function getAstrals(charId) {
  const rows = db.getDatabase()
    .prepare('SELECT * FROM astrals WHERE char_id = ? ORDER BY slot DESC, level DESC')
    .all(charId);

  return rows.map(r => {
    const t = ASTRAL_TYPES.find(a => a.id === r.type_id) || ASTRAL_TYPES[0];
    return {
      id: r.id,
      typeId: r.type_id,
      name: t.name,
      stat: t.stat,
      color: t.color,
      level: r.level,
      exp: r.exp,
      slot: r.slot,
      value: t.baseValue + t.perLevel * (r.level - 1),
    };
  });
}

function equipAstral(charId, astralId, slot) {
  if (slot < 0 || slot >= MAX_ASTRAL_SLOTS) return { success: false, msg: 'Invalid slot' };

  const astral = db.getDatabase()
    .prepare('SELECT * FROM astrals WHERE id = ? AND char_id = ?')
    .get(astralId, charId);
  if (!astral) return { success: false, msg: 'Astral not found' };

  // Check slot availability (unlock at levels: 0-4 at lv25, 5 at lv40, 6 at lv50, 7 at lv60)
  const char = db.getCharacterById(charId);
  const slotsUnlocked = char.grade >= 60 ? 8 : char.grade >= 50 ? 7 : char.grade >= 40 ? 6 : char.grade >= 25 ? 5 : 0;
  if (slot >= slotsUnlocked) return { success: false, msg: `Slot ${slot + 1} not unlocked yet` };

  // Unequip existing in that slot
  db.getDatabase().prepare('UPDATE astrals SET slot = -1 WHERE char_id = ? AND slot = ?').run(charId, slot);

  // Equip
  db.getDatabase().prepare('UPDATE astrals SET slot = ? WHERE id = ?').run(slot, astralId);

  recalcAstralStats(charId);
  return { success: true };
}

function upgradeAstral(charId, astralId, feedIds) {
  const astral = db.getDatabase()
    .prepare('SELECT * FROM astrals WHERE id = ? AND char_id = ?')
    .get(astralId, charId);
  if (!astral) return { success: false, msg: 'Astral not found' };

  let totalExp = 0;
  for (const fid of feedIds) {
    if (fid === astralId) continue;
    const feed = db.getDatabase()
      .prepare('SELECT * FROM astrals WHERE id = ? AND char_id = ? AND slot = -1')
      .get(fid, charId);
    if (feed) {
      const ft = ASTRAL_TYPES.find(a => a.id === feed.type_id) || ASTRAL_TYPES[0];
      totalExp += (ft.color + 1) * 50 * feed.level;
      db.getDatabase().prepare('DELETE FROM astrals WHERE id = ?').run(fid);
    }
  }

  let newExp = astral.exp + totalExp;
  let newLevel = astral.level;
  while (newLevel < 50 && newExp >= expForAstralLevel(newLevel + 1)) {
    newExp -= expForAstralLevel(newLevel + 1);
    newLevel++;
  }

  db.getDatabase()
    .prepare('UPDATE astrals SET level = ?, exp = ? WHERE id = ?')
    .run(newLevel, newExp, astralId);

  if (astral.slot >= 0) recalcAstralStats(charId);

  const t = ASTRAL_TYPES.find(a => a.id === astral.type_id);
  return { success: true, level: newLevel, exp: newExp, value: t.baseValue + t.perLevel * (newLevel - 1) };
}

function sellAstral(charId, astralId) {
  const astral = db.getDatabase()
    .prepare('SELECT * FROM astrals WHERE id = ? AND char_id = ? AND slot = -1')
    .get(astralId, charId);
  if (!astral) return { success: false, msg: 'Cannot sell equipped astral' };

  const t = ASTRAL_TYPES.find(a => a.id === astral.type_id);
  const gold = (t.color + 1) * 100 * astral.level;

  db.getDatabase().prepare('DELETE FROM astrals WHERE id = ?').run(astralId);
  db.getDatabase().prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').run(gold, charId);

  return { success: true, gold };
}

function recalcAstralStats(charId) {
  const equipped = getAstrals(charId).filter(a => a.slot >= 0);
  // Store as player_data for battle calculation
  const bonuses = {};
  for (const a of equipped) {
    bonuses[a.stat] = (bonuses[a.stat] || 0) + a.value;
  }
  db.setPlayerData(charId, 'astral_bonuses', bonuses);
}

function expForAstralLevel(level) {
  return Math.floor(100 * level * level);
}

module.exports = {
  OPCODES, ASTRAL_TYPES, ASTRAL_COLOR, MAX_ASTRAL_SLOTS,
  initDB,
  captureAstral, getAstrals, equipAstral, upgradeAstral, sellAstral,
  recalcAstralStats,
};
