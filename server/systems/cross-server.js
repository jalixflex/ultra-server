'use strict';

const db = require('../db');

const OPCODES = {
  C_CS_ARENA_INFO:      0x8800,
  S_CS_ARENA_INFO:      0x8810,
  C_CS_ARENA_MATCH:     0x8801,
  S_CS_ARENA_MATCH:     0x8811,
  C_CS_ARENA_COMPLETE:  0x8802,
  S_CS_ARENA_COMPLETE:  0x8812,
  C_CS_ARENA_RANKING:   0x8803,
  S_CS_ARENA_RANKING:   0x8813,
  C_CS_GW_INFO:         0x8804,
  S_CS_GW_INFO:         0x8814,
  C_CS_GW_RANKING:      0x8805,
  S_CS_GW_RANKING:      0x8815,
  C_CS_SEASON_REWARDS:  0x8806,
  S_CS_SEASON_REWARDS:  0x8816,
};

const BASE_RATING = 1000;
const K_FACTOR = 25;
const MIN_LEVEL = 50;
const DAILY_ATTEMPTS = 10;

const RATING_TIERS = [
  { name: 'Bronze',   min: 0,    max: 999,  reward: { gold: 50000,  balens: 50 } },
  { name: 'Silver',   min: 1000, max: 1199, reward: { gold: 100000, balens: 100 } },
  { name: 'Gold',     min: 1200, max: 1399, reward: { gold: 200000, balens: 200 } },
  { name: 'Platinum', min: 1400, max: 1599, reward: { gold: 350000, balens: 350 } },
  { name: 'Diamond',  min: 1600, max: 1799, reward: { gold: 500000, balens: 500 } },
  { name: 'Master',   min: 1800, max: 9999, reward: { gold: 800000, balens: 800 } },
];

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS cross_server_arena (
      char_id     INTEGER PRIMARY KEY REFERENCES characters(id),
      cs_rating   INTEGER DEFAULT ${BASE_RATING},
      cs_wins     INTEGER DEFAULT 0,
      cs_losses   INTEGER DEFAULT 0,
      season      INTEGER DEFAULT 1,
      attempts    INTEGER DEFAULT ${DAILY_ATTEMPTS},
      last_fight  TEXT DEFAULT (date('now'))
    );
    CREATE TABLE IF NOT EXISTS cross_server_guild_war (
      guild_id     INTEGER PRIMARY KEY,
      cs_gw_points INTEGER DEFAULT 0,
      cs_gw_rank   INTEGER DEFAULT 0,
      season       INTEGER DEFAULT 1
    );
  `);
}

function ensureArenaEntry(charId) {
  db.getDatabase().prepare('INSERT OR IGNORE INTO cross_server_arena (char_id) VALUES (?)').run(charId);
  const row = db.getDatabase().prepare('SELECT last_fight FROM cross_server_arena WHERE char_id = ?').get(charId);
  const today = new Date().toISOString().slice(0, 10);
  if (row && row.last_fight !== today) {
    db.getDatabase().prepare('UPDATE cross_server_arena SET attempts = ?, last_fight = ? WHERE char_id = ?')
      .run(DAILY_ATTEMPTS, today, charId);
  }
}

function getRatingTier(rating) {
  for (const tier of RATING_TIERS) {
    if (rating >= tier.min && rating <= tier.max) return tier;
  }
  return RATING_TIERS[0];
}

function getCsArenaInfo(charId) {
  const char = db.getCharacterById(charId);
  if (!char) return { success: false, msg: 'Character not found' };
  if (char.grade < MIN_LEVEL) return { success: false, msg: `Level ${MIN_LEVEL} required` };

  ensureArenaEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM cross_server_arena WHERE char_id = ?').get(charId);
  const tier = getRatingTier(row.cs_rating);

  return {
    success: true,
    rating: row.cs_rating,
    tier: tier.name,
    wins: row.cs_wins,
    losses: row.cs_losses,
    attempts: row.attempts,
    maxAttempts: DAILY_ATTEMPTS,
    season: row.season,
    seasonReward: tier.reward,
  };
}

function generateOpponent(charId, rating) {
  const variance = Math.floor(Math.random() * 200) - 100;
  const oppRating = Math.max(800, rating + variance);
  const oppFighting = 10000 + oppRating * 10 + Math.floor(Math.random() * 5000);
  return {
    id: 100000 + Math.floor(Math.random() * 99999),
    name: `Warrior_${Math.floor(Math.random() * 9999)}`,
    rating: oppRating,
    fighting: oppFighting,
    level: Math.min(80, 50 + Math.floor(oppRating / 100)),
    classType: Math.floor(Math.random() * 3) + 1,
  };
}

function startCsArenaMatch(charId) {
  const char = db.getCharacterById(charId);
  if (!char) return { success: false, msg: 'Character not found' };
  if (char.grade < MIN_LEVEL) return { success: false, msg: `Level ${MIN_LEVEL} required` };

  ensureArenaEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM cross_server_arena WHERE char_id = ?').get(charId);
  if (row.attempts <= 0) return { success: false, msg: 'No attempts left today' };

  const opponent = generateOpponent(charId, row.cs_rating);
  return { success: true, opponent, yourRating: row.cs_rating };
}

function completeCsArenaMatch(charId, won) {
  ensureArenaEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM cross_server_arena WHERE char_id = ?').get(charId);
  if (row.attempts <= 0) return { success: false, msg: 'No attempts left' };

  const ratingChange = won ? K_FACTOR : -K_FACTOR;
  const newRating = Math.max(0, row.cs_rating + ratingChange);

  if (won) {
    db.getDatabase().prepare(`
      UPDATE cross_server_arena SET cs_rating = ?, cs_wins = cs_wins + 1, attempts = attempts - 1 WHERE char_id = ?
    `).run(newRating, charId);
  } else {
    db.getDatabase().prepare(`
      UPDATE cross_server_arena SET cs_rating = ?, cs_losses = cs_losses + 1, attempts = attempts - 1 WHERE char_id = ?
    `).run(newRating, charId);
  }

  const tier = getRatingTier(newRating);
  return {
    success: true, won,
    oldRating: row.cs_rating, newRating, ratingChange,
    tier: tier.name,
    attemptsLeft: row.attempts - 1,
  };
}

function getCsArenaRanking(limit) {
  const rows = db.getDatabase().prepare(`
    SELECT csa.*, c.nick_name, c.grade, c.fighting
    FROM cross_server_arena csa
    JOIN characters c ON csa.char_id = c.id
    ORDER BY csa.cs_rating DESC LIMIT ?
  `).all(limit || 50);

  return {
    success: true,
    rankings: rows.map((r, i) => ({
      rank: i + 1,
      charId: r.char_id,
      name: r.nick_name,
      level: r.grade,
      fighting: r.fighting,
      rating: r.cs_rating,
      wins: r.cs_wins,
      losses: r.cs_losses,
      tier: getRatingTier(r.cs_rating).name,
    })),
  };
}

function ensureGuildWarEntry(guildId) {
  db.getDatabase().prepare('INSERT OR IGNORE INTO cross_server_guild_war (guild_id) VALUES (?)').run(guildId);
}

function getCsGuildWarInfo(guildId) {
  if (!guildId) return { success: false, msg: 'No guild' };
  ensureGuildWarEntry(guildId);
  const row = db.getDatabase().prepare('SELECT * FROM cross_server_guild_war WHERE guild_id = ?').get(guildId);

  return {
    success: true,
    guildId,
    points: row.cs_gw_points,
    rank: row.cs_gw_rank,
    season: row.season,
  };
}

function getCsGuildWarRanking(limit) {
  const rows = db.getDatabase().prepare(`
    SELECT csgw.*, g.name as guild_name, g.level as guild_level
    FROM cross_server_guild_war csgw
    JOIN guilds g ON csgw.guild_id = g.id
    ORDER BY csgw.cs_gw_points DESC LIMIT ?
  `).all(limit || 50);

  return {
    success: true,
    rankings: rows.map((r, i) => ({
      rank: i + 1,
      guildId: r.guild_id,
      guildName: r.guild_name,
      guildLevel: r.guild_level,
      points: r.cs_gw_points,
      season: r.season,
    })),
  };
}

function getSeasonRewards(charId) {
  ensureArenaEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM cross_server_arena WHERE char_id = ?').get(charId);
  const tier = getRatingTier(row.cs_rating);

  return {
    success: true,
    season: row.season,
    currentTier: tier.name,
    rating: row.cs_rating,
    reward: tier.reward,
    allTiers: RATING_TIERS.map(t => ({ name: t.name, minRating: t.min, reward: t.reward })),
  };
}

module.exports = {
  OPCODES, BASE_RATING, K_FACTOR, RATING_TIERS, MIN_LEVEL, DAILY_ATTEMPTS,
  initDB,
  getCsArenaInfo, startCsArenaMatch, completeCsArenaMatch, getCsArenaRanking,
  getCsGuildWarInfo, getCsGuildWarRanking, getSeasonRewards,
};
