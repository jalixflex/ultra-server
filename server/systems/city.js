'use strict';

const db = require('../db');

const OPCODES = {
  C_CITY_INFO:      0x6100,
  S_CITY_INFO:      0x6110,
  C_CITY_UPGRADE:   0x6101,
  S_CITY_UPGRADE:   0x6111,
  C_CITY_COLLECT:   0x6102,
  S_CITY_COLLECT:   0x6112,
};

const BUILDINGS = [
  {
    id: 'townhall', name: 'Town Hall', maxLevel: 80,
    desc: 'Central building. Level caps all other buildings.',
    goldCost: l => 200 * l * l,
    timeSec: l => 10 * l,
    effect: l => ({ buildingCap: l }),
  },
  {
    id: 'barracks', name: 'Barracks', maxLevel: 80,
    desc: 'Recruit and upgrade troops.',
    goldCost: l => 150 * l * l,
    timeSec: l => 8 * l,
    unlockLevel: 1,
    effect: l => ({ troopTypes: Math.min(1 + Math.floor(l / 10), 8) }),
  },
  {
    id: 'cottage', name: 'Cottage', maxLevel: 80,
    desc: 'Increases troop population cap.',
    goldCost: l => 120 * l * l,
    timeSec: l => 6 * l,
    unlockLevel: 1,
    effect: l => ({ troopCap: 50 + l * 10 }),
  },
  {
    id: 'gold_refinery', name: 'Gold Refinery', maxLevel: 80,
    desc: 'Produces gold over time.',
    goldCost: l => 100 * l * l,
    timeSec: l => 5 * l,
    unlockLevel: 5,
    effect: l => ({ goldPerHour: 50 * l }),
  },
  {
    id: 'warehouse', name: 'Warehouse', maxLevel: 80,
    desc: 'Stores gold. Production stops when full.',
    goldCost: l => 80 * l * l,
    timeSec: l => 4 * l,
    unlockLevel: 5,
    effect: l => ({ goldCap: 5000 + l * 2000 }),
  },
  {
    id: 'academy_building', name: 'Academy', maxLevel: 80,
    desc: 'Research technologies for stat boosts.',
    goldCost: l => 200 * l * l,
    timeSec: l => 12 * l,
    unlockLevel: 18,
    effect: l => ({ techSlots: Math.min(1 + Math.floor(l / 5), 13) }),
  },
  {
    id: 'farm_building', name: 'Farm', maxLevel: 40,
    desc: 'Plant seeds, harvest resources.',
    goldCost: l => 60 * l * l,
    timeSec: l => 3 * l,
    unlockLevel: 11,
    effect: l => ({ plots: Math.min(3 + Math.floor(l / 5), 9) }),
  },
  {
    id: 'market', name: 'Market', maxLevel: 80,
    desc: 'Trade resources and buy items at reduced prices.',
    goldCost: l => 90 * l * l,
    timeSec: l => 5 * l,
    unlockLevel: 3,
    effect: l => ({ shopDiscount: Math.min(l, 30), tradeSlots: Math.min(1 + Math.floor(l / 10), 6) }),
  },
  {
    id: 'tower', name: 'Tower', maxLevel: 80,
    desc: 'Watchtower for city defense and scouting.',
    goldCost: l => 160 * l * l,
    timeSec: l => 8 * l,
    unlockLevel: 10,
    effect: l => ({ scoutRange: l, cityDefence: l * 50 }),
  },
  {
    id: 'arena_building', name: 'Arena', maxLevel: 80,
    desc: 'Unlock arena features and increase daily attempts.',
    goldCost: l => 140 * l * l,
    timeSec: l => 7 * l,
    unlockLevel: 13,
    effect: l => ({ arenaAttempts: 5 + Math.floor(l / 10) }),
  },
];

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS city_buildings (
      char_id      INTEGER NOT NULL REFERENCES characters(id),
      building_id  TEXT NOT NULL,
      level        INTEGER DEFAULT 1,
      last_collect INTEGER DEFAULT 0,
      upgrading_until INTEGER DEFAULT 0,
      PRIMARY KEY (char_id, building_id)
    );
  `);
}

function ensureBuildings(charId) {
  const char = db.getCharacterById(charId);
  if (!char) return;
  for (const b of BUILDINGS) {
    if (b.unlockLevel && char.grade < b.unlockLevel) continue;
    db.getDatabase().prepare(`
      INSERT OR IGNORE INTO city_buildings (char_id, building_id) VALUES (?, ?)
    `).run(charId, b.id);
  }
}

function getCityInfo(charId) {
  ensureBuildings(charId);
  const rows = db.getDatabase()
    .prepare('SELECT * FROM city_buildings WHERE char_id = ?')
    .all(charId);

  const now = Math.floor(Date.now() / 1000);
  return rows.map(r => {
    const b = BUILDINGS.find(bb => bb.id === r.building_id);
    if (!b) return null;
    const upgrading = r.upgrading_until > now;
    const nextCost = r.level < b.maxLevel ? b.goldCost(r.level + 1) : null;
    return {
      id: b.id,
      name: b.name,
      level: r.level,
      maxLevel: b.maxLevel,
      upgrading,
      upgradeTimeLeft: upgrading ? r.upgrading_until - now : 0,
      nextCost,
      effect: b.effect(r.level),
      desc: b.desc,
    };
  }).filter(Boolean);
}

function upgradeBuilding(charId, buildingId) {
  ensureBuildings(charId);
  const b = BUILDINGS.find(bb => bb.id === buildingId);
  if (!b) return { success: false, msg: 'Unknown building' };

  const row = db.getDatabase()
    .prepare('SELECT * FROM city_buildings WHERE char_id = ? AND building_id = ?')
    .get(charId, buildingId);
  if (!row) return { success: false, msg: 'Building not unlocked' };

  if (row.level >= b.maxLevel) return { success: false, msg: 'Max level' };

  const now = Math.floor(Date.now() / 1000);
  if (row.upgrading_until > now) return { success: false, msg: 'Already upgrading' };

  // Town Hall level caps other buildings
  if (buildingId !== 'townhall') {
    const th = db.getDatabase()
      .prepare('SELECT level FROM city_buildings WHERE char_id = ? AND building_id = ?')
      .get(charId, 'townhall');
    if (th && row.level >= th.level) {
      return { success: false, msg: 'Upgrade Town Hall first' };
    }
  }

  const cost = b.goldCost(row.level + 1);
  const char = db.getCharacterById(charId);
  if (char.gold < cost) return { success: false, msg: 'Not enough gold' };

  db.updateCharacter(charId, { gold: char.gold - cost });

  const time = b.timeSec(row.level + 1);
  const until = now + time;

  // Instant upgrade for now (can add timer later)
  db.getDatabase().prepare(`
    UPDATE city_buildings SET level = level + 1, upgrading_until = 0
    WHERE char_id = ? AND building_id = ?
  `).run(charId, buildingId);

  return { success: true, building: buildingId, level: row.level + 1, effect: b.effect(row.level + 1) };
}

function collectGold(charId) {
  ensureBuildings(charId);
  const row = db.getDatabase()
    .prepare('SELECT * FROM city_buildings WHERE char_id = ? AND building_id = ?')
    .get(charId, 'gold_refinery');
  if (!row) return { success: false, msg: 'No gold refinery' };

  const now = Math.floor(Date.now() / 1000);
  const lastCollect = row.last_collect || now - 3600;
  const hours = Math.min((now - lastCollect) / 3600, 12);
  const goldPerHour = 50 * row.level;
  const amount = Math.floor(goldPerHour * hours);

  if (amount < 1) return { success: false, msg: 'Nothing to collect yet' };

  // Check warehouse cap
  const wh = db.getDatabase()
    .prepare('SELECT level FROM city_buildings WHERE char_id = ? AND building_id = ?')
    .get(charId, 'warehouse');
  const cap = wh ? 5000 + wh.level * 2000 : 10000;

  const char = db.getCharacterById(charId);
  const actual = Math.min(amount, cap);

  db.getDatabase().prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').run(actual, charId);
  db.getDatabase().prepare('UPDATE city_buildings SET last_collect = ? WHERE char_id = ? AND building_id = ?').run(now, charId, 'gold_refinery');

  return { success: true, gold: actual, hours: Math.floor(hours) };
}

module.exports = {
  OPCODES, BUILDINGS,
  initDB, getCityInfo, upgradeBuilding, collectGold,
};
