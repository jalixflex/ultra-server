'use strict';

const db = require('../db');

const OPCODES = {
  C_KNIGHTHOOD_INFO:     0x8300,
  S_KNIGHTHOOD_INFO:     0x8310,
  C_KNIGHTHOOD_UPGRADE:  0x8301,
  S_KNIGHTHOOD_UPGRADE:  0x8311,
  C_KNIGHTHOOD_SKILL:    0x8302,
  S_KNIGHTHOOD_SKILL:    0x8312,
  C_KNIGHTHOOD_SET_ACTIVE: 0x8303,
  S_KNIGHTHOOD_SET_ACTIVE: 0x8313,
};

const MIN_LEVEL = 80;

const KH_LEVELS = {
  1:  { expNeeded: 0,      title: 'Squire',           skillPoints: 1 },
  2:  { expNeeded: 5000,   title: 'Page',             skillPoints: 1 },
  3:  { expNeeded: 15000,  title: 'Man-at-Arms',      skillPoints: 2 },
  4:  { expNeeded: 35000,  title: 'Cavalier',         skillPoints: 2 },
  5:  { expNeeded: 70000,  title: 'Knight',            skillPoints: 3 },
  6:  { expNeeded: 120000, title: 'Knight Captain',    skillPoints: 3 },
  7:  { expNeeded: 200000, title: 'Knight Commander',  skillPoints: 4 },
  8:  { expNeeded: 350000, title: 'Knight Lord',       skillPoints: 4 },
  9:  { expNeeded: 600000, title: 'Grand Knight',      skillPoints: 5 },
  10: { expNeeded: 1000000,title: 'Sovereign Knight',  skillPoints: 5 },
};

const KH_SKILLS = {
  1: { name: 'Holy Strike',     type: 'active',  maxLevel: 10, stat: 'attack',        perLevel: 80,  costPerLevel: 1 },
  2: { name: 'Divine Shield',   type: 'active',  maxLevel: 10, stat: 'defence',       perLevel: 60,  costPerLevel: 1 },
  3: { name: 'Sacred Flame',    type: 'active',  maxLevel: 10, stat: 'magic_attack',  perLevel: 70,  costPerLevel: 1 },
  4: { name: 'Aegis Blessing',  type: 'active',  maxLevel: 10, stat: 'max_hp',        perLevel: 500, costPerLevel: 1 },
  5: { name: 'Iron Will',       type: 'passive', maxLevel: 10, stat: 'defence',       perLevel: 40,  costPerLevel: 1 },
  6: { name: 'Vitality',        type: 'passive', maxLevel: 10, stat: 'max_hp',        perLevel: 300, costPerLevel: 1 },
  7: { name: 'Precision',       type: 'passive', maxLevel: 10, stat: 'crit_rate',     perLevel: 50,  costPerLevel: 1 },
  8: { name: 'Resilience',      type: 'passive', maxLevel: 10, stat: 'magic_defence', perLevel: 40,  costPerLevel: 1 },
};

const MAX_ACTIVE_SLOTS = 4;

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS knighthood (
      char_id       INTEGER PRIMARY KEY REFERENCES characters(id),
      kh_level      INTEGER DEFAULT 1,
      kh_exp        INTEGER DEFAULT 0,
      skill_points  INTEGER DEFAULT 1,
      active_skills TEXT DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS knighthood_skills (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id   INTEGER NOT NULL REFERENCES characters(id),
      skill_id  INTEGER NOT NULL,
      level     INTEGER DEFAULT 0,
      UNIQUE(char_id, skill_id)
    );
  `);
}

function ensureEntry(charId) {
  db.getDatabase().prepare('INSERT OR IGNORE INTO knighthood (char_id) VALUES (?)').run(charId);
  for (const skillId of Object.keys(KH_SKILLS)) {
    db.getDatabase().prepare('INSERT OR IGNORE INTO knighthood_skills (char_id, skill_id) VALUES (?, ?)').run(charId, parseInt(skillId));
  }
}

function getKnighthoodInfo(charId) {
  const char = db.getCharacterById(charId);
  if (!char) return { success: false };
  if (char.grade < MIN_LEVEL) return { success: false, msg: 'Level ' + MIN_LEVEL + ' required' };

  ensureEntry(charId);
  const kh = db.getDatabase().prepare('SELECT * FROM knighthood WHERE char_id = ?').get(charId);
  const skills = db.getDatabase().prepare('SELECT * FROM knighthood_skills WHERE char_id = ?').all(charId);
  const levelInfo = KH_LEVELS[kh.kh_level];
  const nextLevel = KH_LEVELS[kh.kh_level + 1];

  let activeSkills = [];
  try { activeSkills = JSON.parse(kh.active_skills); } catch (e) { /* empty */ }

  return {
    success: true,
    level: kh.kh_level,
    exp: kh.kh_exp,
    expNeeded: nextLevel ? nextLevel.expNeeded : null,
    title: levelInfo.title,
    skillPoints: kh.skill_points,
    activeSkills,
    skills: skills.map(s => {
      const def = KH_SKILLS[s.skill_id];
      return {
        skillId: s.skill_id,
        name: def.name,
        type: def.type,
        level: s.level,
        maxLevel: def.maxLevel,
        stat: def.stat,
        bonus: def.perLevel * s.level,
        upgradeCost: s.level < def.maxLevel ? def.costPerLevel : null,
      };
    }),
  };
}

function gainKhExp(charId, amount) {
  const char = db.getCharacterById(charId);
  if (!char || char.grade < MIN_LEVEL) return { success: false };

  ensureEntry(charId);
  const kh = db.getDatabase().prepare('SELECT * FROM knighthood WHERE char_id = ?').get(charId);
  let { kh_level, kh_exp, skill_points } = kh;

  kh_exp += amount;
  let leveled = false;

  while (kh_level < 10) {
    const next = KH_LEVELS[kh_level + 1];
    if (!next || kh_exp < next.expNeeded) break;
    kh_level++;
    skill_points += KH_LEVELS[kh_level].skillPoints;
    leveled = true;
  }

  db.getDatabase().prepare('UPDATE knighthood SET kh_level = ?, kh_exp = ?, skill_points = ? WHERE char_id = ?')
    .run(kh_level, kh_exp, skill_points, charId);

  return {
    success: true,
    level: kh_level,
    exp: kh_exp,
    skillPoints: skill_points,
    leveled,
    title: KH_LEVELS[kh_level].title,
  };
}

function upgradeKhSkill(charId, skillId) {
  const def = KH_SKILLS[skillId];
  if (!def) return { success: false, msg: 'Invalid skill' };

  ensureEntry(charId);
  const kh = db.getDatabase().prepare('SELECT * FROM knighthood WHERE char_id = ?').get(charId);
  const skill = db.getDatabase().prepare('SELECT * FROM knighthood_skills WHERE char_id = ? AND skill_id = ?').get(charId, skillId);

  if (skill.level >= def.maxLevel) return { success: false, msg: 'Skill already max level' };
  if (kh.skill_points < def.costPerLevel) return { success: false, msg: 'Not enough skill points' };

  db.getDatabase().prepare('UPDATE knighthood_skills SET level = level + 1 WHERE char_id = ? AND skill_id = ?')
    .run(charId, skillId);
  db.getDatabase().prepare('UPDATE knighthood SET skill_points = skill_points - ? WHERE char_id = ?')
    .run(def.costPerLevel, charId);

  return {
    success: true,
    skillId,
    newLevel: skill.level + 1,
    bonus: def.perLevel * (skill.level + 1),
    remainingPoints: kh.skill_points - def.costPerLevel,
  };
}

function getActiveSkills(charId) {
  ensureEntry(charId);
  const kh = db.getDatabase().prepare('SELECT active_skills FROM knighthood WHERE char_id = ?').get(charId);
  try { return JSON.parse(kh.active_skills); } catch (e) { return []; }
}

function setActiveSkills(charId, skillIds) {
  if (!Array.isArray(skillIds)) return { success: false, msg: 'Invalid skill list' };
  if (skillIds.length > MAX_ACTIVE_SLOTS) return { success: false, msg: 'Max ' + MAX_ACTIVE_SLOTS + ' active skills' };

  for (const sid of skillIds) {
    const def = KH_SKILLS[sid];
    if (!def || def.type !== 'active') return { success: false, msg: 'Skill ' + sid + ' is not an active skill' };
  }

  const unique = [...new Set(skillIds)];
  ensureEntry(charId);
  db.getDatabase().prepare('UPDATE knighthood SET active_skills = ? WHERE char_id = ?')
    .run(JSON.stringify(unique), charId);

  return { success: true, activeSkills: unique };
}

function getKnighthoodBonuses(charId) {
  ensureEntry(charId);
  const skills = db.getDatabase().prepare('SELECT * FROM knighthood_skills WHERE char_id = ? AND level > 0').all(charId);
  const bonuses = { attack: 0, defence: 0, max_hp: 0, magic_attack: 0, magic_defence: 0, crit_rate: 0 };

  for (const s of skills) {
    const def = KH_SKILLS[s.skill_id];
    if (!def) continue;
    if (bonuses[def.stat] !== undefined) {
      bonuses[def.stat] += def.perLevel * s.level;
    }
  }

  return bonuses;
}

module.exports = {
  OPCODES, KH_LEVELS, KH_SKILLS, MIN_LEVEL, MAX_ACTIVE_SLOTS,
  initDB,
  getKnighthoodInfo, gainKhExp, upgradeKhSkill,
  getActiveSkills, setActiveSkills, getKnighthoodBonuses,
};
