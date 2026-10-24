'use strict';

const db = require('../db');

const OPCODES = {
  C_HONOR_INFO:       0x7400,
  S_HONOR_INFO_RSP:   0x7410,
  C_MEDALLION_INFO:   0x7401,
  S_MEDALLION_INFO:   0x7411,
  C_MEDALLION_BUY:    0x7402,
  S_MEDALLION_UPDATE: 0x7412,
  C_MEDALLION_EQUIP:  0x7403,
  C_PVP_SHOP_LIST:    0x7404,
  S_PVP_SHOP_LIST:    0x7414,
  C_PVP_SHOP_BUY:     0x7405,
  S_PVP_SHOP_UPDATE:  0x7415,
};

const TITLES = [
  { rank: 1,  name: 'Private',       honor: 0,      atkBonus: 50,   defBonus: 30,   hpBonus: 200 },
  { rank: 2,  name: 'Corporal',      honor: 500,    atkBonus: 100,  defBonus: 60,   hpBonus: 400 },
  { rank: 3,  name: 'Sergeant',      honor: 2000,   atkBonus: 150,  defBonus: 90,   hpBonus: 600 },
  { rank: 4,  name: 'Lieutenant',    honor: 5000,   atkBonus: 200,  defBonus: 120,  hpBonus: 800 },
  { rank: 5,  name: 'Captain',       honor: 10000,  atkBonus: 250,  defBonus: 150,  hpBonus: 1000 },
  { rank: 6,  name: 'Major',         honor: 20000,  atkBonus: 300,  defBonus: 180,  hpBonus: 1200 },
  { rank: 7,  name: 'Colonel',       honor: 40000,  atkBonus: 350,  defBonus: 210,  hpBonus: 1400 },
  { rank: 8,  name: 'General',       honor: 70000,  atkBonus: 400,  defBonus: 240,  hpBonus: 1600 },
  { rank: 9,  name: 'Marshal',       honor: 100000, atkBonus: 450,  defBonus: 270,  hpBonus: 1800 },
  { rank: 10, name: 'Grand Marshal', honor: 150000, atkBonus: 500,  defBonus: 300,  hpBonus: 2000 },
];

const MEDALLIONS = [];
for (let tier = 1; tier <= 10; tier++) {
  MEDALLIONS.push({
    tier,
    name: `Medallion Tier ${tier}`,
    requiredRank: tier,
    insigniaCost: tier <= 3 ? tier * 100 : tier <= 6 ? tier * 200 : tier * 500,
    atkBonus: tier * 100,
    defBonus: tier * 50,
    hpBonus: tier * 200,
  });
}

const PVP_SHOP = [
  { id: 1, name: 'PvP Sword',       type: 'weapon',  insigniaCost: 200,  requiredRank: 2, atk: 150 },
  { id: 2, name: 'PvP Shield',      type: 'armor',   insigniaCost: 200,  requiredRank: 2, def: 100 },
  { id: 3, name: 'PvP Helmet',      type: 'helmet',  insigniaCost: 150,  requiredRank: 3, def: 80, hp: 300 },
  { id: 4, name: 'Honor Cloak',     type: 'cloak',   insigniaCost: 300,  requiredRank: 4, atk: 80, def: 80 },
  { id: 5, name: 'War Boots',       type: 'boots',   insigniaCost: 250,  requiredRank: 3, def: 60, hp: 200 },
  { id: 6, name: 'Commander Ring',   type: 'ring',    insigniaCost: 500,  requiredRank: 5, atk: 120, hp: 500 },
  { id: 7, name: 'Marshal Amulet',  type: 'amulet',  insigniaCost: 1000, requiredRank: 7, atk: 200, def: 150, hp: 800 },
  { id: 8, name: 'Rune Stone x10',  type: 'material',insigniaCost: 100,  requiredRank: 1 },
  { id: 9, name: 'Star Sand x5',    type: 'material',insigniaCost: 150,  requiredRank: 1 },
  { id: 10,name: 'Mount Whip x5',   type: 'material',insigniaCost: 80,   requiredRank: 1 },
];

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS honor (
      char_id       INTEGER PRIMARY KEY REFERENCES characters(id),
      honor         INTEGER DEFAULT 0,
      insignia      INTEGER DEFAULT 0,
      medallion_tier INTEGER DEFAULT 0,
      medallion_equipped INTEGER DEFAULT 0
    );
  `);
}

function ensureEntry(charId) {
  db.getDatabase().prepare('INSERT OR IGNORE INTO honor (char_id) VALUES (?)').run(charId);
}

function getTitle(charId) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT honor FROM honor WHERE char_id = ?').get(charId);
  let title = TITLES[0];
  for (const t of TITLES) {
    if (row.honor >= t.honor) title = t;
  }
  return title;
}

function getHonorInfo(charId) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM honor WHERE char_id = ?').get(charId);
  const title = getTitle(charId);
  const nextTitle = TITLES.find(t => t.honor > row.honor) || null;

  return {
    honor: row.honor,
    insignia: row.insignia,
    title: title.name,
    titleRank: title.rank,
    atkBonus: title.atkBonus,
    defBonus: title.defBonus,
    hpBonus: title.hpBonus,
    nextTitle: nextTitle ? { name: nextTitle.name, honorNeeded: nextTitle.honor - row.honor } : null,
    medallionTier: row.medallion_tier,
    medallionEquipped: !!row.medallion_equipped,
  };
}

function addHonor(charId, amount) {
  ensureEntry(charId);
  if (amount <= 0) return;
  db.getDatabase().prepare('UPDATE honor SET honor = honor + ? WHERE char_id = ?').run(amount, charId);
}

function addInsignia(charId, amount) {
  ensureEntry(charId);
  if (amount <= 0) return;
  db.getDatabase().prepare('UPDATE honor SET insignia = insignia + ? WHERE char_id = ?').run(amount, charId);
}

function getMedallionInfo(charId) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM honor WHERE char_id = ?').get(charId);
  const title = getTitle(charId);
  const currentMedallion = row.medallion_tier > 0 ? MEDALLIONS[row.medallion_tier - 1] : null;
  const nextMedallion = row.medallion_tier < 10 ? MEDALLIONS[row.medallion_tier] : null;

  return {
    currentTier: row.medallion_tier,
    equipped: !!row.medallion_equipped,
    current: currentMedallion,
    next: nextMedallion ? {
      ...nextMedallion,
      canAfford: row.insignia >= nextMedallion.insigniaCost,
      meetsRank: title.rank >= nextMedallion.requiredRank,
    } : null,
    allTiers: MEDALLIONS.map(m => ({
      ...m,
      owned: row.medallion_tier >= m.tier,
      canAfford: row.insignia >= m.insigniaCost,
      meetsRank: title.rank >= m.requiredRank,
    })),
  };
}

function buyMedallion(charId, tier) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM honor WHERE char_id = ?').get(charId);
  const title = getTitle(charId);

  if (tier < 1 || tier > 10) return { success: false, msg: 'Invalid tier' };
  if (tier !== row.medallion_tier + 1) return { success: false, msg: 'Must buy tiers in order' };

  const medallion = MEDALLIONS[tier - 1];
  if (title.rank < medallion.requiredRank) {
    const needed = TITLES.find(t => t.rank === medallion.requiredRank);
    return { success: false, msg: `Requires ${needed.name} rank` };
  }
  if (row.insignia < medallion.insigniaCost) {
    return { success: false, msg: `Need ${medallion.insigniaCost} insignia (have ${row.insignia})` };
  }

  db.getDatabase().prepare('UPDATE honor SET insignia = insignia - ?, medallion_tier = ? WHERE char_id = ?')
    .run(medallion.insigniaCost, tier, charId);

  return {
    success: true,
    tier,
    name: medallion.name,
    atkBonus: medallion.atkBonus,
    defBonus: medallion.defBonus,
    hpBonus: medallion.hpBonus,
    insigniaRemaining: row.insignia - medallion.insigniaCost,
  };
}

function equipMedallion(charId) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT medallion_tier, medallion_equipped FROM honor WHERE char_id = ?').get(charId);
  if (row.medallion_tier === 0) return { success: false, msg: 'No medallion owned' };

  const newState = row.medallion_equipped ? 0 : 1;
  db.getDatabase().prepare('UPDATE honor SET medallion_equipped = ? WHERE char_id = ?').run(newState, charId);

  return { success: true, equipped: !!newState, tier: row.medallion_tier };
}

function getTitleBonuses(charId) {
  const title = getTitle(charId);
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT medallion_tier, medallion_equipped FROM honor WHERE char_id = ?').get(charId);

  const bonuses = {
    attack: title.atkBonus,
    defence: title.defBonus,
    max_hp: title.hpBonus,
  };

  if (row.medallion_equipped && row.medallion_tier > 0) {
    const m = MEDALLIONS[row.medallion_tier - 1];
    bonuses.attack += m.atkBonus;
    bonuses.defence += m.defBonus;
    bonuses.max_hp += m.hpBonus;
  }

  return bonuses;
}

function getPvpShopList(charId) {
  const title = getTitle(charId);
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT insignia FROM honor WHERE char_id = ?').get(charId);

  return {
    insignia: row.insignia,
    items: PVP_SHOP.map(item => ({
      ...item,
      canAfford: row.insignia >= item.insigniaCost,
      meetsRank: title.rank >= item.requiredRank,
    })),
  };
}

function buyPvpItem(charId, itemId) {
  ensureEntry(charId);
  const item = PVP_SHOP.find(i => i.id === itemId);
  if (!item) return { success: false, msg: 'Item not found' };

  const row = db.getDatabase().prepare('SELECT insignia FROM honor WHERE char_id = ?').get(charId);
  const title = getTitle(charId);

  if (title.rank < item.requiredRank) return { success: false, msg: 'Rank too low' };
  if (row.insignia < item.insigniaCost) return { success: false, msg: 'Not enough insignia' };

  db.getDatabase().prepare('UPDATE honor SET insignia = insignia - ? WHERE char_id = ?')
    .run(item.insigniaCost, charId);

  return { success: true, item: item.name, insigniaRemaining: row.insignia - item.insigniaCost };
}

module.exports = {
  OPCODES, TITLES, MEDALLIONS, PVP_SHOP,
  initDB,
  getHonorInfo, addHonor, addInsignia, getTitle,
  getMedallionInfo, buyMedallion, equipMedallion,
  getTitleBonuses, getPvpShopList, buyPvpItem,
};
