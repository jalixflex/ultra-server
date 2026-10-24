/**
 * Wartune Ultra — VIP System
 */

'use strict';

const db = require('../db');

const OPCODES = {
  C_VIP_INFO:     0x32C8,  // 13000
  S_VIP_INFO:     0x1080,  // 4224
  C_VIP_REWARDS:  0x32C9,  // 13001
  S_VIP_REWARDS:  0x1081,  // 4225
};

// VIP levels: balens required and bonuses
const VIP_LEVELS = [
  { level: 0, balensReq: 0,     expBonus: 0,   goldBonus: 0,   extraStamina: 0 },
  { level: 1, balensReq: 100,   expBonus: 5,   goldBonus: 5,   extraStamina: 20 },
  { level: 2, balensReq: 500,   expBonus: 10,  goldBonus: 10,  extraStamina: 40 },
  { level: 3, balensReq: 1000,  expBonus: 15,  goldBonus: 15,  extraStamina: 60 },
  { level: 4, balensReq: 2000,  expBonus: 20,  goldBonus: 20,  extraStamina: 80 },
  { level: 5, balensReq: 5000,  expBonus: 25,  goldBonus: 25,  extraStamina: 100 },
  { level: 6, balensReq: 10000, expBonus: 30,  goldBonus: 30,  extraStamina: 120 },
  { level: 7, balensReq: 20000, expBonus: 35,  goldBonus: 35,  extraStamina: 140 },
  { level: 8, balensReq: 50000, expBonus: 40,  goldBonus: 40,  extraStamina: 160 },
  { level: 9, balensReq: 100000,expBonus: 50,  goldBonus: 50,  extraStamina: 200 },
];

function getVipInfo(charId) {
  const char = db.getCharacterById(charId);
  if (!char) return null;

  const level = char.vip_level || 0;
  const vipData = VIP_LEVELS[level] || VIP_LEVELS[0];
  const nextLevel = VIP_LEVELS[level + 1] || null;

  return {
    level,
    ...vipData,
    nextBalensReq: nextLevel ? nextLevel.balensReq : null,
  };
}

function addVipExp(charId, balensSpent) {
  // VIP exp is based on total balens spent
  const totalSpent = (db.getPlayerData(charId, 'vip_balens_total') || 0) + balensSpent;
  db.setPlayerData(charId, 'vip_balens_total', totalSpent);

  // Check for level up
  let newLevel = 0;
  for (const vl of VIP_LEVELS) {
    if (totalSpent >= vl.balensReq) newLevel = vl.level;
  }

  const char = db.getCharacterById(charId);
  if (char && newLevel > char.vip_level) {
    db.updateCharacter(charId, { vip_level: newLevel });
    return { levelUp: true, newLevel };
  }
  return { levelUp: false, level: char ? char.vip_level : 0 };
}

module.exports = { OPCODES, VIP_LEVELS, getVipInfo, addVipExp };
