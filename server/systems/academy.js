/**
 * Wartune Ultra — Academy System
 * Research technologies for permanent stat boosts.
 * Uses Gold and Kyanite. Original: city building level gates.
 */

'use strict';

const db = require('../db');

const OPCODES = {
  C_ACADEMY_LIST:    0x5208,  // 21000
  S_ACADEMY_LIST:    0x10F0,  // 4336
  C_ACADEMY_RESEARCH:0x5209,  // 21001
  S_ACADEMY_RESEARCH:0x10F1,  // 4337
};

const TECH_TREE = [
  // Military
  { id: 1,  name: 'Attack Mastery',    category: 'military', stat: 'attack',        perLevel: 5,  maxLevel: 20, goldCost: 500,   kyaniteCost: 100 },
  { id: 2,  name: 'Defense Mastery',   category: 'military', stat: 'defence',       perLevel: 3,  maxLevel: 20, goldCost: 500,   kyaniteCost: 100 },
  { id: 3,  name: 'HP Mastery',        category: 'military', stat: 'hp',            perLevel: 30, maxLevel: 20, goldCost: 500,   kyaniteCost: 100 },
  { id: 4,  name: 'Magic Mastery',     category: 'military', stat: 'magic_attack',  perLevel: 4,  maxLevel: 20, goldCost: 600,   kyaniteCost: 120 },
  { id: 5,  name: 'Magic Shield',      category: 'military', stat: 'magic_defence', perLevel: 3,  maxLevel: 20, goldCost: 600,   kyaniteCost: 120 },
  { id: 6,  name: 'Troop Attack',      category: 'military', stat: 'troop_atk',     perLevel: 3,  maxLevel: 15, goldCost: 800,   kyaniteCost: 150 },
  { id: 7,  name: 'Troop Defense',     category: 'military', stat: 'troop_def',     perLevel: 2,  maxLevel: 15, goldCost: 800,   kyaniteCost: 150 },
  { id: 8,  name: 'Troop HP',          category: 'military', stat: 'troop_hp',      perLevel: 20, maxLevel: 15, goldCost: 800,   kyaniteCost: 150 },
  // Economy
  { id: 10, name: 'Gold Production',   category: 'economy', stat: 'gold_prod',      perLevel: 50,  maxLevel: 20, goldCost: 300,  kyaniteCost: 50 },
  { id: 11, name: 'Daru Production',   category: 'economy', stat: 'daru_prod',      perLevel: 30,  maxLevel: 20, goldCost: 300,  kyaniteCost: 50 },
  { id: 12, name: 'Kyanite Mining',    category: 'economy', stat: 'kyanite_prod',   perLevel: 20,  maxLevel: 20, goldCost: 400,  kyaniteCost: 80 },
  // Charisma
  { id: 15, name: 'Charisma',          category: 'social',  stat: 'charisma',       perLevel: 1,   maxLevel: 10, goldCost: 1000, kyaniteCost: 200 },
];

function initDB() {
  const dbInst = db.getDatabase();
  dbInst.exec(`
    CREATE TABLE IF NOT EXISTS academy (
      char_id  INTEGER NOT NULL REFERENCES characters(id),
      tech_id  INTEGER NOT NULL,
      level    INTEGER DEFAULT 0,
      PRIMARY KEY (char_id, tech_id)
    );
  `);
}

function getTechLevels(charId) {
  const rows = db.getDatabase()
    .prepare('SELECT * FROM academy WHERE char_id = ?')
    .all(charId);
  const levelMap = new Map(rows.map(r => [r.tech_id, r.level]));

  return TECH_TREE.map(t => ({
    ...t,
    currentLevel: levelMap.get(t.id) || 0,
    currentValue: (levelMap.get(t.id) || 0) * t.perLevel,
    nextCostGold: t.goldCost * ((levelMap.get(t.id) || 0) + 1),
    nextCostKyanite: t.kyaniteCost * ((levelMap.get(t.id) || 0) + 1),
  }));
}

function research(charId, techId) {
  const tech = TECH_TREE.find(t => t.id === techId);
  if (!tech) return { success: false, msg: 'Unknown technology' };

  const currentLevel = db.getDatabase()
    .prepare('SELECT level FROM academy WHERE char_id = ? AND tech_id = ?')
    .get(charId, techId)?.level || 0;

  if (currentLevel >= tech.maxLevel) return { success: false, msg: 'Already max level' };

  const nextLevel = currentLevel + 1;
  const goldCost = tech.goldCost * nextLevel;
  const kyaniteCost = tech.kyaniteCost * nextLevel;

  const char = db.getCharacterById(charId);
  if (!char) return { success: false };
  if (char.gold < goldCost) return { success: false, msg: 'Not enough gold' };

  const kyanite = db.getPlayerData(charId, 'kyanite') || 0;
  if (kyanite < kyaniteCost) return { success: false, msg: 'Not enough kyanite' };

  // Deduct costs
  db.updateCharacter(charId, { gold: char.gold - goldCost });
  db.setPlayerData(charId, 'kyanite', kyanite - kyaniteCost);

  // Upsert tech level
  db.getDatabase().prepare(`
    INSERT INTO academy (char_id, tech_id, level) VALUES (?, ?, ?)
    ON CONFLICT(char_id, tech_id) DO UPDATE SET level = excluded.level
  `).run(charId, techId, nextLevel);

  recalcAcademyStats(charId);
  return { success: true, techId, level: nextLevel, value: nextLevel * tech.perLevel };
}

function recalcAcademyStats(charId) {
  const techs = getTechLevels(charId);
  const bonuses = {};
  for (const t of techs) {
    if (t.currentLevel > 0) {
      bonuses[t.stat] = (bonuses[t.stat] || 0) + t.currentValue;
    }
  }
  db.setPlayerData(charId, 'academy_bonuses', bonuses);
}

module.exports = {
  OPCODES, TECH_TREE,
  initDB,
  getTechLevels, research, recalcAcademyStats,
};
