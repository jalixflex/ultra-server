'use strict';

const db = require('../db');

const OPCODES = {
  C_RESIST_INFO:     0x7C00,
  S_RESIST_INFO_RSP: 0x7C10,
};

const ELEMENTS = ['fire', 'water', 'thunder', 'dark'];
const MAX_RESIST = 1000;
const RESIST_CAP_PCT = 80; // max 80% reduction
const RESIST_PER_POINT = 0.1; // each point = 0.1% reduction

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS resistance (
      char_id     INTEGER PRIMARY KEY REFERENCES characters(id),
      fire_res    INTEGER DEFAULT 0,
      water_res   INTEGER DEFAULT 0,
      thunder_res INTEGER DEFAULT 0,
      dark_res    INTEGER DEFAULT 0,
      fire_pen    INTEGER DEFAULT 0,
      water_pen   INTEGER DEFAULT 0,
      thunder_pen INTEGER DEFAULT 0,
      dark_pen    INTEGER DEFAULT 0,
      willpower   INTEGER DEFAULT 0
    );
  `);
}

function ensureEntry(charId) {
  db.getDatabase().prepare('INSERT OR IGNORE INTO resistance (char_id) VALUES (?)').run(charId);
}

function getResistInfo(charId) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM resistance WHERE char_id = ?').get(charId);

  const result = { elements: {}, willpower: row.willpower, willpowerReduction: Math.min(50, row.willpower * 0.05) };

  for (const el of ELEMENTS) {
    const res = row[`${el}_res`];
    const pen = row[`${el}_pen`];
    result.elements[el] = {
      resistance: res,
      penetration: pen,
      reductionPct: Math.min(RESIST_CAP_PCT, res * RESIST_PER_POINT),
    };
  }

  return result;
}

function addResist(charId, element, amount) {
  if (!ELEMENTS.includes(element)) return { success: false, msg: 'Invalid element' };
  ensureEntry(charId);

  const col = `${element}_res`;
  db.getDatabase().prepare(`UPDATE resistance SET ${col} = MIN(${col} + ?, ?) WHERE char_id = ?`)
    .run(amount, MAX_RESIST, charId);

  return { success: true, element, added: amount };
}

function addPenetration(charId, element, amount) {
  if (!ELEMENTS.includes(element)) return { success: false, msg: 'Invalid element' };
  ensureEntry(charId);

  const col = `${element}_pen`;
  db.getDatabase().prepare(`UPDATE resistance SET ${col} = MIN(${col} + ?, ?) WHERE char_id = ?`)
    .run(amount, MAX_RESIST, charId);

  return { success: true, element, added: amount };
}

function addWillpower(charId, amount) {
  ensureEntry(charId);
  db.getDatabase().prepare('UPDATE resistance SET willpower = MIN(willpower + ?, 1000) WHERE char_id = ?')
    .run(amount, charId);
  return { success: true };
}

function getResistReduction(charId, element) {
  if (!ELEMENTS.includes(element)) return 0;
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM resistance WHERE char_id = ?').get(charId);
  const res = row[`${element}_res`] || 0;
  return Math.min(RESIST_CAP_PCT, res * RESIST_PER_POINT);
}

function getEffectiveResist(attackerCharId, defenderCharId, element) {
  if (!ELEMENTS.includes(element)) return 0;
  ensureEntry(attackerCharId);
  ensureEntry(defenderCharId);

  const attacker = db.getDatabase().prepare('SELECT * FROM resistance WHERE char_id = ?').get(attackerCharId);
  const defender = db.getDatabase().prepare('SELECT * FROM resistance WHERE char_id = ?').get(defenderCharId);

  const defRes = defender[`${element}_res`] || 0;
  const atkPen = attacker[`${element}_pen`] || 0;
  const effective = Math.max(0, defRes - atkPen);

  return Math.min(RESIST_CAP_PCT, effective * RESIST_PER_POINT);
}

function getWillpower(charId) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT willpower FROM resistance WHERE char_id = ?').get(charId);
  return row ? row.willpower : 0;
}

function getWillpowerReduction(charId) {
  const wp = getWillpower(charId);
  return Math.min(50, wp * 0.05); // max 50% CC duration reduction
}

module.exports = {
  OPCODES, ELEMENTS, MAX_RESIST, RESIST_CAP_PCT, RESIST_PER_POINT,
  initDB,
  getResistInfo, addResist, addPenetration, addWillpower,
  getResistReduction, getEffectiveResist, getWillpower, getWillpowerReduction,
};
