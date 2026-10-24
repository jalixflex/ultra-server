'use strict';

const db = require('../db');

const OPCODES = {
  C_RUNE_INFO:      0x7200,
  S_RUNE_INFO_RSP:  0x7210,
  C_RUNE_EQUIP:     0x7201,
  S_RUNE_UPDATE:    0x7211,
  C_RUNE_UNEQUIP:   0x7202,
  C_RUNE_UPGRADE:   0x7203,
};

const MIN_LEVEL = 35;
const MAX_RUNE_LEVEL = 10;
const TOTAL_SLOTS = 8;

const SLOT_UNLOCK_LEVELS = [35, 40, 45, 50, 55, 60, 70, 80];

const RUNE_TEMPLATES = {
  1:  { name: 'Rune of Fury',      stat: 'attack',    pctPerLevel: 2,   desc: '+ATK%' },
  2:  { name: 'Rune of Iron',      stat: 'defence',   pctPerLevel: 2,   desc: '+DEF%' },
  3:  { name: 'Rune of Vitality',  stat: 'max_hp',    pctPerLevel: 3,   desc: '+HP%' },
  4:  { name: 'Rune of Precision', stat: 'crit',      pctPerLevel: 1.5, desc: '+Crit%' },
  5:  { name: 'Rune of Haste',     stat: 'speed',     pctPerLevel: 2,   desc: '+Speed%' },
  6:  { name: 'Rune of Drain',     stat: 'hp_steal',  pctPerLevel: 0.5, desc: 'HP steal on hit' },
  7:  { name: 'Rune of Thorns',    stat: 'reflect',   pctPerLevel: 1,   desc: 'Reflect damage' },
  8:  { name: 'Rune of Shield',    stat: 'dmg_reduce', pctPerLevel: 1.5, desc: 'Damage reduction' },
  9:  { name: 'Rune of Flame',     stat: 'fire_dmg',  pctPerLevel: 3,   desc: 'Fire damage bonus' },
  10: { name: 'Rune of Frost',     stat: 'ice_dmg',   pctPerLevel: 2,   desc: 'Slow enemy + ice damage' },
  11: { name: 'Rune of Thunder',   stat: 'stun_chance', pctPerLevel: 1, desc: 'Chance to stun' },
  12: { name: 'Rune of Shadow',    stat: 'dodge',     pctPerLevel: 1.5, desc: 'Dodge bonus' },
};

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS runes (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id   INTEGER NOT NULL REFERENCES characters(id),
      rune_id   INTEGER NOT NULL,
      level     INTEGER DEFAULT 1,
      UNIQUE(char_id, rune_id)
    );
    CREATE TABLE IF NOT EXISTS rune_slots (
      char_id    INTEGER NOT NULL REFERENCES characters(id),
      slot_index INTEGER NOT NULL,
      rune_id    INTEGER DEFAULT NULL,
      PRIMARY KEY(char_id, slot_index)
    );
  `);
}

function getUnlockedSlotCount(charLevel) {
  let count = 0;
  for (const lvl of SLOT_UNLOCK_LEVELS) {
    if (charLevel >= lvl) count++;
  }
  return count;
}

function ensureSlots(charId, charLevel) {
  const unlocked = getUnlockedSlotCount(charLevel);
  const stmt = db.getDatabase().prepare(
    'INSERT OR IGNORE INTO rune_slots (char_id, slot_index) VALUES (?, ?)'
  );
  for (let i = 0; i < unlocked; i++) {
    stmt.run(charId, i);
  }
}

function ensureRune(charId, runeId) {
  db.getDatabase().prepare(
    'INSERT OR IGNORE INTO runes (char_id, rune_id) VALUES (?, ?)'
  ).run(charId, runeId);
}

function getRuneInfo(charId) {
  const char = db.getCharacterById(charId);
  if (!char) return { success: false };
  if (char.grade < MIN_LEVEL) return { success: false, msg: `Level ${MIN_LEVEL} required` };

  ensureSlots(charId, char.grade);

  const slots = db.getDatabase().prepare(
    'SELECT * FROM rune_slots WHERE char_id = ? ORDER BY slot_index'
  ).all(charId);

  const ownedRunes = db.getDatabase().prepare(
    'SELECT * FROM runes WHERE char_id = ?'
  ).all(charId);

  const unlockedSlots = getUnlockedSlotCount(char.grade);

  return {
    success: true,
    level: char.grade,
    unlockedSlots,
    totalSlots: TOTAL_SLOTS,
    slotUnlockLevels: SLOT_UNLOCK_LEVELS,
    slots: slots.map(s => {
      const template = s.rune_id ? RUNE_TEMPLATES[s.rune_id] : null;
      const runeData = s.rune_id
        ? ownedRunes.find(r => r.rune_id === s.rune_id)
        : null;
      return {
        slotIndex: s.slot_index,
        runeId: s.rune_id,
        runeName: template ? template.name : null,
        runeLevel: runeData ? runeData.level : 0,
        desc: template ? template.desc : null,
      };
    }),
    ownedRunes: ownedRunes.map(r => {
      const t = RUNE_TEMPLATES[r.rune_id];
      return {
        runeId: r.rune_id,
        name: t ? t.name : `Rune #${r.rune_id}`,
        level: r.level,
        stat: t ? t.stat : null,
        pctPerLevel: t ? t.pctPerLevel : 0,
        totalBonus: t ? r.level * t.pctPerLevel : 0,
        desc: t ? t.desc : null,
      };
    }),
    templates: Object.entries(RUNE_TEMPLATES).map(([id, t]) => ({
      runeId: Number(id),
      name: t.name,
      stat: t.stat,
      pctPerLevel: t.pctPerLevel,
      desc: t.desc,
    })),
  };
}

function equipRune(charId, slotIndex, runeId) {
  const char = db.getCharacterById(charId);
  if (!char) return { success: false };
  if (char.grade < MIN_LEVEL) return { success: false, msg: `Level ${MIN_LEVEL} required` };

  const template = RUNE_TEMPLATES[runeId];
  if (!template) return { success: false, msg: 'Unknown rune' };

  const unlockedSlots = getUnlockedSlotCount(char.grade);
  if (slotIndex < 0 || slotIndex >= unlockedSlots) {
    return { success: false, msg: 'Slot not unlocked' };
  }

  ensureSlots(charId, char.grade);
  ensureRune(charId, runeId);

  // Check if rune is already equipped in another slot
  const existing = db.getDatabase().prepare(
    'SELECT slot_index FROM rune_slots WHERE char_id = ? AND rune_id = ?'
  ).get(charId, runeId);
  if (existing && existing.slot_index !== slotIndex) {
    return { success: false, msg: 'Rune already equipped in another slot' };
  }

  db.getDatabase().prepare(
    'UPDATE rune_slots SET rune_id = ? WHERE char_id = ? AND slot_index = ?'
  ).run(runeId, charId, slotIndex);

  const runeRow = db.getDatabase().prepare(
    'SELECT level FROM runes WHERE char_id = ? AND rune_id = ?'
  ).get(charId, runeId);

  return {
    success: true,
    slotIndex,
    runeId,
    name: template.name,
    level: runeRow ? runeRow.level : 1,
  };
}

function unequipRune(charId, slotIndex) {
  const char = db.getCharacterById(charId);
  if (!char) return { success: false };

  ensureSlots(charId, char.grade);

  const slot = db.getDatabase().prepare(
    'SELECT rune_id FROM rune_slots WHERE char_id = ? AND slot_index = ?'
  ).get(charId, slotIndex);
  if (!slot || !slot.rune_id) return { success: false, msg: 'Slot is empty' };

  db.getDatabase().prepare(
    'UPDATE rune_slots SET rune_id = NULL WHERE char_id = ? AND slot_index = ?'
  ).run(charId, slotIndex);

  return { success: true, slotIndex, removedRuneId: slot.rune_id };
}

function upgradeRune(charId, runeId) {
  const char = db.getCharacterById(charId);
  if (!char) return { success: false };

  const template = RUNE_TEMPLATES[runeId];
  if (!template) return { success: false, msg: 'Unknown rune' };

  ensureRune(charId, runeId);

  const row = db.getDatabase().prepare(
    'SELECT level FROM runes WHERE char_id = ? AND rune_id = ?'
  ).get(charId, runeId);
  if (!row) return { success: false };

  if (row.level >= MAX_RUNE_LEVEL) return { success: false, msg: 'Rune already at max level' };

  const nextLevel = row.level + 1;
  const stoneCost = nextLevel * 5;
  const goldCost = nextLevel * 10000;

  if (char.gold < goldCost) return { success: false, msg: `Need ${goldCost} gold` };

  // Deduct gold (rune stones tracked as gold cost for simplicity)
  db.getDatabase().prepare('UPDATE characters SET gold = gold - ? WHERE id = ?')
    .run(goldCost, charId);

  db.getDatabase().prepare('UPDATE runes SET level = ? WHERE char_id = ? AND rune_id = ?')
    .run(nextLevel, charId, runeId);

  return {
    success: true,
    runeId,
    name: template.name,
    newLevel: nextLevel,
    goldSpent: goldCost,
    stonesCost: stoneCost,
    totalBonus: nextLevel * template.pctPerLevel,
  };
}

function getRuneBonuses(charId) {
  const bonuses = {};

  const slots = db.getDatabase().prepare(
    'SELECT rs.rune_id, r.level FROM rune_slots rs ' +
    'JOIN runes r ON rs.char_id = r.char_id AND rs.rune_id = r.rune_id ' +
    'WHERE rs.char_id = ? AND rs.rune_id IS NOT NULL'
  ).all(charId);

  for (const s of slots) {
    const t = RUNE_TEMPLATES[s.rune_id];
    if (!t) continue;
    const val = s.level * t.pctPerLevel;
    bonuses[t.stat] = (bonuses[t.stat] || 0) + val;
  }

  return bonuses;
}

module.exports = {
  OPCODES, RUNE_TEMPLATES, SLOT_UNLOCK_LEVELS, MIN_LEVEL, MAX_RUNE_LEVEL, TOTAL_SLOTS,
  initDB,
  getRuneInfo, equipRune, unequipRune, upgradeRune, getRuneBonuses,
};
