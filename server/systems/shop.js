/**
 * Wartune Ultra — Shop / Mall System
 */

'use strict';

const db = require('../db');
const inventory = require('./inventory');

const OPCODES = {
  C_SHOP_LIST:    0x2EE0,  // 12000
  S_SHOP_LIST:    0x1070,  // 4208
  C_SHOP_BUY:     0x2EE1,  // 12001
  S_SHOP_BUY_RSP: 0x1071,  // 4209
};

// Shop items catalog
const SHOP_ITEMS = [
  // Consumables
  { shopId: 1, itemId: 100001, name: 'HP Potion (Small)',    priceGold: 50,   priceBalens: 0, levelReq: 1 },
  { shopId: 2, itemId: 100002, name: 'MP Potion (Small)',    priceGold: 50,   priceBalens: 0, levelReq: 1 },
  { shopId: 3, itemId: 100003, name: 'HP Potion (Medium)',   priceGold: 200,  priceBalens: 0, levelReq: 10 },
  { shopId: 4, itemId: 100004, name: 'MP Potion (Medium)',   priceGold: 200,  priceBalens: 0, levelReq: 10 },
  { shopId: 5, itemId: 100005, name: 'HP Potion (Large)',    priceGold: 500,  priceBalens: 0, levelReq: 20 },
  { shopId: 6, itemId: 100010, name: 'EXP Scroll (+50%)',    priceGold: 0,    priceBalens: 50, levelReq: 5 },
  { shopId: 7, itemId: 100011, name: 'Stamina Refill',       priceGold: 0,    priceBalens: 20, levelReq: 1 },
  // Equipment
  { shopId: 10, itemId: 1010, name: 'Iron Sword',            priceGold: 1000, priceBalens: 0, levelReq: 1 },
  { shopId: 11, itemId: 1011, name: 'Steel Sword',           priceGold: 3000, priceBalens: 0, levelReq: 10 },
  { shopId: 12, itemId: 2010, name: 'Leather Armor',         priceGold: 800,  priceBalens: 0, levelReq: 1 },
  { shopId: 13, itemId: 2011, name: 'Chain Mail',            priceGold: 2500, priceBalens: 0, levelReq: 10 },
  // VIP items
  { shopId: 20, itemId: 100020, name: 'VIP Card (7 Days)',   priceGold: 0,    priceBalens: 200, levelReq: 1 },
  { shopId: 21, itemId: 100021, name: 'Bag Expansion +10',   priceGold: 0,    priceBalens: 100, levelReq: 1 },
];

function getShopList(playerLevel) {
  return SHOP_ITEMS.filter(item => playerLevel >= item.levelReq);
}

function buyItem(charId, shopId, count = 1) {
  const shopItem = SHOP_ITEMS.find(i => i.shopId === shopId);
  if (!shopItem) return { success: false, msg: 'Item not found in shop' };

  const char = db.getCharacterById(charId);
  if (!char) return { success: false, msg: 'Character not found' };

  if (char.grade < shopItem.levelReq) {
    return { success: false, msg: `Level ${shopItem.levelReq} required` };
  }

  const totalGold = shopItem.priceGold * count;
  const totalBalens = shopItem.priceBalens * count;

  if (totalGold > 0 && char.gold < totalGold) {
    return { success: false, msg: 'Not enough gold' };
  }
  if (totalBalens > 0 && char.balens < totalBalens) {
    return { success: false, msg: 'Not enough balens' };
  }

  // Deduct currency
  const updates = {};
  if (totalGold > 0) updates.gold = char.gold - totalGold;
  if (totalBalens > 0) updates.balens = char.balens - totalBalens;
  if (Object.keys(updates).length) db.updateCharacter(charId, updates);

  // Add item
  const result = inventory.addItem(charId, shopItem.itemId, count);
  if (!result) {
    // Refund if bag is full
    if (totalGold > 0) db.updateCharacter(charId, { gold: char.gold });
    if (totalBalens > 0) db.updateCharacter(charId, { balens: char.balens });
    return { success: false, msg: 'Bag is full' };
  }

  return { success: true, item: result, goldSpent: totalGold, balensSpent: totalBalens };
}

module.exports = {
  OPCODES, SHOP_ITEMS,
  getShopList, buyItem,
};
