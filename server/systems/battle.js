'use strict';

const { encode } = require('../proto');
const { buildPacket } = require('../packet');
const db = require('../db');

const OPCODES = {
  C_BATTLE_START:     0x1B58,
  S_BATTLE_INIT:      0x1020,
  S_BATTLE_ROUND:     0x1021,
  S_BATTLE_END:       0x1022,
  C_BATTLE_ACTION:    0x1B59,
  C_BATTLE_AUTO:      0x1B5A,
  C_PVP_CHALLENGE:    0x1B5B,
  S_PVP_RESULT:       0x1023,
  C_BATTLE_SKILL:     0x1B5C,
  S_BATTLE_SKILL_RSP: 0x1024,
  S_BATTLE_RAGE:      0x1025,
  S_BATTLE_TROOP_ACT: 0x1026,
  S_BATTLE_BUFF:      0x1027,
};

const STATE = { WAITING: 0, ACTIVE: 1, FINISHED: 2 };

const activeBattles = new Map();
let battleIdCounter = 1;

// Rage config
const RAGE_PER_HIT = 10;
const RAGE_PER_CRIT = 20;
const RAGE_PER_KILL = 15;
const RAGE_ON_DAMAGED = 5;
const MAX_RAGE = 100;

// Skill definitions — 6 slots per class
const CLASS_SKILLS = {
  knight: [
    { slot: 1, id: 'slash',         name: 'Slash',          type: 'physical', multiplier: 1.2, rageCost: 0,  cooldown: 0, aoe: false },
    { slot: 2, id: 'whirlwind',     name: 'Whirlwind',      type: 'physical', multiplier: 1.5, rageCost: 20, cooldown: 2, aoe: true },
    { slot: 3, id: 'shield_bash',   name: 'Shield Bash',    type: 'physical', multiplier: 1.0, rageCost: 15, cooldown: 2, aoe: false, stun: 1 },
    { slot: 4, id: 'divine_strike', name: 'Divine Strike',  type: 'physical', multiplier: 2.0, rageCost: 30, cooldown: 3, aoe: false },
    { slot: 5, id: 'taunt',         name: 'Taunt',          type: 'buff',     multiplier: 0,   rageCost: 25, cooldown: 4, aoe: false, effect: 'taunt', duration: 2 },
    { slot: 6, id: 'ultimate_fury', name: 'Ultimate Fury',  type: 'physical', multiplier: 3.0, rageCost: 80, cooldown: 6, aoe: true },
  ],
  mage: [
    { slot: 1, id: 'fireball',      name: 'Fireball',       type: 'magic',    multiplier: 1.3, rageCost: 0,  cooldown: 0, aoe: false },
    { slot: 2, id: 'thunderstorm',  name: 'Thunderstorm',   type: 'magic',    multiplier: 1.4, rageCost: 20, cooldown: 2, aoe: true },
    { slot: 3, id: 'frost_nova',    name: 'Frost Nova',     type: 'magic',    multiplier: 1.0, rageCost: 15, cooldown: 2, aoe: true, slow: 1 },
    { slot: 4, id: 'meteor',        name: 'Meteor',         type: 'magic',    multiplier: 2.2, rageCost: 35, cooldown: 3, aoe: false },
    { slot: 5, id: 'mana_shield',   name: 'Mana Shield',    type: 'buff',     multiplier: 0,   rageCost: 25, cooldown: 4, aoe: false, effect: 'shield', duration: 2 },
    { slot: 6, id: 'armageddon',    name: 'Armageddon',     type: 'magic',    multiplier: 3.5, rageCost: 80, cooldown: 6, aoe: true },
  ],
  archer: [
    { slot: 1, id: 'arrow_shot',    name: 'Arrow Shot',     type: 'physical', multiplier: 1.2, rageCost: 0,  cooldown: 0, aoe: false },
    { slot: 2, id: 'multi_shot',    name: 'Multi Shot',     type: 'physical', multiplier: 1.3, rageCost: 20, cooldown: 2, aoe: true },
    { slot: 3, id: 'poison_arrow',  name: 'Poison Arrow',   type: 'physical', multiplier: 1.0, rageCost: 15, cooldown: 2, aoe: false, dot: { dmg: 50, rounds: 3 } },
    { slot: 4, id: 'snipe',         name: 'Snipe',          type: 'physical', multiplier: 2.5, rageCost: 30, cooldown: 3, aoe: false },
    { slot: 5, id: 'evasion',       name: 'Evasion',        type: 'buff',     multiplier: 0,   rageCost: 25, cooldown: 4, aoe: false, effect: 'dodge', duration: 2 },
    { slot: 6, id: 'arrow_rain',    name: 'Arrow Rain',     type: 'physical', multiplier: 3.0, rageCost: 80, cooldown: 6, aoe: true },
  ],
};

const MONSTERS = {
  // Early game (Level 1-5)
  1001: { name: 'Goblin',         level: 1, hp: 500,   attack: 30,  defence: 10, magicAttack: 0,   magicDefence: 5,   exp: 20,   gold: 15 },
  1002: { name: 'Wolf',           level: 2, hp: 800,   attack: 45,  defence: 15, magicAttack: 0,   magicDefence: 8,   exp: 35,   gold: 25 },
  1003: { name: 'Skeleton',       level: 3, hp: 1200,  attack: 60,  defence: 25, magicAttack: 20,  magicDefence: 15,  exp: 50,   gold: 40 },
  1004: { name: 'Dark Mage',      level: 5, hp: 1500,  attack: 40,  defence: 20, magicAttack: 80,  magicDefence: 30,  exp: 80,   gold: 60 },
  // Tutorial map (Lane's Road)
  1010: { name: 'Avcı',           level: 1, hp: 150,   attack: 20,  defence: 5,  magicAttack: 0,   magicDefence: 3,   exp: 15,   gold: 10 },
  1011: { name: 'Sihirli Ayı',    level: 2, hp: 300,   attack: 35,  defence: 12, magicAttack: 15,  magicDefence: 8,   exp: 30,   gold: 20 },
  1012: { name: 'Vahşi Kurt',     level: 2, hp: 250,   attack: 40,  defence: 8,  magicAttack: 0,   magicDefence: 5,   exp: 25,   gold: 18 },
  // Mid game
  1005: { name: 'Orc Warrior',    level: 7, hp: 2500,  attack: 100, defence: 50, magicAttack: 10,  magicDefence: 25,  exp: 120,  gold: 90 },
  1006: { name: 'Dragon Whelp',   level: 10, hp: 4000, attack: 150, defence: 80, magicAttack: 120, magicDefence: 60,  exp: 200,  gold: 150 },
  1007: { name: 'Shadow Knight',  level: 15, hp: 8000, attack: 250, defence: 120,magicAttack: 180, magicDefence: 90,  exp: 400,  gold: 300 },
  1008: { name: 'Demon Lord',     level: 20, hp: 15000,attack: 400, defence: 200,magicAttack: 350, magicDefence: 150, exp: 800,  gold: 600 },
  // Bosses
  2001: { name: 'Cave Troll',     level: 10, hp: 10000,attack: 200, defence: 100,magicAttack: 50,  magicDefence: 80,  exp: 500,  gold: 400, boss: true },
  2002: { name: 'Lich King',      level: 20, hp: 25000,attack: 300, defence: 150,magicAttack: 500, magicDefence: 200, exp: 1500, gold: 1000, boss: true },
  2003: { name: 'Ancient Dragon', level: 30, hp: 50000,attack: 500, defence: 300,magicAttack: 600, magicDefence: 350, exp: 3000, gold: 2000, boss: true },
};

// Troop type config — troops fight alongside the player
const TROOP_COMBAT = {
  lancers:   { attackType: 'physical', multiplier: 0.5, hitCount: 1 },
  paladins:  { attackType: 'physical', multiplier: 0.4, hitCount: 1, heal: 0.05 },
  priests:   { attackType: 'magic',    multiplier: 0.3, hitCount: 1, heal: 0.10 },
  gryphons:  { attackType: 'physical', multiplier: 0.6, hitCount: 1 },
  knights:   { attackType: 'physical', multiplier: 0.7, hitCount: 1 },
  angels:    { attackType: 'magic',    multiplier: 0.8, hitCount: 1, heal: 0.08 },
  warlocks:  { attackType: 'magic',    multiplier: 0.9, hitCount: 1 },
};

function getClassSkills(job) {
  const classMap = { 0: 'knight', 1: 'mage', 2: 'archer' };
  return CLASS_SKILLS[classMap[job]] || CLASS_SKILLS.knight;
}

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
      boss: !!template.boss,
      buffs: [],
    };
  });

  // Load player troops
  let troopData = null;
  try {
    const troops = require('./troops');
    troopData = troops.getActiveTroop(charId);
  } catch (e) { /* troops module may not exist */ }

  const skills = getClassSkills(char.job);
  const cooldowns = {};
  for (const s of skills) cooldowns[s.id] = 0;

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
      hp: char.hp || char.max_hp,
      maxHp: char.max_hp,
      attack: char.attack,
      defence: char.defence,
      magicAttack: char.magic_attack,
      magicDefence: char.magic_defence,
      job: char.job,
      alive: true,
      rage: 0,
      skills,
      cooldowns,
      buffs: [],
      selectedSkill: null,
    },
    troop: troopData ? {
      type: troopData.type || 'lancers',
      count: troopData.count || 10,
      level: troopData.level || 1,
      hp: troopData.hp || 500,
      maxHp: troopData.hp || 500,
      attack: troopData.attack || 30,
      alive: true,
    } : null,
    monsters,
    ws,
    auto: false,
    pendingAction: null,
  };

  activeBattles.set(battleId, battle);
  sendBattleInit(ws, battle);
  return battleId;
}

function sendBattleInit(ws, battle) {
  const data = {
    battleId: battle.id,
    round: 0,
    maxRounds: battle.maxRounds,
    player: {
      charId: battle.player.charId,
      name: battle.player.name,
      level: battle.player.level,
      hp: battle.player.hp,
      maxHp: battle.player.maxHp,
      rage: battle.player.rage,
      maxRage: MAX_RAGE,
      job: battle.player.job,
    },
    skills: battle.player.skills.map(s => ({
      slot: s.slot,
      id: s.id,
      name: s.name,
      type: s.type,
      rageCost: s.rageCost,
      cooldown: s.cooldown,
      currentCooldown: 0,
      aoe: !!s.aoe,
    })),
    troop: battle.troop ? {
      type: battle.troop.type,
      count: battle.troop.count,
      level: battle.troop.level,
      hp: battle.troop.hp,
      maxHp: battle.troop.maxHp,
    } : null,
    monsters: battle.monsters.map(m => ({
      id: m.id,
      templateId: m.templateId,
      name: m.name,
      level: m.level,
      hp: m.hp,
      maxHp: m.maxHp,
      boss: m.boss,
    })),
    serverTime: new Date().toISOString(),
  };

  try {
    const body = encode('com.road.yishi.proto.battle.BattleInitMsg', data);
    const pkt = buildPacket(OPCODES.S_BATTLE_INIT, body, battle.player.charId);
    if (ws.readyState === 1) ws.send(pkt);
  } catch (e) {
    const json = JSON.stringify(data);
    const pkt = buildPacket(OPCODES.S_BATTLE_INIT, Buffer.from(json), battle.player.charId);
    if (ws.readyState === 1) ws.send(pkt);
  }
}

function selectSkill(battleId, charId, skillSlot) {
  const battle = activeBattles.get(battleId);
  if (!battle || battle.state !== STATE.ACTIVE) return { success: false };
  if (battle.player.charId !== charId) return { success: false };

  const skill = battle.player.skills.find(s => s.slot === skillSlot);
  if (!skill) return { success: false, msg: 'Invalid skill slot' };

  if (battle.player.cooldowns[skill.id] > 0) {
    return { success: false, msg: `Skill on cooldown (${battle.player.cooldowns[skill.id]} rounds)` };
  }
  if (skill.rageCost > battle.player.rage) {
    return { success: false, msg: `Need ${skill.rageCost} rage (have ${battle.player.rage})` };
  }

  battle.pendingAction = { type: 'skill', skillId: skill.id, slot: skillSlot };
  processRound(battleId);
  return { success: true };
}

function setAuto(battleId, charId, enabled) {
  const battle = activeBattles.get(battleId);
  if (!battle || battle.player.charId !== charId) return;
  battle.auto = enabled;
  if (enabled && battle.state === STATE.ACTIVE) {
    processRound(battleId);
  }
}

function processRound(battleId) {
  const battle = activeBattles.get(battleId);
  if (!battle || battle.state !== STATE.ACTIVE) return;

  battle.round++;
  const actions = [];

  // Reduce cooldowns
  for (const skillId of Object.keys(battle.player.cooldowns)) {
    if (battle.player.cooldowns[skillId] > 0) battle.player.cooldowns[skillId]--;
  }

  // Process buffs/debuffs
  processBuff(battle);

  // Determine player skill
  let usedSkill = null;
  if (battle.pendingAction?.type === 'skill') {
    usedSkill = battle.player.skills.find(s => s.id === battle.pendingAction.skillId);
    battle.pendingAction = null;
  } else if (battle.auto) {
    usedSkill = pickAutoSkill(battle);
  } else {
    usedSkill = battle.player.skills[0]; // Default: slot 1
  }

  // Player attacks
  if (battle.player.alive && usedSkill) {
    const targets = usedSkill.aoe
      ? battle.monsters.filter(m => m.alive)
      : [battle.monsters.find(m => m.alive)].filter(Boolean);

    // Consume rage
    if (usedSkill.rageCost > 0) {
      battle.player.rage = Math.max(0, battle.player.rage - usedSkill.rageCost);
    }

    // Set cooldown
    if (usedSkill.cooldown > 0) {
      battle.player.cooldowns[usedSkill.id] = usedSkill.cooldown;
    }

    const atkType = usedSkill.type === 'magic' ? 'magic' : 'physical';

    for (const target of targets) {
      if (!target.alive) continue;

      if (usedSkill.type === 'buff') {
        battle.player.buffs.push({ effect: usedSkill.effect, duration: usedSkill.duration, round: battle.round });
        actions.push({
          attackerId: battle.player.charId, attackerType: 0,
          targetId: battle.player.charId, targetType: 0,
          damage: 0, skillId: usedSkill.slot, skillName: usedSkill.name,
          targetHp: battle.player.hp, isCrit: false, isBuff: true, buffEffect: usedSkill.effect,
        });
        break;
      }

      const dmg = calcSkillDamage(battle.player, target, usedSkill);
      const isCrit = dmg.crit;
      target.hp -= dmg.total;

      const killed = target.hp <= 0;
      if (killed) {
        target.hp = 0;
        target.alive = false;
        battle.player.rage = Math.min(MAX_RAGE, battle.player.rage + RAGE_PER_KILL);
      }

      battle.player.rage = Math.min(MAX_RAGE, battle.player.rage + (isCrit ? RAGE_PER_CRIT : RAGE_PER_HIT));

      actions.push({
        attackerId: battle.player.charId, attackerType: 0,
        targetId: target.id, targetType: 1,
        damage: dmg.total, skillId: usedSkill.slot, skillName: usedSkill.name,
        targetHp: target.hp, isCrit, killed,
      });

      // Stun
      if (usedSkill.stun && !killed) {
        target.buffs.push({ effect: 'stun', duration: usedSkill.stun, round: battle.round });
      }
      // DoT
      if (usedSkill.dot && !killed) {
        target.buffs.push({ effect: 'dot', damage: usedSkill.dot.dmg, duration: usedSkill.dot.rounds, round: battle.round });
      }
    }
  }

  // Troop attacks
  if (battle.troop && battle.troop.alive && battle.player.alive) {
    const troopCfg = TROOP_COMBAT[battle.troop.type] || TROOP_COMBAT.lancers;
    const target = battle.monsters.find(m => m.alive);
    if (target) {
      const troopAtk = battle.troop.attack * battle.troop.count * troopCfg.multiplier;
      const troopDmg = Math.max(1, Math.floor(troopAtk * troopAtk / (troopAtk + target.defence) * (0.9 + Math.random() * 0.2)));
      target.hp -= troopDmg;
      if (target.hp <= 0) { target.hp = 0; target.alive = false; }

      actions.push({
        attackerId: -1, attackerType: 2,
        targetId: target.id, targetType: 1,
        damage: troopDmg, skillId: 0, skillName: 'Troop Attack',
        targetHp: target.hp, isCrit: false, isTroop: true, troopType: battle.troop.type,
      });

      // Troop heal
      if (troopCfg.heal && battle.player.hp < battle.player.maxHp) {
        const healAmt = Math.floor(battle.player.maxHp * troopCfg.heal);
        battle.player.hp = Math.min(battle.player.maxHp, battle.player.hp + healAmt);
        actions.push({
          attackerId: -1, attackerType: 2,
          targetId: battle.player.charId, targetType: 0,
          damage: -healAmt, skillId: 0, skillName: 'Troop Heal',
          targetHp: battle.player.hp, isCrit: false, isHeal: true,
        });
      }
    }
  }

  // Monsters attack
  for (const monster of battle.monsters) {
    if (!monster.alive || !battle.player.alive) continue;

    // Skip if stunned
    const stunned = monster.buffs.find(b => b.effect === 'stun' && b.duration > 0);
    if (stunned) {
      actions.push({
        attackerId: monster.id, attackerType: 1,
        targetId: monster.id, targetType: 1,
        damage: 0, skillId: 0, skillName: 'Stunned',
        targetHp: monster.hp, isCrit: false, isStunned: true,
      });
      continue;
    }

    // Check taunt — monster must hit player
    const hasDodge = battle.player.buffs.find(b => b.effect === 'dodge' && b.duration > 0);
    if (hasDodge && Math.random() < 0.5) {
      actions.push({
        attackerId: monster.id, attackerType: 1,
        targetId: battle.player.charId, targetType: 0,
        damage: 0, skillId: 0, skillName: 'Miss',
        targetHp: battle.player.hp, isCrit: false, isMiss: true,
      });
      continue;
    }

    const atkType = monster.magicAttack > monster.attack ? 'magic' : 'physical';
    let dmg = calcDamage(monster, battle.player, atkType);

    // Shield buff absorbs damage
    const shieldBuff = battle.player.buffs.find(b => b.effect === 'shield' && b.duration > 0);
    if (shieldBuff) {
      dmg = Math.floor(dmg * 0.5);
    }

    // Target: troop first if they exist, otherwise player
    let hitTarget = 'player';
    if (battle.troop && battle.troop.alive && Math.random() < 0.4) {
      hitTarget = 'troop';
      battle.troop.hp -= dmg;
      if (battle.troop.hp <= 0) {
        battle.troop.hp = 0;
        battle.troop.alive = false;
        battle.troop.count = 0;
      }
      actions.push({
        attackerId: monster.id, attackerType: 1,
        targetId: -1, targetType: 2,
        damage: dmg, skillId: 0,
        targetHp: battle.troop.hp, isCrit: false, hitTroop: true,
      });
    } else {
      battle.player.hp -= dmg;
      battle.player.rage = Math.min(MAX_RAGE, battle.player.rage + RAGE_ON_DAMAGED);

      if (battle.player.hp <= 0) {
        battle.player.hp = 0;
        battle.player.alive = false;
      }
      actions.push({
        attackerId: monster.id, attackerType: 1,
        targetId: battle.player.charId, targetType: 0,
        damage: dmg, skillId: 0,
        targetHp: battle.player.hp, isCrit: false,
      });
    }
  }

  // DoT ticks on monsters
  for (const monster of battle.monsters) {
    if (!monster.alive) continue;
    for (const buff of monster.buffs) {
      if (buff.effect === 'dot' && buff.duration > 0) {
        monster.hp -= buff.damage;
        if (monster.hp <= 0) { monster.hp = 0; monster.alive = false; }
        actions.push({
          attackerId: battle.player.charId, attackerType: 0,
          targetId: monster.id, targetType: 1,
          damage: buff.damage, skillId: 0, skillName: 'Poison',
          targetHp: monster.hp, isCrit: false, isDot: true,
        });
      }
    }
  }

  sendRoundResult(battle, actions);

  // Win/Lose check
  const allDead = battle.monsters.every(m => !m.alive);
  const playerDead = !battle.player.alive;
  const maxRounds = battle.round >= battle.maxRounds;

  if (allDead || playerDead || maxRounds) {
    battle.state = STATE.FINISHED;
    const won = allDead && battle.player.alive;
    setTimeout(() => endBattle(battleId, won), 500);
  } else if (battle.auto) {
    setTimeout(() => processRound(battleId), 1500);
  }
  // If not auto, wait for next C_BATTLE_ACTION / C_BATTLE_SKILL
}

function processBuff(battle) {
  for (const buff of battle.player.buffs) {
    if (buff.duration > 0) buff.duration--;
  }
  battle.player.buffs = battle.player.buffs.filter(b => b.duration > 0);
  for (const m of battle.monsters) {
    for (const buff of m.buffs) {
      if (buff.duration > 0) buff.duration--;
    }
    m.buffs = m.buffs.filter(b => b.duration > 0);
  }
}

function pickAutoSkill(battle) {
  const available = battle.player.skills.filter(s =>
    s.rageCost <= battle.player.rage && battle.player.cooldowns[s.id] <= 0
  );
  // Prefer highest rage cost skill (strongest available)
  available.sort((a, b) => b.rageCost - a.rageCost);
  return available[0] || battle.player.skills[0];
}

function calcSkillDamage(attacker, defender, skill) {
  const type = skill.type === 'magic' ? 'magic' : 'physical';
  const base = calcBaseDamage(
    type === 'magic' ? attacker.magicAttack : attacker.attack,
    type === 'magic' ? defender.magicDefence : defender.defence
  );
  const variance = 0.9 + Math.random() * 0.2;
  const critRoll = Math.random() < 0.15;
  const critMult = critRoll ? 1.5 : 1.0;
  const total = Math.max(1, Math.floor(base * skill.multiplier * variance * critMult));
  return { total, crit: critRoll };
}

function sendRoundResult(battle, actions) {
  const data = {
    battleId: battle.id,
    round: battle.round,
    actions,
    playerHp: battle.player.hp,
    playerMaxHp: battle.player.maxHp,
    playerRage: battle.player.rage,
    maxRage: MAX_RAGE,
    cooldowns: Object.entries(battle.player.cooldowns).map(([id, cd]) => ({ skillId: id, remaining: cd })),
    troop: battle.troop ? { hp: battle.troop.hp, maxHp: battle.troop.maxHp, count: battle.troop.count, alive: battle.troop.alive } : null,
    monsters: battle.monsters.map(m => ({ id: m.id, hp: m.hp, maxHp: m.maxHp, alive: m.alive })),
  };

  try {
    const body = encode('com.road.yishi.proto.battle.BattleRoundMsg', data);
    const pkt = buildPacket(OPCODES.S_BATTLE_ROUND, body, battle.player.charId);
    if (battle.ws.readyState === 1) battle.ws.send(pkt);
  } catch (e) {
    const json = JSON.stringify(data);
    const pkt = buildPacket(OPCODES.S_BATTLE_ROUND, Buffer.from(json), battle.player.charId);
    if (battle.ws.readyState === 1) battle.ws.send(pkt);
  }
}

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

    const char = db.getCharacterById(battle.player.charId);
    if (char) {
      const newExp = char.exp + expReward;
      const newGold = char.gold + goldReward;
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
        hp: char.max_hp,
      });

      const loot = generateDrops(battle.monsters, char.grade);
      drops.push(...loot);

      // Tutorial progress
      try {
        const tutorial = require('./tutorial');
        for (const m of battle.monsters) {
          tutorial.onAction(battle.player.charId, 'kill_monster', m.templateId <= 1012 ? 'hunter' : m.name.toLowerCase());
        }
      } catch (e) { /* ignore */ }

      // Quest progress
      try {
        const quest = require('./quest');
        for (const m of battle.monsters) {
          quest.updateProgress(battle.player.charId, 'kill_monster', m.name.toLowerCase().replace(/\s/g, '_'));
        }
      } catch (e) { /* ignore */ }
    }
  } else {
    db.updateCharacter(battle.player.charId, {
      hp: Math.floor(battle.player.maxHp * 0.3),
    });
  }

  const data = {
    battleId: battle.id,
    result: won ? 1 : 0,
    expReward, goldReward,
    drops: drops.map(d => ({ itemId: d.itemId, count: d.count, quality: d.quality })),
    levelUp: false,
    newLevel: 0,
  };

  try {
    const body = encode('com.road.yishi.proto.battle.BattleEndMsg', data);
    const pkt = buildPacket(OPCODES.S_BATTLE_END, body, battle.player.charId);
    if (battle.ws.readyState === 1) battle.ws.send(pkt);
  } catch (e) {
    const json = JSON.stringify(data);
    const pkt = buildPacket(OPCODES.S_BATTLE_END, Buffer.from(json), battle.player.charId);
    if (battle.ws.readyState === 1) battle.ws.send(pkt);
  }

  activeBattles.delete(battleId);
}

function calcDamage(attacker, defender, type) {
  let base;
  if (type === 'magic') {
    base = calcBaseDamage(attacker.magicAttack, defender.magicDefence);
  } else {
    base = calcBaseDamage(attacker.attack, defender.defence);
  }
  const variance = 0.9 + Math.random() * 0.2;
  const crit = Math.random() < 0.1 ? 1.5 : 1.0;
  return Math.max(1, Math.floor(base * variance * crit));
}

function calcBaseDamage(attack, defence) {
  return Math.max(1, Math.floor((attack * attack) / (attack + defence)));
}

function expForLevel(level) {
  return Math.floor(100 * level * level * 0.8);
}

function generateDrops(monsters, playerLevel) {
  const drops = [];
  for (const m of monsters) {
    if (Math.random() < 0.3) {
      drops.push({ itemId: 100001 + Math.floor(Math.random() * 20), count: 1 + Math.floor(Math.random() * 3), quality: rollQuality(m.level) });
    }
    if (Math.random() < 0.1) {
      drops.push({ itemId: 1000 + Math.floor(Math.random() * 50), count: 1, quality: rollQuality(m.level) });
    }
  }
  return drops;
}

function rollQuality(monsterLevel) {
  const roll = Math.random();
  if (monsterLevel >= 20 && roll < 0.02) return 4;
  if (monsterLevel >= 10 && roll < 0.08) return 3;
  if (monsterLevel >= 5 && roll < 0.20) return 2;
  if (roll < 0.45) return 1;
  return 0;
}

function pvpBattle(challengerId, targetId) {
  const challenger = db.getCharacterById(challengerId);
  const target = db.getCharacterById(targetId);
  if (!challenger || !target) return null;

  let cHp = challenger.hp, tHp = target.hp;
  let cRage = 0, tRage = 0;
  const rounds = [];

  for (let r = 0; r < 15 && cHp > 0 && tHp > 0; r++) {
    const cDmg = calcDamage(challenger, target, 'physical');
    tHp -= cDmg;
    cRage = Math.min(MAX_RAGE, cRage + RAGE_PER_HIT);

    const tDmg = tHp > 0 ? calcDamage(target, challenger, 'physical') : 0;
    cHp -= tDmg;
    tRage = Math.min(MAX_RAGE, tRage + RAGE_PER_HIT);

    rounds.push({ round: r + 1, challengerDmg: cDmg, targetDmg: tDmg, challengerHp: cHp, targetHp: tHp, cRage, tRage });
  }

  return { won: cHp > tHp, rounds, challengerHp: cHp, targetHp: tHp };
}

function getBattle(battleId) {
  return activeBattles.get(battleId);
}

module.exports = {
  OPCODES, MONSTERS, STATE, CLASS_SKILLS, TROOP_COMBAT, MAX_RAGE,
  startBattle, endBattle, processRound, selectSkill, setAuto, getBattle,
  pvpBattle, calcDamage, calcBaseDamage, expForLevel, getClassSkills,
};
