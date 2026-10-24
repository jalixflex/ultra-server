'use strict';

const db = require('../db');

const OPCODES = {
  C_ACHIEVEMENT_LIST:   0x7E00,
  S_ACHIEVEMENT_LIST:   0x7E10,
  C_ACHIEVEMENT_CLAIM:  0x7E01,
  S_ACHIEVEMENT_CLAIM:  0x7E11,
};

const ACHIEVEMENTS = [
  { id: 1,  category: 'level',    name: 'First Steps',        desc: 'Reach Level 10',   condition: { type: 'level', value: 10 },  reward: { gold: 5000, exp: 1000 } },
  { id: 2,  category: 'level',    name: 'Adventurer',          desc: 'Reach Level 30',   condition: { type: 'level', value: 30 },  reward: { gold: 20000, exp: 5000 } },
  { id: 3,  category: 'level',    name: 'Veteran',             desc: 'Reach Level 50',   condition: { type: 'level', value: 50 },  reward: { gold: 50000, exp: 15000 } },
  { id: 4,  category: 'level',    name: 'Elite',               desc: 'Reach Level 70',   condition: { type: 'level', value: 70 },  reward: { gold: 100000, exp: 30000, boundBalens: 50 } },
  { id: 5,  category: 'level',    name: 'Legend',              desc: 'Reach Level 90',   condition: { type: 'level', value: 90 },  reward: { gold: 200000, exp: 60000, boundBalens: 100 } },
  { id: 6,  category: 'combat',   name: 'Arena Novice',        desc: 'Win 10 Arena fights',  condition: { type: 'arena_wins', value: 10 },  reward: { gold: 10000, insignia: 50 } },
  { id: 7,  category: 'combat',   name: 'Arena Master',        desc: 'Win 100 Arena fights', condition: { type: 'arena_wins', value: 100 }, reward: { gold: 50000, insignia: 200 } },
  { id: 8,  category: 'combat',   name: 'Arena Champion',      desc: 'Win 500 Arena fights', condition: { type: 'arena_wins', value: 500 }, reward: { gold: 150000, insignia: 500, boundBalens: 100 } },
  { id: 9,  category: 'combat',   name: 'World Boss Slayer',   desc: 'Deal 1M dmg to World Boss', condition: { type: 'wb_damage', value: 1000000 }, reward: { gold: 100000, exp: 50000 } },
  { id: 10, category: 'combat',   name: 'Campaign Hero',       desc: 'Clear Campaign 10',    condition: { type: 'campaign_stage', value: 10 }, reward: { gold: 30000, exp: 10000 } },
  { id: 11, category: 'social',   name: 'Friendly',            desc: 'Add 10 friends',       condition: { type: 'friends', value: 10 },   reward: { gold: 5000 } },
  { id: 12, category: 'social',   name: 'Popular',             desc: 'Add 50 friends',       condition: { type: 'friends', value: 50 },   reward: { gold: 20000, boundBalens: 20 } },
  { id: 13, category: 'social',   name: 'Guild Member',        desc: 'Join a guild',         condition: { type: 'guild_join', value: 1 },  reward: { gold: 5000 } },
  { id: 14, category: 'collect',  name: 'Gem Collector',       desc: 'Own 20 gems',          condition: { type: 'gems', value: 20 },      reward: { gold: 30000 } },
  { id: 15, category: 'collect',  name: 'Mount Collector',     desc: 'Own 5 mounts',         condition: { type: 'mounts', value: 5 },     reward: { gold: 50000, boundBalens: 50 } },
  { id: 16, category: 'collect',  name: 'Sylph Collector',     desc: 'Own 3 sylphs',         condition: { type: 'sylphs', value: 3 },     reward: { gold: 30000, boundBalens: 30 } },
  { id: 17, category: 'progress', name: 'Wing Awakening',      desc: 'Upgrade wings to Lv5', condition: { type: 'wing_level', value: 5 },  reward: { gold: 20000 } },
  { id: 18, category: 'progress', name: 'Forging Master',      desc: 'Forge item to +10',    condition: { type: 'forge_level', value: 10 }, reward: { gold: 50000, boundBalens: 30 } },
  { id: 19, category: 'progress', name: 'Astral Adept',        desc: 'Own 6 orange astrals', condition: { type: 'orange_astrals', value: 6 }, reward: { gold: 80000, boundBalens: 50 } },
  { id: 20, category: 'dungeon',  name: 'Catacombs Explorer',  desc: 'Clear Catacombs Floor 50', condition: { type: 'catacomb_floor', value: 50 }, reward: { gold: 60000, exp: 30000 } },
  { id: 21, category: 'dungeon',  name: 'Spire Climber',       desc: 'Clear Spire Floor 100', condition: { type: 'spire_floor', value: 100 }, reward: { gold: 100000, boundBalens: 80 } },
  { id: 22, category: 'progress', name: 'Class Mastery',       desc: 'Reach Class Advance 2', condition: { type: 'class_advance', value: 2 }, reward: { gold: 150000, boundBalens: 100 } },
  { id: 23, category: 'wealth',   name: 'Gold Hoarder',        desc: 'Accumulate 1M gold',    condition: { type: 'gold_total', value: 1000000 }, reward: { boundBalens: 50 } },
  { id: 24, category: 'wealth',   name: 'Devoted',             desc: 'Earn 500 devotion pts', condition: { type: 'devotion_total', value: 500 }, reward: { gold: 30000 } },
  { id: 25, category: 'combat',   name: 'Battle Royale',       desc: 'Win 50 battlegrounds',  condition: { type: 'bg_wins', value: 50 }, reward: { gold: 80000, insignia: 300 } },
];

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS achievements (
      char_id      INTEGER NOT NULL REFERENCES characters(id),
      achievement_id INTEGER NOT NULL,
      progress     INTEGER DEFAULT 0,
      completed    INTEGER DEFAULT 0,
      claimed      INTEGER DEFAULT 0,
      completed_at TEXT DEFAULT '',
      PRIMARY KEY(char_id, achievement_id)
    );
    CREATE TABLE IF NOT EXISTS achievement_stats (
      char_id        INTEGER PRIMARY KEY REFERENCES characters(id),
      arena_wins     INTEGER DEFAULT 0,
      wb_damage      INTEGER DEFAULT 0,
      bg_wins        INTEGER DEFAULT 0,
      devotion_total INTEGER DEFAULT 0,
      gold_total     INTEGER DEFAULT 0
    );
  `);
}

function ensureEntries(charId) {
  db.getDatabase().prepare('INSERT OR IGNORE INTO achievement_stats (char_id) VALUES (?)').run(charId);
  const stmt = db.getDatabase().prepare('INSERT OR IGNORE INTO achievements (char_id, achievement_id) VALUES (?, ?)');
  for (const a of ACHIEVEMENTS) {
    stmt.run(charId, a.id);
  }
}

function getProgress(charId, condType) {
  const char = db.getCharacterById(charId);
  if (!char) return 0;
  const stats = db.getDatabase().prepare('SELECT * FROM achievement_stats WHERE char_id = ?').get(charId);

  switch (condType) {
    case 'level': return char.grade || 0;
    case 'arena_wins': return stats?.arena_wins || 0;
    case 'wb_damage': return stats?.wb_damage || 0;
    case 'bg_wins': return stats?.bg_wins || 0;
    case 'campaign_stage': return char.campaign_stage || 0;
    case 'friends': {
      const r = db.getDatabase().prepare('SELECT COUNT(*) as c FROM friends WHERE char_id = ? AND status = 1').get(charId);
      return r?.c || 0;
    }
    case 'guild_join': return char.guild_id ? 1 : 0;
    case 'gems': {
      const r = db.getDatabase().prepare('SELECT COUNT(*) as c FROM gems WHERE char_id = ?').get(charId);
      return r?.c || 0;
    }
    case 'mounts': {
      const r = db.getDatabase().prepare('SELECT COUNT(*) as c FROM mounts WHERE char_id = ?').get(charId);
      return r?.c || 0;
    }
    case 'sylphs': {
      const r = db.getDatabase().prepare('SELECT COUNT(*) as c FROM sylphs WHERE char_id = ?').get(charId);
      return r?.c || 0;
    }
    case 'wing_level': {
      const r = db.getDatabase().prepare('SELECT level FROM wings WHERE char_id = ?').get(charId);
      return r?.level || 0;
    }
    case 'forge_level': {
      const r = db.getDatabase().prepare('SELECT MAX(enhance_level) as m FROM inventory WHERE char_id = ?').get(charId);
      return r?.m || 0;
    }
    case 'orange_astrals': {
      const r = db.getDatabase().prepare("SELECT COUNT(*) as c FROM astrals WHERE char_id = ? AND quality = 'orange'").get(charId);
      return r?.c || 0;
    }
    case 'catacomb_floor': {
      const r = db.getDatabase().prepare('SELECT MAX(floor_reached) as f FROM catacombs WHERE char_id = ?').get(charId);
      return r?.f || 0;
    }
    case 'spire_floor': {
      const r = db.getDatabase().prepare('SELECT MAX(floor_reached) as f FROM spire WHERE char_id = ?').get(charId);
      return r?.f || 0;
    }
    case 'class_advance': {
      const r = db.getDatabase().prepare('SELECT advance_level FROM class_advance WHERE char_id = ?').get(charId);
      return r?.advance_level || 0;
    }
    case 'gold_total': return stats?.gold_total || 0;
    case 'devotion_total': return stats?.devotion_total || 0;
    default: return 0;
  }
}

function getAchievementList(charId) {
  ensureEntries(charId);
  const rows = db.getDatabase().prepare('SELECT * FROM achievements WHERE char_id = ?').all(charId);
  const map = {};
  for (const r of rows) map[r.achievement_id] = r;

  return ACHIEVEMENTS.map(a => {
    const row = map[a.id] || {};
    const progress = getProgress(charId, a.condition.type);
    const completed = progress >= a.condition.value;

    if (completed && !row.completed) {
      db.getDatabase().prepare('UPDATE achievements SET completed = 1, progress = ?, completed_at = ? WHERE char_id = ? AND achievement_id = ?')
        .run(progress, new Date().toISOString(), charId, a.id);
    } else if (progress !== (row.progress || 0)) {
      db.getDatabase().prepare('UPDATE achievements SET progress = ? WHERE char_id = ? AND achievement_id = ?')
        .run(progress, charId, a.id);
    }

    return {
      id: a.id,
      category: a.category,
      name: a.name,
      desc: a.desc,
      progress,
      target: a.condition.value,
      completed: completed || !!row.completed,
      claimed: !!row.claimed,
      reward: a.reward,
    };
  });
}

function claimAchievement(charId, achievementId) {
  const ach = ACHIEVEMENTS.find(a => a.id === achievementId);
  if (!ach) return { success: false, msg: 'Invalid achievement' };

  ensureEntries(charId);
  const row = db.getDatabase().prepare('SELECT * FROM achievements WHERE char_id = ? AND achievement_id = ?').get(charId, achievementId);
  if (!row) return { success: false, msg: 'Achievement not found' };

  const progress = getProgress(charId, ach.condition.type);
  if (progress < ach.condition.value) return { success: false, msg: 'Not yet completed' };
  if (row.claimed) return { success: false, msg: 'Already claimed' };

  const r = ach.reward;
  if (r.gold) db.getDatabase().prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').run(r.gold, charId);
  if (r.exp) db.getDatabase().prepare('UPDATE characters SET exp = exp + ? WHERE id = ?').run(r.exp, charId);
  if (r.boundBalens) db.getDatabase().prepare('UPDATE characters SET bound_balens = bound_balens + ? WHERE id = ?').run(r.boundBalens, charId);
  if (r.insignia) db.getDatabase().prepare('UPDATE characters SET insignia = insignia + ? WHERE id = ?').run(r.insignia, charId);

  db.getDatabase().prepare('UPDATE achievements SET claimed = 1, completed = 1, progress = ? WHERE char_id = ? AND achievement_id = ?')
    .run(progress, charId, achievementId);

  return { success: true, achievementId, name: ach.name, reward: r };
}

function incrementStat(charId, statName, amount) {
  db.getDatabase().prepare('INSERT OR IGNORE INTO achievement_stats (char_id) VALUES (?)').run(charId);
  const col = ['arena_wins', 'wb_damage', 'bg_wins', 'devotion_total', 'gold_total'].includes(statName) ? statName : null;
  if (!col) return;
  db.getDatabase().prepare(`UPDATE achievement_stats SET ${col} = ${col} + ? WHERE char_id = ?`).run(amount, charId);
}

module.exports = {
  OPCODES, ACHIEVEMENTS,
  initDB,
  getAchievementList, claimAchievement, incrementStat,
};
