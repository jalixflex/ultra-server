'use strict';

const db = require('../db');

const OPCODES = {
  C_WINGS_INFO:    0x5E00,
  S_WINGS_INFO:    0x1300,
  C_WINGS_UPGRADE: 0x5E01,
  S_WINGS_UPGRADE: 0x1301,
};

const WING_TIERS = [
  { tier: 1, name: 'Apprentice Wings',   attack: 10,  defence: 5,   hp: 50,   cost: 500,    material: 5 },
  { tier: 2, name: 'Warrior Wings',      attack: 25,  defence: 12,  hp: 120,  cost: 2000,   material: 10 },
  { tier: 3, name: 'Guardian Wings',     attack: 50,  defence: 25,  hp: 250,  cost: 5000,   material: 20 },
  { tier: 4, name: 'Angelic Wings',      attack: 100, defence: 50,  hp: 500,  cost: 12000,  material: 40 },
  { tier: 5, name: 'Seraph Wings',       attack: 200, defence: 100, hp: 1000, cost: 30000,  material: 80 },
  { tier: 6, name: 'Divine Wings',       attack: 400, defence: 200, hp: 2000, cost: 80000,  material: 150 },
  { tier: 7, name: 'Celestial Wings',    attack: 700, defence: 350, hp: 3500, cost: 200000, material: 300 },
  { tier: 8, name: 'Transcendent Wings', attack: 1200,defence: 600, hp: 6000, cost: 500000, material: 500 },
];

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS wings (
      char_id   INTEGER PRIMARY KEY REFERENCES characters(id),
      tier      INTEGER DEFAULT 0,
      stars     INTEGER DEFAULT 0,
      exp       INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

function getWingsInfo(charId) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM wings WHERE char_id = ?').get(charId);
  const current = row.tier > 0 ? WING_TIERS[row.tier - 1] : null;
  const next = row.tier < WING_TIERS.length ? WING_TIERS[row.tier] : null;

  return {
    tier: row.tier,
    stars: row.stars,
    exp: row.exp,
    name: current ? current.name : 'None',
    stats: current || { attack: 0, defence: 0, hp: 0 },
    nextTier: next ? { name: next.name, cost: next.cost, material: next.material } : null,
  };
}

function upgradeWings(charId) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM wings WHERE char_id = ?').get(charId);

  if (row.tier >= WING_TIERS.length) return { success: false, msg: 'Max tier reached' };

  const next = WING_TIERS[row.tier]; // tier is 0-based index for next
  const char = db.getCharacterById(charId);
  if (!char) return { success: false };
  if (char.gold < next.cost) return { success: false, msg: 'Not enough gold' };

  const feathers = db.getPlayerData(charId, 'wing_feathers') || 0;
  if (feathers < next.material) return { success: false, msg: 'Not enough wing feathers' };

  db.updateCharacter(charId, { gold: char.gold - next.cost });
  db.setPlayerData(charId, 'wing_feathers', feathers - next.material);

  db.getDatabase().prepare('UPDATE wings SET tier = tier + 1, stars = 0 WHERE char_id = ?').run(charId);

  recalcWingStats(charId);
  return { success: true, tier: row.tier + 1, name: next.name };
}

function addStarExp(charId, amount) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM wings WHERE char_id = ?').get(charId);
  if (row.tier === 0) return { success: false, msg: 'No wings yet' };

  const expNeeded = 100 * row.tier;
  let newExp = row.exp + amount;
  let newStars = row.stars;

  while (newExp >= expNeeded && newStars < 10) {
    newExp -= expNeeded;
    newStars++;
  }

  db.getDatabase().prepare('UPDATE wings SET exp = ?, stars = ? WHERE char_id = ?').run(newExp, newStars, charId);
  recalcWingStats(charId);
  return { success: true, stars: newStars, exp: newExp };
}

function recalcWingStats(charId) {
  const row = db.getDatabase().prepare('SELECT * FROM wings WHERE char_id = ?').get(charId);
  if (!row || row.tier === 0) {
    db.setPlayerData(charId, 'wing_bonuses', {});
    return;
  }
  const t = WING_TIERS[row.tier - 1];
  const starMul = 1 + row.stars * 0.05;
  db.setPlayerData(charId, 'wing_bonuses', {
    attack: Math.floor(t.attack * starMul),
    defence: Math.floor(t.defence * starMul),
    hp: Math.floor(t.hp * starMul),
  });
}

function ensureEntry(charId) {
  db.getDatabase().prepare('INSERT OR IGNORE INTO wings (char_id) VALUES (?)').run(charId);
}

module.exports = {
  OPCODES, WING_TIERS,
  initDB,
  getWingsInfo, upgradeWings, addStarExp, recalcWingStats,
};
