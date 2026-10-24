'use strict';

const db = require('../db');
let inventory = null;
function getInventory() {
  if (!inventory) inventory = require('./inventory');
  return inventory;
}

const OPCODES = {
  C_GACHA_INFO:     0x8000,
  S_GACHA_INFO:     0x8010,
  C_GACHA_PULL:     0x8001,
  S_GACHA_PULL:     0x8011,
  C_GACHA_HISTORY:  0x8002,
  S_GACHA_HISTORY:  0x8012,
};

const BANNERS = {
  standard: {
    id: 'standard', name: 'Standard Wheel', costType: 'gold', costAmount: 10000,
    pool: [
      { id: 'gold_500',      name: '500 Gold',         type: 'gold',    amount: 500,    rarity: 'common',    weight: 30 },
      { id: 'gold_2000',     name: '2000 Gold',        type: 'gold',    amount: 2000,   rarity: 'common',    weight: 20 },
      { id: 'exp_1000',      name: '1000 EXP',         type: 'exp',     amount: 1000,   rarity: 'common',    weight: 15 },
      { id: 'exp_5000',      name: '5000 EXP',         type: 'exp',     amount: 5000,   rarity: 'uncommon',  weight: 12 },
      { id: 'gold_10000',    name: '10000 Gold',       type: 'gold',    amount: 10000,  rarity: 'uncommon',  weight: 10 },
      { id: 'bbalens_5',     name: '5 Bound Balens',   type: 'bound_balens', amount: 5, rarity: 'rare',      weight: 6 },
      { id: 'gem_lv1',       name: 'Lv1 Gem',          type: 'item',    itemId: 'gem_random_1', rarity: 'rare', weight: 4 },
      { id: 'bbalens_20',    name: '20 Bound Balens',  type: 'bound_balens', amount: 20, rarity: 'epic',     weight: 2 },
      { id: 'mount_ticket',  name: 'Mount Whip',       type: 'item',    itemId: 'mount_whip', rarity: 'legendary', weight: 1 },
    ],
  },
  premium: {
    id: 'premium', name: 'Premium Wheel', costType: 'balens', costAmount: 50,
    pool: [
      { id: 'gold_5000',     name: '5000 Gold',         type: 'gold',    amount: 5000,   rarity: 'common',    weight: 25 },
      { id: 'exp_5000p',     name: '5000 EXP',          type: 'exp',     amount: 5000,   rarity: 'common',    weight: 20 },
      { id: 'bbalens_10',    name: '10 Bound Balens',   type: 'bound_balens', amount: 10, rarity: 'uncommon', weight: 15 },
      { id: 'gold_30000',    name: '30000 Gold',        type: 'gold',    amount: 30000,  rarity: 'uncommon',  weight: 12 },
      { id: 'gem_lv3',       name: 'Lv3 Gem',           type: 'item',    itemId: 'gem_random_3', rarity: 'rare', weight: 10 },
      { id: 'bbalens_50',    name: '50 Bound Balens',   type: 'bound_balens', amount: 50, rarity: 'rare',     weight: 8 },
      { id: 'sylph_shard',   name: 'Sylph Shard x5',    type: 'item',    itemId: 'sylph_shard', amount: 5, rarity: 'epic', weight: 6 },
      { id: 'mount_card',    name: 'Mount Card',         type: 'item',    itemId: 'mount_card', rarity: 'epic', weight: 3 },
      { id: 'legendary_gem', name: 'Lv7 Gem',           type: 'item',    itemId: 'gem_random_7', rarity: 'legendary', weight: 1 },
    ],
  },
};

const PITY_RARE = 10;
const PITY_LEGENDARY = 50;

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS gacha (
      char_id    INTEGER NOT NULL REFERENCES characters(id),
      banner     TEXT NOT NULL,
      pull_count INTEGER DEFAULT 0,
      pity_rare  INTEGER DEFAULT 0,
      pity_legend INTEGER DEFAULT 0,
      free_today TEXT DEFAULT '',
      PRIMARY KEY(char_id, banner)
    );
    CREATE TABLE IF NOT EXISTS gacha_history (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id   INTEGER NOT NULL,
      banner    TEXT NOT NULL,
      prize_id  TEXT NOT NULL,
      prize_name TEXT NOT NULL,
      rarity    TEXT NOT NULL,
      pulled_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

function ensureEntry(charId, banner) {
  db.getDatabase().prepare('INSERT OR IGNORE INTO gacha (char_id, banner) VALUES (?, ?)').run(charId, banner);
}

function weightedPick(pool) {
  const totalWeight = pool.reduce((s, p) => s + p.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const prize of pool) {
    roll -= prize.weight;
    if (roll <= 0) return prize;
  }
  return pool[pool.length - 1];
}

function getGachaInfo(charId) {
  const result = {};
  for (const [key, banner] of Object.entries(BANNERS)) {
    ensureEntry(charId, key);
    const row = db.getDatabase().prepare('SELECT * FROM gacha WHERE char_id = ? AND banner = ?').get(charId, key);
    const today = new Date().toISOString().slice(0, 10);
    result[key] = {
      id: banner.id, name: banner.name, costType: banner.costType, costAmount: banner.costAmount,
      pullCount: row.pull_count, pityRare: PITY_RARE - row.pity_rare, pityLegendary: PITY_LEGENDARY - row.pity_legend,
      freeAvailable: row.free_today !== today,
    };
  }
  return { success: true, banners: result };
}

function pull(charId, bannerId, useFree) {
  const banner = BANNERS[bannerId];
  if (!banner) return { success: false, msg: 'Invalid banner' };
  ensureEntry(charId, bannerId);
  const row = db.getDatabase().prepare('SELECT * FROM gacha WHERE char_id = ? AND banner = ?').get(charId, bannerId);
  const today = new Date().toISOString().slice(0, 10);
  const isFree = useFree && row.free_today !== today;

  if (!isFree) {
    const char = db.getCharacterById(charId);
    if (!char) return { success: false, msg: 'Character not found' };
    if (banner.costType === 'gold' && char.gold < banner.costAmount) return { success: false, msg: 'Not enough gold' };
    if (banner.costType === 'balens' && char.balens < banner.costAmount) return { success: false, msg: 'Not enough balens' };
    const col = banner.costType === 'gold' ? 'gold' : 'balens';
    db.getDatabase().prepare(`UPDATE characters SET ${col} = ${col} - ? WHERE id = ?`).run(banner.costAmount, charId);
  }

  const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  let prize;
  const newPityRare = row.pity_rare + 1;
  const newPityLegend = row.pity_legend + 1;

  if (newPityLegend >= PITY_LEGENDARY) {
    const pool = banner.pool.filter(p => p.rarity === 'legendary');
    prize = pool.length ? pool[Math.floor(Math.random() * pool.length)] : weightedPick(banner.pool);
  } else if (newPityRare >= PITY_RARE) {
    const pool = banner.pool.filter(p => RARITY_ORDER.indexOf(p.rarity) >= 2);
    prize = pool.length ? weightedPick(pool) : weightedPick(banner.pool);
  } else {
    prize = weightedPick(banner.pool);
  }

  const prIdx = RARITY_ORDER.indexOf(prize.rarity);
  const resetRare = prIdx >= 2 ? 0 : newPityRare;
  const resetLegend = prIdx >= 4 ? 0 : newPityLegend;

  if (isFree) {
    db.getDatabase().prepare('UPDATE gacha SET pull_count = pull_count + 1, pity_rare = ?, pity_legend = ?, free_today = ? WHERE char_id = ? AND banner = ?')
      .run(resetRare, resetLegend, today, charId, bannerId);
  } else {
    db.getDatabase().prepare('UPDATE gacha SET pull_count = pull_count + 1, pity_rare = ?, pity_legend = ? WHERE char_id = ? AND banner = ?')
      .run(resetRare, resetLegend, charId, bannerId);
  }

  const amount = prize.amount || 1;
  if (prize.type === 'gold') db.getDatabase().prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').run(amount, charId);
  if (prize.type === 'exp') db.getDatabase().prepare('UPDATE characters SET exp = exp + ? WHERE id = ?').run(amount, charId);
  if (prize.type === 'bound_balens') db.getDatabase().prepare('UPDATE characters SET bound_balens = bound_balens + ? WHERE id = ?').run(amount, charId);
  if (prize.type === 'item') {
    try {
      const itemId = typeof prize.itemId === 'number' ? prize.itemId : (100100 + Math.floor(Math.random() * 50));
      getInventory().addItem(charId, itemId, amount, 0, 0);
    } catch (e) { console.error('[GACHA] Failed to add item:', e.message); }
  }

  db.getDatabase().prepare('INSERT INTO gacha_history (char_id, banner, prize_id, prize_name, rarity) VALUES (?, ?, ?, ?, ?)')
    .run(charId, bannerId, prize.id, prize.name, prize.rarity);

  return { success: true, prize: { id: prize.id, name: prize.name, type: prize.type, rarity: prize.rarity, amount }, wasFree: isFree };
}

function getHistory(charId, bannerId, limit) {
  const rows = db.getDatabase().prepare('SELECT * FROM gacha_history WHERE char_id = ? AND banner LIKE ? ORDER BY id DESC LIMIT ?')
    .all(charId, bannerId || '%', limit || 20);
  return { success: true, history: rows };
}

module.exports = { OPCODES, BANNERS, PITY_RARE, PITY_LEGENDARY, initDB, getGachaInfo, pull, getHistory };
