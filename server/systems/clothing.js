'use strict';

const db = require('../db');

const OPCODES = {
  C_CLOTHING_LIST:       0x6C00,
  S_CLOTHING_LIST:       0x6C10,
  C_CLOTHING_EQUIP:      0x6C01,
  S_CLOTHING_UPDATE:     0x6C11,
  C_CLOTHING_UPGRADE:    0x6C02,
  C_CLOTHING_SYNTHESIZE: 0x6C03,
  C_CLOTHING_BUY:        0x6C04,
};

const SLOTS = ['head', 'body', 'weapon', 'wings'];

const SETS = {
  1: { name: 'Apprentice Set',       rarity: 'white',  hp: 200,  atk: 20,  def: 10,  cost: 0,      currency: 'free',   minLevel: 1  },
  2: { name: "Knight's Regalia",     rarity: 'green',  hp: 500,  atk: 50,  def: 25,  cost: 50000,  currency: 'gold',   minLevel: 15 },
  3: { name: 'Shadow Garb',          rarity: 'blue',   hp: 800,  atk: 80,  def: 30,  cost: 200,    currency: 'balens', minLevel: 25 },
  4: { name: 'Phoenix Attire',       rarity: 'blue',   hp: 1200, atk: 120, def: 60,  cost: 0,      currency: 'event',  minLevel: 35 },
  5: { name: 'Dragon Emperor',       rarity: 'purple', hp: 2000, atk: 200, def: 100, cost: 5000,   currency: 'guild',  minLevel: 45 },
  6: { name: 'Celestial Raiment',    rarity: 'purple', hp: 3000, atk: 300, def: 150, cost: 0,      currency: 'wb',     minLevel: 55 },
  7: { name: 'Abyssal Regalia',      rarity: 'orange', hp: 4000, atk: 400, def: 200, cost: 500,    currency: 'crypt',  minLevel: 65 },
  8: { name: 'Divine Transcendence', rarity: 'orange', hp: 6000, atk: 600, def: 300, cost: 0,      currency: 'class',  minLevel: 80 },
};

const MAX_STARS = 10;
const STAR_COST_BASE = 5000; // gold per star attempt

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS clothing (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id     INTEGER NOT NULL REFERENCES characters(id),
      set_id      INTEGER NOT NULL,
      slot        TEXT NOT NULL,
      stars       INTEGER DEFAULT 0,
      equipped    INTEGER DEFAULT 0,
      created_at  TEXT DEFAULT (datetime('now')),
      UNIQUE(char_id, set_id, slot)
    );
    CREATE TABLE IF NOT EXISTS clothing_equipped (
      char_id     INTEGER PRIMARY KEY REFERENCES characters(id),
      head_id     INTEGER DEFAULT 0,
      body_id     INTEGER DEFAULT 0,
      weapon_id   INTEGER DEFAULT 0,
      wings_id    INTEGER DEFAULT 0
    );
  `);
}

function ensureEquipRow(charId) {
  db.getDatabase().prepare('INSERT OR IGNORE INTO clothing_equipped (char_id) VALUES (?)').run(charId);
}

function getClothingList(charId) {
  ensureEquipRow(charId);
  const pieces = db.getDatabase()
    .prepare('SELECT * FROM clothing WHERE char_id = ? ORDER BY set_id, slot')
    .all(charId);

  const equipped = db.getDatabase()
    .prepare('SELECT * FROM clothing_equipped WHERE char_id = ?')
    .get(charId);

  const ownedSets = {};
  for (const p of pieces) {
    if (!ownedSets[p.set_id]) ownedSets[p.set_id] = [];
    ownedSets[p.set_id].push(p);
  }

  const result = [];
  for (const p of pieces) {
    const tmpl = SETS[p.set_id];
    const setComplete = ownedSets[p.set_id] && ownedSets[p.set_id].length === 4;
    const starMul = 1 + p.stars * 0.1;
    result.push({
      id: p.id,
      setId: p.set_id,
      setName: tmpl ? tmpl.name : 'Unknown',
      rarity: tmpl ? tmpl.rarity : 'white',
      slot: p.slot,
      stars: p.stars,
      equipped: p.equipped === 1,
      setComplete,
      bonusHp: tmpl ? Math.floor(tmpl.hp * starMul / 4) : 0,
      bonusAtk: tmpl ? Math.floor(tmpl.atk * starMul / 4) : 0,
      bonusDef: tmpl ? Math.floor(tmpl.def * starMul / 4) : 0,
    });
  }

  return {
    pieces: result,
    equipped: {
      headId: equipped ? equipped.head_id : 0,
      bodyId: equipped ? equipped.body_id : 0,
      weaponId: equipped ? equipped.weapon_id : 0,
      wingsId: equipped ? equipped.wings_id : 0,
    },
    sets: Object.entries(SETS).map(([id, s]) => ({
      setId: Number(id),
      name: s.name,
      rarity: s.rarity,
      hp: s.hp, atk: s.atk, def: s.def,
      minLevel: s.minLevel,
      currency: s.currency,
      cost: s.cost,
      owned: !!ownedSets[Number(id)],
      ownedCount: ownedSets[Number(id)] ? ownedSets[Number(id)].length : 0,
    })),
  };
}

function equipClothing(charId, clothingId) {
  ensureEquipRow(charId);
  const piece = db.getDatabase()
    .prepare('SELECT * FROM clothing WHERE id = ? AND char_id = ?')
    .get(clothingId, charId);
  if (!piece) return { success: false, msg: 'Clothing not found' };

  const slot = piece.slot;
  const col = slot + '_id';

  // Unequip current piece in that slot
  const current = db.getDatabase()
    .prepare('SELECT * FROM clothing_equipped WHERE char_id = ?')
    .get(charId);
  const currentId = current ? current[col] : 0;
  if (currentId > 0) {
    db.getDatabase().prepare('UPDATE clothing SET equipped = 0 WHERE id = ?').run(currentId);
  }

  // Equip new piece
  db.getDatabase().prepare('UPDATE clothing SET equipped = 1 WHERE id = ?').run(clothingId);
  db.getDatabase().prepare(`UPDATE clothing_equipped SET ${col} = ? WHERE char_id = ?`).run(clothingId, charId);

  return { success: true, slot, clothingId: piece.id, setId: piece.set_id };
}

function upgradeClothing(charId, clothingId) {
  const piece = db.getDatabase()
    .prepare('SELECT * FROM clothing WHERE id = ? AND char_id = ?')
    .get(clothingId, charId);
  if (!piece) return { success: false, msg: 'Clothing not found' };
  if (piece.stars >= MAX_STARS) return { success: false, msg: 'Already max stars' };

  const cost = STAR_COST_BASE * (piece.stars + 1);
  const char = db.getCharacterById(charId);
  if (!char || char.gold < cost) return { success: false, msg: 'Not enough gold' };

  db.getDatabase().prepare('UPDATE characters SET gold = gold - ? WHERE id = ?').run(cost, charId);

  // Success chance decreases with stars
  const chance = Math.max(0.2, 1.0 - piece.stars * 0.08);
  const success = Math.random() < chance;

  if (success) {
    const newStars = piece.stars + 1;
    db.getDatabase().prepare('UPDATE clothing SET stars = ? WHERE id = ?').run(newStars, clothingId);
    return { success: true, stars: newStars, cost, msg: 'Upgrade successful' };
  }

  return { success: false, stars: piece.stars, cost, msg: 'Upgrade failed, materials consumed' };
}

function synthesizeClothing(charId, materialIds) {
  if (!Array.isArray(materialIds) || materialIds.length < 2) {
    return { success: false, msg: 'Need at least 2 clothing pieces to synthesize' };
  }

  const pieces = [];
  for (const mid of materialIds) {
    const p = db.getDatabase()
      .prepare('SELECT * FROM clothing WHERE id = ? AND char_id = ? AND equipped = 0')
      .get(mid, charId);
    if (!p) return { success: false, msg: `Piece ${mid} not found or is equipped` };
    pieces.push(p);
  }

  // All materials must be same set
  const setId = pieces[0].set_id;
  if (!pieces.every(p => p.set_id === setId)) {
    return { success: false, msg: 'All pieces must be from the same set' };
  }

  // Synthesize into next tier set
  const nextSetId = setId + 1;
  if (!SETS[nextSetId]) return { success: false, msg: 'Already highest tier' };

  const char = db.getCharacterById(charId);
  if (char.grade < SETS[nextSetId].minLevel) {
    return { success: false, msg: `Level ${SETS[nextSetId].minLevel} required` };
  }

  // Remove materials
  for (const p of pieces) {
    db.getDatabase().prepare('DELETE FROM clothing WHERE id = ?').run(p.id);
  }

  // Grant a random piece from the next set
  const slot = SLOTS[Math.floor(Math.random() * SLOTS.length)];
  const result = db.getDatabase().prepare(`
    INSERT OR IGNORE INTO clothing (char_id, set_id, slot) VALUES (?, ?, ?)
  `).run(charId, nextSetId, slot);

  // If piece already existed, try another slot
  let grantedSlot = slot;
  if (result.changes === 0) {
    for (const s of SLOTS) {
      const r2 = db.getDatabase().prepare(`
        INSERT OR IGNORE INTO clothing (char_id, set_id, slot) VALUES (?, ?, ?)
      `).run(charId, nextSetId, s);
      if (r2.changes > 0) { grantedSlot = s; break; }
    }
  }

  return {
    success: true,
    newSetId: nextSetId,
    newSetName: SETS[nextSetId].name,
    slot: grantedSlot,
    materialsConsumed: materialIds.length,
  };
}

function buyClothing(charId, setId) {
  const tmpl = SETS[setId];
  if (!tmpl) return { success: false, msg: 'Unknown set' };
  if (tmpl.currency !== 'gold' && tmpl.currency !== 'balens') {
    return { success: false, msg: 'This set cannot be purchased directly' };
  }

  const char = db.getCharacterById(charId);
  if (!char) return { success: false };
  if (char.grade < tmpl.minLevel) return { success: false, msg: `Level ${tmpl.minLevel} required` };

  // Check if already owns full set
  const owned = db.getDatabase()
    .prepare('SELECT COUNT(*) as cnt FROM clothing WHERE char_id = ? AND set_id = ?')
    .get(charId, setId);
  if (owned.cnt >= 4) return { success: false, msg: 'Already own full set' };

  // Deduct cost
  if (tmpl.currency === 'gold') {
    if (char.gold < tmpl.cost) return { success: false, msg: 'Not enough gold' };
    db.getDatabase().prepare('UPDATE characters SET gold = gold - ? WHERE id = ?').run(tmpl.cost, charId);
  } else if (tmpl.currency === 'balens') {
    if (char.balens < tmpl.cost) return { success: false, msg: 'Not enough balens' };
    db.getDatabase().prepare('UPDATE characters SET balens = balens - ? WHERE id = ?').run(tmpl.cost, charId);
  }

  // Grant all missing pieces
  const granted = [];
  for (const slot of SLOTS) {
    const r = db.getDatabase().prepare(`
      INSERT OR IGNORE INTO clothing (char_id, set_id, slot) VALUES (?, ?, ?)
    `).run(charId, setId, slot);
    if (r.changes > 0) granted.push(slot);
  }

  return {
    success: true,
    setId,
    setName: tmpl.name,
    grantedPieces: granted,
    cost: tmpl.cost,
    currency: tmpl.currency,
  };
}

function getEquippedStats(charId) {
  ensureEquipRow(charId);
  const equipped = db.getDatabase()
    .prepare('SELECT * FROM clothing_equipped WHERE char_id = ?')
    .get(charId);
  if (!equipped) return { hp: 0, atk: 0, def: 0 };

  let totalHp = 0, totalAtk = 0, totalDef = 0;
  const ids = [equipped.head_id, equipped.body_id, equipped.weapon_id, equipped.wings_id];

  for (const pid of ids) {
    if (!pid) continue;
    const piece = db.getDatabase().prepare('SELECT * FROM clothing WHERE id = ?').get(pid);
    if (!piece) continue;
    const tmpl = SETS[piece.set_id];
    if (!tmpl) continue;
    const starMul = 1 + piece.stars * 0.1;
    totalHp += Math.floor(tmpl.hp * starMul / 4);
    totalAtk += Math.floor(tmpl.atk * starMul / 4);
    totalDef += Math.floor(tmpl.def * starMul / 4);
  }

  // Set bonus: if all 4 equipped pieces are from same set, +20% bonus
  const equippedPieces = ids.filter(id => id > 0).map(id =>
    db.getDatabase().prepare('SELECT set_id FROM clothing WHERE id = ?').get(id)
  ).filter(Boolean);

  if (equippedPieces.length === 4) {
    const allSame = equippedPieces.every(p => p.set_id === equippedPieces[0].set_id);
    if (allSame) {
      totalHp = Math.floor(totalHp * 1.2);
      totalAtk = Math.floor(totalAtk * 1.2);
      totalDef = Math.floor(totalDef * 1.2);
    }
  }

  return { hp: totalHp, atk: totalAtk, def: totalDef };
}

module.exports = {
  OPCODES, SETS, SLOTS, MAX_STARS,
  initDB,
  getClothingList, equipClothing, upgradeClothing,
  synthesizeClothing, buyClothing, getEquippedStats,
};
