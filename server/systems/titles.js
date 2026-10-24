'use strict';

const db = require('../db');

const OPCODES = {
  C_TITLE_LIST:    0x9B00,
  S_TITLE_LIST:    0x9B10,
  C_EQUIP_TITLE:   0x9B01,
  S_EQUIP_TITLE:   0x9B11,
};

const TITLES = [
  { id: 1,  name: 'Acemi Savaşçı',      requirement: { type: 'level', value: 5 },    stats: { attack: 5, defence: 5 } },
  { id: 2,  name: 'Şehir Koruyucusu',    requirement: { type: 'level', value: 10 },   stats: { hp: 100, defence: 10 } },
  { id: 3,  name: 'Canavar Avcısı',      requirement: { type: 'kills', value: 100 },  stats: { attack: 15 } },
  { id: 4,  name: 'Lonca Savaşçısı',     requirement: { type: 'guild_level', value: 1 }, stats: { hp: 200 } },
  { id: 5,  name: 'Arena Şampiyonu',     requirement: { type: 'arena_wins', value: 50 }, stats: { attack: 20, hp: 150 } },
  { id: 6,  name: 'Altın Lord',           requirement: { type: 'gold_total', value: 1000000 }, stats: { defence: 20, magicDefence: 20 } },
  { id: 7,  name: 'Efsane Kahraman',     requirement: { type: 'level', value: 40 },   stats: { attack: 30, defence: 20, hp: 300 } },
  { id: 8,  name: 'Ejderha Efendisi',    requirement: { type: 'level', value: 60 },   stats: { attack: 50, magicAttack: 50, hp: 500 } },
  { id: 9,  name: 'Tanrıların Gazabı',   requirement: { type: 'level', value: 80 },   stats: { attack: 80, defence: 50, magicAttack: 80, magicDefence: 50, hp: 1000 } },
  { id: 10, name: 'Boss Katili',          requirement: { type: 'bosses_killed', value: 20 }, stats: { attack: 25, hp: 200 } },
  { id: 11, name: 'Görev Ustası',        requirement: { type: 'quests_completed', value: 30 }, stats: { hp: 300, defence: 15 } },
  { id: 12, name: 'Dungeon Fatihi',      requirement: { type: 'catacombs_floor', value: 50 }, stats: { attack: 40, magicAttack: 40 } },
  { id: 13, name: 'PvP Kralı',           requirement: { type: 'arena_wins', value: 200 }, stats: { attack: 60, hp: 400, defence: 30 } },
  { id: 14, name: 'Efsanevi Komutan',    requirement: { type: 'fighting', value: 50000 }, stats: { attack: 100, defence: 60, hp: 800 } },
  { id: 15, name: 'Ölümsüz',             requirement: { type: 'level', value: 100 },  stats: { attack: 120, defence: 80, magicAttack: 120, magicDefence: 80, hp: 2000 } },
];

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS player_titles (
      char_id   INTEGER NOT NULL REFERENCES characters(id),
      title_id  INTEGER NOT NULL,
      earned_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY(char_id, title_id)
    );
    CREATE TABLE IF NOT EXISTS equipped_title (
      char_id   INTEGER PRIMARY KEY REFERENCES characters(id),
      title_id  INTEGER DEFAULT 0
    );
  `);
}

function checkAndAwardTitles(charId) {
  const char = db.getCharacterById(charId);
  if (!char) return [];

  let stats = {};
  try {
    const achRows = db.getDatabase().prepare('SELECT stat_key, stat_value FROM achievement_stats WHERE char_id = ?').all(charId);
    for (const r of achRows) stats[r.stat_key] = r.stat_value;
  } catch (e) { /* achievement_stats may not exist yet */ }

  const earned = db.getDatabase().prepare('SELECT title_id FROM player_titles WHERE char_id = ?').all(charId).map(r => r.title_id);
  const newTitles = [];

  for (const t of TITLES) {
    if (earned.includes(t.id)) continue;
    const req = t.requirement;
    let met = false;

    switch (req.type) {
      case 'level':           met = char.grade >= req.value; break;
      case 'kills':           met = (stats.monsters_killed || 0) >= req.value; break;
      case 'guild_level':     met = char.consortia_id > 0; break;
      case 'arena_wins':      met = (stats.arena_wins || 0) >= req.value; break;
      case 'gold_total':      met = (stats.gold_total || 0) >= req.value; break;
      case 'bosses_killed':   met = (stats.bosses_killed || 0) >= req.value; break;
      case 'quests_completed': met = (stats.quests_completed || 0) >= req.value; break;
      case 'catacombs_floor': met = (stats.catacombs_floor || 0) >= req.value; break;
      case 'fighting':        met = (char.fighting || 0) >= req.value; break;
    }

    if (met) {
      db.getDatabase().prepare('INSERT OR IGNORE INTO player_titles (char_id, title_id) VALUES (?, ?)').run(charId, t.id);
      newTitles.push(t);
    }
  }
  return newTitles;
}

function getTitles(charId) {
  checkAndAwardTitles(charId);
  const earned = db.getDatabase().prepare('SELECT title_id, earned_at FROM player_titles WHERE char_id = ?').all(charId);
  const earnedIds = new Set(earned.map(r => r.title_id));
  const equippedRow = db.getDatabase().prepare('SELECT title_id FROM equipped_title WHERE char_id = ?').get(charId);
  const equippedId = equippedRow ? equippedRow.title_id : 0;

  return {
    equipped: equippedId,
    titles: TITLES.map(t => ({
      id: t.id,
      name: t.name,
      stats: t.stats,
      requirement: t.requirement,
      earned: earnedIds.has(t.id),
      active: t.id === equippedId,
    })),
  };
}

function equipTitle(charId, titleId) {
  if (titleId !== 0) {
    const has = db.getDatabase().prepare('SELECT title_id FROM player_titles WHERE char_id = ? AND title_id = ?').get(charId, titleId);
    if (!has) return { success: false, msg: 'Bu unvanı kazanmadınız' };
  }

  db.getDatabase().prepare('INSERT OR REPLACE INTO equipped_title (char_id, title_id) VALUES (?, ?)').run(charId, titleId);

  const inventory = require('./inventory');
  inventory.recalcStats(charId);

  return { success: true, titleId };
}

function getEquippedTitleStats(charId) {
  const row = db.getDatabase().prepare('SELECT title_id FROM equipped_title WHERE char_id = ?').get(charId);
  if (!row || row.title_id === 0) return {};
  const t = TITLES.find(tt => tt.id === row.title_id);
  return t ? t.stats : {};
}

module.exports = {
  OPCODES, TITLES,
  initDB,
  getTitles, equipTitle, checkAndAwardTitles, getEquippedTitleStats,
};
