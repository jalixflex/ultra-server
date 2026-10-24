'use strict';

const db = require('../db');

const OPCODES = {
  C_CROSS_ARENA_INFO:   0x8800,
  S_CROSS_ARENA_INFO:   0x8810,
  C_CROSS_ARENA_FIGHT:  0x8801,
  S_CROSS_ARENA_FIGHT:  0x8811,
  C_CROSS_BOSS_INFO:    0x8802,
  S_CROSS_BOSS_INFO:    0x8812,
  C_CROSS_BOSS_ATTACK:  0x8803,
  S_CROSS_BOSS_ATTACK:  0x8813,
  C_CROSS_GW_INFO:      0x8804,
  S_CROSS_GW_INFO:      0x8814,
  C_CROSS_GW_FIGHT:     0x8805,
  S_CROSS_GW_FIGHT:     0x8815,
  C_CROSS_SEASON_INFO:  0x8806,
  S_CROSS_SEASON_INFO:  0x8816,
  C_CROSS_CLAIM_REWARD: 0x8807,
  S_CROSS_CLAIM_REWARD: 0x8817,
};

const DAILY_ARENA = 10;
const DAILY_BOSS = 5;
const DAILY_GW = 3;

const SIM_OPPONENTS = [
  { name: 'DarkKnight_S2',   br: 50000,  class: 'knight' },
  { name: 'FireMage_S3',     br: 55000,  class: 'mage' },
  { name: 'ShadowArcher_S1', br: 45000,  class: 'archer' },
  { name: 'IceQueen_S5',     br: 65000,  class: 'mage' },
  { name: 'IronShield_S4',   br: 70000,  class: 'knight' },
  { name: 'WindRanger_S2',   br: 48000,  class: 'archer' },
  { name: 'ThunderLord_S6',  br: 80000,  class: 'knight' },
  { name: 'PhoenixMage_S3',  br: 75000,  class: 'mage' },
  { name: 'NightHunter_S1',  br: 60000,  class: 'archer' },
  { name: 'DragonSlayer_S7', br: 90000,  class: 'knight' },
];

const CROSS_BOSS = { name: 'Dimensional Titan', maxHp: 50000000 };

const SEASON_REWARDS = {
  1:  { gold: 500000, boundBalens: 300, insignia: 500 },
  2:  { gold: 350000, boundBalens: 200, insignia: 350 },
  3:  { gold: 250000, boundBalens: 150, insignia: 250 },
  10: { gold: 100000, boundBalens: 50,  insignia: 100 },
  50: { gold: 50000,  boundBalens: 20,  insignia: 50 },
};

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS cross_server (
      char_id       INTEGER PRIMARY KEY REFERENCES characters(id),
      arena_wins    INTEGER DEFAULT 0,
      arena_losses  INTEGER DEFAULT 0,
      arena_rating  INTEGER DEFAULT 1000,
      arena_fights  INTEGER DEFAULT 0,
      boss_damage   INTEGER DEFAULT 0,
      boss_attacks  INTEGER DEFAULT 0,
      gw_wins       INTEGER DEFAULT 0,
      gw_fights     INTEGER DEFAULT 0,
      last_date     TEXT DEFAULT '',
      season        INTEGER DEFAULT 1,
      season_claimed INTEGER DEFAULT 0
    );
  `);
}

function ensureEntry(charId) {
  db.getDatabase().prepare('INSERT OR IGNORE INTO cross_server (char_id) VALUES (?)').run(charId);
}

function resetDaily(charId) {
  const r = db.getDatabase().prepare('SELECT last_date FROM cross_server WHERE char_id = ?').get(charId);
  const today = new Date().toISOString().slice(0, 10);
  if (r && r.last_date !== today) {
    db.getDatabase().prepare('UPDATE cross_server SET arena_fights = 0, boss_attacks = 0, gw_fights = 0, last_date = ? WHERE char_id = ?').run(today, charId);
  }
}

function getCrossArenaInfo(charId) {
  ensureEntry(charId); resetDaily(charId);
  const r = db.getDatabase().prepare('SELECT * FROM cross_server WHERE char_id = ?').get(charId);
  const opps = SIM_OPPONENTS.map(o => ({ ...o, br: o.br + Math.floor((Math.random() - 0.5) * 10000) })).sort(() => Math.random() - 0.5).slice(0, 3);
  return { success: true, rating: r.arena_rating, wins: r.arena_wins, losses: r.arena_losses, fightsToday: r.arena_fights, maxFights: DAILY_ARENA, opponents: opps };
}

function crossArenaFight(charId, oppIdx) {
  ensureEntry(charId); resetDaily(charId);
  const r = db.getDatabase().prepare('SELECT * FROM cross_server WHERE char_id = ?').get(charId);
  if (r.arena_fights >= DAILY_ARENA) return { success: false, msg: 'No fights left' };
  const char = db.getCharacterById(charId);
  if (!char) return { success: false, msg: 'Not found' };
  const opp = SIM_OPPONENTS[oppIdx % SIM_OPPONENTS.length];
  const oppBr = opp.br + Math.floor((Math.random() - 0.5) * 10000);
  const won = Math.random() < Math.min(0.9, Math.max(0.1, 0.5 + ((char.battle_rating || 1000) - oppBr) / 100000));
  const ratingChange = won ? 15 + Math.floor(Math.random() * 10) : -(10 + Math.floor(Math.random() * 8));
  const newRating = Math.max(0, r.arena_rating + ratingChange);
  const gold = won ? 10000 : 2000;
  const insignia = won ? 30 : 5;
  db.getDatabase().prepare('UPDATE cross_server SET arena_fights = arena_fights + 1, arena_rating = ?, arena_wins = arena_wins + ?, arena_losses = arena_losses + ? WHERE char_id = ?')
    .run(newRating, won ? 1 : 0, won ? 0 : 1, charId);
  db.getDatabase().prepare('UPDATE characters SET gold = gold + ?, insignia = insignia + ? WHERE id = ?').run(gold, insignia, charId);
  return { success: true, won, opponent: { name: opp.name, br: oppBr }, ratingChange, newRating, rewards: { gold, insignia } };
}

function getCrossBossInfo(charId) {
  ensureEntry(charId); resetDaily(charId);
  const r = db.getDatabase().prepare('SELECT * FROM cross_server WHERE char_id = ?').get(charId);
  return { success: true, boss: CROSS_BOSS.name, yourDamage: r.boss_damage, attacksToday: r.boss_attacks, maxAttacks: DAILY_BOSS };
}

function attackCrossBoss(charId) {
  ensureEntry(charId); resetDaily(charId);
  const r = db.getDatabase().prepare('SELECT * FROM cross_server WHERE char_id = ?').get(charId);
  if (r.boss_attacks >= DAILY_BOSS) return { success: false, msg: 'No attacks left' };
  const char = db.getCharacterById(charId);
  const dmg = Math.floor((char?.battle_rating || 1000) * (0.8 + Math.random() * 0.4));
  const gold = Math.floor(dmg * 0.01);
  const exp = Math.floor(dmg * 0.005);
  db.getDatabase().prepare('UPDATE cross_server SET boss_damage = boss_damage + ?, boss_attacks = boss_attacks + 1 WHERE char_id = ?').run(dmg, charId);
  db.getDatabase().prepare('UPDATE characters SET gold = gold + ?, exp = exp + ? WHERE id = ?').run(gold, exp, charId);
  return { success: true, damage: dmg, totalDamage: r.boss_damage + dmg, rewards: { gold, exp } };
}

function getCrossGWInfo(charId) {
  ensureEntry(charId); resetDaily(charId);
  const r = db.getDatabase().prepare('SELECT * FROM cross_server WHERE char_id = ?').get(charId);
  return { success: true, wins: r.gw_wins, fightsToday: r.gw_fights, maxFights: DAILY_GW };
}

function crossGWFight(charId) {
  ensureEntry(charId); resetDaily(charId);
  const r = db.getDatabase().prepare('SELECT * FROM cross_server WHERE char_id = ?').get(charId);
  if (r.gw_fights >= DAILY_GW) return { success: false, msg: 'No GW fights left' };
  const won = Math.random() < 0.55;
  const gold = won ? 20000 : 5000;
  db.getDatabase().prepare('UPDATE cross_server SET gw_fights = gw_fights + 1, gw_wins = gw_wins + ? WHERE char_id = ?').run(won ? 1 : 0, charId);
  db.getDatabase().prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').run(gold, charId);
  return { success: true, won, rewards: { gold } };
}

function getSeasonInfo(charId) {
  ensureEntry(charId);
  const r = db.getDatabase().prepare('SELECT * FROM cross_server WHERE char_id = ?').get(charId);
  return { success: true, season: r.season, arenaRating: r.arena_rating, claimed: !!r.season_claimed };
}

function claimSeasonReward(charId) {
  ensureEntry(charId);
  const r = db.getDatabase().prepare('SELECT * FROM cross_server WHERE char_id = ?').get(charId);
  if (r.season_claimed) return { success: false, msg: 'Already claimed' };
  let rank = 100;
  if (r.arena_rating > 2000) rank = 1;
  else if (r.arena_rating > 1800) rank = 2;
  else if (r.arena_rating > 1600) rank = 3;
  else if (r.arena_rating > 1400) rank = 10;
  else if (r.arena_rating > 1200) rank = 50;
  let reward = null;
  for (const [th, rw] of Object.entries(SEASON_REWARDS).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    if (rank <= Number(th)) { reward = rw; break; }
  }
  if (!reward) return { success: false, msg: 'No reward' };
  if (reward.gold) db.getDatabase().prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').run(reward.gold, charId);
  if (reward.boundBalens) db.getDatabase().prepare('UPDATE characters SET bound_balens = bound_balens + ? WHERE id = ?').run(reward.boundBalens, charId);
  if (reward.insignia) db.getDatabase().prepare('UPDATE characters SET insignia = insignia + ? WHERE id = ?').run(reward.insignia, charId);
  db.getDatabase().prepare('UPDATE cross_server SET season_claimed = 1 WHERE char_id = ?').run(charId);
  return { success: true, rank, reward };
}

module.exports = {
  OPCODES, DAILY_ARENA, DAILY_BOSS, DAILY_GW, SEASON_REWARDS, initDB,
  getCrossArenaInfo, crossArenaFight, getCrossBossInfo, attackCrossBoss,
  getCrossGWInfo, crossGWFight, getSeasonInfo, claimSeasonReward,
};
