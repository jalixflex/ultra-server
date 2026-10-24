'use strict';

const db = require('../db');

const OPCODES = {
  C_TITLE_LIST:      0x9910,
  S_TITLE_LIST:      0x9911,
  C_EQUIP_TITLE:     0x9912,
  S_EQUIP_TITLE_RSP: 0x9913,
};

const TITLES = [
  { id: 1, name: 'Acemi Savaşçı', desc: 'Seviye 10\'a ulaş', minLevel: 10, stats: { attack: 5, hp: 50 } },
  { id: 2, name: 'Deneyimli', desc: 'Seviye 20\'ye ulaş', minLevel: 20, stats: { attack: 10, defence: 5, hp: 100 } },
  { id: 3, name: 'Kıdemli Savaşçı', desc: 'Seviye 30\'a ulaş', minLevel: 30, stats: { attack: 20, defence: 10, hp: 200 } },
  { id: 4, name: 'Usta', desc: 'Seviye 40\'a ulaş', minLevel: 40, stats: { attack: 35, defence: 20, hp: 400 } },
  { id: 5, name: 'Efsane', desc: 'Seviye 50\'ye ulaş', minLevel: 50, stats: { attack: 50, defence: 30, hp: 600 } },
  { id: 6, name: 'Şampiyon', desc: 'Seviye 60\'a ulaş', minLevel: 60, stats: { attack: 70, defence: 40, hp: 800 } },
  { id: 7, name: 'Tanrısal', desc: 'Seviye 70\'e ulaş', minLevel: 70, stats: { attack: 100, defence: 60, hp: 1200 } },
  { id: 8, name: 'Ölümsüz', desc: 'Seviye 80\'e ulaş', minLevel: 80, stats: { attack: 150, defence: 80, hp: 2000 } },
  { id: 10, name: 'Arena Kralı', desc: '100 arena zaferi', requirement: { stat: 'arena_wins', count: 100 }, stats: { attack: 30, hp: 300 } },
  { id: 11, name: 'Boss Avcısı', desc: '50 boss öldür', requirement: { stat: 'bosses_killed', count: 50 }, stats: { attack: 40, hp: 500 } },
  { id: 12, name: 'Zengin', desc: '1M gold topla', requirement: { stat: 'gold_total', count: 1000000 }, stats: { hp: 1000 } },
  { id: 13, name: 'Lonca Lideri', desc: 'Lonca kur', requirement: { stat: 'guild_leader', count: 1 }, stats: { attack: 15, defence: 15 } },
  { id: 14, name: 'Koleksiyoncu', desc: '50 görev tamamla', requirement: { stat: 'quests_completed', count: 50 }, stats: { hp: 400, defence: 20 } },
  { id: 15, name: 'VIP Üye', desc: 'VIP 1+', requirement: { stat: 'vip_level', count: 1 }, stats: { attack: 10, hp: 200 } },
  { id: 16, name: 'Savaş Lordu', desc: '500 savaş kazan', requirement: { stat: 'battles_won', count: 500 }, stats: { attack: 60, defence: 30, hp: 800 } },
  { id: 17, name: 'Canavar Avcısı', desc: '1000 canavar öldür', requirement: { stat: 'monsters_killed', count: 1000 }, stats: { attack: 45, hp: 600 } },
  { id: 18, name: 'Kaşif', desc: 'Tüm kampanya bölümlerini bitir', requirement: { stat: 'campaigns_cleared', count: 8 }, stats: { attack: 80, defence: 50, hp: 1500 } },
];

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS player_titles (
      char_id   INTEGER NOT NULL REFERENCES characters(id),
      title_id  INTEGER NOT NULL,
      earned_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (char_id, title_id)
    );
    CREATE TABLE IF NOT EXISTS active_title (
      char_id  INTEGER PRIMARY KEY REFERENCES characters(id),
      title_id INTEGER NOT NULL DEFAULT 0
    );
  `);
}

function getTitles(charId) {
  const earned = db.getDatabase()
    .prepare('SELECT title_id FROM player_titles WHERE char_id = ?')
    .all(charId)
    .map(r => r.title_id);
  const activeRow = db.getDatabase()
    .prepare('SELECT title_id FROM active_title WHERE char_id = ?')
    .get(charId);
  const activeId = activeRow ? activeRow.title_id : 0;

  return TITLES.map(t => ({
    id: t.id,
    name: t.name,
    desc: t.desc,
    stats: t.stats,
    earned: earned.includes(t.id),
    active: t.id === activeId,
  }));
}

function equipTitle(charId, titleId) {
  if (titleId !== 0) {
    const earned = db.getDatabase()
      .prepare('SELECT 1 FROM player_titles WHERE char_id = ? AND title_id = ?')
      .get(charId, titleId);
    if (!earned) return { success: false, msg: 'Title not earned' };
  }

  db.getDatabase().prepare(`
    INSERT INTO active_title (char_id, title_id) VALUES (?, ?)
    ON CONFLICT(char_id) DO UPDATE SET title_id = excluded.title_id
  `).run(charId, titleId);

  try { require('./inventory').recalcStats(charId); } catch(e) {}

  const title = TITLES.find(t => t.id === titleId);
  return { success: true, titleId, name: title ? title.name : 'None', stats: title ? title.stats : {} };
}

function grantTitle(charId, titleId) {
  db.getDatabase().prepare(`
    INSERT OR IGNORE INTO player_titles (char_id, title_id) VALUES (?, ?)
  `).run(charId, titleId);
}

function checkNewTitles(charId) {
  const char = db.getCharacterById(charId);
  if (!char) return [];

  const newTitles = [];

  for (const t of TITLES) {
    const already = db.getDatabase()
      .prepare('SELECT 1 FROM player_titles WHERE char_id = ? AND title_id = ?')
      .get(charId, t.id);
    if (already) continue;

    let qualifies = false;

    if (t.minLevel && char.grade >= t.minLevel) {
      qualifies = true;
    }

    if (t.requirement) {
      const { stat, count } = t.requirement;
      if (stat === 'vip_level') {
        qualifies = (char.vip_level || 0) >= count;
      } else if (stat === 'guild_leader') {
        qualifies = (char.consortia_id || 0) > 0;
      } else {
        try {
          const achievement = require('./achievement');
          const val = achievement.getStat(charId, stat);
          qualifies = val >= count;
        } catch(e) {
          qualifies = false;
        }
      }
    }

    if (qualifies) {
      grantTitle(charId, t.id);
      newTitles.push({ id: t.id, name: t.name });
    }
  }

  return newTitles;
}

function getActiveTitleStats(charId) {
  const activeRow = db.getDatabase()
    .prepare('SELECT title_id FROM active_title WHERE char_id = ?')
    .get(charId);
  if (!activeRow || activeRow.title_id === 0) return {};
  const title = TITLES.find(t => t.id === activeRow.title_id);
  return title ? title.stats : {};
}

module.exports = {
  OPCODES, TITLES,
  initDB,
  getTitles, equipTitle, grantTitle, checkNewTitles, getActiveTitleStats,
};
