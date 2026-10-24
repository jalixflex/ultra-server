'use strict';

const db = require('../db');

const OPCODES = {
  C_GM_CMD:          0x7000,
  S_GM_CMD_RSP:      0x7010,
  S_SERVER_ANNOUNCE:  0x7011,
  C_GM_BAN:          0x7001,
  S_GM_BAN_RSP:      0x7012,
  C_GM_KICK:         0x7002,
  S_GM_KICK_RSP:     0x7013,
  C_GM_ITEM:         0x7003,
  S_GM_ITEM_RSP:     0x7014,
};

const connectedClients = new Set();

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS gm_accounts (
      char_id    INTEGER PRIMARY KEY REFERENCES characters(id),
      gm_level   INTEGER DEFAULT 1,
      granted_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS server_announcements (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT NOT NULL,
      content    TEXT NOT NULL,
      type       TEXT DEFAULT 'normal',
      start_time INTEGER DEFAULT 0,
      end_time   INTEGER DEFAULT 0,
      created_by INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS bans (
      char_id    INTEGER PRIMARY KEY,
      reason     TEXT DEFAULT '',
      banned_by  INTEGER DEFAULT 0,
      until      INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

function registerClient(ws) { connectedClients.add(ws); }
function removeClient(ws) { connectedClients.delete(ws); }

function isGM(charId) {
  const row = db.getDatabase()
    .prepare('SELECT gm_level FROM gm_accounts WHERE char_id = ?')
    .get(charId);
  return row && row.gm_level >= 1;
}

function getGMLevel(charId) {
  const row = db.getDatabase()
    .prepare('SELECT gm_level FROM gm_accounts WHERE char_id = ?')
    .get(charId);
  return row ? row.gm_level : 0;
}

function isBanned(charId) {
  const row = db.getDatabase()
    .prepare('SELECT * FROM bans WHERE char_id = ?')
    .get(charId);
  if (!row) return false;
  const now = Math.floor(Date.now() / 1000);
  if (row.until > 0 && row.until <= now) {
    db.getDatabase().prepare('DELETE FROM bans WHERE char_id = ?').run(charId);
    return false;
  }
  return true;
}

function executeGMCommand(charId, command, args) {
  if (!isGM(charId)) return { success: false, msg: 'Not authorized' };

  const cmd = command.toLowerCase().replace(/^\//, '');

  switch (cmd) {
    case 'addgold': {
      const target = findCharByName(args[0]);
      if (!target) return { success: false, msg: 'Player not found' };
      const amount = parseInt(args[1]) || 0;
      if (amount <= 0 || amount > 10000000) return { success: false, msg: 'Invalid amount' };
      db.getDatabase().prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').run(amount, target.id);
      return { success: true, msg: `Added ${amount} gold to ${target.nick_name}` };
    }

    case 'addbalens': {
      const target = findCharByName(args[0]);
      if (!target) return { success: false, msg: 'Player not found' };
      const amount = parseInt(args[1]) || 0;
      if (amount <= 0 || amount > 1000000) return { success: false, msg: 'Invalid amount' };
      db.getDatabase().prepare('UPDATE characters SET balens = balens + ? WHERE id = ?').run(amount, target.id);
      return { success: true, msg: `Added ${amount} balens to ${target.nick_name}` };
    }

    case 'addexp': {
      const target = findCharByName(args[0]);
      if (!target) return { success: false, msg: 'Player not found' };
      const amount = parseInt(args[1]) || 0;
      if (amount <= 0 || amount > 100000000) return { success: false, msg: 'Invalid amount' };
      db.getDatabase().prepare('UPDATE characters SET exp = exp + ? WHERE id = ?').run(amount, target.id);
      return { success: true, msg: `Added ${amount} exp to ${target.nick_name}` };
    }

    case 'setlevel': {
      const target = findCharByName(args[0]);
      if (!target) return { success: false, msg: 'Player not found' };
      const level = parseInt(args[1]) || 1;
      if (level < 1 || level > 80) return { success: false, msg: 'Level must be 1-80' };
      db.getDatabase().prepare('UPDATE characters SET grade = ? WHERE id = ?').run(level, target.id);
      try { require('./inventory').recalcStats(target.id); } catch (e) {}
      return { success: true, msg: `Set ${target.nick_name} to level ${level}` };
    }

    case 'additem': {
      const target = findCharByName(args[0]);
      if (!target) return { success: false, msg: 'Player not found' };
      const itemId = parseInt(args[1]) || 0;
      const count = parseInt(args[2]) || 1;
      if (itemId <= 0) return { success: false, msg: 'Invalid item ID' };
      try {
        const inv = require('./inventory');
        inv.addItem(target.id, itemId, count);
        return { success: true, msg: `Gave ${count}x item #${itemId} to ${target.nick_name}` };
      } catch (e) {
        return { success: false, msg: 'Inventory error' };
      }
    }

    case 'ban': {
      if (getGMLevel(charId) < 2) return { success: false, msg: 'Need GM level 2' };
      const target = findCharByName(args[0]);
      if (!target) return { success: false, msg: 'Player not found' };
      const minutes = parseInt(args[1]) || 1440;
      return banPlayer(charId, target.id, minutes);
    }

    case 'unban': {
      if (getGMLevel(charId) < 2) return { success: false, msg: 'Need GM level 2' };
      const target = findCharByName(args[0]);
      if (!target) return { success: false, msg: 'Player not found' };
      db.getDatabase().prepare('DELETE FROM bans WHERE char_id = ?').run(target.id);
      return { success: true, msg: `Unbanned ${target.nick_name}` };
    }

    case 'kick': {
      const target = findCharByName(args[0]);
      if (!target) return { success: false, msg: 'Player not found' };
      return kickPlayer(target.id);
    }

    case 'announce': {
      const message = args.join(' ');
      if (!message) return { success: false, msg: 'Empty message' };
      sendAnnouncement('GM Announcement', message, 'gm');
      return { success: true, msg: 'Announcement sent' };
    }

    case 'maint': {
      const minutes = parseInt(args[0]) || 30;
      const shutdownAt = Math.floor(Date.now() / 1000) + minutes * 60;
      sendAnnouncement('Maintenance Notice',
        `Server maintenance in ${minutes} minutes. Please finish your activities.`,
        'maintenance');
      db.getDatabase().prepare(`
        INSERT INTO server_announcements (title, content, type, end_time, created_by)
        VALUES (?, ?, 'maintenance', ?, ?)
      `).run('Maintenance', `Scheduled in ${minutes}min`, shutdownAt, charId);
      return { success: true, msg: `Maintenance scheduled in ${minutes} minutes` };
    }

    case 'resetcd': {
      const target = findCharByName(args[0]);
      if (!target) return { success: false, msg: 'Player not found' };
      try {
        db.getDatabase().prepare("UPDATE characters SET daily_data = '{}' WHERE id = ?").run(target.id);
      } catch (e) {}
      return { success: true, msg: `Cooldowns reset for ${target.nick_name}` };
    }

    case 'givegm': {
      if (getGMLevel(charId) < 3) return { success: false, msg: 'Need GM level 3' };
      const target = findCharByName(args[0]);
      if (!target) return { success: false, msg: 'Player not found' };
      const level = Math.min(parseInt(args[1]) || 1, getGMLevel(charId) - 1);
      db.getDatabase().prepare(`
        INSERT OR REPLACE INTO gm_accounts (char_id, gm_level) VALUES (?, ?)
      `).run(target.id, level);
      return { success: true, msg: `Granted GM level ${level} to ${target.nick_name}` };
    }

    case 'info': {
      const target = findCharByName(args[0]);
      if (!target) return { success: false, msg: 'Player not found' };
      return {
        success: true,
        msg: `${target.nick_name}: Lv${target.grade} | Gold:${target.gold} | Balens:${target.balens} | Fighting:${target.fighting || 0} | VIP:${target.vip_level || 0}`,
      };
    }

    default:
      return { success: false, msg: `Unknown command: ${cmd}. Available: addgold, addbalens, addexp, setlevel, additem, ban, unban, kick, announce, maint, resetcd, givegm, info` };
  }
}

function findCharByName(name) {
  if (!name) return null;
  return db.getDatabase()
    .prepare('SELECT * FROM characters WHERE nick_name = ? COLLATE NOCASE')
    .get(name);
}

function banPlayer(gmCharId, targetCharId, durationMinutes) {
  const now = Math.floor(Date.now() / 1000);
  const until = now + durationMinutes * 60;
  db.getDatabase().prepare(`
    INSERT OR REPLACE INTO bans (char_id, reason, banned_by, until)
    VALUES (?, 'GM ban', ?, ?)
  `).run(targetCharId, gmCharId, until);

  kickPlayer(targetCharId);
  const target = db.getCharacterById(targetCharId);
  const name = target ? target.nick_name : targetCharId;
  return { success: true, msg: `Banned ${name} for ${durationMinutes} minutes` };
}

function kickPlayer(targetCharId) {
  for (const ws of connectedClients) {
    if (ws.session?.charId === targetCharId) {
      try {
        const data = JSON.stringify({ msg: 'You have been kicked from the server' });
        ws.send(data);
        ws.close(1000, 'Kicked by GM');
      } catch (e) {}
      break;
    }
  }
  const target = db.getCharacterById(targetCharId);
  const name = target ? target.nick_name : targetCharId;
  return { success: true, msg: `Kicked ${name}` };
}

function sendAnnouncement(title, content, type) {
  const now = Math.floor(Date.now() / 1000);
  db.getDatabase().prepare(`
    INSERT INTO server_announcements (title, content, type, start_time, end_time)
    VALUES (?, ?, ?, ?, ?)
  `).run(title, content, type || 'normal', now, now + 86400);

  broadcastToAll(OPCODES.S_SERVER_ANNOUNCE, { title, content, type: type || 'normal', time: now });
}

function broadcastToAll(opcode, data) {
  const payload = JSON.stringify({ opcode, ...data });
  for (const ws of connectedClients) {
    try {
      if (ws.readyState === 1) ws.send(payload);
    } catch (e) {}
  }
}

function getAnnouncements() {
  const now = Math.floor(Date.now() / 1000);
  return db.getDatabase()
    .prepare('SELECT * FROM server_announcements WHERE end_time > ? ORDER BY id DESC LIMIT 20')
    .all(now);
}

module.exports = {
  OPCODES,
  initDB,
  registerClient, removeClient,
  isGM, getGMLevel, isBanned,
  executeGMCommand,
  banPlayer, kickPlayer,
  sendAnnouncement, broadcastToAll, getAnnouncements,
  connectedClients,
};
