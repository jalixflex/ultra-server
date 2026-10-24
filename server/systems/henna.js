'use strict';

const db = require('../db');

const OPCODES = {
  C_HENNA_INFO:    0x7D00,
  S_HENNA_INFO:    0x7D10,
  C_HENNA_APPLY:   0x7D01,
  S_HENNA_APPLY:   0x7D11,
  C_HENNA_REMOVE:  0x7D02,
  S_HENNA_REMOVE:  0x7D12,
};

const SLOTS = [
  { index: 0, unlockLevel: 30 },
  { index: 1, unlockLevel: 40 },
  { index: 2, unlockLevel: 50 },
  { index: 3, unlockLevel: 60 },
];

const HENNA_TYPES = {
  might:    { name: 'Might Henna',    stat: 'attack' },
  guard:    { name: 'Guard Henna',    stat: 'defence' },
  vitality: { name: 'Vitality Henna', stat: 'max_hp' },
  mystic:   { name: 'Mystic Henna',   stat: 'magic_attack' },
  ward:     { name: 'Ward Henna',     stat: 'magic_defence' },
  fortune:  { name: 'Fortune Henna',  stat: 'crit' },
};

const HENNA_GRADES = {
  common:    { name: 'Common',    value: 50,   goldCost: 5000 },
  uncommon:  { name: 'Uncommon',  value: 100,  goldCost: 15000 },
  rare:      { name: 'Rare',      value: 200,  goldCost: 40000 },
  epic:      { name: 'Epic',      value: 400,  goldCost: 100000 },
  legendary: { name: 'Legendary', value: 800,  goldCost: 250000 },
};

const DURATION_DAYS = 7;
const REMOVE_BALEN_COST = 20;

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS henna (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id    INTEGER NOT NULL REFERENCES characters(id),
      slot_index INTEGER NOT NULL,
      henna_type TEXT NOT NULL,
      grade      TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      UNIQUE(char_id, slot_index)
    );
  `);
}

function cleanExpired(charId) {
  const now = new Date().toISOString();
  db.getDatabase().prepare('DELETE FROM henna WHERE char_id = ? AND expires_at < ?').run(charId, now);
}

function getHennaInfo(charId) {
  cleanExpired(charId);
  const char = db.getCharacterById(charId);
  if (!char) return { slots: [] };

  const rows = db.getDatabase().prepare('SELECT * FROM henna WHERE char_id = ?').all(charId);
  const hennaMap = {};
  for (const r of rows) hennaMap[r.slot_index] = r;

  return {
    slots: SLOTS.map(s => {
      const unlocked = char.grade >= s.unlockLevel;
      const active = hennaMap[s.index];
      const ht = active ? HENNA_TYPES[active.henna_type] : null;
      const hg = active ? HENNA_GRADES[active.grade] : null;

      return {
        index: s.index,
        unlockLevel: s.unlockLevel,
        unlocked,
        active: !!active,
        hennaType: active ? active.henna_type : null,
        hennaName: ht ? ht.name : null,
        grade: active ? active.grade : null,
        gradeName: hg ? hg.name : null,
        stat: ht ? ht.stat : null,
        value: hg ? hg.value : 0,
        expiresAt: active ? active.expires_at : null,
      };
    }),
    removeCost: REMOVE_BALEN_COST,
    grades: Object.entries(HENNA_GRADES).map(([k, v]) => ({ id: k, ...v })),
    types: Object.entries(HENNA_TYPES).map(([k, v]) => ({ id: k, ...v })),
  };
}

function applyHenna(charId, slotIndex, hennaType, grade) {
  const char = db.getCharacterById(charId);
  if (!char) return { success: false };

  const slot = SLOTS.find(s => s.index === slotIndex);
  if (!slot) return { success: false, msg: 'Invalid slot' };
  if (char.grade < slot.unlockLevel) return { success: false, msg: `Level ${slot.unlockLevel} required` };

  const ht = HENNA_TYPES[hennaType];
  if (!ht) return { success: false, msg: 'Unknown henna type' };

  const hg = HENNA_GRADES[grade];
  if (!hg) return { success: false, msg: 'Unknown henna grade' };

  if (char.gold < hg.goldCost) return { success: false, msg: `Need ${hg.goldCost} gold` };

  // Remove existing henna in this slot
  db.getDatabase().prepare('DELETE FROM henna WHERE char_id = ? AND slot_index = ?').run(charId, slotIndex);

  // Deduct gold
  db.getDatabase().prepare('UPDATE characters SET gold = gold - ? WHERE id = ?').run(hg.goldCost, charId);

  // Apply new henna
  const expiresAt = new Date(Date.now() + DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.getDatabase().prepare(`
    INSERT INTO henna (char_id, slot_index, henna_type, grade, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(charId, slotIndex, hennaType, grade, expiresAt);

  return {
    success: true,
    slot: slotIndex,
    hennaName: ht.name,
    gradeName: hg.name,
    stat: ht.stat,
    value: hg.value,
    expiresAt,
    goldSpent: hg.goldCost,
  };
}

function removeHenna(charId, slotIndex) {
  const char = db.getCharacterById(charId);
  if (!char) return { success: false };

  const existing = db.getDatabase()
    .prepare('SELECT * FROM henna WHERE char_id = ? AND slot_index = ?')
    .get(charId, slotIndex);

  if (!existing) return { success: false, msg: 'No henna in this slot' };
  if (char.balens < REMOVE_BALEN_COST) return { success: false, msg: `Need ${REMOVE_BALEN_COST} balens to remove` };

  db.getDatabase().prepare('UPDATE characters SET balens = balens - ? WHERE id = ?').run(REMOVE_BALEN_COST, charId);
  db.getDatabase().prepare('DELETE FROM henna WHERE char_id = ? AND slot_index = ?').run(charId, slotIndex);

  return { success: true, balensSpent: REMOVE_BALEN_COST };
}

function getHennaBonuses(charId) {
  cleanExpired(charId);
  const bonuses = { attack: 0, defence: 0, max_hp: 0, magic_attack: 0, magic_defence: 0, crit: 0 };

  const rows = db.getDatabase().prepare('SELECT * FROM henna WHERE char_id = ?').all(charId);
  for (const r of rows) {
    const ht = HENNA_TYPES[r.henna_type];
    const hg = HENNA_GRADES[r.grade];
    if (ht && hg && bonuses[ht.stat] !== undefined) {
      bonuses[ht.stat] += hg.value;
    }
  }

  return bonuses;
}

module.exports = {
  OPCODES, SLOTS, HENNA_TYPES, HENNA_GRADES, DURATION_DAYS, REMOVE_BALEN_COST,
  initDB,
  getHennaInfo, applyHenna, removeHenna, getHennaBonuses,
};
