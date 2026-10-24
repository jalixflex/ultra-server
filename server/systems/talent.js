'use strict';

const db = require('../db');

const OPCODES = {
  C_TALENT_INFO:       0x7100,
  S_TALENT_INFO_RSP:   0x7110,
  C_TALENT_UPGRADE:    0x7101,
  S_TALENT_UPGRADE_RSP:0x7111,
  C_HOLY_SEAL_INFO:    0x7102,
  S_HOLY_SEAL_INFO_RSP:0x7112,
  C_HOLY_SEAL_UPGRADE: 0x7103,
  S_HOLY_SEAL_UPGRADE_RSP:0x7113,
};

const MIN_LEVEL = 50;
const MAX_TALENT_LEVEL = 5;
const MAX_SEAL_LEVEL = 10;
const TALENT_COUNT = 9;

// class 1=Knight, 2=Mage, 3=Archer (matches characters.camp)
const CLASS_TALENTS = {
  1: [
    { name: 'Iron Will',            stat: 'defence',       pct: 2,  desc: '+2% DEF per level' },
    { name: 'Commanding Presence',  stat: 'troop_atk',     pct: 3,  desc: '+3% troop ATK per level' },
    { name: 'Shield Mastery',       stat: 'block',         pct: 5,  desc: '+5% block per level' },
    { name: 'Rallying Cry',         stat: 'party_atk',     pct: 1,  desc: '+1% party ATK per level' },
    { name: 'Fortification',        stat: 'max_hp',        pct: 2,  desc: '+2% HP per level' },
    { name: 'Counter Strike',       stat: 'counter_dmg',   pct: 3,  desc: '+3% counter damage per level' },
    { name: 'Intimidate',           stat: 'enemy_atk_red', pct: 2,  desc: '+2% enemy ATK reduction per level' },
    { name: 'Battle Hardened',      stat: 'all_stats',     pct: 1,  desc: '+1% all stats per level' },
    { name: 'Unbreakable',          stat: 'dmg_reduction',  pct: 4,  desc: '+4% damage reduction per level' },
  ],
  2: [
    { name: 'Arcane Power',         stat: 'magic_attack',  pct: 3,  desc: '+3% MATK per level' },
    { name: 'Mana Shield',          stat: 'magic_defence', pct: 2,  desc: '+2% MDEF per level' },
    { name: 'Spell Penetration',    stat: 'ignore_mdef',   pct: 2,  desc: '+2% ignore MDEF per level' },
    { name: 'Elemental Mastery',    stat: 'elemental_dmg', pct: 3,  desc: '+3% elemental damage per level' },
    { name: 'Concentration',        stat: 'crit',          pct: 2,  desc: '+2% crit per level' },
    { name: 'Mystic Barrier',       stat: 'resist',        pct: 3,  desc: '+3% resist per level' },
    { name: 'Soul Harvest',         stat: 'hp_drain',      pct: 1,  desc: '+1% HP drain per level' },
    { name: 'Transcendence',        stat: 'all_stats',     pct: 2,  desc: '+2% all stats per level' },
    { name: 'Arcane Explosion',     stat: 'aoe_dmg',       pct: 5,  desc: '+5% AoE damage per level' },
  ],
  3: [
    { name: 'Eagle Eye',            stat: 'attack',        pct: 3,  desc: '+3% ATK per level' },
    { name: 'Quick Draw',           stat: 'speed',         pct: 2,  desc: '+2% speed per level' },
    { name: 'Precision',            stat: 'crit',          pct: 3,  desc: '+3% crit per level' },
    { name: 'Evasion',              stat: 'dodge',         pct: 3,  desc: '+3% dodge per level' },
    { name: 'Poison Arrow',         stat: 'dot_dmg',       pct: 2,  desc: '+2% DoT per level' },
    { name: 'Multi Shot',           stat: 'aoe_dmg',       pct: 2,  desc: '+2% AoE per level' },
    { name: 'Sniper Training',      stat: 'crit_dmg',      pct: 4,  desc: '+4% crit damage per level' },
    { name: 'Survival Instinct',    stat: 'max_hp',        pct: 2,  desc: '+2% HP per level' },
    { name: 'Death Mark',           stat: 'marked_dmg',    pct: 3,  desc: '+3% damage to marked per level' },
  ],
};

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS talents (
      char_id      INTEGER PRIMARY KEY REFERENCES characters(id),
      talent_data  TEXT DEFAULT '[]',
      holy_seal    INTEGER DEFAULT 0
    );
  `);
}

function ensureEntry(charId) {
  const char = db.getCharacterById(charId);
  if (!char) return null;
  db.getDatabase().prepare('INSERT OR IGNORE INTO talents (char_id) VALUES (?)').run(charId);
  return char;
}

function getTalentLevels(charId) {
  const row = db.getDatabase().prepare('SELECT talent_data FROM talents WHERE char_id = ?').get(charId);
  if (!row || !row.talent_data) return new Array(TALENT_COUNT).fill(0);
  try {
    const arr = JSON.parse(row.talent_data);
    while (arr.length < TALENT_COUNT) arr.push(0);
    return arr;
  } catch (_) {
    return new Array(TALENT_COUNT).fill(0);
  }
}

function saveTalentLevels(charId, levels) {
  db.getDatabase().prepare('UPDATE talents SET talent_data = ? WHERE char_id = ?')
    .run(JSON.stringify(levels), charId);
}

function getAvailablePoints(charId) {
  const char = db.getCharacterById(charId);
  if (!char || char.grade < MIN_LEVEL) return 0;
  const totalPoints = char.grade - (MIN_LEVEL - 1);
  const levels = getTalentLevels(charId);
  const spent = levels.reduce((s, v) => s + v, 0);
  return Math.max(0, totalPoints - spent);
}

function getTalentInfo(charId) {
  const char = ensureEntry(charId);
  if (!char) return { success: false, msg: 'Character not found' };
  if (char.grade < MIN_LEVEL) return { unlocked: false, minLevel: MIN_LEVEL };

  const classId = char.camp;
  const templates = CLASS_TALENTS[classId] || CLASS_TALENTS[1];
  const levels = getTalentLevels(charId);
  const available = getAvailablePoints(charId);

  return {
    unlocked: true,
    classId,
    availablePoints: available,
    talents: templates.map((t, i) => ({
      index: i,
      name: t.name,
      stat: t.stat,
      pctPerLevel: t.pct,
      desc: t.desc,
      level: levels[i],
      maxLevel: MAX_TALENT_LEVEL,
      totalBonus: t.pct * levels[i],
    })),
  };
}

function upgradeTalent(charId, talentIndex) {
  const char = ensureEntry(charId);
  if (!char) return { success: false, msg: 'Character not found' };
  if (char.grade < MIN_LEVEL) return { success: false, msg: `Level ${MIN_LEVEL} required` };
  if (talentIndex < 0 || talentIndex >= TALENT_COUNT) return { success: false, msg: 'Invalid talent' };

  const available = getAvailablePoints(charId);
  if (available <= 0) return { success: false, msg: 'No talent points available' };

  const levels = getTalentLevels(charId);
  if (levels[talentIndex] >= MAX_TALENT_LEVEL) return { success: false, msg: 'Talent already maxed' };

  levels[talentIndex]++;
  saveTalentLevels(charId, levels);

  const classId = char.camp;
  const templates = CLASS_TALENTS[classId] || CLASS_TALENTS[1];
  const t = templates[talentIndex];

  return {
    success: true,
    talentIndex,
    name: t.name,
    newLevel: levels[talentIndex],
    totalBonus: t.pct * levels[talentIndex],
    remainingPoints: available - 1,
  };
}

function getHolySealInfo(charId) {
  const char = ensureEntry(charId);
  if (!char) return { success: false, msg: 'Character not found' };
  if (char.grade < MIN_LEVEL) return { unlocked: false, minLevel: MIN_LEVEL };

  const row = db.getDatabase().prepare('SELECT holy_seal FROM talents WHERE char_id = ?').get(charId);
  const sealLevel = row ? row.holy_seal : 0;
  const stunChance = 20 + sealLevel * 5;
  const upgradeCost = (sealLevel + 1) * 50000;

  return {
    unlocked: true,
    level: sealLevel,
    maxLevel: MAX_SEAL_LEVEL,
    stunChance,
    upgradeCost: sealLevel < MAX_SEAL_LEVEL ? upgradeCost : null,
    canUpgrade: sealLevel < MAX_SEAL_LEVEL && char.gold >= upgradeCost,
  };
}

function upgradeHolySeal(charId) {
  const char = ensureEntry(charId);
  if (!char) return { success: false, msg: 'Character not found' };
  if (char.grade < MIN_LEVEL) return { success: false, msg: `Level ${MIN_LEVEL} required` };

  const row = db.getDatabase().prepare('SELECT holy_seal FROM talents WHERE char_id = ?').get(charId);
  const sealLevel = row ? row.holy_seal : 0;

  if (sealLevel >= MAX_SEAL_LEVEL) return { success: false, msg: 'Holy Seal already max level' };

  const cost = (sealLevel + 1) * 50000;
  if (char.gold < cost) return { success: false, msg: `Need ${cost} gold` };

  db.getDatabase().prepare('UPDATE characters SET gold = gold - ? WHERE id = ?').run(cost, charId);
  db.getDatabase().prepare('UPDATE talents SET holy_seal = ? WHERE char_id = ?').run(sealLevel + 1, charId);

  const newStunChance = 20 + (sealLevel + 1) * 5;

  return {
    success: true,
    newLevel: sealLevel + 1,
    stunChance: newStunChance,
    goldSpent: cost,
  };
}

function getTalentBonuses(charId) {
  const char = db.getCharacterById(charId);
  if (!char || char.grade < MIN_LEVEL) return {};

  const classId = char.camp;
  const templates = CLASS_TALENTS[classId] || CLASS_TALENTS[1];
  const levels = getTalentLevels(charId);
  const bonuses = {};

  for (let i = 0; i < templates.length; i++) {
    if (levels[i] > 0) {
      const t = templates[i];
      bonuses[t.stat] = (bonuses[t.stat] || 0) + t.pct * levels[i];
    }
  }

  // Holy seal stun chance
  const row = db.getDatabase().prepare('SELECT holy_seal FROM talents WHERE char_id = ?').get(charId);
  if (row && row.holy_seal > 0) {
    bonuses.stun_chance = 20 + row.holy_seal * 5;
  }

  return bonuses;
}

module.exports = {
  OPCODES, CLASS_TALENTS, MIN_LEVEL, MAX_TALENT_LEVEL, MAX_SEAL_LEVEL, TALENT_COUNT,
  initDB,
  getTalentInfo, upgradeTalent,
  getHolySealInfo, upgradeHolySeal,
  getTalentBonuses,
};
