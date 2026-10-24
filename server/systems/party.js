'use strict';

const db = require('../db');

const OPCODES = {
  C_PARTY_CREATE:     0x6A00,
  S_PARTY_INFO_RSP:   0x6A10,
  C_PARTY_INVITE:     0x6A01,
  S_PARTY_INVITE_RSP: 0x6A11,
  C_PARTY_ACCEPT:     0x6A02,
  C_PARTY_LEAVE:      0x6A03,
  C_PARTY_KICK:       0x6A04,
  C_PARTY_INFO:       0x6A05,
  C_MPD_LIST:         0x6A06,
  S_MPD_LIST_RSP:     0x6A16,
  C_MPD_ENTER:        0x6A07,
  S_MPD_ENTER_RSP:    0x6A17,
  C_MPD_FIGHT:        0x6A08,
  S_MPD_FIGHT_RSP:    0x6A18,
  C_MPD_INFO:         0x6A09,
  S_MPD_INFO_RSP:     0x6913,
};

const MAX_PARTY_SIZE = 4;
const DAILY_MPD_RUNS = 3;

const DIFFICULTY = { NORMAL: 0, NIGHTMARE: 1, HELL: 2 };
const DIFF_NAMES = ['Normal', 'Nightmare', 'Hell'];
const DIFF_STAT_MUL = [1.0, 1.8, 3.0];
const DIFF_REWARD_MUL = [1.0, 2.0, 3.5];

const DUNGEONS = [
  {
    id: 1, name: 'Forgotten Catacombs', minLevel: 18,
    bossName: 'Yaros the Forgotten',
    baseHp: 8000, baseAtk: 200, baseDef: 80,
    baseExp: 3000, baseGold: 2000, baseDaru: 500,
  },
  {
    id: 2, name: 'Sacrifice Shrine', minLevel: 25,
    bossName: 'High Priest Mordon',
    baseHp: 18000, baseAtk: 350, baseDef: 140,
    baseExp: 6000, baseGold: 4000, baseDaru: 1000,
  },
  {
    id: 3, name: 'Dragon\'s Den', minLevel: 35,
    bossName: 'Voidscale Dragon',
    baseHp: 40000, baseAtk: 600, baseDef: 250,
    baseExp: 12000, baseGold: 8000, baseDaru: 2000,
  },
  {
    id: 4, name: 'Void Palace', minLevel: 45,
    bossName: 'Shadow Emperor',
    baseHp: 80000, baseAtk: 1000, baseDef: 400,
    baseExp: 22000, baseGold: 15000, baseDaru: 4000,
  },
  {
    id: 5, name: 'Demon Abyss', minLevel: 55,
    bossName: 'Archdemon Kuzul',
    baseHp: 150000, baseAtk: 1600, baseDef: 650,
    baseExp: 40000, baseGold: 28000, baseDaru: 7000,
  },
  {
    id: 6, name: 'Celestial Sanctum', minLevel: 70,
    bossName: 'Seraph Guardian',
    baseHp: 300000, baseAtk: 2500, baseDef: 1000,
    baseExp: 75000, baseGold: 50000, baseDaru: 12000,
  },
  {
    id: 7, name: 'Frozen Tomb', minLevel: 40,
    bossName: 'Ice Lich King',
    baseHp: 60000, baseAtk: 800, baseDef: 320,
    baseExp: 16000, baseGold: 10000, baseDaru: 3000,
  },
  {
    id: 8, name: 'Burning Pit', minLevel: 50,
    bossName: 'Inferno Warden',
    baseHp: 120000, baseAtk: 1300, baseDef: 520,
    baseExp: 30000, baseGold: 20000, baseDaru: 5500,
  },
  {
    id: 9, name: 'Shadow Throne', minLevel: 60,
    bossName: 'Void King',
    baseHp: 220000, baseAtk: 2000, baseDef: 800,
    baseExp: 55000, baseGold: 38000, baseDaru: 9000,
  },
  {
    id: 10, name: 'Divine Colosseum', minLevel: 75,
    bossName: 'Titan Overlord',
    baseHp: 500000, baseAtk: 3500, baseDef: 1400,
    baseExp: 100000, baseGold: 70000, baseDaru: 18000,
  },
];

// In-memory party state (parties don't persist across restarts)
const parties = new Map();   // partyId → { id, leaderId, members: [charId], createdAt }
const playerParty = new Map(); // charId → partyId
const pendingInvites = new Map(); // charId → { partyId, fromCharId, expiresAt }
let nextPartyId = 1;

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS mpd_runs (
      char_id     INTEGER NOT NULL REFERENCES characters(id),
      dungeon_id  INTEGER NOT NULL,
      difficulty  INTEGER NOT NULL DEFAULT 0,
      run_date    TEXT NOT NULL,
      completed   INTEGER DEFAULT 0,
      exp_reward  INTEGER DEFAULT 0,
      gold_reward INTEGER DEFAULT 0,
      PRIMARY KEY (char_id, dungeon_id, difficulty, run_date, completed)
    );
    CREATE TABLE IF NOT EXISTS mpd_daily (
      char_id    INTEGER PRIMARY KEY REFERENCES characters(id),
      runs_today INTEGER DEFAULT 0,
      last_date  TEXT DEFAULT ''
    );
  `);
}

function ensureMpdDaily(charId) {
  db.getDatabase().prepare('INSERT OR IGNORE INTO mpd_daily (char_id) VALUES (?)').run(charId);
  const today = new Date().toISOString().slice(0, 10);
  const row = db.getDatabase().prepare('SELECT last_date FROM mpd_daily WHERE char_id = ?').get(charId);
  if (row && row.last_date !== today) {
    db.getDatabase().prepare('UPDATE mpd_daily SET runs_today = 0, last_date = ? WHERE char_id = ?').run(today, charId);
  }
}

// ─── Party Management ───────────────────────

function createParty(charId) {
  if (playerParty.has(charId)) {
    return { success: false, msg: 'Already in a party' };
  }

  const id = nextPartyId++;
  const party = { id, leaderId: charId, members: [charId], createdAt: Date.now() };
  parties.set(id, party);
  playerParty.set(charId, id);

  return { success: true, party: formatParty(party) };
}

function inviteToParty(charId, targetCharId) {
  const partyId = playerParty.get(charId);
  if (!partyId) return { success: false, msg: 'You are not in a party' };

  const party = parties.get(partyId);
  if (!party) return { success: false, msg: 'Party not found' };
  if (party.leaderId !== charId) return { success: false, msg: 'Only the leader can invite' };
  if (party.members.length >= MAX_PARTY_SIZE) return { success: false, msg: 'Party is full' };
  if (playerParty.has(targetCharId)) return { success: false, msg: 'Target is already in a party' };

  const target = db.getCharacterById(targetCharId);
  if (!target) return { success: false, msg: 'Player not found' };
  if (!target.is_online) return { success: false, msg: 'Player is offline' };

  pendingInvites.set(targetCharId, {
    partyId,
    fromCharId: charId,
    expiresAt: Date.now() + 60000,
  });

  return { success: true, msg: `Invited ${target.nick_name}` };
}

function acceptInvite(charId) {
  const invite = pendingInvites.get(charId);
  if (!invite) return { success: false, msg: 'No pending invite' };

  pendingInvites.delete(charId);

  if (invite.expiresAt < Date.now()) return { success: false, msg: 'Invite expired' };
  if (playerParty.has(charId)) return { success: false, msg: 'Already in a party' };

  const party = parties.get(invite.partyId);
  if (!party) return { success: false, msg: 'Party no longer exists' };
  if (party.members.length >= MAX_PARTY_SIZE) return { success: false, msg: 'Party is full' };

  party.members.push(charId);
  playerParty.set(charId, party.id);

  return { success: true, party: formatParty(party) };
}

function leaveParty(charId) {
  const partyId = playerParty.get(charId);
  if (!partyId) return { success: false, msg: 'Not in a party' };

  const party = parties.get(partyId);
  if (!party) {
    playerParty.delete(charId);
    return { success: true };
  }

  party.members = party.members.filter(m => m !== charId);
  playerParty.delete(charId);

  if (party.members.length === 0) {
    parties.delete(partyId);
  } else if (party.leaderId === charId) {
    party.leaderId = party.members[0];
  }

  return { success: true };
}

function kickMember(charId, targetCharId) {
  const partyId = playerParty.get(charId);
  if (!partyId) return { success: false, msg: 'Not in a party' };

  const party = parties.get(partyId);
  if (!party) return { success: false, msg: 'Party not found' };
  if (party.leaderId !== charId) return { success: false, msg: 'Only the leader can kick' };
  if (targetCharId === charId) return { success: false, msg: 'Cannot kick yourself' };
  if (!party.members.includes(targetCharId)) return { success: false, msg: 'Player not in your party' };

  party.members = party.members.filter(m => m !== targetCharId);
  playerParty.delete(targetCharId);

  return { success: true, party: formatParty(party) };
}

function getPartyInfo(charId) {
  const partyId = playerParty.get(charId);
  if (!partyId) return { inParty: false };

  const party = parties.get(partyId);
  if (!party) {
    playerParty.delete(charId);
    return { inParty: false };
  }

  return { inParty: true, party: formatParty(party) };
}

function formatParty(party) {
  const members = party.members.map(mid => {
    const c = db.getCharacterById(mid);
    return c ? {
      charId: mid,
      name: c.nick_name,
      level: c.grade,
      class: c.job,
      hp: c.max_hp || c.hp,
      attack: c.attack,
      defence: c.defence,
      isLeader: mid === party.leaderId,
      isOnline: !!c.is_online,
    } : { charId: mid, name: '???', isLeader: mid === party.leaderId };
  });

  return { id: party.id, leaderId: party.leaderId, members, size: members.length, maxSize: MAX_PARTY_SIZE };
}

// ─── Multiplayer Dungeon ────────────────────

function getDungeonList(charId) {
  const char = db.getCharacterById(charId);
  if (!char) return { dungeons: [] };

  ensureMpdDaily(charId);
  const daily = db.getDatabase().prepare('SELECT runs_today FROM mpd_daily WHERE char_id = ?').get(charId);

  return {
    dungeons: DUNGEONS.map(d => ({
      id: d.id,
      name: d.name,
      minLevel: d.minLevel,
      bossName: d.bossName,
      unlocked: char.grade >= d.minLevel,
      difficulties: DIFF_NAMES,
    })),
    runsToday: daily ? daily.runs_today : 0,
    maxRuns: DAILY_MPD_RUNS,
  };
}

function getDungeonInfo(dungeonId, difficulty) {
  const tmpl = DUNGEONS.find(d => d.id === dungeonId);
  if (!tmpl) return { success: false, msg: 'Unknown dungeon' };

  const diff = DIFF_STAT_MUL[difficulty] || DIFF_STAT_MUL[0];
  const rewardMul = DIFF_REWARD_MUL[difficulty] || DIFF_REWARD_MUL[0];

  return {
    success: true,
    id: tmpl.id,
    name: tmpl.name,
    difficulty: DIFF_NAMES[difficulty] || 'Normal',
    minLevel: tmpl.minLevel,
    bossName: tmpl.bossName,
    bossHp: Math.floor(tmpl.baseHp * diff),
    bossAtk: Math.floor(tmpl.baseAtk * diff),
    bossDef: Math.floor(tmpl.baseDef * diff),
    expReward: Math.floor(tmpl.baseExp * rewardMul),
    goldReward: Math.floor(tmpl.baseGold * rewardMul),
    daruReward: Math.floor(tmpl.baseDaru * rewardMul),
  };
}

function enterDungeon(charId, dungeonId, difficulty) {
  const partyId = playerParty.get(charId);
  const party = partyId ? parties.get(partyId) : null;

  if (party && party.leaderId !== charId) {
    return { success: false, msg: 'Only the party leader can enter a dungeon' };
  }

  const tmpl = DUNGEONS.find(d => d.id === dungeonId);
  if (!tmpl) return { success: false, msg: 'Unknown dungeon' };

  const diff = Math.min(Math.max(difficulty || 0, 0), 2);
  const memberIds = party ? party.members : [charId];

  for (const mid of memberIds) {
    const c = db.getCharacterById(mid);
    if (!c) return { success: false, msg: 'Party member not found' };
    if (c.grade < tmpl.minLevel) return { success: false, msg: `${c.nick_name} needs level ${tmpl.minLevel}` };

    ensureMpdDaily(mid);
    const daily = db.getDatabase().prepare('SELECT runs_today FROM mpd_daily WHERE char_id = ?').get(mid);
    if (daily && daily.runs_today >= DAILY_MPD_RUNS) {
      return { success: false, msg: `${c.nick_name} has no MPD runs left today` };
    }
  }

  return {
    success: true,
    dungeonId,
    dungeonName: tmpl.name,
    difficulty: DIFF_NAMES[diff],
    bossName: tmpl.bossName,
    partySize: memberIds.length,
    members: memberIds.map(mid => {
      const c = db.getCharacterById(mid);
      return { charId: mid, name: c.nick_name, level: c.grade };
    }),
  };
}

function fightBoss(charId, dungeonId, difficulty) {
  const partyId = playerParty.get(charId);
  const party = partyId ? parties.get(partyId) : null;
  const memberIds = party ? party.members : [charId];

  const tmpl = DUNGEONS.find(d => d.id === dungeonId);
  if (!tmpl) return { success: false, msg: 'Unknown dungeon' };

  const diff = Math.min(Math.max(difficulty || 0, 0), 2);
  const statMul = DIFF_STAT_MUL[diff];
  const rewardMul = DIFF_REWARD_MUL[diff];

  // Verify all members can run
  const chars = [];
  for (const mid of memberIds) {
    const c = db.getCharacterById(mid);
    if (!c) return { success: false, msg: 'Party member not found' };
    if (c.grade < tmpl.minLevel) return { success: false, msg: `${c.nick_name} needs level ${tmpl.minLevel}` };

    ensureMpdDaily(mid);
    const daily = db.getDatabase().prepare('SELECT runs_today FROM mpd_daily WHERE char_id = ?').get(mid);
    if (daily && daily.runs_today >= DAILY_MPD_RUNS) {
      return { success: false, msg: `${c.nick_name} has no MPD runs left today` };
    }
    chars.push(c);
  }

  // Sylph bonuses from equipped sylphs
  let sylphBonusAtk = 0, sylphBonusDef = 0, sylphBonusHp = 0;
  try {
    const sylphMod = require('./sylph');
    for (const mid of memberIds) {
      const sylphs = sylphMod.getSylphs(mid);
      const equipped = sylphs.find(s => s.equipped);
      if (equipped) {
        sylphBonusAtk += equipped.attack;
        sylphBonusDef += equipped.defence;
        sylphBonusHp += equipped.hp;
      }
    }
  } catch (e) { /* sylph module not ready */ }

  // Combined party stats (includes sylph bonuses)
  const totalAtk = chars.reduce((s, c) => s + c.attack, 0) + sylphBonusAtk;
  const totalDef = chars.reduce((s, c) => s + c.defence, 0) + sylphBonusDef;
  const totalHp = chars.reduce((s, c) => s + (c.max_hp || c.hp), 0) + sylphBonusHp;
  const avgAtk = Math.floor(totalAtk / chars.length);
  const avgDef = Math.floor(totalDef / chars.length);

  // Boss stats (scaled by difficulty)
  const bossHp = Math.floor(tmpl.baseHp * statMul);
  const bossAtk = Math.floor(tmpl.baseAtk * statMul);
  const bossDef = Math.floor(tmpl.baseDef * statMul);

  // Simulate combat
  let partyHp = totalHp;
  let mHp = bossHp;
  const rounds = [];
  let roundNum = 0;

  while (mHp > 0 && partyHp > 0 && roundNum < 40) {
    roundNum++;

    // Party attacks boss
    const pDmg = Math.max(1, Math.floor(totalAtk * totalAtk / (totalAtk + bossDef)));
    const crit = Math.random() < 0.12;
    const finalDmg = crit ? Math.floor(pDmg * 1.5) : pDmg;
    mHp -= finalDmg;

    // Boss attacks party
    let mDmg = 0;
    if (mHp > 0) {
      mDmg = Math.max(1, Math.floor(bossAtk * bossAtk / (bossAtk + totalDef)));
      partyHp -= mDmg;
    }

    rounds.push({
      round: roundNum,
      partyDmg: finalDmg,
      crit,
      bossDmg: mDmg,
      partyHp: Math.max(0, partyHp),
      bossHp: Math.max(0, mHp),
    });
  }

  const won = mHp <= 0;

  // Party size bonus: 10% per extra member
  const partySizeBonus = 1.0 + (chars.length - 1) * 0.1;

  let expReward = 0, goldReward = 0, daruReward = 0;
  if (won) {
    expReward = Math.floor(tmpl.baseExp * rewardMul * partySizeBonus);
    goldReward = Math.floor(tmpl.baseGold * rewardMul * partySizeBonus);
    daruReward = Math.floor(tmpl.baseDaru * rewardMul * partySizeBonus);
  }

  const today = new Date().toISOString().slice(0, 10);

  // Consume a run and give rewards to each member
  for (const mid of memberIds) {
    db.getDatabase().prepare('UPDATE mpd_daily SET runs_today = runs_today + 1 WHERE char_id = ?').run(mid);

    if (won) {
      db.getDatabase().prepare('UPDATE characters SET exp = exp + ?, gold = gold + ? WHERE id = ?')
        .run(expReward, goldReward, mid);

      db.getDatabase().prepare(`
        INSERT INTO mpd_runs (char_id, dungeon_id, difficulty, run_date, completed, exp_reward, gold_reward)
        VALUES (?, ?, ?, ?, 1, ?, ?)
      `).run(mid, dungeonId, diff, today, expReward, goldReward);

      // Quest progress
      try {
        const quest = require('./quest');
        quest.updateProgress(mid, 'mpd', String(dungeonId));
        quest.checkLevelUp(mid);
      } catch (e) { /* ignore */ }

      // Achievement triggers
      try {
        const achievement = require('./achievement');
        achievement.incrementStat(mid, 'mpd_completed', 1);
      } catch (e) { /* ignore */ }

      // Random drop rewards scaled by difficulty
      try {
        const inventory = require('./inventory');
        const dropChance = 0.3 + diff * 0.15;
        const possibleDrops = [
          { itemId: 100001, count: 5 },
          { itemId: 100003, count: 2 },
          { itemId: 3001, count: 1, quality: diff + 1 },
        ];
        for (const drop of possibleDrops) {
          if (Math.random() < dropChance) {
            inventory.addItem(mid, drop.itemId, drop.count, drop.quality || 0);
          }
        }
      } catch (e) { /* ignore */ }
    }
  }

  return {
    success: true,
    won,
    dungeonId,
    dungeonName: tmpl.name,
    difficulty: DIFF_NAMES[diff],
    bossName: tmpl.bossName,
    partySize: chars.length,
    rounds: rounds.slice(-6),
    rewards: won ? { exp: expReward, gold: goldReward, daru: daruReward, partySizeBonus: Math.round((partySizeBonus - 1) * 100) + '%' } : null,
  };
}

module.exports = {
  OPCODES, DUNGEONS, DIFFICULTY, DIFF_NAMES, MAX_PARTY_SIZE, DAILY_MPD_RUNS,
  initDB,
  createParty, inviteToParty, acceptInvite, leaveParty, kickMember, getPartyInfo,
  getDungeonList, getDungeonInfo, enterDungeon, fightBoss,
};
