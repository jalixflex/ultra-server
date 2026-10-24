'use strict';

const db = require('../db');

const OPCODES = {
  // Guild Altar
  C_GUILD_ALTAR_INFO:   0x7700,
  S_GUILD_ALTAR_INFO:   0x7710,
  C_GUILD_ALTAR_SPIN:   0x7701,
  S_GUILD_ALTAR_SPIN:   0x7711,
  // Guild Beast
  C_GUILD_BEAST_INFO:   0x7702,
  S_GUILD_BEAST_INFO:   0x7712,
  C_GUILD_BEAST_ATTACK: 0x7703,
  S_GUILD_BEAST_ATTACK: 0x7713,
  // Guild Shop
  C_GUILD_SHOP_LIST:    0x7704,
  S_GUILD_SHOP_LIST:    0x7714,
  C_GUILD_SHOP_BUY:     0x7705,
  S_GUILD_SHOP_BUY:     0x7715,
  // Guild War
  C_GUILD_WAR_INFO:     0x7706,
  S_GUILD_WAR_INFO:     0x7716,
  C_GUILD_WAR_ATTACK:   0x7707,
  S_GUILD_WAR_ATTACK:   0x7717,
  C_GUILD_WAR_RANK:     0x7708,
  S_GUILD_WAR_RANK:     0x7718,
};

// ═══════════════════════════════════════════
// GUILD ALTAR — Blessing wheel, 30 spins/day
// ═══════════════════════════════════════════
const DEITIES = [
  { id: 'ares',    name: 'Ares',    statBonus: { attack: 50 } },
  { id: 'athena',  name: 'Athena',  statBonus: { defence: 50 } },
  { id: 'apollo',  name: 'Apollo',  statBonus: { max_hp: 200 } },
];

const ALTAR_REWARDS = [
  { weight: 30, type: 'gold',   amount: 5000,  name: '5,000 Gold' },
  { weight: 25, type: 'gold',   amount: 10000, name: '10,000 Gold' },
  { weight: 15, type: 'exp',    amount: 5000,  name: '5,000 EXP' },
  { weight: 10, type: 'daru',   amount: 2000,  name: '2,000 Daru' },
  { weight: 8,  type: 'kyanite',amount: 1000,  name: '1,000 Kyanite' },
  { weight: 5,  type: 'balens', amount: 10,    name: '10 Bound Balens' },
  { weight: 4,  type: 'item',   itemId: 'scroll_exp', name: 'EXP Scroll' },
  { weight: 3,  type: 'item',   itemId: 'holy_stone',  name: 'Holy Stone' },
];

const ALTAR_COST = 20; // contribution per spin
const MAX_SPINS = 30;

// ═══════════════════════════════════════════
// GUILD BEAST — Cooperative guild boss
// ═══════════════════════════════════════════
const GUILD_BEASTS = [
  { id: 1, name: 'Cerberus',       hp: 2000000,  atk: 400, def: 150, minGuildLvl: 2, expReward: 10000, goldReward: 20000 },
  { id: 2, name: 'Hydra',          hp: 5000000,  atk: 600, def: 250, minGuildLvl: 4, expReward: 20000, goldReward: 40000 },
  { id: 3, name: 'Titan Golem',    hp: 10000000, atk: 900, def: 400, minGuildLvl: 6, expReward: 35000, goldReward: 70000 },
  { id: 4, name: 'Dragon Emperor',  hp: 20000000, atk: 1300,def: 600, minGuildLvl: 8, expReward: 50000, goldReward: 100000 },
];

// ═══════════════════════════════════════════
// GUILD SHOP — Buy with contribution
// ═══════════════════════════════════════════
const GUILD_SHOP_ITEMS = [
  { id: 1,  name: 'EXP Scroll',       cost: 100,  type: 'item', itemId: 'scroll_exp' },
  { id: 2,  name: 'Gold Bag (10k)',    cost: 50,   type: 'gold', amount: 10000 },
  { id: 3,  name: 'Skill Book',       cost: 200,  type: 'item', itemId: 'skill_book' },
  { id: 4,  name: 'Rune Stone x5',    cost: 150,  type: 'item', itemId: 'rune_stone', amount: 5 },
  { id: 5,  name: 'Holy Stone x3',    cost: 300,  type: 'item', itemId: 'holy_stone', amount: 3 },
  { id: 6,  name: 'Mount Whip x5',    cost: 100,  type: 'item', itemId: 'mount_whip', amount: 5 },
  { id: 7,  name: 'Star Sand x2',     cost: 250,  type: 'item', itemId: 'star_sand', amount: 2 },
  { id: 8,  name: 'Blood of Zeus',    cost: 400,  type: 'item', itemId: 'blood_zeus' },
  { id: 9,  name: 'Medallion Shard',  cost: 500,  type: 'item', itemId: 'medallion_shard' },
  { id: 10, name: 'Dragon Soul Crystal', cost: 600, type: 'item', itemId: 'dragon_crystal' },
];

// ═══════════════════════════════════════════
// GUILD WAR — Wed/Sat PvP
// ═══════════════════════════════════════════
const WAR_TOWERS = [
  { id: 'north', name: 'North Tower', hp: 50000 },
  { id: 'south', name: 'South Tower', hp: 50000 },
  { id: 'east',  name: 'East Tower',  hp: 50000 },
  { id: 'west',  name: 'West Tower',  hp: 50000 },
  { id: 'center',name: 'Central Fortress', hp: 100000 },
];

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS guild_altar (
      char_id     INTEGER PRIMARY KEY REFERENCES characters(id),
      spins_today INTEGER DEFAULT 0,
      deity       TEXT DEFAULT 'ares',
      last_spin   TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS guild_beast (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id    INTEGER NOT NULL,
      beast_id    INTEGER NOT NULL,
      current_hp  INTEGER NOT NULL,
      max_hp      INTEGER NOT NULL,
      active      INTEGER DEFAULT 1,
      started_at  TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS guild_beast_damage (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      beast_run INTEGER NOT NULL,
      char_id   INTEGER NOT NULL REFERENCES characters(id),
      damage    INTEGER DEFAULT 0,
      attacks   INTEGER DEFAULT 0,
      UNIQUE(beast_run, char_id)
    );
    CREATE TABLE IF NOT EXISTS guild_shop_purchases (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id   INTEGER NOT NULL REFERENCES characters(id),
      item_id   INTEGER NOT NULL,
      bought_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS guild_war (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_a     INTEGER NOT NULL,
      guild_b     INTEGER NOT NULL,
      score_a     INTEGER DEFAULT 0,
      score_b     INTEGER DEFAULT 0,
      status      TEXT DEFAULT 'active',
      started_at  TEXT DEFAULT (datetime('now')),
      ended_at    TEXT
    );
    CREATE TABLE IF NOT EXISTS guild_war_towers (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      war_id    INTEGER NOT NULL,
      tower_id  TEXT NOT NULL,
      owner     TEXT DEFAULT 'neutral',
      hp        INTEGER NOT NULL,
      UNIQUE(war_id, tower_id)
    );
  `);
}

// ─── Altar ──────────────────────────────────
function getAltarInfo(charId) {
  db.getDatabase().prepare('INSERT OR IGNORE INTO guild_altar (char_id) VALUES (?)').run(charId);
  resetAltarDaily(charId);
  const row = db.getDatabase().prepare('SELECT * FROM guild_altar WHERE char_id = ?').get(charId);
  const deity = DEITIES.find(d => d.id === row.deity) || DEITIES[0];
  return {
    spinsToday: row.spins_today,
    maxSpins: MAX_SPINS,
    cost: ALTAR_COST,
    deity: deity,
    deities: DEITIES,
  };
}

function resetAltarDaily(charId) {
  const today = new Date().toISOString().slice(0, 10);
  const row = db.getDatabase().prepare('SELECT last_spin FROM guild_altar WHERE char_id = ?').get(charId);
  if (row && row.last_spin !== today) {
    db.getDatabase().prepare('UPDATE guild_altar SET spins_today = 0, last_spin = ? WHERE char_id = ?').run(today, charId);
  }
}

function spinAltar(charId, deityId) {
  db.getDatabase().prepare('INSERT OR IGNORE INTO guild_altar (char_id) VALUES (?)').run(charId);
  resetAltarDaily(charId);

  const row = db.getDatabase().prepare('SELECT * FROM guild_altar WHERE char_id = ?').get(charId);
  if (row.spins_today >= MAX_SPINS) return { success: false, msg: 'No spins left today' };

  // Check contribution (from guild system)
  const guild = require('./guild');
  const memberInfo = guild.getPlayerGuild(charId);
  if (!memberInfo || !memberInfo.guild_id) return { success: false, msg: 'Not in a guild' };
  // For now, deduct contribution is handled via guild donate tracking

  // Pick reward
  const totalWeight = ALTAR_REWARDS.reduce((s, r) => s + r.weight, 0);
  let roll = Math.random() * totalWeight;
  let reward = ALTAR_REWARDS[0];
  for (const r of ALTAR_REWARDS) {
    roll -= r.weight;
    if (roll <= 0) { reward = r; break; }
  }

  // Apply reward
  if (reward.type === 'gold') {
    db.getDatabase().prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').run(reward.amount, charId);
  } else if (reward.type === 'exp') {
    db.getDatabase().prepare('UPDATE characters SET exp = exp + ? WHERE id = ?').run(reward.amount, charId);
  } else if (reward.type === 'balens') {
    db.getDatabase().prepare('UPDATE characters SET bound_balens = bound_balens + ? WHERE id = ?').run(reward.amount, charId);
  }

  // Update deity if changed
  if (deityId && DEITIES.find(d => d.id === deityId)) {
    db.getDatabase().prepare('UPDATE guild_altar SET deity = ? WHERE char_id = ?').run(deityId, charId);
  }

  db.getDatabase().prepare('UPDATE guild_altar SET spins_today = spins_today + 1, last_spin = ? WHERE char_id = ?')
    .run(new Date().toISOString().slice(0, 10), charId);

  return { success: true, reward: { name: reward.name, type: reward.type, amount: reward.amount } };
}

// ─── Guild Beast ────────────────────────────
function getBeastInfo(charId) {
  const guild = require('./guild');
  const memberInfo = guild.getMemberInfo(charId);
  if (!memberInfo || !memberInfo.guild_id) return { active: false, msg: 'Not in a guild' };

  let beast = db.getDatabase()
    .prepare('SELECT * FROM guild_beast WHERE guild_id = ? AND active = 1 ORDER BY id DESC LIMIT 1')
    .get(memberInfo.guild_id);

  if (!beast) {
    // Auto-spawn first beast
    spawnBeast(memberInfo.guild_id, 1);
    beast = db.getDatabase()
      .prepare('SELECT * FROM guild_beast WHERE guild_id = ? AND active = 1 ORDER BY id DESC LIMIT 1')
      .get(memberInfo.guild_id);
  }
  if (!beast) return { active: false };

  const template = GUILD_BEASTS.find(b => b.id === beast.beast_id);
  const myDmg = db.getDatabase()
    .prepare('SELECT damage, attacks FROM guild_beast_damage WHERE beast_run = ? AND char_id = ?')
    .get(beast.id, charId);

  return {
    active: true,
    beastId: beast.beast_id,
    beastName: template.name,
    currentHp: beast.current_hp,
    maxHp: beast.max_hp,
    myDamage: myDmg ? myDmg.damage : 0,
    myAttacks: myDmg ? myDmg.attacks : 0,
  };
}

function spawnBeast(guildId, beastId) {
  const template = GUILD_BEASTS.find(b => b.id === beastId);
  if (!template) return;
  db.getDatabase().prepare('UPDATE guild_beast SET active = 0 WHERE guild_id = ? AND active = 1').run(guildId);
  db.getDatabase().prepare('INSERT INTO guild_beast (guild_id, beast_id, current_hp, max_hp) VALUES (?, ?, ?, ?)')
    .run(guildId, beastId, template.hp, template.hp);
}

function attackBeast(charId) {
  const guild = require('./guild');
  const memberInfo = guild.getPlayerGuild(charId);
  if (!memberInfo || !memberInfo.guild_id) return { success: false, msg: 'Not in a guild' };

  const beast = db.getDatabase()
    .prepare('SELECT * FROM guild_beast WHERE guild_id = ? AND active = 1 ORDER BY id DESC LIMIT 1')
    .get(memberInfo.guild_id);
  if (!beast || beast.current_hp <= 0) return { success: false, msg: 'No active beast' };

  const char = db.getCharacterById(charId);
  if (!char) return { success: false };
  const template = GUILD_BEASTS.find(b => b.id === beast.beast_id);

  const baseDmg = Math.max(1, Math.floor(char.attack * char.attack / (char.attack + template.def)));
  const variance = 0.8 + Math.random() * 0.4;
  const crit = Math.random() < 0.15;
  const damage = Math.floor(baseDmg * variance * (crit ? 2.0 : 1.0));

  const newHp = Math.max(0, beast.current_hp - damage);
  db.getDatabase().prepare('UPDATE guild_beast SET current_hp = ? WHERE id = ?').run(newHp, beast.id);

  db.getDatabase().prepare(`
    INSERT INTO guild_beast_damage (beast_run, char_id, damage, attacks)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(beast_run, char_id) DO UPDATE SET
      damage = damage + excluded.damage, attacks = attacks + 1
  `).run(beast.id, charId, damage);

  let killed = false;
  if (newHp <= 0) {
    killed = true;
    db.getDatabase().prepare('UPDATE guild_beast SET active = 0 WHERE id = ?').run(beast.id);
    distributeBeastRewards(beast.id, beast.beast_id, memberInfo.guild_id);
    const nextId = beast.beast_id < GUILD_BEASTS.length ? beast.beast_id + 1 : 1;
    spawnBeast(memberInfo.guild_id, nextId);
  }

  return { success: true, damage, crit, beastHp: newHp, killed };
}

function distributeBeastRewards(beastRunId, beastId, guildId) {
  const template = GUILD_BEASTS.find(b => b.id === beastId);
  if (!template) return;
  const participants = db.getDatabase()
    .prepare('SELECT * FROM guild_beast_damage WHERE beast_run = ? ORDER BY damage DESC').all(beastRunId);
  const totalDmg = participants.reduce((s, p) => s + p.damage, 0) || 1;

  for (let i = 0; i < participants.length; i++) {
    const p = participants[i];
    const ratio = p.damage / totalDmg;
    const rankBonus = i < 3 ? 2.0 : i < 10 ? 1.5 : 1.0;
    const gold = Math.floor(template.goldReward * ratio * rankBonus);
    const exp = Math.floor(template.expReward * ratio * rankBonus);
    db.getDatabase().prepare('UPDATE characters SET gold = gold + ?, exp = exp + ? WHERE id = ?').run(gold, exp, p.char_id);
  }
}

// ─── Guild Shop ─────────────────────────────
function getGuildShopList() {
  return { items: GUILD_SHOP_ITEMS };
}

function buyGuildShopItem(charId, itemId) {
  const item = GUILD_SHOP_ITEMS.find(i => i.id === itemId);
  if (!item) return { success: false, msg: 'Item not found' };

  const guild = require('./guild');
  const memberInfo = guild.getPlayerGuild(charId);
  if (!memberInfo || !memberInfo.guild_id) return { success: false, msg: 'Not in a guild' };

  // Check contribution (simplified — uses gold as proxy for now)
  const char = db.getCharacterById(charId);
  if (!char || char.gold < item.cost * 10) return { success: false, msg: 'Not enough resources' };

  db.getDatabase().prepare('UPDATE characters SET gold = gold - ? WHERE id = ?').run(item.cost * 10, charId);

  if (item.type === 'gold') {
    db.getDatabase().prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').run(item.amount, charId);
  } else if (item.type === 'exp') {
    db.getDatabase().prepare('UPDATE characters SET exp = exp + ? WHERE id = ?').run(item.amount, charId);
  }

  db.getDatabase().prepare('INSERT INTO guild_shop_purchases (char_id, item_id) VALUES (?, ?)').run(charId, itemId);
  return { success: true, item: item.name };
}

// ─── Guild War ──────────────────────────────
function getWarInfo(charId) {
  const guild = require('./guild');
  const memberInfo = guild.getMemberInfo(charId);
  if (!memberInfo || !memberInfo.guild_id) return { active: false, msg: 'Not in a guild' };

  const war = db.getDatabase()
    .prepare("SELECT * FROM guild_war WHERE (guild_a = ? OR guild_b = ?) AND status = 'active' ORDER BY id DESC LIMIT 1")
    .get(memberInfo.guild_id, memberInfo.guild_id);

  if (!war) return { active: false, msg: 'No active guild war' };

  const towers = db.getDatabase()
    .prepare('SELECT * FROM guild_war_towers WHERE war_id = ?').all(war.id);

  const isGuildA = war.guild_a === memberInfo.guild_id;

  return {
    active: true,
    warId: war.id,
    myGuild: isGuildA ? 'A' : 'B',
    scoreA: war.score_a,
    scoreB: war.score_b,
    towers: towers.map(t => ({ id: t.tower_id, name: WAR_TOWERS.find(wt => wt.id === t.tower_id)?.name, owner: t.owner, hp: t.hp })),
  };
}

function startGuildWar(guildAId, guildBId) {
  const result = db.getDatabase().prepare('INSERT INTO guild_war (guild_a, guild_b) VALUES (?, ?)').run(guildAId, guildBId);
  const warId = result.lastInsertRowid;
  for (const tower of WAR_TOWERS) {
    db.getDatabase().prepare('INSERT INTO guild_war_towers (war_id, tower_id, hp) VALUES (?, ?, ?)')
      .run(warId, tower.id, tower.hp);
  }
  return warId;
}

function attackTower(charId, towerId) {
  const guild = require('./guild');
  const memberInfo = guild.getPlayerGuild(charId);
  if (!memberInfo || !memberInfo.guild_id) return { success: false, msg: 'Not in a guild' };

  const war = db.getDatabase()
    .prepare("SELECT * FROM guild_war WHERE (guild_a = ? OR guild_b = ?) AND status = 'active' ORDER BY id DESC LIMIT 1")
    .get(memberInfo.guild_id, memberInfo.guild_id);
  if (!war) return { success: false, msg: 'No active war' };

  const tower = db.getDatabase()
    .prepare('SELECT * FROM guild_war_towers WHERE war_id = ? AND tower_id = ?').get(war.id, towerId);
  if (!tower) return { success: false, msg: 'Tower not found' };

  const myTeam = war.guild_a === memberInfo.guild_id ? 'A' : 'B';
  if (tower.owner === myTeam) return { success: false, msg: 'You already own this tower' };

  const char = db.getCharacterById(charId);
  if (!char) return { success: false };

  const damage = Math.floor(char.attack * (0.8 + Math.random() * 0.4));
  const newHp = Math.max(0, tower.hp - damage);

  db.getDatabase().prepare('UPDATE guild_war_towers SET hp = ? WHERE war_id = ? AND tower_id = ?')
    .run(newHp, war.id, towerId);

  let captured = false;
  if (newHp <= 0) {
    captured = true;
    const towerTemplate = WAR_TOWERS.find(t => t.id === towerId);
    db.getDatabase().prepare('UPDATE guild_war_towers SET owner = ?, hp = ? WHERE war_id = ? AND tower_id = ?')
      .run(myTeam, towerTemplate.hp, war.id, towerId);

    const scoreCol = myTeam === 'A' ? 'score_a' : 'score_b';
    const points = towerId === 'center' ? 500 : 200;
    db.getDatabase().prepare(`UPDATE guild_war SET ${scoreCol} = ${scoreCol} + ? WHERE id = ?`).run(points, war.id);
  }

  // Honor reward for participating
  const honor = require('./honor');
  if (honor && honor.addHonor) honor.addHonor(charId, 10);

  return { success: true, damage, towerHp: newHp, captured, towerId };
}

function getWarRanking(warId) {
  const war = db.getDatabase().prepare('SELECT * FROM guild_war WHERE id = ?').get(warId);
  if (!war) return { ranking: [] };

  const towers = db.getDatabase().prepare('SELECT * FROM guild_war_towers WHERE war_id = ?').all(war.id);
  const towersA = towers.filter(t => t.owner === 'A').length;
  const towersB = towers.filter(t => t.owner === 'B').length;

  return {
    guildA: war.guild_a, scoreA: war.score_a, towersA,
    guildB: war.guild_b, scoreB: war.score_b, towersB,
    towers: towers.map(t => ({ id: t.tower_id, owner: t.owner, hp: t.hp })),
  };
}

module.exports = {
  OPCODES, DEITIES, ALTAR_REWARDS, GUILD_BEASTS, GUILD_SHOP_ITEMS, WAR_TOWERS,
  initDB,
  // Altar
  getAltarInfo, spinAltar,
  // Beast
  getBeastInfo, attackBeast, spawnBeast,
  // Shop
  getGuildShopList, buyGuildShopItem,
  // War
  getWarInfo, startGuildWar, attackTower, getWarRanking,
};
