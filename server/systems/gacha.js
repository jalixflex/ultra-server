'use strict';

const db = require('../db');

const OPCODES = {
  C_GACHA_INFO:     0x8000,
  S_GACHA_INFO:     0x8010,
  C_GACHA_SPIN:     0x8001,
  S_GACHA_SPIN:     0x8011,
  C_GACHA_TEN_SPIN: 0x8002,
  S_GACHA_TEN_SPIN: 0x8012,
};

const GACHA_POOLS = [
  {
    id: 1, name: 'Standard Chest', costType: 'gold', costAmount: 50000, tenCostAmount: 450000,
    items: [
      { itemId: 'gold_bag_s',     name: 'Small Gold Bag',    rarity: 1, weight: 300, rewards: { gold: 10000 } },
      { itemId: 'exp_scroll_s',   name: 'EXP Scroll (S)',    rarity: 1, weight: 250, rewards: { exp: 5000 } },
      { itemId: 'soul_crystal_1', name: 'Soul Crystal I',    rarity: 2, weight: 150, rewards: { item: 'soul_crystal_1', amount: 1 } },
      { itemId: 'mount_whip',     name: 'Mount Training Whip', rarity: 2, weight: 120, rewards: { item: 'mount_whip', amount: 5 } },
      { itemId: 'rune_stone',     name: 'Rune Stone',        rarity: 2, weight: 80,  rewards: { item: 'rune_stone', amount: 3 } },
      { itemId: 'gem_pack_1',     name: 'Lv1 Gem Pack',      rarity: 3, weight: 50,  rewards: { item: 'gem_pack_1', amount: 1 } },
      { itemId: 'wing_feather',   name: 'Wing Feather',      rarity: 3, weight: 30,  rewards: { item: 'wing_feather', amount: 2 } },
      { itemId: 'rare_mount',     name: 'Rare Mount Card',   rarity: 4, weight: 15,  rewards: { item: 'rare_mount', amount: 1 } },
      { itemId: 'sylph_shard',    name: 'Sylph Shard',       rarity: 4, weight: 5,   rewards: { item: 'sylph_shard', amount: 1 } },
    ],
  },
  {
    id: 2, name: 'Premium Chest', costType: 'balens', costAmount: 100, tenCostAmount: 900,
    items: [
      { itemId: 'gold_bag_l',     name: 'Large Gold Bag',    rarity: 2, weight: 200, rewards: { gold: 100000 } },
      { itemId: 'exp_scroll_l',   name: 'EXP Scroll (L)',    rarity: 2, weight: 180, rewards: { exp: 50000 } },
      { itemId: 'soul_crystal_3', name: 'Soul Crystal III',  rarity: 3, weight: 120, rewards: { item: 'soul_crystal_3', amount: 1 } },
      { itemId: 'rune_stone_p',   name: 'Premium Rune Stone', rarity: 3, weight: 100, rewards: { item: 'rune_stone_p', amount: 5 } },
      { itemId: 'gem_pack_3',     name: 'Lv3 Gem Pack',      rarity: 3, weight: 80,  rewards: { item: 'gem_pack_3', amount: 1 } },
      { itemId: 'sylph_equip',    name: 'Sylph Equipment',   rarity: 4, weight: 50,  rewards: { item: 'sylph_equip', amount: 1 } },
      { itemId: 'dragon_crystal', name: 'Dragon Crystal',    rarity: 4, weight: 40,  rewards: { item: 'dragon_crystal', amount: 3 } },
      { itemId: 'epic_mount',     name: 'Epic Mount Card',   rarity: 5, weight: 20,  rewards: { item: 'epic_mount', amount: 1 } },
      { itemId: 'legendary_wing', name: 'Legendary Wing',    rarity: 5, weight: 8,   rewards: { item: 'legendary_wing', amount: 1 } },
      { itemId: 'eudaemon_shard', name: 'Eudaemon Shard',    rarity: 5, weight: 2,   rewards: { item: 'eudaemon_shard', amount: 1 } },
    ],
  },
  {
    id: 3, name: 'Lucky Wheel', costType: 'voucher', costAmount: 1, tenCostAmount: 10,
    items: [
      { itemId: 'gold_bag_m',     name: 'Medium Gold Bag',   rarity: 1, weight: 250, rewards: { gold: 50000 } },
      { itemId: 'bound_balens_50', name: '50 Bound Balens',  rarity: 2, weight: 200, rewards: { bound_balens: 50 } },
      { itemId: 'star_sand',      name: 'Star Sand',         rarity: 3, weight: 100, rewards: { item: 'star_sand', amount: 5 } },
      { itemId: 'holy_stone',     name: 'Holy Stone',        rarity: 3, weight: 80,  rewards: { item: 'holy_stone', amount: 10 } },
      { itemId: 'dragon_crystal', name: 'Dragon Crystal',    rarity: 4, weight: 40,  rewards: { item: 'dragon_crystal', amount: 2 } },
      { itemId: 'clothing_shard', name: 'Clothing Shard',    rarity: 4, weight: 30,  rewards: { item: 'clothing_shard', amount: 5 } },
    ],
  },
];

const PITY_THRESHOLD = 50;

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS gacha_history (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id   INTEGER NOT NULL REFERENCES characters(id),
      pool_id   INTEGER NOT NULL,
      item_id   TEXT NOT NULL,
      rarity    INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS gacha_pity (
      char_id   INTEGER NOT NULL REFERENCES characters(id),
      pool_id   INTEGER NOT NULL,
      counter   INTEGER DEFAULT 0,
      PRIMARY KEY(char_id, pool_id)
    );
  `);
}

function getPoolInfo(poolId) {
  return GACHA_POOLS.find(p => p.id === poolId) || null;
}

function rollItem(pool, pityCount) {
  let items = pool.items;
  if (pityCount >= PITY_THRESHOLD) {
    items = items.filter(i => i.rarity >= 4);
    if (items.length === 0) items = pool.items;
  }
  const totalWeight = items.reduce((sum, i) => sum + i.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

function getInfo(charId) {
  const pools = GACHA_POOLS.map(p => {
    const pity = db.getDatabase().prepare('SELECT counter FROM gacha_pity WHERE char_id = ? AND pool_id = ?').get(charId, p.id);
    return {
      poolId: p.id,
      name: p.name,
      costType: p.costType,
      costAmount: p.costAmount,
      tenCostAmount: p.tenCostAmount,
      pityCounter: pity ? pity.counter : 0,
      pityThreshold: PITY_THRESHOLD,
      items: p.items.map(i => ({ itemId: i.itemId, name: i.name, rarity: i.rarity })),
    };
  });
  return { success: true, pools };
}

function spin(charId, poolId, count) {
  const pool = getPoolInfo(poolId);
  if (!pool) return { success: false, msg: 'Invalid pool' };
  count = count || 1;
  if (count !== 1 && count !== 10) return { success: false, msg: 'Spin 1 or 10' };

  const char = db.getCharacterById(charId);
  if (!char) return { success: false, msg: 'Character not found' };

  const totalCost = count === 10 ? pool.tenCostAmount : pool.costAmount;

  if (pool.costType === 'gold') {
    if (char.gold < totalCost) return { success: false, msg: 'Not enough gold' };
    db.getDatabase().prepare('UPDATE characters SET gold = gold - ? WHERE id = ?').run(totalCost, charId);
  } else if (pool.costType === 'balens') {
    if ((char.balens || 0) < totalCost) return { success: false, msg: 'Not enough balens' };
    db.getDatabase().prepare('UPDATE characters SET balens = balens - ? WHERE id = ?').run(totalCost, charId);
  } else if (pool.costType === 'voucher') {
    if ((char.vouchers || 0) < totalCost) return { success: false, msg: 'Not enough vouchers' };
    db.getDatabase().prepare('UPDATE characters SET vouchers = vouchers - ? WHERE id = ?').run(totalCost, charId);
  }

  db.getDatabase().prepare('INSERT OR IGNORE INTO gacha_pity (char_id, pool_id) VALUES (?, ?)').run(charId, poolId);
  const pity = db.getDatabase().prepare('SELECT counter FROM gacha_pity WHERE char_id = ? AND pool_id = ?').get(charId, poolId);

  const results = [];
  let pityCounter = pity ? pity.counter : 0;

  for (let i = 0; i < count; i++) {
    const item = rollItem(pool, pityCounter);
    results.push({ itemId: item.itemId, name: item.name, rarity: item.rarity });

    db.getDatabase().prepare('INSERT INTO gacha_history (char_id, pool_id, item_id, rarity) VALUES (?, ?, ?, ?)')
      .run(charId, poolId, item.itemId, item.rarity);

    if (item.rarity >= 4) {
      pityCounter = 0;
    } else {
      pityCounter++;
    }

    if (item.rewards) {
      if (item.rewards.gold) db.getDatabase().prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').run(item.rewards.gold, charId);
      if (item.rewards.exp) db.getDatabase().prepare('UPDATE characters SET exp = exp + ? WHERE id = ?').run(item.rewards.exp, charId);
      if (item.rewards.bound_balens) db.getDatabase().prepare('UPDATE characters SET bound_balens = bound_balens + ? WHERE id = ?').run(item.rewards.bound_balens, charId);
    }
  }

  db.getDatabase().prepare('UPDATE gacha_pity SET counter = ? WHERE char_id = ? AND pool_id = ?').run(pityCounter, charId, poolId);

  return { success: true, results, pityCounter };
}

module.exports = {
  OPCODES, GACHA_POOLS, PITY_THRESHOLD,
  initDB, getInfo, spin, getPoolInfo,
};
