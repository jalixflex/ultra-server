'use strict';

const db = require('../db');

const OPCODES = {
  C_EVENT_LIST:       0x7F00,
  S_EVENT_LIST:       0x7F10,
  C_EVENT_INFO:       0x7F01,
  S_EVENT_INFO:       0x7F11,
  C_HOT_EVENT_CLAIM:  0x7F02,
  S_HOT_EVENT_CLAIM:  0x7F12,
};

const EVENT_TEMPLATES = [
  { id: 1,  type: 'double_exp',   name: 'Double EXP',          description: 'All EXP gains doubled', duration: 7200 },
  { id: 2,  type: 'double_gold',  name: 'Double Gold',         description: 'All gold gains doubled', duration: 7200 },
  { id: 3,  type: 'happy_hour',   name: 'Happy Hour',          description: 'All costs reduced by 20%', duration: 3600 },
  { id: 4,  type: 'hot_event',    name: 'Big Spender',         description: 'Spend balens for bonus rewards', duration: 86400 },
  { id: 5,  type: 'hot_event',    name: 'Recharge Rewards',    description: 'Top up balens for gifts', duration: 86400 },
  { id: 6,  type: 'double_exp',   name: 'Weekend EXP Boost',   description: 'Weekend double EXP', duration: 172800 },
  { id: 7,  type: 'boss_event',   name: 'World Boss Frenzy',   description: 'World boss spawns every hour', duration: 86400 },
  { id: 8,  type: 'pvp_event',    name: 'Arena Festival',      description: 'Double arena honor rewards', duration: 86400 },
  { id: 9,  type: 'drop_event',   name: 'Lucky Drop',          description: 'Increased rare drop rates', duration: 86400 },
  { id: 10, type: 'happy_hour',   name: 'Midnight Madness',    description: 'Half-price forge costs at night', duration: 14400 },
];

const HOT_EVENT_TIERS = [
  { tier: 1, balenCost: 100,   rewards: [{ type: 'gold', amount: 50000, name: '50k Gold' }, { type: 'item', itemId: 'scroll_exp', amount: 2, name: 'EXP Scroll x2' }] },
  { tier: 2, balenCost: 500,   rewards: [{ type: 'gold', amount: 200000, name: '200k Gold' }, { type: 'item', itemId: 'mount_whip', amount: 10, name: 'Mount Whip x10' }] },
  { tier: 3, balenCost: 1000,  rewards: [{ type: 'gold', amount: 500000, name: '500k Gold' }, { type: 'item', itemId: 'rune_stone', amount: 20, name: 'Rune Stone x20' }] },
  { tier: 4, balenCost: 5000,  rewards: [{ type: 'bound_balens', amount: 500, name: '500 Bound Balens' }, { type: 'item', itemId: 'star_sand', amount: 10, name: 'Star Sand x10' }] },
  { tier: 5, balenCost: 10000, rewards: [{ type: 'bound_balens', amount: 1500, name: '1500 Bound Balens' }, { type: 'item', itemId: 'dragon_crystal', amount: 5, name: 'Dragon Crystal x5' }] },
];

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS server_events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL,
      start_at    TEXT NOT NULL,
      end_at      TEXT NOT NULL,
      active      INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS hot_event_claims (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id   INTEGER NOT NULL REFERENCES characters(id),
      event_id  INTEGER NOT NULL,
      tier      INTEGER NOT NULL,
      claimed_at TEXT DEFAULT (datetime('now')),
      UNIQUE(char_id, event_id, tier)
    );
    CREATE TABLE IF NOT EXISTS hot_event_spending (
      char_id   INTEGER PRIMARY KEY REFERENCES characters(id),
      event_id  INTEGER NOT NULL,
      spent     INTEGER DEFAULT 0
    );
  `);
}

function getActiveEvents() {
  const now = new Date().toISOString();
  const rows = db.getDatabase().prepare(`
    SELECT * FROM server_events WHERE active = 1 AND start_at <= ? AND end_at >= ?
  `).all(now, now);

  return {
    events: rows.map(r => {
      const tmpl = EVENT_TEMPLATES.find(t => t.id === r.template_id);
      return {
        eventId: r.id,
        templateId: r.template_id,
        type: tmpl ? tmpl.type : 'unknown',
        name: tmpl ? tmpl.name : 'Event',
        description: tmpl ? tmpl.description : '',
        startAt: r.start_at,
        endAt: r.end_at,
      };
    }),
  };
}

function getEventInfo(eventId) {
  const row = db.getDatabase().prepare('SELECT * FROM server_events WHERE id = ?').get(eventId);
  if (!row) return { success: false, msg: 'Event not found' };
  const tmpl = EVENT_TEMPLATES.find(t => t.id === row.template_id);
  return {
    success: true,
    eventId: row.id,
    name: tmpl ? tmpl.name : 'Event',
    type: tmpl ? tmpl.type : 'unknown',
    description: tmpl ? tmpl.description : '',
    startAt: row.start_at,
    endAt: row.end_at,
    tiers: tmpl && tmpl.type === 'hot_event' ? HOT_EVENT_TIERS : null,
  };
}

function isEventActive(eventType) {
  const now = new Date().toISOString();
  const rows = db.getDatabase().prepare(`
    SELECT se.* FROM server_events se WHERE se.active = 1 AND se.start_at <= ? AND se.end_at >= ?
  `).all(now, now);

  for (const r of rows) {
    const tmpl = EVENT_TEMPLATES.find(t => t.id === r.template_id);
    if (tmpl && tmpl.type === eventType) return true;
  }
  return false;
}

function createEvent(templateId, durationOverride) {
  const tmpl = EVENT_TEMPLATES.find(t => t.id === templateId);
  if (!tmpl) return null;
  const now = new Date();
  const dur = durationOverride || tmpl.duration;
  const end = new Date(now.getTime() + dur * 1000);
  const result = db.getDatabase().prepare(`
    INSERT INTO server_events (template_id, start_at, end_at) VALUES (?, ?, ?)
  `).run(templateId, now.toISOString(), end.toISOString());
  return result.lastInsertRowid;
}

function claimHotEventReward(charId, tierId) {
  const now = new Date().toISOString();
  const hotEvents = db.getDatabase().prepare(`
    SELECT se.* FROM server_events se WHERE se.active = 1 AND se.start_at <= ? AND se.end_at >= ?
  `).all(now, now);

  let activeHotEvent = null;
  for (const ev of hotEvents) {
    const tmpl = EVENT_TEMPLATES.find(t => t.id === ev.template_id);
    if (tmpl && tmpl.type === 'hot_event') { activeHotEvent = ev; break; }
  }

  if (!activeHotEvent) return { success: false, msg: 'No active hot event' };

  const tier = HOT_EVENT_TIERS.find(t => t.tier === tierId);
  if (!tier) return { success: false, msg: 'Invalid tier' };

  const already = db.getDatabase().prepare(
    'SELECT id FROM hot_event_claims WHERE char_id = ? AND event_id = ? AND tier = ?'
  ).get(charId, activeHotEvent.id, tierId);
  if (already) return { success: false, msg: 'Already claimed' };

  const spending = db.getDatabase().prepare(
    'SELECT spent FROM hot_event_spending WHERE char_id = ? AND event_id = ?'
  ).get(charId, activeHotEvent.id);
  const totalSpent = spending ? spending.spent : 0;

  if (totalSpent < tier.balenCost) return { success: false, msg: `Need to spend ${tier.balenCost} balens (spent: ${totalSpent})` };

  db.getDatabase().prepare(
    'INSERT INTO hot_event_claims (char_id, event_id, tier) VALUES (?, ?, ?)'
  ).run(charId, activeHotEvent.id, tierId);

  for (const reward of tier.rewards) {
    if (reward.type === 'gold') {
      db.getDatabase().prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').run(reward.amount, charId);
    } else if (reward.type === 'bound_balens') {
      db.getDatabase().prepare('UPDATE characters SET bound_balens = bound_balens + ? WHERE id = ?').run(reward.amount, charId);
    }
  }

  return { success: true, tier: tierId, rewards: tier.rewards.map(r => r.name) };
}

function trackSpending(charId, eventId, amount) {
  db.getDatabase().prepare(`
    INSERT INTO hot_event_spending (char_id, event_id, spent) VALUES (?, ?, ?)
    ON CONFLICT(char_id) DO UPDATE SET spent = spent + ?, event_id = ?
  `).run(charId, eventId, amount, amount, eventId);
}

module.exports = {
  OPCODES, EVENT_TEMPLATES, HOT_EVENT_TIERS,
  initDB,
  getActiveEvents, getEventInfo, isEventActive, createEvent,
  claimHotEventReward, trackSpending,
};
