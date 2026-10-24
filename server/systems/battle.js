/**
 * Wartune Ultra — Battle System
 * Turn-based combat, PvE and PvP, damage calculation
 */

'use strict';

const { encode } = require('../proto');
const { buildPacket } = require('../packet');
const db = require('../db');

const OPCODES = {
  C_BATTLE_START:    0x1B58,  // 7000 — Start PvE battle
  S_BATTLE_INIT:     0x1020,  // 4128 — Battle initialization
  S_BATTLE_ROUND:    0x1021,  // 4129 — Round actions/results
  S_BATTLE_END:      0x1022,  // 4130 — Battle end + rewards
  C_BATTLE_ACTION:   0x1B59,  // 7001 — Player action selection
  C_BATTLE_AUTO:     0x1B5A,  // 7002 — Toggle auto-battle
  C_PVP_CHALLENGE:   0x1B5B,  // 7003 — PvP challenge
  S_PVP_RESULT:      0x1023,  // 4131 — PvP result
};

// Battle states
const STATE = {
  WAITING:  0,
  ACTIVE:   1,
  FINISHED: 2,
};

// Active battles in memory
const activeBattles = new Map();
let battleIdCounter = 1;

// ─── Monster Templates ──────────────────
const MONSTERS = {
  // ID: { name, level, hp, attack, defence, magicAttack, magicDefence, exp, gold }
  1001: { name: 'Goblin', level: 1, hp: 500, attack: 30, defence: 10, magicAttack: 0, magicDefence: 5, exp: 20, gold: 15 },
  1002: { name: 'Wolf', level: 2, hp: 800, attack: 45, defence: 15, magicAttack: 0, magicDefence: 8, exp: 35, gold: 25 },
  1003: { name: 'Skeleton', level: 3, hp: 1200, attack: 60, defence: 25, magicAttack: 20, magicDefence: 15, exp: 50, gold: 40 },
  1004: { name: 'Dark Mage', level: 5, hp: 1500, attack: 40, defence: 20, magicAttack: 80, magicDefence: 30, exp: 80, gold: 60 },
  1005: { name: 'Orc Warrior', level: 7, hp: 2500, attack: 100, defence: 50, magicAttack: 10, magicDefence: 25, exp: 120, gold: 90 },
  1006: { name: 'Dragon Whelp', level: 10, hp: 4000, attack: 150, defence: 80, magicAttack: 120, magicDefence: 60, exp: 200, gold: 150 },
  1007: { name: 'Shadow Knight', level: 15, hp: 8000, attack: 250, defence: 120, magicAttack: 180, magicDefence: 90, exp: 400, gold: 300 },
  1008: { name: 'Demon Lord', level: 20, hp: 15000, attack: 400, defence: 200, magicAttack: 350, magicDefence: 150, exp: 800, gold: 600 },
  // Boss monsters
  2001: { name: 'Cave Troll (Boss)', level: 10, hp: 10000, attack: 200, defence: 100, magicAttack: 50, magicDefence: 80, exp: 500, gold: 400 },
  2002: { name: 'Lich King (Boss)', level: 20, hp: 25000, attack: 300, defence: 150, magicAttack: 500, magicDefence: 200, exp: 1500, gold: 1000 },
  2003: { name: 'Ancient Dragon (Boss)', level: 30, hp: 50000, attack: 500, defence: 300, magicAttack: 600, magicDefence: 350, exp: 3000, gold: 2000 },
};

/**
 * Start a PvE battle
 */
function startBattle(ws, monsterIds, campaignId = 0) {
  const charId = ws.session?.charId;
  if (!charId) return;

  const char = db.getCharacterById(charId);
  if (!char) return;

  const battleId = battleIdCounter++;
  const monsters = monsterIds.map((mid, idx) => {
    const template = MONSTERS[mid] || MONSTERS[1001];
    return {
      id: idx + 1,
      templateId: mid,
      name: template.name,
      level: template.level,
      hp: template.hp,
      maxHp: template.hp,
      attack: template.attack,
      defence: template.defence,
      magicAttack: template.magicAttack,
      magicDefence: template.magicDefence,
      exp: template.exp,
      gold: template.gold,
      alive: true,
    };
  });

  const battle = {
    id: battleId,
    state: STATE.ACTIVE,
    campaignId,
    round: 0,
    maxRounds: 30,
    player: {
      charId: char.id,
      name: char.nick_name,
      level: char.grade,
      hp: char.hp,
      maxHp: char.max_hp,
      attack: char.attack,
      defence: char.defence,
      magicAttack: char.magic_attack,
      magicDefence: char.magic_defence,
      job: char.job,
      alive: true,
    },
    monsters,
    ws,
    auto: false,
  };

  activeBattles.set(battleId, battle);

  // Send battle init
  sendBattleInit(ws, battle);

  // Start first round
  setTimeout(() => processRound(battleId), 1000);

  return battleId;
}

/**
 * Send battle initialization to client
 */
function sendBattleInit(ws, battle) {
  try {
    const body = encode('com.road.yishi.proto.battle.BattleInitMsg', {
      battleId: battle.id,
      round: 0,
      maxRounds: battle.maxRounds,
      playerId: battle.player.charId,
      playerHp: battle.player.hp,
      playerMaxHp: battle.player.maxHp,
      monsters: battle.monsters.map(m => ({
        id: m.id,
        templateId: m.templateId,
        name: m.name,
        level: m.level,
        hp: m.hp,
        maxHp: m.maxHp,
      })),
    });
    const pkt = buildPacket(OPCODES.S_BATTLE_INIT, body, battle.player.charId);
    if (ws.readyState === 1) ws.send(pkt);
  } catch (e) {
    console.error('[BATTLE] Init encode error:', e.message);
  }
}

/**
 * Process one battle round
 */
function processRound(battleId) {
  const battle = activeBattles.get(battleId);
  if (!battle || battle.state !== STATE.ACTIVE) return;

  battle.round++;
  const actions = [];

  // ─── Player attacks ────────────────
  if (battle.player.alive) {
    const target = battle.monsters.find(m => m.alive);
    if (target) {
      const dmg = calcDamage(battle.player, target, 'physical');
      target.hp -= dmg;
      if (target.hp <= 0) {
        target.hp = 0;
        target.alive = false;
      }
      actions.push({
        attackerId: battle.player.charId,
        attackerType: 0, // player
        targetId: target.id,
        targetType: 1, // monster
        damage: dmg,
        skillId: 0,
        targetHp: target.hp,
        isCrit: dmg > calcBaseDamage(battle.player.attack, target.defence) * 1.3,
      });
    }
  }

  // ─── Monsters attack ───────────────
  for (const monster of battle.monsters) {
    if (!monster.alive || !battle.player.alive) continue;

    const dmg = calcDamage(monster, battle.player, monster.magicAttack > monster.attack ? 'magic' : 'physical');
    battle.player.hp -= dmg;
    if (battle.player.hp <= 0) {
      battle.player.hp = 0;
      battle.player.alive = false;
    }
    actions.push({
      attackerId: monster.id,
      attackerType: 1,
      targetId: battle.player.charId,
      targetType: 0,
      damage: dmg,
      skillId: 0,
      targetHp: battle.player.hp,
      isCrit: false,
    });
  }

  // Send round result
  sendRoundResult(battle, actions);

  // Check win/lose conditions
  const allMonstersDead = battle.monsters.every(m => !m.alive);
  const playerDead = !battle.player.alive;
  const maxRoundsReached = battle.round >= battle.maxRounds;

  if (allMonstersDead || playerDead || maxRoundsReached) {
    battle.state = STATE.FINISHED;
    const won = allMonstersDead && battle.player.alive;
    setTimeout(() => endBattle(battleId, won), 500);
  } else {
    // Next round
    setTimeout(() => processRound(battleId), 1500);
  }
}

/**
 * Send round actions to client
 */
function sendRoundResult(battle, actions) {
  try {
    const body = encode('com.road.yishi.proto.battle.BattleRoundMsg', {
      battleId: battle.id,
      round: battle.round,
      actions: actions.map(a => ({
        attackerId: a.attackerId,
        attackerType: a.attackerType,
        targetId: a.targetId,
        targetType: a.targetType,
        damage: a.damage,
        skillId: a.skillId,
        targetHp: a.targetHp,
        isCrit: a.isCrit,
      })),
      playerHp: battle.player.hp,
    });
    const pkt = buildPacket(OPCODES.S_BATTLE_ROUND, body, battle.player.charId);
    if (battle.ws.readyState === 1) battle.ws.send(pkt);
  } catch (e) {
    console.error('[BATTLE] Round encode error:', e.message);
  }
}

/**
 * End battle, give rewards
 */
function endBattle(battleId, won) {
  const battle = activeBattles.get(battleId);
  if (!battle) return;

  let expReward = 0, goldReward = 0;
  const drops = [];

  if (won) {
    for (const m of battle.monsters) {
      expReward += m.exp;
      goldReward += m.gold;
    }

    // Add rewards to character
    const char = db.getCharacterById(battle.player.charId);
    if (char) {
      const newExp = char.exp + expReward;
      const newGold = char.gold + goldReward;

      // Level up check
      let newLevel = char.grade;
      let remainExp = newExp;
      while (remainExp >= expForLevel(newLevel + 1) && newLevel < 100) {
        remainExp -= expForLevel(newLevel + 1);
        newLevel++;
      }

      db.updateCharacter(battle.player.charId, {
        exp: remainExp,
        gold: newGold,
        grade: newLevel,
        hp: char.max_hp, // Full heal after battle win
      });

      // Generate random drops
      const loot = generateDrops(battle.monsters, char.grade);
      drops.push(...loot);
    }
  } else {
    // Defeat: restore some HP
    db.updateCharacter(battle.player.charId, {
      hp: Math.floor(battle.player.maxHp * 0.3),
    });
  }

  // Send battle end message
  try {
    const body = encode('com.road.yishi.proto.battle.BattleEndMsg', {
      battleId: battle.id,
      result: won ? 1 : 0,
      expReward,
      goldReward,
      drops: drops.map(d => ({ itemId: d.itemId, count: d.count, quality: d.quality })),
    });
    const pkt = buildPacket(OPCODES.S_BATTLE_END, body, battle.player.charId);
    if (battle.ws.readyState === 1) battle.ws.send(pkt);
  } catch (e) {
    console.error('[BATTLE] End encode error:', e.message);
  }

  activeBattles.delete(battleId);
}

// ─── Damage Calculation ──────────────────
function calcDamage(attacker, defender, type) {
  let base;
  if (type === 'magic') {
    base = calcBaseDamage(attacker.magicAttack, defender.magicDefence);
  } else {
    base = calcBaseDamage(attacker.attack, defender.defence);
  }

  // Random variance ±10%
  const variance = 0.9 + Math.random() * 0.2;
  // Crit chance (10%)
  const crit = Math.random() < 0.1 ? 1.5 : 1.0;

  return Math.max(1, Math.floor(base * variance * crit));
}

function calcBaseDamage(attack, defence) {
  // Standard formula: attack^2 / (attack + defence)
  return Math.max(1, Math.floor((attack * attack) / (attack + defence)));
}

// ─── Level / EXP ─────────────────────────
function expForLevel(level) {
  // Progressive EXP curve
  return Math.floor(100 * level * level * 0.8);
}

// ─── Loot Generation ─────────────────────
function generateDrops(monsters, playerLevel) {
  const drops = [];
  for (const m of monsters) {
    // 30% chance per monster for a drop
    if (Math.random() < 0.3) {
      const quality = rollQuality(m.level);
      drops.push({
        itemId: 100001 + Math.floor(Math.random() * 20), // Random consumable
        count: 1 + Math.floor(Math.random() * 3),
        quality,
      });
    }
    // 10% chance for equipment drop
    if (Math.random() < 0.1) {
      const quality = rollQuality(m.level);
      drops.push({
        itemId: 1000 + Math.floor(Math.random() * 50), // Random equipment
        count: 1,
        quality,
      });
    }
  }
  return drops;
}

function rollQuality(monsterLevel) {
  const roll = Math.random();
  if (monsterLevel >= 20 && roll < 0.02) return 4; // Orange
  if (monsterLevel >= 10 && roll < 0.08) return 3; // Purple
  if (monsterLevel >= 5 && roll < 0.20) return 2;  // Blue
  if (roll < 0.45) return 1;                        // Green
  return 0;                                          // White
}

/**
 * PvP: simple one-round simulation
 */
function pvpBattle(challengerId, targetId) {
  const challenger = db.getCharacterById(challengerId);
  const target = db.getCharacterById(targetId);
  if (!challenger || !target) return null;

  // Simulate 10 rounds
  let cHp = challenger.hp, tHp = target.hp;
  const rounds = [];

  for (let r = 0; r < 10 && cHp > 0 && tHp > 0; r++) {
    const cDmg = calcDamage(challenger, target, 'physical');
    tHp -= cDmg;
    const tDmg = tHp > 0 ? calcDamage(target, challenger, 'physical') : 0;
    cHp -= tDmg;
    rounds.push({ round: r + 1, challengerDmg: cDmg, targetDmg: tDmg, challengerHp: cHp, targetHp: tHp });
  }

  const won = cHp > tHp;
  return { won, rounds, challengerHp: cHp, targetHp: tHp };
}

module.exports = {
  OPCODES, MONSTERS, STATE,
  startBattle, endBattle, processRound,
  pvpBattle, calcDamage, expForLevel,
};
