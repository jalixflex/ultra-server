/**
 * Wartune Ultra — Inventory / Item System
 * Manages player bags, items, equipping, using consumables
 */

'use strict';

const { encode } = require('../proto');
const { buildPacket } = require('../packet');
const db = require('../db');

const OPCODES = {
  C_BAG_INFO:       0x1770,  // 6000 — Client requests bag info
  S_BAG_INFO:       0x1006,  // 4102 — Server sends bag contents
  C_USE_ITEM:       0x1771,  // 6001 — Client uses an item
  S_USE_ITEM_RSP:   0x1007,  // 4103 — Server response to item use
  C_EQUIP_ITEM:     0x1772,  // 6002 — Client equips item
  S_EQUIP_RSP:      0x1008,  // 4104 — Equip response
  C_UNEQUIP_ITEM:   0x1773,  // 6003 — Client unequips
  S_UNEQUIP_RSP:    0x1009,  // 4105 — Unequip response
  C_SELL_ITEM:      0x1774,  // 6004 — Sell item
  S_SELL_RSP:       0x100A,  // 4106 — Sell response
  S_ITEM_UPDATE:    0x100B,  // 4107 — Item slot update notification
};

// Equipment slot types
const EQUIP_SLOT = {
  WEAPON:    1,
  HELMET:    2,
  ARMOR:     3,
  PANTS:     4,
  BOOTS:     5,
  RING:      6,
  NECKLACE:  7,
  ACCESSORY: 8,
  MOUNT:     9,
  WING:      10,
};

// Item quality/rarity
const QUALITY = {
  WHITE:   0,
  GREEN:   1,
  BLUE:    2,
  PURPLE:  3,
  ORANGE:  4,
  RED:     5,
  GOLD:    6,
};

/**
 * Initialize item tables in database
 */
function initDB() {
  const dbInst = db.getDatabase();
  dbInst.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id     INTEGER NOT NULL REFERENCES characters(id),
      item_id     INTEGER NOT NULL,
      slot        INTEGER DEFAULT -1,
      count       INTEGER DEFAULT 1,
      enhance     INTEGER DEFAULT 0,
      quality     INTEGER DEFAULT 0,
      bound       INTEGER DEFAULT 0,
      equip_slot  INTEGER DEFAULT 0,
      attrs       TEXT DEFAULT '{}',
      created_at  TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_items_char ON items(char_id);
  `);
}

/**
 * Get all items for a character
 */
function getItems(charId) {
  return db.getDatabase()
    .prepare('SELECT * FROM items WHERE char_id = ? ORDER BY slot')
    .all(charId);
}

/**
 * Get equipped items for a character
 */
function getEquippedItems(charId) {
  return db.getDatabase()
    .prepare('SELECT * FROM items WHERE char_id = ? AND equip_slot > 0')
    .all(charId);
}

/**
 * Add item to character's inventory
 */
function addItem(charId, itemId, count = 1, quality = 0, bound = 0) {
  const char = db.getCharacterById(charId);
  if (!char) return null;

  // Find first empty slot
  const items = getItems(charId);
  const usedSlots = new Set(items.map(i => i.slot));
  let freeSlot = -1;
  for (let s = 0; s < char.bag_count; s++) {
    if (!usedSlots.has(s)) { freeSlot = s; break; }
  }
  if (freeSlot === -1) return null; // Bag full

  // Check if stackable (same item_id, not equipment)
  const existing = items.find(i => i.item_id === itemId && i.equip_slot === 0 && i.bound === bound);
  if (existing && isStackable(itemId)) {
    db.getDatabase()
      .prepare('UPDATE items SET count = count + ? WHERE id = ?')
      .run(count, existing.id);
    return { ...existing, count: existing.count + count };
  }

  const result = db.getDatabase()
    .prepare('INSERT INTO items (char_id, item_id, slot, count, quality, bound) VALUES (?, ?, ?, ?, ?, ?)')
    .run(charId, itemId, freeSlot, count, quality, bound);

  return { id: result.lastInsertRowid, char_id: charId, item_id: itemId, slot: freeSlot, count, quality, bound };
}

/**
 * Remove item or reduce count
 */
function removeItem(itemDbId, count = 1) {
  const item = db.getDatabase().prepare('SELECT * FROM items WHERE id = ?').get(itemDbId);
  if (!item) return false;

  if (item.count <= count) {
    db.getDatabase().prepare('DELETE FROM items WHERE id = ?').run(itemDbId);
  } else {
    db.getDatabase().prepare('UPDATE items SET count = count - ? WHERE id = ?').run(count, itemDbId);
  }
  return true;
}

/**
 * Equip an item
 */
function equipItem(charId, itemDbId, slot) {
  const item = db.getDatabase().prepare('SELECT * FROM items WHERE id = ? AND char_id = ?').get(itemDbId, charId);
  if (!item) return { success: false, msg: 'Item not found' };

  // Unequip existing item in that slot
  const existing = db.getDatabase()
    .prepare('SELECT * FROM items WHERE char_id = ? AND equip_slot = ?')
    .get(charId, slot);
  if (existing) {
    db.getDatabase()
      .prepare('UPDATE items SET equip_slot = 0 WHERE id = ?')
      .run(existing.id);
  }

  // Equip new item
  db.getDatabase()
    .prepare('UPDATE items SET equip_slot = ? WHERE id = ?')
    .run(slot, itemDbId);

  // Recalculate stats
  recalcStats(charId);
  return { success: true };
}

/**
 * Unequip an item
 */
function unequipItem(charId, equipSlot) {
  const item = db.getDatabase()
    .prepare('SELECT * FROM items WHERE char_id = ? AND equip_slot = ?')
    .get(charId, equipSlot);
  if (!item) return { success: false, msg: 'No item in slot' };

  db.getDatabase()
    .prepare('UPDATE items SET equip_slot = 0 WHERE id = ?')
    .run(item.id);

  recalcStats(charId);
  return { success: true };
}

/**
 * Sell item for gold
 */
function sellItem(charId, itemDbId, count = 1) {
  const item = db.getDatabase().prepare('SELECT * FROM items WHERE id = ? AND char_id = ?').get(itemDbId, charId);
  if (!item) return { success: false };
  if (item.equip_slot > 0) return { success: false, msg: 'Cannot sell equipped item' };

  const sellPrice = getItemSellPrice(item.item_id, item.quality) * Math.min(count, item.count);
  removeItem(itemDbId, count);

  // Add gold to character
  db.getDatabase()
    .prepare('UPDATE characters SET gold = gold + ? WHERE id = ?')
    .run(sellPrice, charId);

  return { success: true, gold: sellPrice };
}

/**
 * Recalculate character stats from equipped items
 */
const BASE_STATS = {
  1: { hp: 500, attack: 30, defence: 25, magicAttack: 10, magicDefence: 15 },
  2: { hp: 350, attack: 10, defence: 15, magicAttack: 35, magicDefence: 20 },
  3: { hp: 400, attack: 35, defence: 18, magicAttack: 8, magicDefence: 12 },
};
const STAT_GROWTH = {
  1: { hp: 80, attack: 8, defence: 5, magicAttack: 3, magicDefence: 3 },
  2: { hp: 50, attack: 3, defence: 3, magicAttack: 10, magicDefence: 5 },
  3: { hp: 60, attack: 10, defence: 4, magicAttack: 2, magicDefence: 3 },
};

function recalcStats(charId) {
  const char = db.getCharacterById(charId);
  if (!char) return;

  const job = char.job || char.camp || 1;
  const base = BASE_STATS[job] || BASE_STATS[1];
  const growth = STAT_GROWTH[job] || STAT_GROWTH[1];
  const level = char.grade || 1;

  let totalHp = base.hp + growth.hp * (level - 1);
  let totalAtk = base.attack + growth.attack * (level - 1);
  let totalDef = base.defence + growth.defence * (level - 1);
  let totalMAtk = base.magicAttack + growth.magicAttack * (level - 1);
  let totalMDef = base.magicDefence + growth.magicDefence * (level - 1);

  const equipped = getEquippedItems(charId);
  for (const item of equipped) {
    const attrs = JSON.parse(item.attrs || '{}');
    totalAtk  += (attrs.attack || 0) + item.enhance * 5;
    totalDef  += (attrs.defence || 0) + item.enhance * 3;
    totalHp   += (attrs.hp || 0) + item.enhance * 20;
    totalMAtk += (attrs.magicAttack || 0) + item.enhance * 4;
    totalMDef += (attrs.magicDefence || 0) + item.enhance * 2;
  }

  const fighting = totalAtk + totalDef + totalHp / 10 + totalMAtk + totalMDef;

  db.updateCharacter(charId, {
    attack: totalAtk,
    defence: totalDef,
    hp: totalHp,
    max_hp: totalHp,
    magic_attack: totalMAtk,
    magic_defence: totalMDef,
    fighting: Math.floor(fighting),
  });
}

/**
 * Handle bag info request
 */
function handleBagInfo(ws) {
  const charId = ws.session?.charId;
  if (!charId) return;

  const items = getItems(charId);
  sendBagInfo(ws, charId, items);
}

/**
 * Send full bag contents to client
 */
function sendBagInfo(ws, charId, items) {
  try {
    const body = encode('com.road.yishi.proto.item.BagInfoMsg', {
      items: items.map(i => ({
        dbId: i.id,
        itemId: i.item_id,
        slot: i.slot,
        count: i.count,
        enhance: i.enhance,
        quality: i.quality,
        bound: i.bound,
        equipSlot: i.equip_slot,
      })),
    });
    const pkt = buildPacket(OPCODES.S_BAG_INFO, body, charId);
    if (ws.readyState === 1) ws.send(pkt);
  } catch (e) {
    console.error('[INVENTORY] Failed to send bag info:', e.message);
  }
}

// ─── Helpers ─────────────────────────────
function isStackable(itemId) {
  // Items with id >= 100000 are consumables (stackable)
  return itemId >= 100000;
}

function getItemSellPrice(itemId, quality) {
  // Base sell price by quality
  const basePrice = [10, 50, 200, 500, 2000, 5000, 10000];
  return basePrice[quality] || 10;
}

/**
 * Give starter items to a new character
 */
function giveStarterItems(charId, job) {
  const weapons = {
    1: { id: 1001, attrs: { attack: 25, hp: 50 } },
    2: { id: 1002, attrs: { magicAttack: 30, hp: 30 } },
    3: { id: 1003, attrs: { attack: 28, hp: 40 } },
  };
  const weapon = weapons[job] || weapons[1];

  const w = addItem(charId, weapon.id, 1, QUALITY.GREEN, 0);
  if (w) {
    db.getDatabase().prepare('UPDATE items SET attrs = ?, equip_slot = ? WHERE id = ?')
      .run(JSON.stringify(weapon.attrs), EQUIP_SLOT.WEAPON, w.id);
  }

  const armors = {
    1: { id: 2001, attrs: { defence: 20, hp: 100 } },
    2: { id: 2002, attrs: { magicDefence: 25, hp: 60 } },
    3: { id: 2003, attrs: { defence: 15, hp: 80 } },
  };
  const armor = armors[job] || armors[1];
  const a = addItem(charId, armor.id, 1, QUALITY.GREEN, 0);
  if (a) {
    db.getDatabase().prepare('UPDATE items SET attrs = ?, equip_slot = ? WHERE id = ?')
      .run(JSON.stringify(armor.attrs), EQUIP_SLOT.ARMOR, a.id);
  }

  addItem(charId, 100001, 20, QUALITY.WHITE);
  addItem(charId, 100002, 10, QUALITY.WHITE);
  addItem(charId, 100003, 5, QUALITY.WHITE);
}

module.exports = {
  OPCODES, EQUIP_SLOT, QUALITY,
  initDB,
  getItems, getEquippedItems,
  addItem, removeItem,
  equipItem, unequipItem, sellItem,
  recalcStats, handleBagInfo,
  giveStarterItems,
};
