/**
 * Wartune Ultra — Troops / Army System
 * Troops fight alongside the player in battle.
 * Trained in Barracks, limited by Cottage population.
 */

'use strict';

const db = require('../db');

const OPCODES = {
  C_TROOP_LIST:     0x4650,  // 18000
  S_TROOP_LIST:     0x10C0,  // 4288
  C_TROOP_RECRUIT:  0x4651,  // 18001
  S_TROOP_RECRUIT:  0x10C1,  // 4289
  C_TROOP_UPGRADE:  0x4652,  // 18002
  S_TROOP_UPGRADE:  0x10C2,  // 4290
  C_TROOP_EQUIP:    0x4653,  // 18003
};

const TROOP_TYPES = [
  { id: 1, name: 'Lancer',     type: 'melee',  baseAtk: 20, baseDef: 15, baseHp: 200, unlockLevel: 1,  goldCost: 100 },
  { id: 2, name: 'Hunter',     type: 'ranged', baseAtk: 25, baseDef: 10, baseHp: 150, unlockLevel: 5,  goldCost: 200 },
  { id: 3, name: 'Priest',     type: 'magic',  baseAtk: 15, baseDef: 12, baseHp: 180, unlockLevel: 10, goldCost: 300 },
  { id: 4, name: 'Knight',     type: 'melee',  baseAtk: 35, baseDef: 25, baseHp: 350, unlockLevel: 20, goldCost: 500 },
  { id: 5, name: 'Warlock',    type: 'magic',  baseAtk: 40, baseDef: 15, baseHp: 250, unlockLevel: 25, goldCost: 600 },
  { id: 6, name: 'Paladin',    type: 'melee',  baseAtk: 50, baseDef: 40, baseHp: 500, unlockLevel: 35, goldCost: 1000 },
  { id: 7, name: 'Angel',      type: 'magic',  baseAtk: 60, baseDef: 30, baseHp: 400, unlockLevel: 45, goldCost: 1500 },
  { id: 8, name: 'Gryphon',    type: 'ranged', baseAtk: 70, baseDef: 35, baseHp: 450, unlockLevel: 55, goldCost: 2000 },
];

function initDB() {
  const dbInst = db.getDatabase();
  dbInst.exec(`
    CREATE TABLE IF NOT EXISTS troops (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id     INTEGER NOT NULL REFERENCES characters(id),
      type_id     INTEGER NOT NULL,
      level       INTEGER DEFAULT 1,
      count       INTEGER DEFAULT 50,
      equipped    INTEGER DEFAULT 0,
      created_at  TEXT DEFAULT (datetime('now')),
      UNIQUE(char_id, type_id)
    );
    CREATE INDEX IF NOT EXISTS idx_troops_char ON troops(char_id);
  `);
}

function getTroops(charId) {
  return db.getDatabase()
    .prepare('SELECT * FROM troops WHERE char_id = ? ORDER BY equipped DESC, type_id')
    .all(charId)
    .map(r => {
      const t = TROOP_TYPES.find(tt => tt.id === r.type_id) || TROOP_TYPES[0];
      const mul = 1 + (r.level - 1) * 0.12;
      return {
        id: r.id, typeId: r.type_id, name: t.name, type: t.type,
        level: r.level, count: r.count, equipped: r.equipped === 1,
        attack: Math.floor(t.baseAtk * mul),
        defence: Math.floor(t.baseDef * mul),
        hp: Math.floor(t.baseHp * mul),
      };
    });
}

function recruitTroop(charId, typeId, count = 50) {
  const char = db.getCharacterById(charId);
  if (!char) return { success: false };

  const t = TROOP_TYPES.find(tt => tt.id === typeId);
  if (!t) return { success: false, msg: 'Unknown troop type' };
  if (char.grade < t.unlockLevel) return { success: false, msg: `Level ${t.unlockLevel} required` };

  const totalCost = t.goldCost * count;
  if (char.gold < totalCost) return { success: false, msg: 'Not enough gold' };

  db.updateCharacter(charId, { gold: char.gold - totalCost });

  // Upsert
  db.getDatabase().prepare(`
    INSERT INTO troops (char_id, type_id, count) VALUES (?, ?, ?)
    ON CONFLICT(char_id, type_id) DO UPDATE SET count = count + excluded.count
  `).run(charId, typeId, count);

  return { success: true };
}

function equipTroop(charId, troopId) {
  db.getDatabase().prepare('UPDATE troops SET equipped = 0 WHERE char_id = ?').run(charId);
  db.getDatabase().prepare('UPDATE troops SET equipped = 1 WHERE id = ? AND char_id = ?').run(troopId, charId);
  recalcTroopStats(charId);
  return { success: true };
}

function upgradeTroop(charId, typeId) {
  const troop = db.getDatabase()
    .prepare('SELECT * FROM troops WHERE char_id = ? AND type_id = ?')
    .get(charId, typeId);
  if (!troop) return { success: false };

  const char = db.getCharacterById(charId);
  const cost = troop.level * 1000;
  if (char.gold < cost) return { success: false, msg: 'Not enough gold' };

  db.updateCharacter(charId, { gold: char.gold - cost });
  db.getDatabase()
    .prepare('UPDATE troops SET level = level + 1 WHERE char_id = ? AND type_id = ?')
    .run(charId, typeId);

  if (troop.equipped) recalcTroopStats(charId);
  return { success: true, level: troop.level + 1 };
}

function recalcTroopStats(charId) {
  const eq = getTroops(charId).find(t => t.equipped);
  db.setPlayerData(charId, 'troop_bonuses', eq
    ? { attack: eq.attack, defence: eq.defence, hp: eq.hp * Math.min(eq.count, 100) / 100, count: eq.count }
    : {}
  );
}

function giveStarterTroop(charId) {
  recruitTroop(charId, 1, 50); // 50 Lancers
}

module.exports = {
  OPCODES, TROOP_TYPES,
  initDB,
  getTroops, recruitTroop, equipTroop, upgradeTroop,
  recalcTroopStats, giveStarterTroop,
};
