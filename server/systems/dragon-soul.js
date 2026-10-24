'use strict';

const db = require('../db');

const OPCODES = {
  C_DRAGON_SOUL_LIST:    0x7500,
  S_DRAGON_SOUL_LIST:    0x7510,
  C_DRAGON_SOUL_UNLOCK:  0x7501,
  S_DRAGON_SOUL_UPDATE:  0x7511,
  C_DRAGON_SOUL_UPGRADE: 0x7502,
  C_DRAGON_SOUL_EQUIP:   0x7503,
};

const MAX_LEVEL = 10;

const ELEMENTS = {
  fire:    { name: 'Fire Dragon Soul',    atkPct: 3, critPct: 1,   defPct: 0, hpPct: 0, matkPct: 0, mdefPct: 0, speedPct: 0, dodgePct: 0, stunPct: 0, healPct: 0, drainPct: 0 },
  water:   { name: 'Water Dragon Soul',   atkPct: 0, critPct: 0,   defPct: 0, hpPct: 3, matkPct: 0, mdefPct: 2, speedPct: 0, dodgePct: 0, stunPct: 0, healPct: 0, drainPct: 0 },
  wind:    { name: 'Wind Dragon Soul',    atkPct: 0, critPct: 0,   defPct: 0, hpPct: 0, matkPct: 0, mdefPct: 0, speedPct: 4, dodgePct: 1, stunPct: 0, healPct: 0, drainPct: 0 },
  thunder: { name: 'Thunder Dragon Soul', atkPct: 0, critPct: 0,   defPct: 0, hpPct: 0, matkPct: 3, mdefPct: 0, speedPct: 0, dodgePct: 0, stunPct: 0.5, healPct: 0, drainPct: 0 },
  light:   { name: 'Light Dragon Soul',   atkPct: 0, critPct: 0,   defPct: 2, hpPct: 0, matkPct: 0, mdefPct: 0, speedPct: 0, dodgePct: 0, stunPct: 0, healPct: 3, drainPct: 0 },
  dark:    { name: 'Dark Dragon Soul',    atkPct: 2, critPct: 0,   defPct: 0, hpPct: 0, matkPct: 0, mdefPct: 0, speedPct: 0, dodgePct: 0, stunPct: 0, healPct: 0, drainPct: 1 },
};

// Crystals needed to upgrade: level * 5
// Gold needed: level * 100000
function upgradeCost(level) {
  return { crystals: level * 5, gold: level * 100000 };
}

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS dragon_souls (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id   INTEGER NOT NULL REFERENCES characters(id),
      element   TEXT NOT NULL,
      level     INTEGER DEFAULT 1,
      equipped  INTEGER DEFAULT 0,
      UNIQUE(char_id, element)
    );
  `);
}

function getDragonSouls(charId) {
  const rows = db.getDatabase().prepare('SELECT * FROM dragon_souls WHERE char_id = ?').all(charId);
  const char = db.getCharacterById(charId);
  const hasClassAdv = char && char.grade >= 80;

  return {
    unlocked: hasClassAdv,
    souls: Object.keys(ELEMENTS).map(elem => {
      const row = rows.find(r => r.element === elem);
      const template = ELEMENTS[elem];
      const cost = row ? upgradeCost(row.level) : null;
      return {
        element: elem,
        name: template.name,
        owned: !!row,
        level: row ? row.level : 0,
        maxLevel: MAX_LEVEL,
        equipped: row ? !!row.equipped : false,
        upgradeCost: cost,
        bonuses: row ? calculateBonuses(elem, row.level) : null,
      };
    }),
  };
}

function calculateBonuses(element, level) {
  const template = ELEMENTS[element];
  if (!template) return {};
  const bonuses = {};
  for (const [key, perLevel] of Object.entries(template)) {
    if (key === 'name') continue;
    if (perLevel !== 0) {
      bonuses[key] = Math.round(perLevel * level * 100) / 100;
    }
  }
  return bonuses;
}

function unlockDragonSoul(charId, element) {
  if (!ELEMENTS[element]) return { success: false, msg: 'Unknown element' };

  const char = db.getCharacterById(charId);
  if (!char || char.grade < 80) return { success: false, msg: 'Requires level 80 and class advancement' };

  const existing = db.getDatabase()
    .prepare('SELECT id FROM dragon_souls WHERE char_id = ? AND element = ?')
    .get(charId, element);
  if (existing) return { success: false, msg: 'Already unlocked' };

  // First dragon soul is free; subsequent cost 50000 gold
  const owned = db.getDatabase()
    .prepare('SELECT COUNT(*) as cnt FROM dragon_souls WHERE char_id = ?')
    .get(charId);

  if (owned.cnt > 0) {
    if (char.gold < 50000) return { success: false, msg: 'Need 50000 gold' };
    db.getDatabase().prepare('UPDATE characters SET gold = gold - 50000 WHERE id = ?').run(charId);
  }

  db.getDatabase().prepare('INSERT INTO dragon_souls (char_id, element) VALUES (?, ?)').run(charId, element);

  return {
    success: true,
    element,
    name: ELEMENTS[element].name,
    level: 1,
    bonuses: calculateBonuses(element, 1),
  };
}

function upgradeDragonSoul(charId, element) {
  if (!ELEMENTS[element]) return { success: false, msg: 'Unknown element' };

  const row = db.getDatabase()
    .prepare('SELECT * FROM dragon_souls WHERE char_id = ? AND element = ?')
    .get(charId, element);
  if (!row) return { success: false, msg: 'Dragon soul not unlocked' };
  if (row.level >= MAX_LEVEL) return { success: false, msg: 'Already max level' };

  const cost = upgradeCost(row.level);
  const char = db.getCharacterById(charId);
  if (!char) return { success: false };

  if (char.gold < cost.gold) return { success: false, msg: `Need ${cost.gold} gold` };

  // For crystals we just check gold for now (crystals would be an inventory item)
  db.getDatabase().prepare('UPDATE characters SET gold = gold - ? WHERE id = ?').run(cost.gold, charId);

  const newLevel = row.level + 1;
  db.getDatabase().prepare('UPDATE dragon_souls SET level = ? WHERE char_id = ? AND element = ?')
    .run(newLevel, charId, element);

  return {
    success: true,
    element,
    name: ELEMENTS[element].name,
    level: newLevel,
    bonuses: calculateBonuses(element, newLevel),
    goldSpent: cost.gold,
  };
}

function equipDragonSoul(charId, element) {
  if (!ELEMENTS[element]) return { success: false, msg: 'Unknown element' };

  const row = db.getDatabase()
    .prepare('SELECT * FROM dragon_souls WHERE char_id = ? AND element = ?')
    .get(charId, element);
  if (!row) return { success: false, msg: 'Dragon soul not unlocked' };

  // Unequip all first, then equip selected
  db.getDatabase().prepare('UPDATE dragon_souls SET equipped = 0 WHERE char_id = ?').run(charId);
  db.getDatabase().prepare('UPDATE dragon_souls SET equipped = 1 WHERE char_id = ? AND element = ?')
    .run(charId, element);

  return {
    success: true,
    element,
    name: ELEMENTS[element].name,
    level: row.level,
    bonuses: calculateBonuses(element, row.level),
  };
}

function getDragonSoulBonuses(charId) {
  const equipped = db.getDatabase()
    .prepare('SELECT * FROM dragon_souls WHERE char_id = ? AND equipped = 1')
    .get(charId);

  if (!equipped) return {};
  return calculateBonuses(equipped.element, equipped.level);
}

module.exports = {
  OPCODES, ELEMENTS, MAX_LEVEL,
  initDB,
  getDragonSouls, unlockDragonSoul, upgradeDragonSoul, equipDragonSoul,
  getDragonSoulBonuses,
};
