'use strict';

const db = require('../db');

const OPCODES = {
  C_SKILL_LIST:    0x5A00,
  S_SKILL_LIST:    0x1200,
  C_SKILL_UPGRADE: 0x5A01,
  S_SKILL_UPGRADE: 0x1201,
  C_SKILL_EQUIP:   0x5A02,
  S_SKILL_EQUIP:   0x1202,
};

const CLASS_SKILLS = {
  1: [ // Knight
    { id: 101, name: 'Slashing Strike',  type: 'active',  dmgMul: 1.5, maxLevel: 10, goldCost: 200 },
    { id: 102, name: 'Shield Bash',      type: 'active',  dmgMul: 1.2, maxLevel: 10, goldCost: 200, stun: true },
    { id: 103, name: 'Whirlwind',        type: 'active',  dmgMul: 2.0, maxLevel: 10, goldCost: 400, aoe: true },
    { id: 104, name: 'Ultimate Slash',   type: 'active',  dmgMul: 3.0, maxLevel: 10, goldCost: 600 },
    { id: 105, name: 'Iron Will',        type: 'passive', stat: 'defence', perLevel: 10, maxLevel: 10, goldCost: 300 },
    { id: 106, name: 'Block Mastery',    type: 'passive', stat: 'block', perLevel: 5, maxLevel: 10, goldCost: 300 },
    { id: 107, name: 'Intercept',        type: 'active',  dmgMul: 1.8, maxLevel: 10, goldCost: 500, taunt: true },
    { id: 108, name: 'Apollo Shield',    type: 'active',  dmgMul: 0, maxLevel: 10, goldCost: 500, shield: true },
  ],
  2: [ // Mage
    { id: 201, name: 'Fireball',         type: 'active',  dmgMul: 1.6, maxLevel: 10, goldCost: 200 },
    { id: 202, name: 'Lightning Bolt',   type: 'active',  dmgMul: 1.8, maxLevel: 10, goldCost: 300 },
    { id: 203, name: 'Meteor Shower',    type: 'active',  dmgMul: 2.5, maxLevel: 10, goldCost: 500, aoe: true },
    { id: 204, name: 'Thunderstorm',     type: 'active',  dmgMul: 3.0, maxLevel: 10, goldCost: 600, aoe: true },
    { id: 205, name: 'Arcane Intellect', type: 'passive', stat: 'magic_attack', perLevel: 8, maxLevel: 10, goldCost: 300 },
    { id: 206, name: 'Mana Shield',      type: 'passive', stat: 'magic_defence', perLevel: 6, maxLevel: 10, goldCost: 300 },
    { id: 207, name: 'Rain of Fire',     type: 'active',  dmgMul: 2.2, maxLevel: 10, goldCost: 400, aoe: true, dot: true },
    { id: 208, name: 'Delphic Inferno',  type: 'active',  dmgMul: 4.0, maxLevel: 10, goldCost: 800 },
  ],
  3: [ // Archer
    { id: 301, name: 'Arrow Strike',     type: 'active',  dmgMul: 1.5, maxLevel: 10, goldCost: 200 },
    { id: 302, name: 'Multi-Shot',       type: 'active',  dmgMul: 1.3, maxLevel: 10, goldCost: 300, aoe: true },
    { id: 303, name: 'Lunatic Fire',     type: 'active',  dmgMul: 2.0, maxLevel: 10, goldCost: 400 },
    { id: 304, name: 'Armor Piercer',    type: 'active',  dmgMul: 2.5, maxLevel: 10, goldCost: 500, armorBreak: true },
    { id: 305, name: 'Deep Freeze',      type: 'active',  dmgMul: 1.8, maxLevel: 10, goldCost: 400, freeze: true },
    { id: 306, name: 'Eagle Eye',        type: 'passive', stat: 'crit', perLevel: 10, maxLevel: 10, goldCost: 300 },
    { id: 307, name: 'Sniper\'s Edge',   type: 'passive', stat: 'attack', perLevel: 8, maxLevel: 10, goldCost: 300 },
    { id: 308, name: 'Delphic Barrage',  type: 'active',  dmgMul: 4.0, maxLevel: 10, goldCost: 800, aoe: true },
  ],
};

const MAX_EQUIPPED = 5;

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS skills (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id   INTEGER NOT NULL REFERENCES characters(id),
      skill_id  INTEGER NOT NULL,
      level     INTEGER DEFAULT 1,
      equipped  INTEGER DEFAULT 0,
      slot      INTEGER DEFAULT -1,
      UNIQUE(char_id, skill_id)
    );
    CREATE INDEX IF NOT EXISTS idx_skills_char ON skills(char_id);
  `);
}

function getSkills(charId) {
  const char = db.getCharacterById(charId);
  if (!char) return [];
  const classId = char.camp || 1;
  const templates = CLASS_SKILLS[classId] || CLASS_SKILLS[1];

  const rows = db.getDatabase()
    .prepare('SELECT * FROM skills WHERE char_id = ?')
    .all(charId);
  const learned = new Map(rows.map(r => [r.skill_id, r]));

  return templates.map(t => {
    const row = learned.get(t.id);
    return {
      ...t,
      level: row ? row.level : 0,
      equipped: row ? row.equipped === 1 : false,
      slot: row ? row.slot : -1,
      unlocked: row ? true : false,
    };
  });
}

function learnOrUpgrade(charId, skillId) {
  const char = db.getCharacterById(charId);
  if (!char) return { success: false };
  const classId = char.camp || 1;
  const template = (CLASS_SKILLS[classId] || []).find(s => s.id === skillId);
  if (!template) return { success: false, msg: 'Skill not available for your class' };

  const existing = db.getDatabase()
    .prepare('SELECT * FROM skills WHERE char_id = ? AND skill_id = ?')
    .get(charId, skillId);

  if (existing) {
    if (existing.level >= template.maxLevel) return { success: false, msg: 'Already max level' };
    const cost = template.goldCost * (existing.level + 1);
    if (char.gold < cost) return { success: false, msg: 'Not enough gold' };
    db.updateCharacter(charId, { gold: char.gold - cost });
    db.getDatabase().prepare('UPDATE skills SET level = level + 1 WHERE char_id = ? AND skill_id = ?').run(charId, skillId);
    recalcPassives(charId);
    return { success: true, level: existing.level + 1 };
  }

  if (char.gold < template.goldCost) return { success: false, msg: 'Not enough gold' };
  db.updateCharacter(charId, { gold: char.gold - template.goldCost });
  db.getDatabase().prepare('INSERT INTO skills (char_id, skill_id, level) VALUES (?, ?, 1)').run(charId, skillId);
  recalcPassives(charId);
  return { success: true, level: 1 };
}

function equipSkill(charId, skillId, slot) {
  if (slot < 0 || slot >= MAX_EQUIPPED) return { success: false, msg: 'Invalid slot' };

  const row = db.getDatabase()
    .prepare('SELECT * FROM skills WHERE char_id = ? AND skill_id = ?')
    .get(charId, skillId);
  if (!row || row.level < 1) return { success: false, msg: 'Skill not learned' };

  // Unequip whatever is in that slot
  db.getDatabase().prepare('UPDATE skills SET equipped = 0, slot = -1 WHERE char_id = ? AND slot = ?').run(charId, slot);
  // Equip this skill
  db.getDatabase().prepare('UPDATE skills SET equipped = 1, slot = ? WHERE char_id = ? AND skill_id = ?').run(slot, charId, skillId);

  return { success: true };
}

function recalcPassives(charId) {
  const char = db.getCharacterById(charId);
  if (!char) return;
  const classId = char.camp || 1;
  const templates = CLASS_SKILLS[classId] || CLASS_SKILLS[1];

  const rows = db.getDatabase()
    .prepare('SELECT * FROM skills WHERE char_id = ? AND level > 0')
    .all(charId);

  const bonuses = {};
  for (const row of rows) {
    const t = templates.find(tt => tt.id === row.skill_id);
    if (t && t.type === 'passive' && t.stat) {
      bonuses[t.stat] = (bonuses[t.stat] || 0) + t.perLevel * row.level;
    }
  }
  db.setPlayerData(charId, 'skill_bonuses', bonuses);
}

function giveStarterSkills(charId, job) {
  const classId = job || 1;
  const templates = CLASS_SKILLS[classId] || CLASS_SKILLS[1];
  const starters = templates.filter(s => s.type === 'active').slice(0, 2);
  for (let i = 0; i < starters.length; i++) {
    db.getDatabase()
      .prepare('INSERT OR IGNORE INTO skills (char_id, skill_id, level, equipped, slot) VALUES (?, ?, 1, 1, ?)')
      .run(charId, starters[i].id, i);
  }
  recalcPassives(charId);
}

module.exports = {
  OPCODES, CLASS_SKILLS, MAX_EQUIPPED,
  initDB,
  getSkills, learnOrUpgrade, equipSkill, recalcPassives, giveStarterSkills,
};
