'use strict';

const db = require('../db');

const OPCODES = {
  C_HOT_EVENTS:     0x7100,
  S_HOT_EVENTS:     0x7110,
  C_CLAIM_EVENT:    0x7101,
  S_CLAIM_EVENT_RSP: 0x7111,
};

const EVENT_TYPES = {
  RECHARGE_REWARD: 'recharge_reward',
  SPEND_REWARD:    'spend_reward',
  LOGIN_DAYS:      'login_days',
  LEVEL_RACE:      'level_race',
  POWER_RACE:      'power_race',
  TOTAL_RECHARGE:  'total_recharge',
  CONSUME_RANKING: 'consume_ranking',
  DAILY_SPECIAL:   'daily_special',
};

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS hot_events (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      type         TEXT NOT NULL,
      title        TEXT NOT NULL,
      description  TEXT DEFAULT '',
      start_time   INTEGER DEFAULT 0,
      end_time     INTEGER DEFAULT 0,
      rewards      TEXT DEFAULT '[]',
      requirements TEXT DEFAULT '{}',
      active       INTEGER DEFAULT 1,
      permanent    INTEGER DEFAULT 0,
      created_at   TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS event_claims (
      char_id    INTEGER NOT NULL,
      event_id   INTEGER NOT NULL,
      tier       INTEGER DEFAULT 0,
      claimed_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (char_id, event_id, tier)
    );
  `);
  seedDefaultEvents();
}

function seedDefaultEvents() {
  const count = db.getDatabase()
    .prepare('SELECT COUNT(*) as c FROM hot_events WHERE permanent = 1')
    .get();
  if (count.c > 0) return;

  const now = Math.floor(Date.now() / 1000);
  const farFuture = now + 365 * 86400;

  const defaults = [
    {
      type: EVENT_TYPES.LEVEL_RACE,
      title: 'Level Rush',
      description: 'Reach level milestones for bonus rewards!',
      rewards: JSON.stringify([
        { tier: 1, requirement: 20, items: [{ type: 'balens', amount: 100 }], desc: 'Reach Level 20' },
        { tier: 2, requirement: 30, items: [{ type: 'balens', amount: 300 }, { type: 'gold', amount: 50000 }], desc: 'Reach Level 30' },
        { tier: 3, requirement: 40, items: [{ type: 'balens', amount: 500 }, { type: 'gold', amount: 100000 }], desc: 'Reach Level 40' },
        { tier: 4, requirement: 60, items: [{ type: 'balens', amount: 1000 }, { type: 'gold', amount: 300000 }], desc: 'Reach Level 60' },
      ]),
      requirements: JSON.stringify({ field: 'grade' }),
    },
    {
      type: EVENT_TYPES.POWER_RACE,
      title: 'Power Up',
      description: 'Increase your Battle Rating for rewards!',
      rewards: JSON.stringify([
        { tier: 1, requirement: 1000,  items: [{ type: 'gold', amount: 10000 }], desc: 'Reach 1,000 BR' },
        { tier: 2, requirement: 5000,  items: [{ type: 'balens', amount: 200 }, { type: 'gold', amount: 50000 }], desc: 'Reach 5,000 BR' },
        { tier: 3, requirement: 10000, items: [{ type: 'balens', amount: 500 }, { type: 'gold', amount: 100000 }], desc: 'Reach 10,000 BR' },
        { tier: 4, requirement: 50000, items: [{ type: 'balens', amount: 1000 }], desc: 'Reach 50,000 BR' },
      ]),
      requirements: JSON.stringify({ field: 'fighting' }),
    },
    {
      type: EVENT_TYPES.LOGIN_DAYS,
      title: 'Login Streak',
      description: 'Login consecutively for special rewards!',
      rewards: JSON.stringify([
        { tier: 1, requirement: 3,  items: [{ type: 'gold', amount: 5000 }, { type: 'item', id: 100001, count: 10 }], desc: '3 Day Login' },
        { tier: 2, requirement: 7,  items: [{ type: 'balens', amount: 100 }, { type: 'gold', amount: 20000 }], desc: '7 Day Login' },
        { tier: 3, requirement: 14, items: [{ type: 'balens', amount: 300 }, { type: 'item', id: 100010, count: 5 }], desc: '14 Day Login' },
        { tier: 4, requirement: 30, items: [{ type: 'balens', amount: 500 }, { type: 'gold', amount: 100000 }], desc: '30 Day Login' },
      ]),
      requirements: JSON.stringify({ field: 'login_streak' }),
    },
    {
      type: EVENT_TYPES.TOTAL_RECHARGE,
      title: 'First Recharge',
      description: 'Any balens purchase gives bonus items!',
      rewards: JSON.stringify([
        { tier: 1, requirement: 1, items: [{ type: 'balens', amount: 200 }, { type: 'gold', amount: 50000 }, { type: 'item', id: 100020, count: 3 }], desc: 'First Recharge Bonus' },
      ]),
      requirements: JSON.stringify({ field: 'total_recharge' }),
    },
    {
      type: EVENT_TYPES.DAILY_SPECIAL,
      title: 'Daily Special',
      description: 'Claim free items once per day!',
      rewards: JSON.stringify([
        { tier: 1, requirement: 0, items: [{ type: 'gold', amount: 2000 }, { type: 'item', id: 100001, count: 5 }], desc: 'Daily Free Gift' },
      ]),
      requirements: JSON.stringify({ field: 'daily', resetDaily: true }),
    },
  ];

  const stmt = db.getDatabase().prepare(`
    INSERT INTO hot_events (type, title, description, start_time, end_time, rewards, requirements, permanent)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `);
  for (const e of defaults) {
    stmt.run(e.type, e.title, e.description, now, farFuture, e.rewards, e.requirements);
  }
}

function getActiveEvents() {
  const now = Math.floor(Date.now() / 1000);
  return db.getDatabase()
    .prepare('SELECT * FROM hot_events WHERE active = 1 AND start_time <= ? AND end_time >= ?')
    .all(now, now);
}

function getHotEvents(charId) {
  const events = getActiveEvents();
  const char = db.getCharacterById(charId);
  if (!char) return [];

  return events.map(e => {
    const rewards = JSON.parse(e.rewards || '[]');
    const requirements = JSON.parse(e.requirements || '{}');

    const playerValue = getPlayerValue(char, charId, requirements);

    const tiers = rewards.map(r => {
      const claimed = db.getDatabase()
        .prepare('SELECT 1 FROM event_claims WHERE char_id = ? AND event_id = ? AND tier = ?')
        .get(charId, e.id, r.tier);

      const canClaim = !claimed && playerValue >= r.requirement;

      return {
        tier: r.tier,
        desc: r.desc,
        requirement: r.requirement,
        items: r.items,
        claimed: !!claimed,
        canClaim,
        progress: playerValue,
      };
    });

    return {
      id: e.id,
      type: e.type,
      title: e.title,
      description: e.description,
      tiers,
    };
  });
}

function getPlayerValue(char, charId, requirements) {
  const field = requirements.field;
  if (!field) return 0;

  switch (field) {
    case 'grade': return char.grade || 0;
    case 'fighting': return char.fighting || 0;
    case 'login_streak': {
      try {
        const login = require('./daily-login');
        const info = login.getLoginInfo(charId);
        return info ? (info.streak || info.consecutiveDays || 0) : 0;
      } catch (e) { return 0; }
    }
    case 'total_recharge': return char.total_recharge || 0;
    case 'daily': return 1;
    default: return char[field] || 0;
  }
}

function claimEventReward(charId, eventId, tier) {
  const event = db.getDatabase()
    .prepare('SELECT * FROM hot_events WHERE id = ? AND active = 1')
    .get(eventId);
  if (!event) return { success: false, msg: 'Event not found' };

  const now = Math.floor(Date.now() / 1000);
  if (now < event.start_time || now > event.end_time) {
    return { success: false, msg: 'Event expired' };
  }

  const rewards = JSON.parse(event.rewards || '[]');
  const tierData = rewards.find(r => r.tier === tier);
  if (!tierData) return { success: false, msg: 'Invalid tier' };

  const requirements = JSON.parse(event.requirements || '{}');

  if (requirements.resetDaily) {
    const today = new Date().toISOString().slice(0, 10);
    const existing = db.getDatabase()
      .prepare("SELECT 1 FROM event_claims WHERE char_id = ? AND event_id = ? AND tier = ? AND date(claimed_at) = ?")
      .get(charId, eventId, tier, today);
    if (existing) return { success: false, msg: 'Already claimed today' };
  } else {
    const existing = db.getDatabase()
      .prepare('SELECT 1 FROM event_claims WHERE char_id = ? AND event_id = ? AND tier = ?')
      .get(charId, eventId, tier);
    if (existing) return { success: false, msg: 'Already claimed' };
  }

  const char = db.getCharacterById(charId);
  const playerValue = getPlayerValue(char, charId, requirements);
  if (playerValue < tierData.requirement) {
    return { success: false, msg: 'Requirements not met' };
  }

  db.getDatabase().prepare(`
    INSERT INTO event_claims (char_id, event_id, tier) VALUES (?, ?, ?)
  `).run(charId, eventId, tier);

  const givenRewards = [];
  for (const item of tierData.items) {
    switch (item.type) {
      case 'gold':
        db.getDatabase().prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').run(item.amount, charId);
        givenRewards.push({ type: 'gold', amount: item.amount });
        break;
      case 'balens':
        db.getDatabase().prepare('UPDATE characters SET balens = balens + ? WHERE id = ?').run(item.amount, charId);
        givenRewards.push({ type: 'balens', amount: item.amount });
        break;
      case 'item':
        try {
          const inv = require('./inventory');
          inv.addItem(charId, item.id, item.count || 1);
          givenRewards.push({ type: 'item', itemId: item.id, count: item.count || 1 });
        } catch (e) {}
        break;
    }
  }

  return { success: true, rewards: givenRewards, msg: `Claimed: ${tierData.desc}` };
}

function checkEventProgress(charId, eventType, value) {
  const events = getActiveEvents().filter(e => e.type === eventType);
  const results = [];

  for (const event of events) {
    const rewards = JSON.parse(event.rewards || '[]');
    for (const r of rewards) {
      if (value >= r.requirement) {
        const claimed = db.getDatabase()
          .prepare('SELECT 1 FROM event_claims WHERE char_id = ? AND event_id = ? AND tier = ?')
          .get(charId, event.id, r.tier);
        if (!claimed) {
          results.push({ eventId: event.id, tier: r.tier, title: event.title, desc: r.desc });
        }
      }
    }
  }

  return results;
}

function createEvent(eventData) {
  const now = Math.floor(Date.now() / 1000);
  const result = db.getDatabase().prepare(`
    INSERT INTO hot_events (type, title, description, start_time, end_time, rewards, requirements, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    eventData.type || EVENT_TYPES.DAILY_SPECIAL,
    eventData.title || 'New Event',
    eventData.description || '',
    eventData.startTime || now,
    eventData.endTime || now + 7 * 86400,
    JSON.stringify(eventData.rewards || []),
    JSON.stringify(eventData.requirements || {}),
  );

  return { success: true, eventId: result.lastInsertRowid };
}

module.exports = {
  OPCODES, EVENT_TYPES,
  initDB,
  getActiveEvents, getHotEvents,
  claimEventReward, checkEventProgress,
  createEvent,
};
