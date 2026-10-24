/**
 * Wartune Ultra — Farm System
 * Plant seeds, harvest resources (gold, daru, kyanite).
 * Can visit and steal from friends' farms.
 */

'use strict';

const db = require('../db');

const OPCODES = {
  C_FARM_INFO:    0x4E20,  // 20000
  S_FARM_INFO:    0x10E0,  // 4320
  C_FARM_PLANT:   0x4E22,  // 20002
  C_FARM_HARVEST: 0x4E23,  // 20003
  S_FARM_UPDATE:  0x10E1,  // 4321
  C_FARM_STEAL:   0x4E24,  // 20004
};

const SEED_TYPES = [
  { id: 1, name: 'Gold Seed',    reward: 'gold',    baseAmount: 500,  growTime: 3600,   cost: 100,  unlockLevel: 1 },
  { id: 2, name: 'Daru Seed',    reward: 'daru',    baseAmount: 200,  growTime: 3600,   cost: 150,  unlockLevel: 10 },
  { id: 3, name: 'Kyanite Seed', reward: 'kyanite', baseAmount: 100,  growTime: 7200,   cost: 200,  unlockLevel: 20 },
  { id: 4, name: 'EXP Seed',     reward: 'exp',     baseAmount: 300,  growTime: 10800,  cost: 300,  unlockLevel: 15 },
  { id: 5, name: 'Rare Seed',    reward: 'gold',    baseAmount: 2000, growTime: 21600,  cost: 1000, unlockLevel: 30 },
];

const MAX_PLOTS = 9; // 3x3 farm grid

function initDB() {
  const dbInst = db.getDatabase();
  dbInst.exec(`
    CREATE TABLE IF NOT EXISTS farm_plots (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id   INTEGER NOT NULL REFERENCES characters(id),
      plot_idx  INTEGER NOT NULL,
      seed_id   INTEGER DEFAULT 0,
      planted_at INTEGER DEFAULT 0,
      harvested INTEGER DEFAULT 0,
      stolen    INTEGER DEFAULT 0,
      UNIQUE(char_id, plot_idx)
    );
  `);
}

function getFarmInfo(charId) {
  ensurePlots(charId);
  const plots = db.getDatabase()
    .prepare('SELECT * FROM farm_plots WHERE char_id = ? ORDER BY plot_idx')
    .all(charId);

  const now = Math.floor(Date.now() / 1000);
  return plots.map(p => {
    if (p.seed_id === 0) return { plotIdx: p.plot_idx, state: 'empty' };

    const seed = SEED_TYPES.find(s => s.id === p.seed_id) || SEED_TYPES[0];
    const elapsed = now - p.planted_at;
    const ready = elapsed >= seed.growTime;

    return {
      plotIdx: p.plot_idx,
      state: p.harvested ? 'harvested' : ready ? 'ready' : 'growing',
      seedId: p.seed_id,
      seedName: seed.name,
      plantedAt: p.planted_at,
      readyAt: p.planted_at + seed.growTime,
      timeLeft: ready ? 0 : seed.growTime - elapsed,
      stolen: p.stolen,
    };
  });
}

function plant(charId, plotIdx, seedId) {
  if (plotIdx < 0 || plotIdx >= MAX_PLOTS) return { success: false, msg: 'Invalid plot' };

  const seed = SEED_TYPES.find(s => s.id === seedId);
  if (!seed) return { success: false, msg: 'Unknown seed' };

  const char = db.getCharacterById(charId);
  if (!char) return { success: false };
  if (char.grade < seed.unlockLevel) return { success: false, msg: `Level ${seed.unlockLevel} required` };
  if (char.gold < seed.cost) return { success: false, msg: 'Not enough gold' };

  ensurePlots(charId);
  const plot = db.getDatabase()
    .prepare('SELECT * FROM farm_plots WHERE char_id = ? AND plot_idx = ?')
    .get(charId, plotIdx);

  if (plot && plot.seed_id !== 0 && !plot.harvested) {
    return { success: false, msg: 'Plot is occupied' };
  }

  db.updateCharacter(charId, { gold: char.gold - seed.cost });
  const now = Math.floor(Date.now() / 1000);

  db.getDatabase().prepare(`
    UPDATE farm_plots SET seed_id = ?, planted_at = ?, harvested = 0, stolen = 0
    WHERE char_id = ? AND plot_idx = ?
  `).run(seedId, now, charId, plotIdx);

  return { success: true };
}

function harvest(charId, plotIdx) {
  ensurePlots(charId);
  const plot = db.getDatabase()
    .prepare('SELECT * FROM farm_plots WHERE char_id = ? AND plot_idx = ?')
    .get(charId, plotIdx);

  if (!plot || plot.seed_id === 0 || plot.harvested) {
    return { success: false, msg: 'Nothing to harvest' };
  }

  const seed = SEED_TYPES.find(s => s.id === plot.seed_id);
  const now = Math.floor(Date.now() / 1000);
  if (now - plot.planted_at < seed.growTime) {
    return { success: false, msg: 'Not ready yet' };
  }

  // Calculate reward (reduced if stolen)
  const stolenPct = Math.min(plot.stolen * 10, 50); // Max 50% stolen
  const amount = Math.floor(seed.baseAmount * (100 - stolenPct) / 100);

  // Give reward
  if (seed.reward === 'gold') {
    db.getDatabase().prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').run(amount, charId);
  } else if (seed.reward === 'exp') {
    db.getDatabase().prepare('UPDATE characters SET exp = exp + ? WHERE id = ?').run(amount, charId);
  }
  // daru and kyanite stored in player_data
  if (seed.reward === 'daru' || seed.reward === 'kyanite') {
    const current = db.getPlayerData(charId, seed.reward) || 0;
    db.setPlayerData(charId, seed.reward, current + amount);
  }

  // Clear plot
  db.getDatabase().prepare(`
    UPDATE farm_plots SET seed_id = 0, harvested = 1, planted_at = 0, stolen = 0
    WHERE char_id = ? AND plot_idx = ?
  `).run(charId, plotIdx);

  return { success: true, reward: seed.reward, amount };
}

function steal(thiefId, targetId, plotIdx) {
  if (thiefId === targetId) return { success: false, msg: 'Cannot steal from yourself' };

  ensurePlots(targetId);
  const plot = db.getDatabase()
    .prepare('SELECT * FROM farm_plots WHERE char_id = ? AND plot_idx = ?')
    .get(targetId, plotIdx);

  if (!plot || plot.seed_id === 0 || plot.harvested) {
    return { success: false, msg: 'Nothing to steal' };
  }

  const seed = SEED_TYPES.find(s => s.id === plot.seed_id);
  const now = Math.floor(Date.now() / 1000);
  if (now - plot.planted_at < seed.growTime) {
    return { success: false, msg: 'Not ready yet' };
  }

  if (plot.stolen >= 5) return { success: false, msg: 'Already stolen too many times' };

  // Steal 10% of the reward
  const stolen = Math.floor(seed.baseAmount * 0.1);
  db.getDatabase().prepare('UPDATE farm_plots SET stolen = stolen + 1 WHERE char_id = ? AND plot_idx = ?').run(targetId, plotIdx);

  // Give to thief
  if (seed.reward === 'gold') {
    db.getDatabase().prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').run(stolen, thiefId);
  }

  return { success: true, reward: seed.reward, amount: stolen };
}

function ensurePlots(charId) {
  for (let i = 0; i < MAX_PLOTS; i++) {
    db.getDatabase().prepare(`
      INSERT OR IGNORE INTO farm_plots (char_id, plot_idx) VALUES (?, ?)
    `).run(charId, i);
  }
}

module.exports = {
  OPCODES, SEED_TYPES, MAX_PLOTS,
  initDB,
  getFarmInfo, plant, harvest, steal,
};
