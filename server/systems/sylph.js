/**
 * Wartune Ultra — Sylph System
 * Elemental battle companions. Original: unlocks at level 50.
 * Sylphs have elements, skills, can be upgraded, engulfed, enchanted.
 */

'use strict';

const db = require('../db');

const OPCODES = {
  C_SYLPH_LIST:      0x3E80,  // 16000
  S_SYLPH_LIST:      0x10A0,  // 4256
  C_SYLPH_EQUIP:     0x3E81,  // 16001
  S_SYLPH_EQUIP:     0x10A1,  // 4257
  C_SYLPH_UPGRADE:   0x3E82,  // 16002
  S_SYLPH_UPGRADE:   0x10A2,  // 4258
  C_SYLPH_ENGULF:    0x3E83,  // 16003
  S_SYLPH_ENGULF:    0x10A3,  // 4259
  C_SYLPH_SKILL:     0x3E84,  // 16004
  S_SYLPH_SKILL:     0x10A4,  // 4260
};

const ELEMENT = { WIND: 1, FIRE: 2, WATER: 3, ELECTRO: 4, DARK: 5, LIGHT: 6 };

const SYLPH_TEMPLATES = [
  { id: 1, name: 'Gaia',         element: ELEMENT.WIND,    baseAtk: 50,  baseDef: 30, baseHp: 500,  baseMAtk: 60,  rarity: 1 },
  { id: 2, name: 'Amazon Queen', element: ELEMENT.WIND,    baseAtk: 60,  baseDef: 35, baseHp: 600,  baseMAtk: 70,  rarity: 2 },
  { id: 3, name: 'Pan',          element: ELEMENT.FIRE,    baseAtk: 70,  baseDef: 25, baseHp: 450,  baseMAtk: 80,  rarity: 1 },
  { id: 4, name: 'Hades',        element: ELEMENT.FIRE,    baseAtk: 90,  baseDef: 30, baseHp: 550,  baseMAtk: 100, rarity: 2 },
  { id: 5, name: 'Iris',         element: ELEMENT.WATER,   baseAtk: 45,  baseDef: 40, baseHp: 700,  baseMAtk: 55,  rarity: 1 },
  { id: 6, name: 'Poseidon',     element: ELEMENT.WATER,   baseAtk: 55,  baseDef: 50, baseHp: 800,  baseMAtk: 65,  rarity: 2 },
  { id: 7, name: 'Thor',         element: ELEMENT.ELECTRO, baseAtk: 80,  baseDef: 20, baseHp: 400,  baseMAtk: 90,  rarity: 2 },
  { id: 8, name: 'Apollo',       element: ELEMENT.LIGHT,   baseAtk: 100, baseDef: 45, baseHp: 700,  baseMAtk: 110, rarity: 3 },
  { id: 9, name: 'Nyx',          element: ELEMENT.DARK,    baseAtk: 110, baseDef: 35, baseHp: 600,  baseMAtk: 120, rarity: 3 },
];

const SYLPH_SKILLS = [
  { id: 1, name: 'Wind Blade',    element: ELEMENT.WIND,    damage: 120, cooldown: 0, desc: 'Basic wind attack' },
  { id: 2, name: 'Tornado',       element: ELEMENT.WIND,    damage: 250, cooldown: 3, desc: 'AoE wind attack' },
  { id: 3, name: 'Fireball',      element: ELEMENT.FIRE,    damage: 150, cooldown: 0, desc: 'Basic fire attack' },
  { id: 4, name: 'Inferno',       element: ELEMENT.FIRE,    damage: 300, cooldown: 3, desc: 'Massive fire damage' },
  { id: 5, name: 'Water Bolt',    element: ELEMENT.WATER,   damage: 100, cooldown: 0, desc: 'Basic water attack + heal' },
  { id: 6, name: 'Tidal Wave',    element: ELEMENT.WATER,   damage: 200, cooldown: 3, desc: 'AoE water + slow' },
  { id: 7, name: 'Lightning',     element: ELEMENT.ELECTRO, damage: 180, cooldown: 2, desc: 'Chain lightning' },
  { id: 8, name: 'Holy Light',    element: ELEMENT.LIGHT,   damage: 200, cooldown: 2, desc: 'Light damage + purify' },
  { id: 9, name: 'Shadow Strike', element: ELEMENT.DARK,    damage: 220, cooldown: 2, desc: 'Dark damage + lifesteal' },
];

function initDB() {
  const dbInst = db.getDatabase();
  dbInst.exec(`
    CREATE TABLE IF NOT EXISTS sylphs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id     INTEGER NOT NULL REFERENCES characters(id),
      template_id INTEGER NOT NULL,
      level       INTEGER DEFAULT 1,
      exp         INTEGER DEFAULT 0,
      stars       INTEGER DEFAULT 0,
      skills      TEXT DEFAULT '[]',
      equipped    INTEGER DEFAULT 0,
      created_at  TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sylphs_char ON sylphs(char_id);
  `);
}

function getSylphs(charId) {
  const rows = db.getDatabase()
    .prepare('SELECT * FROM sylphs WHERE char_id = ? ORDER BY equipped DESC, level DESC')
    .all(charId);

  return rows.map(r => {
    const t = SYLPH_TEMPLATES.find(s => s.id === r.template_id) || SYLPH_TEMPLATES[0];
    const levelMul = 1 + (r.level - 1) * 0.1 + r.stars * 0.2;
    return {
      id: r.id,
      templateId: r.template_id,
      name: t.name,
      element: t.element,
      rarity: t.rarity,
      level: r.level,
      exp: r.exp,
      stars: r.stars,
      equipped: r.equipped === 1,
      skills: JSON.parse(r.skills || '[]'),
      attack: Math.floor(t.baseAtk * levelMul),
      defence: Math.floor(t.baseDef * levelMul),
      hp: Math.floor(t.baseHp * levelMul),
      magicAttack: Math.floor(t.baseMAtk * levelMul),
    };
  });
}

function addSylph(charId, templateId) {
  const t = SYLPH_TEMPLATES.find(s => s.id === templateId);
  if (!t) return { success: false, msg: 'Unknown sylph' };

  // Default skills based on element
  const defaultSkills = SYLPH_SKILLS
    .filter(sk => sk.element === t.element)
    .map(sk => sk.id)
    .slice(0, 2);

  const result = db.getDatabase()
    .prepare('INSERT INTO sylphs (char_id, template_id, skills) VALUES (?, ?, ?)')
    .run(charId, templateId, JSON.stringify(defaultSkills));

  return { success: true, sylphId: result.lastInsertRowid };
}

function equipSylph(charId, sylphId) {
  // Unequip current
  db.getDatabase()
    .prepare('UPDATE sylphs SET equipped = 0 WHERE char_id = ? AND equipped = 1')
    .run(charId);

  // Equip new
  db.getDatabase()
    .prepare('UPDATE sylphs SET equipped = 1 WHERE id = ? AND char_id = ?')
    .run(sylphId, charId);

  recalcSylphStats(charId);
  return { success: true };
}

function upgradeSylph(charId, sylphId) {
  const sylph = db.getDatabase()
    .prepare('SELECT * FROM sylphs WHERE id = ? AND char_id = ?')
    .get(sylphId, charId);
  if (!sylph) return { success: false, msg: 'Sylph not found' };

  const char = db.getCharacterById(charId);
  const cost = 500 * sylph.level;
  if (char.gold < cost) return { success: false, msg: 'Not enough gold' };

  db.updateCharacter(charId, { gold: char.gold - cost });

  let newExp = sylph.exp + 100;
  let newLevel = sylph.level;
  while (newLevel < 80 && newExp >= sylph.level * 200) {
    newExp -= newLevel * 200;
    newLevel++;
  }

  db.getDatabase()
    .prepare('UPDATE sylphs SET level = ?, exp = ? WHERE id = ?')
    .run(newLevel, newExp, sylphId);

  if (sylph.equipped) recalcSylphStats(charId);
  return { success: true, level: newLevel, exp: newExp };
}

/**
 * Engulf: sacrifice a sylph to give EXP to another
 */
function engulfSylph(charId, targetId, feedId) {
  if (targetId === feedId) return { success: false, msg: 'Cannot engulf self' };

  const target = db.getDatabase()
    .prepare('SELECT * FROM sylphs WHERE id = ? AND char_id = ?').get(targetId, charId);
  const feed = db.getDatabase()
    .prepare('SELECT * FROM sylphs WHERE id = ? AND char_id = ? AND equipped = 0').get(feedId, charId);

  if (!target || !feed) return { success: false, msg: 'Sylph not found' };

  const ft = SYLPH_TEMPLATES.find(s => s.id === feed.template_id);
  const expGain = (ft.rarity + 1) * 100 * feed.level;

  // Delete feed sylph
  db.getDatabase().prepare('DELETE FROM sylphs WHERE id = ?').run(feedId);

  // Add exp to target
  let newExp = target.exp + expGain;
  let newLevel = target.level;
  while (newLevel < 80 && newExp >= newLevel * 200) {
    newExp -= newLevel * 200;
    newLevel++;
  }

  db.getDatabase()
    .prepare('UPDATE sylphs SET level = ?, exp = ? WHERE id = ?')
    .run(newLevel, newExp, targetId);

  if (target.equipped) recalcSylphStats(charId);
  return { success: true, level: newLevel };
}

function recalcSylphStats(charId) {
  const equipped = getSylphs(charId).find(s => s.equipped);
  if (!equipped) {
    db.setPlayerData(charId, 'sylph_bonuses', {});
    return;
  }
  db.setPlayerData(charId, 'sylph_bonuses', {
    attack: equipped.attack,
    defence: equipped.defence,
    hp: equipped.hp,
    magic_attack: equipped.magicAttack,
    element: equipped.element,
  });
}

/**
 * Give a starter sylph to new characters (level 50+)
 */
function giveStarterSylph(charId) {
  // Random element starter
  const starters = [1, 3, 5]; // Gaia, Pan, Iris
  const tid = starters[Math.floor(Math.random() * starters.length)];
  return addSylph(charId, tid);
}

module.exports = {
  OPCODES, ELEMENT, SYLPH_TEMPLATES, SYLPH_SKILLS,
  initDB,
  getSylphs, addSylph, equipSylph, upgradeSylph, engulfSylph,
  recalcSylphStats, giveStarterSylph,
};
