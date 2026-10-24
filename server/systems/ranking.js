'use strict';

const db = require('../db');

const OPCODES = {
  C_RANKING_LIST:   0x8100,
  S_RANKING_LIST:   0x8110,
  C_RANKING_DETAIL: 0x8101,
  S_RANKING_DETAIL: 0x8111,
};

const RANKING_TYPES = {
  BR:          { id: 1,  name: 'Battle Rating', query: 'SELECT id, name, grade, class, br FROM characters ORDER BY br DESC LIMIT 100' },
  LEVEL:       { id: 2,  name: 'Level',         query: 'SELECT id, name, grade, class, br FROM characters ORDER BY grade DESC, exp DESC LIMIT 100' },
  ARENA:       { id: 3,  name: 'Arena',         query: `SELECT c.id, c.name, c.grade, c.class, a.rating as score FROM characters c JOIN arena_data a ON c.id = a.char_id ORDER BY a.rating DESC LIMIT 100` },
  GUILD:       { id: 4,  name: 'Guild',         query: `SELECT id, name, level as score FROM guilds ORDER BY level DESC, wealth DESC LIMIT 100` },
  GOLD:        { id: 5,  name: 'Wealth',        query: 'SELECT id, name, grade, class, gold as score FROM characters ORDER BY gold DESC LIMIT 100' },
  MOUNT:       { id: 6,  name: 'Mount',         query: `SELECT c.id, c.name, c.grade, c.class, m.level as score FROM characters c JOIN mounts m ON c.id = m.char_id ORDER BY m.level DESC LIMIT 100` },
  SYLPH:       { id: 7,  name: 'Sylph',         query: `SELECT c.id, c.name, c.grade, c.class, s.level as score FROM characters c JOIN sylphs s ON c.id = s.char_id AND s.is_active = 1 ORDER BY s.level DESC LIMIT 100` },
  WINGS:       { id: 8,  name: 'Wings',         query: `SELECT c.id, c.name, c.grade, c.class, w.level as score FROM characters c JOIN wings w ON c.id = w.char_id ORDER BY w.level DESC LIMIT 100` },
  CAMPAIGN:    { id: 9,  name: 'Campaign',      query: `SELECT c.id, c.name, c.grade, c.class, cp.current_stage as score FROM characters c JOIN campaign_progress cp ON c.id = cp.char_id ORDER BY cp.current_stage DESC LIMIT 100` },
  ACHIEVEMENT: { id: 10, name: 'Achievement',   query: `SELECT c.id, c.name, c.grade, c.class, COUNT(a.id) as score FROM characters c LEFT JOIN achievements a ON c.id = a.char_id AND a.completed = 1 GROUP BY c.id ORDER BY score DESC LIMIT 100` },
};

function initDB() {
  // Rankings are computed from existing tables, no extra tables needed
}

function getRankingList(rankingType) {
  const rt = Object.values(RANKING_TYPES).find(r => r.id === rankingType);
  if (!rt) return { success: false, msg: 'Invalid ranking type' };

  try {
    const rows = db.getDatabase().prepare(rt.query).all();
    return {
      success: true,
      rankingType: rt.id,
      name: rt.name,
      entries: rows.map((r, idx) => ({
        rank: idx + 1,
        charId: r.id,
        name: r.name,
        level: r.grade || r.level || 0,
        className: r.class || '',
        score: r.br || r.score || r.gold || 0,
      })),
    };
  } catch (e) {
    return { success: true, rankingType: rt.id, name: rt.name, entries: [] };
  }
}

function getPlayerRank(charId, rankingType) {
  const result = getRankingList(rankingType);
  if (!result.success) return { success: false };
  const idx = result.entries.findIndex(e => e.charId === charId);
  return {
    success: true,
    rank: idx >= 0 ? idx + 1 : 0,
    total: result.entries.length,
  };
}

function getAllRankingTypes() {
  return {
    success: true,
    types: Object.values(RANKING_TYPES).map(r => ({ id: r.id, name: r.name })),
  };
}

module.exports = {
  OPCODES, RANKING_TYPES,
  initDB, getRankingList, getPlayerRank, getAllRankingTypes,
};
