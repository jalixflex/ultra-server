'use strict';

const db = require('../db');

const OPCODES = {
  C_RANKING_LIST:    0x8100,
  S_RANKING_LIST:    0x8110,
  C_RANKING_SELF:    0x8101,
  S_RANKING_SELF:    0x8111,
  C_RANKING_REWARDS: 0x8102,
  S_RANKING_REWARDS: 0x8112,
};

const CATEGORIES = {
  br:    { name: 'Battle Rating', column: 'battle_rating', table: 'characters', order: 'DESC' },
  level: { name: 'Level',         column: 'grade',         table: 'characters', order: 'DESC' },
  gold:  { name: 'Wealth',        column: 'gold',          table: 'characters', order: 'DESC' },
  arena: { name: 'Arena',         column: 'rank',          table: 'arena',      order: 'ASC' },
  guild: { name: 'Guild',         column: 'level',         table: 'guilds',     order: 'DESC', isGuild: true },
};

const TOP_REWARDS = {
  1:   { gold: 500000, boundBalens: 200, insignia: 500 },
  2:   { gold: 300000, boundBalens: 150, insignia: 350 },
  3:   { gold: 200000, boundBalens: 100, insignia: 250 },
  10:  { gold: 100000, boundBalens: 50,  insignia: 150 },
  50:  { gold: 50000,  boundBalens: 20,  insignia: 80 },
  100: { gold: 20000,  boundBalens: 10,  insignia: 40 },
};

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS ranking_rewards (
      char_id   INTEGER NOT NULL REFERENCES characters(id),
      category  TEXT NOT NULL,
      week      TEXT NOT NULL,
      rank_num  INTEGER DEFAULT 0,
      claimed   INTEGER DEFAULT 0,
      PRIMARY KEY(char_id, category, week)
    );
  `);
}

function getRankingList(category, limit) {
  const cat = CATEGORIES[category];
  if (!cat) return { success: false, msg: 'Invalid category' };
  limit = Math.min(limit || 100, 100);

  if (cat.isGuild) {
    const rows = db.getDatabase().prepare(
      `SELECT id, name, ${cat.column} as value FROM ${cat.table} ORDER BY ${cat.column} ${cat.order} LIMIT ?`
    ).all(limit);
    return { success: true, category, name: cat.name, rankings: rows.map((r, i) => ({ rank: i + 1, id: r.id, name: r.name, value: r.value })) };
  }

  const rows = db.getDatabase().prepare(
    `SELECT c.id, c.name, c.class, c.grade, ${cat.table === 'characters' ? 'c.' + cat.column : 'a.' + cat.column} as value
     FROM characters c ${cat.table !== 'characters' ? `LEFT JOIN ${cat.table} a ON a.char_id = c.id` : ''}
     ORDER BY value ${cat.order} LIMIT ?`
  ).all(limit);

  return { success: true, category, name: cat.name, rankings: rows.map((r, i) => ({ rank: i + 1, id: r.id, name: r.name, class: r.class, level: r.grade, value: r.value })) };
}

function getSelfRank(charId, category) {
  const cat = CATEGORIES[category];
  if (!cat || cat.isGuild) return { success: false, msg: 'Invalid category' };
  const char = db.getCharacterById(charId);
  if (!char) return { success: false, msg: 'Not found' };

  let value;
  if (cat.table === 'characters') { value = char[cat.column] || 0; }
  else {
    const r = db.getDatabase().prepare(`SELECT ${cat.column} as v FROM ${cat.table} WHERE char_id = ?`).get(charId);
    value = r ? r.v : 0;
  }
  const op = cat.order === 'DESC' ? '>' : '<';
  const c = db.getDatabase().prepare(
    cat.table === 'characters' ? `SELECT COUNT(*) as c FROM characters WHERE ${cat.column} ${op} ?` : `SELECT COUNT(*) as c FROM ${cat.table} WHERE ${cat.column} ${op} ?`
  ).get(value);
  return { success: true, category, rank: (c ? c.c : 0) + 1, value, name: char.name };
}

function claimRankingReward(charId, category) {
  const now = new Date();
  const week = `${now.getFullYear()}-W${String(Math.ceil(((now - new Date(now.getFullYear(),0,1))/86400000 + new Date(now.getFullYear(),0,1).getDay()+1)/7)).padStart(2,'0')}`;
  const row = db.getDatabase().prepare('SELECT * FROM ranking_rewards WHERE char_id = ? AND category = ? AND week = ?').get(charId, category, week);
  if (!row) return { success: false, msg: 'No reward available' };
  if (row.claimed) return { success: false, msg: 'Already claimed' };

  let reward = null;
  for (const [th, r] of Object.entries(TOP_REWARDS).sort((a,b) => Number(a[0]) - Number(b[0]))) {
    if (row.rank_num <= Number(th)) { reward = r; break; }
  }
  if (!reward) return { success: false, msg: 'No reward for your rank' };

  if (reward.gold) db.getDatabase().prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').run(reward.gold, charId);
  if (reward.boundBalens) db.getDatabase().prepare('UPDATE characters SET bound_balens = bound_balens + ? WHERE id = ?').run(reward.boundBalens, charId);
  if (reward.insignia) db.getDatabase().prepare('UPDATE characters SET insignia = insignia + ? WHERE id = ?').run(reward.insignia, charId);
  db.getDatabase().prepare('UPDATE ranking_rewards SET claimed = 1 WHERE char_id = ? AND category = ? AND week = ?').run(charId, category, week);
  return { success: true, rank: row.rank_num, reward };
}

module.exports = { OPCODES, CATEGORIES, TOP_REWARDS, initDB, getRankingList, getSelfRank, claimRankingReward };
