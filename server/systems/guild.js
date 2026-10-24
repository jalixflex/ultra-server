/**
 * Wartune Ultra — Guild (Consortia) System
 * Create, join, leave, manage guilds
 */

'use strict';

const { encode } = require('../proto');
const { buildPacket } = require('../packet');
const db = require('../db');

const OPCODES = {
  C_GUILD_CREATE:    0x1F40,  // 8000
  S_GUILD_CREATE_RSP:0x1030,  // 4144
  C_GUILD_LIST:      0x1F41,  // 8001
  S_GUILD_LIST:      0x1031,  // 4145
  C_GUILD_JOIN:      0x1F42,  // 8002
  S_GUILD_JOIN_RSP:  0x1032,  // 4146
  C_GUILD_LEAVE:     0x1F43,  // 8003
  S_GUILD_LEAVE_RSP: 0x1033,  // 4147
  C_GUILD_INFO:      0x1F44,  // 8004
  S_GUILD_INFO:      0x1034,  // 4148
  C_GUILD_MEMBERS:   0x1F45,  // 8005
  S_GUILD_MEMBERS:   0x1035,  // 4149
  C_GUILD_KICK:      0x1F46,  // 8006
  C_GUILD_PROMOTE:   0x1F47,  // 8007
  C_GUILD_DONATE:    0x1F48,  // 8008
  S_GUILD_DONATE_RSP:0x1036,  // 4150
};

const RANK = {
  MEMBER:     0,
  ELITE:      1,
  OFFICER:    2,
  VICE_LEAD:  3,
  LEADER:     4,
};

function initDB() {
  const dbInst = db.getDatabase();
  dbInst.exec(`
    CREATE TABLE IF NOT EXISTS guilds (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT UNIQUE NOT NULL,
      leader_id    INTEGER NOT NULL,
      level        INTEGER DEFAULT 1,
      exp          INTEGER DEFAULT 0,
      gold         INTEGER DEFAULT 0,
      notice       TEXT DEFAULT '',
      max_members  INTEGER DEFAULT 30,
      created_at   TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS guild_members (
      guild_id    INTEGER NOT NULL REFERENCES guilds(id),
      char_id     INTEGER NOT NULL REFERENCES characters(id),
      rank        INTEGER DEFAULT 0,
      donate_total INTEGER DEFAULT 0,
      joined_at   TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (guild_id, char_id)
    );
    CREATE INDEX IF NOT EXISTS idx_gm_char ON guild_members(char_id);
  `);
}

function createGuild(charId, guildName) {
  const char = db.getCharacterById(charId);
  if (!char) return { success: false, msg: 'Character not found' };

  // Check if already in a guild
  const existing = getPlayerGuild(charId);
  if (existing) return { success: false, msg: 'Already in a guild' };

  // Check gold (costs 1000 gold to create)
  if (char.gold < 1000) return { success: false, msg: 'Not enough gold' };

  // Check name
  if (!guildName || guildName.length < 2 || guildName.length > 20) {
    return { success: false, msg: 'Guild name must be 2-20 characters' };
  }

  const existingGuild = db.getDatabase().prepare('SELECT id FROM guilds WHERE name = ?').get(guildName);
  if (existingGuild) return { success: false, msg: 'Guild name already taken' };

  // Deduct gold
  db.updateCharacter(charId, { gold: char.gold - 1000 });

  // Create guild
  const result = db.getDatabase()
    .prepare('INSERT INTO guilds (name, leader_id) VALUES (?, ?)')
    .run(guildName, charId);
  const guildId = result.lastInsertRowid;

  // Add leader as member
  db.getDatabase()
    .prepare('INSERT INTO guild_members (guild_id, char_id, rank) VALUES (?, ?, ?)')
    .run(guildId, charId, RANK.LEADER);

  // Update character's consortia info
  db.updateCharacter(charId, { consortia_id: guildId });

  return { success: true, guildId };
}

function joinGuild(charId, guildId) {
  const existing = getPlayerGuild(charId);
  if (existing) return { success: false, msg: 'Already in a guild' };

  const guild = getGuild(guildId);
  if (!guild) return { success: false, msg: 'Guild not found' };

  const memberCount = getGuildMemberCount(guildId);
  if (memberCount >= guild.max_members) return { success: false, msg: 'Guild is full' };

  db.getDatabase()
    .prepare('INSERT INTO guild_members (guild_id, char_id, rank) VALUES (?, ?, ?)')
    .run(guildId, charId, RANK.MEMBER);

  db.updateCharacter(charId, { consortia_id: guildId });

  return { success: true };
}

function leaveGuild(charId) {
  const membership = getPlayerGuild(charId);
  if (!membership) return { success: false, msg: 'Not in a guild' };

  if (membership.rank === RANK.LEADER) {
    // Leader must transfer or disband
    const members = getGuildMembers(membership.guild_id);
    if (members.length > 1) {
      return { success: false, msg: 'Transfer leadership before leaving' };
    }
    // Last member — disband guild
    db.getDatabase().prepare('DELETE FROM guild_members WHERE guild_id = ?').run(membership.guild_id);
    db.getDatabase().prepare('DELETE FROM guilds WHERE id = ?').run(membership.guild_id);
  } else {
    db.getDatabase()
      .prepare('DELETE FROM guild_members WHERE guild_id = ? AND char_id = ?')
      .run(membership.guild_id, charId);
  }

  db.updateCharacter(charId, { consortia_id: 0 });
  return { success: true };
}

function kickMember(kickerId, targetId) {
  const kickerMem = getPlayerGuild(kickerId);
  const targetMem = getPlayerGuild(targetId);
  if (!kickerMem || !targetMem) return { success: false };
  if (kickerMem.guild_id !== targetMem.guild_id) return { success: false };
  if (kickerMem.rank <= targetMem.rank) return { success: false, msg: 'Insufficient rank' };

  db.getDatabase()
    .prepare('DELETE FROM guild_members WHERE guild_id = ? AND char_id = ?')
    .run(targetMem.guild_id, targetId);
  db.updateCharacter(targetId, { consortia_id: 0 });

  return { success: true };
}

function promoteMember(leaderId, targetId, newRank) {
  const leaderMem = getPlayerGuild(leaderId);
  const targetMem = getPlayerGuild(targetId);
  if (!leaderMem || !targetMem) return { success: false };
  if (leaderMem.guild_id !== targetMem.guild_id) return { success: false };
  if (leaderMem.rank < RANK.VICE_LEAD) return { success: false, msg: 'Only leaders/vice-leaders can promote' };
  if (newRank >= leaderMem.rank) return { success: false, msg: 'Cannot promote to your rank or higher' };

  db.getDatabase()
    .prepare('UPDATE guild_members SET rank = ? WHERE guild_id = ? AND char_id = ?')
    .run(newRank, targetMem.guild_id, targetId);

  return { success: true };
}

function donateToGuild(charId, amount) {
  const membership = getPlayerGuild(charId);
  if (!membership) return { success: false, msg: 'Not in a guild' };

  const char = db.getCharacterById(charId);
  if (!char || char.gold < amount) return { success: false, msg: 'Not enough gold' };

  db.updateCharacter(charId, { gold: char.gold - amount });

  db.getDatabase()
    .prepare('UPDATE guilds SET gold = gold + ? WHERE id = ?')
    .run(amount, membership.guild_id);

  db.getDatabase()
    .prepare('UPDATE guild_members SET donate_total = donate_total + ? WHERE guild_id = ? AND char_id = ?')
    .run(amount, membership.guild_id, charId);

  // Add guild EXP
  const guildExp = Math.floor(amount / 10);
  db.getDatabase()
    .prepare('UPDATE guilds SET exp = exp + ? WHERE id = ?')
    .run(guildExp, membership.guild_id);

  return { success: true, guildGold: amount, guildExp };
}

// ─── Query helpers ───────────────────────
function getGuild(guildId) {
  return db.getDatabase().prepare('SELECT * FROM guilds WHERE id = ?').get(guildId);
}

function getGuildByName(name) {
  return db.getDatabase().prepare('SELECT * FROM guilds WHERE name = ?').get(name);
}

function getGuildList() {
  return db.getDatabase()
    .prepare(`SELECT g.*, COUNT(gm.char_id) as member_count
              FROM guilds g LEFT JOIN guild_members gm ON g.id = gm.guild_id
              GROUP BY g.id ORDER BY g.level DESC, g.exp DESC LIMIT 50`)
    .all();
}

function getGuildMembers(guildId) {
  return db.getDatabase()
    .prepare(`SELECT gm.*, c.nick_name, c.grade, c.fighting, c.is_online
              FROM guild_members gm JOIN characters c ON gm.char_id = c.id
              WHERE gm.guild_id = ? ORDER BY gm.rank DESC, c.fighting DESC`)
    .all(guildId);
}

function getGuildMemberCount(guildId) {
  const row = db.getDatabase()
    .prepare('SELECT COUNT(*) as cnt FROM guild_members WHERE guild_id = ?')
    .get(guildId);
  return row ? row.cnt : 0;
}

function getPlayerGuild(charId) {
  return db.getDatabase()
    .prepare('SELECT * FROM guild_members WHERE char_id = ?')
    .get(charId);
}

module.exports = {
  OPCODES, RANK,
  initDB,
  createGuild, joinGuild, leaveGuild,
  kickMember, promoteMember, donateToGuild,
  getGuild, getGuildByName, getGuildList,
  getGuildMembers, getPlayerGuild,
};
