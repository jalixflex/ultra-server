'use strict';

const db = require('../db');

const OPCODES = {
  C_ARCHAEOLOGY_INFO:       0x8700,
  S_ARCHAEOLOGY_INFO:       0x8710,
  C_ARCHAEOLOGY_DIG:        0x8701,
  S_ARCHAEOLOGY_DIG:        0x8711,
  C_ARCHAEOLOGY_COLLECTION: 0x8702,
  S_ARCHAEOLOGY_COLLECTION: 0x8712,
  C_ARCHAEOLOGY_CLAIM_SET:  0x8703,
  S_ARCHAEOLOGY_CLAIM_SET:  0x8713,
};

const DIG_SITES = {
  ancient_ruins:  { id: 1, name: 'Ancient Ruins',    minLevel: 30, energyCost: 1, dropPool: [1,2,3,4,5,6,  25,26,27] },
  sunken_temple:  { id: 2, name: 'Sunken Temple',    minLevel: 45, energyCost: 2, dropPool: [7,8,9,10,11,12, 28,29,30] },
  dragon_graveyard:{ id: 3, name: 'Dragon Graveyard', minLevel: 55, energyCost: 2, dropPool: [13,14,15,16,17,18] },
  crystal_cavern: { id: 4, name: 'Crystal Cavern',   minLevel: 65, energyCost: 3, dropPool: [19,20,21,22,23,24] },
  celestial_peak: { id: 5, name: 'Celestial Peak',   minLevel: 75, energyCost: 3, dropPool: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30] },
};

const ARTIFACTS = {
  1:  { name: 'Bronze Idol',        set: 1, rarity: 'common' },
  2:  { name: 'Clay Tablet',        set: 1, rarity: 'common' },
  3:  { name: 'Ancient Coin',       set: 1, rarity: 'common' },
  4:  { name: 'Jade Amulet',        set: 1, rarity: 'uncommon' },
  5:  { name: 'Golden Scarab',      set: 1, rarity: 'uncommon' },
  6:  { name: 'Pharaoh Mask',       set: 1, rarity: 'rare' },
  7:  { name: 'Pearl Necklace',     set: 2, rarity: 'common' },
  8:  { name: 'Coral Fragment',     set: 2, rarity: 'common' },
  9:  { name: 'Sea Shell Horn',     set: 2, rarity: 'common' },
  10: { name: 'Trident Shard',      set: 2, rarity: 'uncommon' },
  11: { name: 'Mermaid Scale',      set: 2, rarity: 'uncommon' },
  12: { name: 'Poseidon Ring',      set: 2, rarity: 'rare' },
  13: { name: 'Dragon Tooth',       set: 3, rarity: 'common' },
  14: { name: 'Wyrm Scale',         set: 3, rarity: 'common' },
  15: { name: 'Bone Fragment',      set: 3, rarity: 'common' },
  16: { name: 'Drake Claw',         set: 3, rarity: 'uncommon' },
  17: { name: 'Dragon Eye Gem',     set: 3, rarity: 'uncommon' },
  18: { name: 'Elder Dragon Heart', set: 3, rarity: 'rare' },
  19: { name: 'Quartz Shard',       set: 4, rarity: 'common' },
  20: { name: 'Amethyst Chunk',     set: 4, rarity: 'common' },
  21: { name: 'Crystal Orb',        set: 4, rarity: 'common' },
  22: { name: 'Diamond Dust',       set: 4, rarity: 'uncommon' },
  23: { name: 'Prismatic Lens',     set: 4, rarity: 'uncommon' },
  24: { name: 'Crystal Crown',      set: 4, rarity: 'rare' },
  25: { name: 'Star Map',           set: 5, rarity: 'common' },
  26: { name: 'Moon Stone',         set: 5, rarity: 'common' },
  27: { name: 'Sun Dial',           set: 5, rarity: 'common' },
  28: { name: 'Celestial Compass',  set: 5, rarity: 'uncommon' },
  29: { name: 'Astrolabe',          set: 5, rarity: 'uncommon' },
  30: { name: 'Heavenly Scepter',   set: 5, rarity: 'rare' },
};

const SETS = {
  1: { name: 'Desert Relics',      items: [1,2,3,4,5,6],     reward: { gold: 500000, exp: 100000 } },
  2: { name: 'Ocean Treasures',    items: [7,8,9,10,11,12],   reward: { gold: 750000, exp: 150000 } },
  3: { name: 'Dragon Remains',     items: [13,14,15,16,17,18], reward: { gold: 1000000, exp: 200000 } },
  4: { name: 'Crystal Collection', items: [19,20,21,22,23,24], reward: { gold: 1250000, exp: 250000 } },
  5: { name: 'Celestial Artifacts',items: [25,26,27,28,29,30], reward: { gold: 1500000, exp: 300000 } },
};

const DROP_WEIGHTS = { common: 60, uncommon: 30, rare: 10 };
const MAX_DAILY_ENERGY = 10;

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS archaeology (
      char_id     INTEGER PRIMARY KEY REFERENCES characters(id),
      dig_energy  INTEGER DEFAULT ${MAX_DAILY_ENERGY},
      total_digs  INTEGER DEFAULT 0,
      rare_finds  INTEGER DEFAULT 0,
      last_reset  TEXT DEFAULT (date('now'))
    );
    CREATE TABLE IF NOT EXISTS archaeology_collection (
      char_id   INTEGER NOT NULL REFERENCES characters(id),
      item_id   INTEGER NOT NULL,
      quantity  INTEGER DEFAULT 0,
      PRIMARY KEY (char_id, item_id)
    );
    CREATE TABLE IF NOT EXISTS archaeology_sets_claimed (
      char_id  INTEGER NOT NULL REFERENCES characters(id),
      set_id   INTEGER NOT NULL,
      PRIMARY KEY (char_id, set_id)
    );
  `);
}

function ensureEntry(charId) {
  db.getDatabase().prepare('INSERT OR IGNORE INTO archaeology (char_id) VALUES (?)').run(charId);
}

function resetDaily(charId) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT last_reset FROM archaeology WHERE char_id = ?').get(charId);
  const today = new Date().toISOString().slice(0, 10);
  if (row && row.last_reset !== today) {
    db.getDatabase().prepare('UPDATE archaeology SET dig_energy = ?, last_reset = ? WHERE char_id = ?')
      .run(MAX_DAILY_ENERGY, today, charId);
  }
}

function getArchaeologyInfo(charId) {
  resetDaily(charId);
  const info = db.getDatabase().prepare('SELECT * FROM archaeology WHERE char_id = ?').get(charId);
  const sites = Object.entries(DIG_SITES).map(([key, s]) => ({
    id: s.id, key, name: s.name, minLevel: s.minLevel, energyCost: s.energyCost,
  }));
  return {
    success: true,
    energy: info.dig_energy,
    maxEnergy: MAX_DAILY_ENERGY,
    totalDigs: info.total_digs,
    rareFinds: info.rare_finds,
    sites,
  };
}

function dig(charId, siteKey) {
  const site = DIG_SITES[siteKey];
  if (!site) return { success: false, msg: 'Invalid dig site' };

  const char = db.getCharacterById(charId);
  if (!char) return { success: false, msg: 'Character not found' };
  if (char.grade < site.minLevel) return { success: false, msg: `Level ${site.minLevel} required` };

  resetDaily(charId);
  const info = db.getDatabase().prepare('SELECT * FROM archaeology WHERE char_id = ?').get(charId);
  if (info.dig_energy < site.energyCost) return { success: false, msg: 'Not enough dig energy' };

  db.getDatabase().prepare('UPDATE archaeology SET dig_energy = dig_energy - ?, total_digs = total_digs + 1 WHERE char_id = ?')
    .run(site.energyCost, charId);

  const pool = site.dropPool;
  const weightedPool = [];
  for (const itemId of pool) {
    const art = ARTIFACTS[itemId];
    if (art) {
      const w = DROP_WEIGHTS[art.rarity] || 10;
      for (let i = 0; i < w; i++) weightedPool.push(itemId);
    }
  }

  const found = weightedPool[Math.floor(Math.random() * weightedPool.length)];
  const foundArt = ARTIFACTS[found];

  db.getDatabase().prepare(`
    INSERT INTO archaeology_collection (char_id, item_id, quantity) VALUES (?, ?, 1)
    ON CONFLICT(char_id, item_id) DO UPDATE SET quantity = quantity + 1
  `).run(charId, found);

  if (foundArt.rarity === 'rare') {
    db.getDatabase().prepare('UPDATE archaeology SET rare_finds = rare_finds + 1 WHERE char_id = ?').run(charId);
  }

  return {
    success: true,
    found: { itemId: found, name: foundArt.name, set: foundArt.set, rarity: foundArt.rarity },
    energyLeft: info.dig_energy - site.energyCost,
  };
}

function getCollection(charId) {
  ensureEntry(charId);
  const items = db.getDatabase().prepare('SELECT * FROM archaeology_collection WHERE char_id = ?').all(charId);
  const collection = {};
  for (const row of items) {
    const art = ARTIFACTS[row.item_id];
    if (art) {
      collection[row.item_id] = { ...art, itemId: row.item_id, quantity: row.quantity };
    }
  }
  return { success: true, collection };
}

function getCompletedSets(charId) {
  const { collection } = getCollection(charId);
  const completed = [];
  const claimed = db.getDatabase().prepare('SELECT set_id FROM archaeology_sets_claimed WHERE char_id = ?').all(charId)
    .map(r => r.set_id);

  for (const [setId, setDef] of Object.entries(SETS)) {
    const sid = parseInt(setId);
    const hasAll = setDef.items.every(itemId => collection[itemId] && collection[itemId].quantity > 0);
    completed.push({
      setId: sid, name: setDef.name, complete: hasAll,
      claimed: claimed.includes(sid), reward: setDef.reward,
      items: setDef.items.map(id => ({
        itemId: id, name: ARTIFACTS[id].name, rarity: ARTIFACTS[id].rarity,
        owned: !!(collection[id] && collection[id].quantity > 0),
      })),
    });
  }
  return { success: true, sets: completed };
}

function claimSetReward(charId, setId) {
  const sid = parseInt(setId);
  const setDef = SETS[sid];
  if (!setDef) return { success: false, msg: 'Invalid set' };

  const already = db.getDatabase().prepare('SELECT 1 FROM archaeology_sets_claimed WHERE char_id = ? AND set_id = ?').get(charId, sid);
  if (already) return { success: false, msg: 'Already claimed' };

  const items = db.getDatabase().prepare('SELECT * FROM archaeology_collection WHERE char_id = ?').all(charId);
  const owned = {};
  for (const r of items) owned[r.item_id] = r.quantity;

  const hasAll = setDef.items.every(id => (owned[id] || 0) > 0);
  if (!hasAll) return { success: false, msg: 'Set not complete' };

  db.getDatabase().prepare('INSERT INTO archaeology_sets_claimed (char_id, set_id) VALUES (?, ?)').run(charId, sid);

  const char = db.getCharacterById(charId);
  if (char) {
    db.updateCharacter(charId, {
      gold: (char.gold || 0) + setDef.reward.gold,
      exp: (char.exp || 0) + setDef.reward.exp,
    });
  }

  return { success: true, setId: sid, reward: setDef.reward };
}

module.exports = {
  OPCODES, ARTIFACTS, SETS, DIG_SITES, MAX_DAILY_ENERGY,
  initDB,
  getArchaeologyInfo, dig, getCollection, getCompletedSets, claimSetReward, resetDaily,
};
