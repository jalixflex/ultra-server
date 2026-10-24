'use strict';

const db = require('../db');

const OPCODES = {
  C_BUFF_LIST:     0x6E00,
  S_BUFF_LIST_RSP: 0x6E10,
};

// Buff types
const BUFF_TEMPLATES = {
  // Combat buffs
  atk_boost_10:    { name: 'Attack Boost I',   stat: 'attack',   pct: 10, duration: 300, stackable: false },
  atk_boost_20:    { name: 'Attack Boost II',  stat: 'attack',   pct: 20, duration: 300, stackable: false },
  def_boost_10:    { name: 'Defense Boost I',  stat: 'defence',  pct: 10, duration: 300, stackable: false },
  def_boost_20:    { name: 'Defense Boost II', stat: 'defence',  pct: 20, duration: 300, stackable: false },
  hp_boost_10:     { name: 'HP Boost I',       stat: 'max_hp',   pct: 10, duration: 300, stackable: false },
  hp_boost_20:     { name: 'HP Boost II',      stat: 'max_hp',   pct: 20, duration: 300, stackable: false },
  crit_boost:      { name: 'Critical Surge',   stat: 'crit',     flat: 15, duration: 180, stackable: false },

  // VIP/daily buffs
  vip_atk:         { name: 'VIP Attack',       stat: 'attack',   pct: 5, duration: 86400, stackable: true },
  vip_def:         { name: 'VIP Defense',      stat: 'defence',  pct: 5, duration: 86400, stackable: true },
  devotion_exp:    { name: 'Devotion EXP',     stat: 'exp_rate', pct: 20, duration: 3600, stackable: false },
  guild_blessing:  { name: 'Guild Blessing',   stat: 'attack',   pct: 8,  duration: 7200, stackable: false },

  // Debuffs (from bosses)
  poison:          { name: 'Poison',           stat: 'hp',       flat: -50, duration: 3, stackable: true, isDebuff: true },
  weaken:          { name: 'Weaken',           stat: 'attack',   pct: -15, duration: 3,  stackable: false, isDebuff: true },
  slow:            { name: 'Slow',             stat: 'speed',    pct: -20, duration: 2,  stackable: false, isDebuff: true },
};

// Rage system constants
const RAGE_PER_HIT     = 10;   // rage gained per attack
const RAGE_PER_TAKEN   = 5;    // rage gained when taking damage
const RAGE_MAX         = 100;
const RAGE_SKILL_COST  = 50;   // rage cost for ultimate skill

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS buffs (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id   INTEGER NOT NULL REFERENCES characters(id),
      buff_key  TEXT NOT NULL,
      stacks    INTEGER DEFAULT 1,
      expires_at TEXT NOT NULL,
      source    TEXT DEFAULT 'system',
      UNIQUE(char_id, buff_key)
    );
  `);
}

function addBuff(charId, buffKey, source = 'system') {
  const template = BUFF_TEMPLATES[buffKey];
  if (!template) return { success: false, msg: 'Unknown buff' };

  const expiresAt = new Date(Date.now() + template.duration * 1000).toISOString();

  if (template.stackable) {
    db.getDatabase().prepare(`
      INSERT INTO buffs (char_id, buff_key, stacks, expires_at, source)
      VALUES (?, ?, 1, ?, ?)
      ON CONFLICT(char_id, buff_key) DO UPDATE SET
        stacks = MIN(stacks + 1, 10),
        expires_at = excluded.expires_at
    `).run(charId, buffKey, expiresAt, source);
  } else {
    db.getDatabase().prepare(`
      INSERT INTO buffs (char_id, buff_key, stacks, expires_at, source)
      VALUES (?, ?, 1, ?, ?)
      ON CONFLICT(char_id, buff_key) DO UPDATE SET
        expires_at = excluded.expires_at
    `).run(charId, buffKey, expiresAt, source);
  }

  return { success: true, buff: buffKey, name: template.name };
}

function removeBuff(charId, buffKey) {
  db.getDatabase().prepare('DELETE FROM buffs WHERE char_id = ? AND buff_key = ?').run(charId, buffKey);
}

function getActiveBuffs(charId) {
  const now = new Date().toISOString();
  // Clean expired
  db.getDatabase().prepare('DELETE FROM buffs WHERE char_id = ? AND expires_at < ?').run(charId, now);

  const rows = db.getDatabase().prepare('SELECT * FROM buffs WHERE char_id = ?').all(charId);
  return rows.map(r => {
    const template = BUFF_TEMPLATES[r.buff_key] || {};
    return {
      key: r.buff_key,
      name: template.name || r.buff_key,
      stacks: r.stacks,
      stat: template.stat,
      pct: template.pct,
      flat: template.flat,
      isDebuff: !!template.isDebuff,
      expiresAt: r.expires_at,
      source: r.source,
    };
  });
}

function getBuffedStats(charId) {
  const char = db.getCharacterById(charId);
  if (!char) return null;

  const buffs = getActiveBuffs(charId);
  const stats = {
    attack: char.attack,
    defence: char.defence,
    max_hp: char.max_hp,
    hp: char.hp,
    magic_attack: char.magic_attack,
    magic_defence: char.magic_defence,
    crit: 10, // base crit %
    speed: 100,
    exp_rate: 100,
  };

  for (const b of buffs) {
    const stacks = b.stacks || 1;
    if (b.pct && stats[b.stat] !== undefined) {
      stats[b.stat] = Math.floor(stats[b.stat] * (1 + (b.pct * stacks) / 100));
    }
    if (b.flat && stats[b.stat] !== undefined) {
      stats[b.stat] += b.flat * stacks;
    }
  }

  return stats;
}

// Enhanced combat with rage
function createCombatState(charId) {
  const stats = getBuffedStats(charId);
  return {
    charId,
    hp: stats.max_hp,
    maxHp: stats.max_hp,
    attack: stats.attack,
    defence: stats.defence,
    magicAttack: stats.magic_attack,
    crit: stats.crit,
    rage: 0,
    buffs: getActiveBuffs(charId).filter(b => !b.isDebuff),
    debuffs: getActiveBuffs(charId).filter(b => b.isDebuff),
  };
}

function combatRound(attacker, defender) {
  const baseDmg = Math.max(1, Math.floor(attacker.attack * attacker.attack / (attacker.attack + defender.defence)));
  const variance = 0.85 + Math.random() * 0.3;
  const isCrit = Math.random() * 100 < attacker.crit;
  const damage = Math.floor(baseDmg * variance * (isCrit ? 1.5 : 1.0));

  defender.hp = Math.max(0, defender.hp - damage);
  attacker.rage = Math.min(RAGE_MAX, attacker.rage + RAGE_PER_HIT);
  defender.rage = Math.min(RAGE_MAX, defender.rage + RAGE_PER_TAKEN);

  return { damage, isCrit, attackerRage: attacker.rage, defenderHp: defender.hp };
}

function useRageSkill(combatState) {
  if (combatState.rage < RAGE_SKILL_COST) return null;
  combatState.rage -= RAGE_SKILL_COST;
  // Rage skill deals 2.5x damage
  return { rageDamage: Math.floor(combatState.attack * 2.5), rageUsed: RAGE_SKILL_COST };
}

module.exports = {
  OPCODES, BUFF_TEMPLATES,
  RAGE_PER_HIT, RAGE_PER_TAKEN, RAGE_MAX, RAGE_SKILL_COST,
  initDB,
  addBuff, removeBuff, getActiveBuffs, getBuffedStats,
  createCombatState, combatRound, useRageSkill,
};
