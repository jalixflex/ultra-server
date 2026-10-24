/**
 * Wartune Ultra — Sylph System
 * Elemental battle companions. Original: unlocks at level 50.
 * Sylphs have elements, skills, can be upgraded, engulfed, enchanted.
 * Includes: Star upgrade, Awakening, Evolution.
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
  C_SYLPH_STAR:      0x3E85,  // 16005
  S_SYLPH_STAR:      0x10A5,  // 4261
  C_SYLPH_AWAKEN:    0x3E86,  // 16006
  S_SYLPH_AWAKEN:    0x10A6,  // 4262
  C_SYLPH_EVOLVE:    0x3E87,  // 16007
  S_SYLPH_EVOLVE:    0x10A7,  // 4263
};

const ELEMENT = { WIND: 1, FIRE: 2, WATER: 3, ELECTRO: 4, DARK: 5, LIGHT: 6 };

const SYLPH_TEMPLATES = [
  // Base sylphs
  { id: 1, name: 'Gaia',         element: ELEMENT.WIND,    baseAtk: 50,  baseDef: 30, baseHp: 500,  baseMAtk: 60,  rarity: 1 },
  { id: 2, name: 'Amazon Queen', element: ELEMENT.WIND,    baseAtk: 60,  baseDef: 35, baseHp: 600,  baseMAtk: 70,  rarity: 2 },
  { id: 3, name: 'Pan',          element: ELEMENT.FIRE,    baseAtk: 70,  baseDef: 25, baseHp: 450,  baseMAtk: 80,  rarity: 1 },
  { id: 4, name: 'Hades',        element: ELEMENT.FIRE,    baseAtk: 90,  baseDef: 30, baseHp: 550,  baseMAtk: 100, rarity: 2 },
  { id: 5, name: 'Iris',         element: ELEMENT.WATER,   baseAtk: 45,  baseDef: 40, baseHp: 700,  baseMAtk: 55,  rarity: 1 },
  { id: 6, name: 'Poseidon',     element: ELEMENT.WATER,   baseAtk: 55,  baseDef: 50, baseHp: 800,  baseMAtk: 65,  rarity: 2 },
  { id: 7, name: 'Thor',         element: ELEMENT.ELECTRO, baseAtk: 80,  baseDef: 20, baseHp: 400,  baseMAtk: 90,  rarity: 2 },
  { id: 8, name: 'Apollo',       element: ELEMENT.LIGHT,   baseAtk: 100, baseDef: 45, baseHp: 700,  baseMAtk: 110, rarity: 3 },
  { id: 9, name: 'Nyx',          element: ELEMENT.DARK,    baseAtk: 110, baseDef: 35, baseHp: 600,  baseMAtk: 120, rarity: 3 },
  // Evolved sylphs
  { id: 10, name: 'Storm Gaia',      element: ELEMENT.WIND,    baseAtk: 120, baseDef: 70,  baseHp: 1200, baseMAtk: 140, rarity: 3 },
  { id: 11, name: 'Tempest Queen',   element: ELEMENT.WIND,    baseAtk: 140, baseDef: 80,  baseHp: 1400, baseMAtk: 160, rarity: 4 },
  { id: 12, name: 'Inferno Pan',     element: ELEMENT.FIRE,    baseAtk: 160, baseDef: 60,  baseHp: 1000, baseMAtk: 180, rarity: 3 },
  { id: 13, name: 'Abyssal Hades',   element: ELEMENT.FIRE,    baseAtk: 200, baseDef: 70,  baseHp: 1200, baseMAtk: 220, rarity: 4 },
  { id: 14, name: 'Tidal Iris',      element: ELEMENT.WATER,   baseAtk: 100, baseDef: 90,  baseHp: 1600, baseMAtk: 120, rarity: 3 },
  { id: 15, name: 'Ocean Poseidon',  element: ELEMENT.WATER,   baseAtk: 120, baseDef: 110, baseHp: 1800, baseMAtk: 140, rarity: 4 },
  { id: 16, name: 'Thunder Thor',    element: ELEMENT.ELECTRO, baseAtk: 180, baseDef: 50,  baseHp: 900,  baseMAtk: 200, rarity: 4 },
  { id: 17, name: 'Radiant Apollo',  element: ELEMENT.LIGHT,   baseAtk: 220, baseDef: 100, baseHp: 1500, baseMAtk: 240, rarity: 5 },
  { id: 18, name: 'Shadow Nyx',      element: ELEMENT.DARK,    baseAtk: 240, baseDef: 80,  baseHp: 1300, baseMAtk: 260, rarity: 5 },
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

const AWAKENING_SKILLS = [
  { id: 101, name: 'Storm Judgment',    element: ELEMENT.WIND,    damage: 500, cooldown: 4, desc: 'Ultimate wind strike' },
  { id: 102, name: 'Hellfire Nova',     element: ELEMENT.FIRE,    damage: 600, cooldown: 4, desc: 'Devastating fire explosion' },
  { id: 103, name: 'Frozen Abyss',      element: ELEMENT.WATER,   damage: 400, cooldown: 3, desc: 'Freeze all + damage' },
  { id: 104, name: 'Thunder God',       element: ELEMENT.ELECTRO, damage: 550, cooldown: 4, desc: 'Chain all enemies' },
  { id: 105, name: 'Divine Wrath',      element: ELEMENT.LIGHT,   damage: 480, cooldown: 3, desc: 'Holy purge + heal' },
  { id: 106, name: 'Void Annihilation', element: ELEMENT.DARK,    damage: 650, cooldown: 5, desc: 'Ultimate dark destruction' },
];

const EVOLUTION_MAP = {
  1: { evolvedId: 10, name: 'Storm Gaia' },
  2: { evolvedId: 11, name: 'Tempest Queen' },
  3: { evolvedId: 12, name: 'Inferno Pan' },
  4: { evolvedId: 13, name: 'Abyssal Hades' },
  5: { evolvedId: 14, name: 'Tidal Iris' },
  6: { evolvedId: 15, name: 'Ocean Poseidon' },
  7: { evolvedId: 16, name: 'Thunder Thor' },
  8: { evolvedId: 17, name: 'Radiant Apollo' },
  9: { evolvedId: 18, name: 'Shadow Nyx' },
};

function getAwakeningSkill(element) {
  return AWAKENING_SKILLS.find(s => s.element === element) || AWAKENING_SKILLS[0];
}

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
    const skillData = JSON.parse(r.skills || '[]');
    const isAwakened = skillData.includes(-1);
    const awakenMul = isAwakened ? 1.3 : 1.0;
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
      awakened: isAwakened,
      skills: skillData.filter(s => s !== -1),
      attack: Math.floor(t.baseAtk * levelMul * awakenMul),
      defence: Math.floor(t.baseDef * levelMul * awakenMul),
      hp: Math.floor(t.baseHp * levelMul * awakenMul),
      magicAttack: Math.floor(t.baseMAtk * levelMul * awakenMul),
    };
  });
}

function addSylph(charId, templateId) {
  const t = SYLPH_TEMPLATES.find(s => s.id === templateId);
  if (!t) return { success: false, msg: 'Unknown sylph' };

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
  db.getDatabase()
    .prepare('UPDATE sylphs SET equipped = 0 WHERE char_id = ? AND equipped = 1')
    .run(charId);

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
  while (newLevel < 80 && newExp >= newLevel * 200) {
    newExp -= newLevel * 200;
    newLevel++;
  }

  db.getDatabase()
    .prepare('UPDATE sylphs SET level = ?, exp = ? WHERE id = ?')
    .run(newLevel, newExp, sylphId);

  if (sylph.equipped) recalcSylphStats(charId);
  return { success: true, level: newLevel, exp: newExp };
}

function engulfSylph(charId, targetId, feedId) {
  if (targetId === feedId) return { success: false, msg: 'Cannot engulf self' };

  const target = db.getDatabase()
    .prepare('SELECT * FROM sylphs WHERE id = ? AND char_id = ?').get(targetId, charId);
  const feed = db.getDatabase()
    .prepare('SELECT * FROM sylphs WHERE id = ? AND char_id = ? AND equipped = 0').get(feedId, charId);

  if (!target || !feed) return { success: false, msg: 'Sylph not found' };

  const ft = SYLPH_TEMPLATES.find(s => s.id === feed.template_id);
  const expGain = (ft.rarity + 1) * 100 * feed.level;

  db.getDatabase().prepare('DELETE FROM sylphs WHERE id = ?').run(feedId);

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

// ─── Star Upgrade ─────────────────────────────

function upgradeStar(charId, sylphId) {
  const sylph = db.getDatabase()
    .prepare('SELECT * FROM sylphs WHERE id = ? AND char_id = ?')
    .get(sylphId, charId);
  if (!sylph) return { success: false, msg: 'Sylph not found' };
  if (sylph.stars >= 10) return { success: false, msg: 'Max stars reached' };

  const char = db.getCharacterById(charId);
  const cost = (sylph.stars + 1) * 5000;
  const balenCost = (sylph.stars + 1) * 20;
  if (char.gold < cost) return { success: false, msg: 'Not enough gold' };
  if (char.balens < balenCost) return { success: false, msg: 'Not enough balens' };

  const chance = Math.max(0.2, 1.0 - sylph.stars * 0.08);
  const succeeded = Math.random() < chance;

  db.updateCharacter(charId, { gold: char.gold - cost, balens: char.balens - balenCost });

  if (succeeded) {
    db.getDatabase().prepare('UPDATE sylphs SET stars = stars + 1 WHERE id = ?').run(sylphId);
    if (sylph.equipped) recalcSylphStats(charId);
    return { success: true, newStars: sylph.stars + 1, msg: 'Star upgrade successful!' };
  }

  return { success: false, msg: 'Star upgrade failed. Try again!' };
}

// ─── Awakening ────────────────────────────────

function awakenSylph(charId, sylphId) {
  const sylph = db.getDatabase()
    .prepare('SELECT * FROM sylphs WHERE id = ? AND char_id = ?')
    .get(sylphId, charId);
  if (!sylph) return { success: false, msg: 'Sylph not found' };
  if (sylph.level < 40) return { success: false, msg: 'Need level 40' };
  if (sylph.stars < 5) return { success: false, msg: 'Need 5 stars' };

  const skillData = JSON.parse(sylph.skills || '[]');
  if (skillData.includes(-1)) return { success: false, msg: 'Already awakened' };

  const char = db.getCharacterById(charId);
  const cost = 100000;
  const balenCost = 500;
  if (char.gold < cost) return { success: false, msg: 'Not enough gold' };
  if (char.balens < balenCost) return { success: false, msg: 'Not enough balens' };

  db.updateCharacter(charId, { gold: char.gold - cost, balens: char.balens - balenCost });

  const t = SYLPH_TEMPLATES.find(s => s.id === sylph.template_id);
  const awakeSkill = getAwakeningSkill(t ? t.element : 1);
  skillData.push(-1);
  skillData.push(awakeSkill.id);

  db.getDatabase().prepare('UPDATE sylphs SET skills = ? WHERE id = ?')
    .run(JSON.stringify(skillData), sylphId);

  if (sylph.equipped) recalcSylphStats(charId);
  return { success: true, msg: 'Sylph awakened!', newSkill: awakeSkill.name };
}

// ─── Evolution ────────────────────────────────

function evolveSylph(charId, sylphId) {
  const sylph = db.getDatabase()
    .prepare('SELECT * FROM sylphs WHERE id = ? AND char_id = ?')
    .get(sylphId, charId);
  if (!sylph) return { success: false, msg: 'Sylph not found' };
  if (sylph.level < 60) return { success: false, msg: 'Need level 60' };

  const skillData = JSON.parse(sylph.skills || '[]');
  if (!skillData.includes(-1)) return { success: false, msg: 'Must be awakened first' };

  const evo = EVOLUTION_MAP[sylph.template_id];
  if (!evo) return { success: false, msg: 'This sylph cannot evolve' };

  if (SYLPH_TEMPLATES.find(t => t.id === sylph.template_id && t.id >= 10)) {
    return { success: false, msg: 'Already evolved' };
  }

  const char = db.getCharacterById(charId);
  const cost = 500000;
  const balenCost = 1000;
  if (char.gold < cost) return { success: false, msg: 'Not enough gold' };
  if (char.balens < balenCost) return { success: false, msg: 'Not enough balens' };

  db.updateCharacter(charId, { gold: char.gold - cost, balens: char.balens - balenCost });

  db.getDatabase().prepare('UPDATE sylphs SET template_id = ? WHERE id = ?')
    .run(evo.evolvedId, sylphId);

  if (sylph.equipped) recalcSylphStats(charId);
  return { success: true, msg: `Sylph evolved into ${evo.name}!`, evolvedName: evo.name };
}

// ─── Stat Recalc ──────────────────────────────

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

function giveStarterSylph(charId) {
  const starters = [1, 3, 5];
  const tid = starters[Math.floor(Math.random() * starters.length)];
  return addSylph(charId, tid);
}

function getEquippedSylph(charId) {
  return getSylphs(charId).find(s => s.equipped) || null;
}

module.exports = {
  OPCODES, ELEMENT, SYLPH_TEMPLATES, SYLPH_SKILLS, AWAKENING_SKILLS, EVOLUTION_MAP,
  initDB,
  getSylphs, addSylph, equipSylph, upgradeSylph, engulfSylph,
  upgradeStar, awakenSylph, evolveSylph,
  recalcSylphStats, giveStarterSylph, getEquippedSylph,
  getAwakeningSkill,
};
