'use strict';

const db = require('../db');

const OPCODES = {
  C_ADVANCE_INFO:      0x6D00,
  S_ADVANCE_INFO:      0x6D10,
  C_ADVANCE_START:     0x6D01,
  S_ADVANCE_START:     0x6D11,
  C_ADVANCE_TRIAL:     0x6D02,
  S_ADVANCE_TRIAL:     0x6D12,
  C_ADVANCE_CHOOSE:    0x6D03,
  S_ADVANCE_CHOOSE:    0x6D13,
};

const MIN_LEVEL = 80;
const SHARDS_REQUIRED = 5;

const SPECIALIZATIONS = {
  // Knight (camp/job 1)
  dark_knight: {
    id: 'dark_knight',
    name: 'Dark Knight',
    baseClass: 1,
    bonuses: { atkPercent: 20, critPercent: 10 },
    transforms: [
      { from: 'Shield Bash', fromId: 101, to: 'Dark Cleave', toId: 151, dmgMul: 1.8, desc: 'Devastating dark-infused cleave' },
      { from: 'Holy Light', fromId: 104, to: 'Shadow Strike', toId: 152, dmgMul: 2.0, desc: 'Shadow damage pierces defence' },
    ],
  },
  paladin: {
    id: 'paladin',
    name: 'Paladin',
    baseClass: 1,
    bonuses: { defPercent: 30, hpPercent: 15 },
    transforms: [
      { from: 'Shield Bash', fromId: 101, to: 'Divine Shield', toId: 153, dmgMul: 1.2, desc: 'Absorbs damage equal to 30% DEF' },
      { from: 'Holy Light', fromId: 104, to: 'Blessed Aura', toId: 154, dmgMul: 1.5, desc: 'Heals 10% max HP each turn' },
    ],
  },
  // Mage (camp/job 2)
  warlock: {
    id: 'warlock',
    name: 'Warlock',
    baseClass: 2,
    bonuses: { matkPercent: 25, critPercent: 15 },
    transforms: [
      { from: 'Fireball', fromId: 201, to: 'Hellfire', toId: 251, dmgMul: 2.2, desc: 'Burns for 3 turns' },
      { from: 'Lightning', fromId: 203, to: 'Chaos Bolt', toId: 252, dmgMul: 2.5, desc: 'Ignores 20% magic defence' },
    ],
  },
  archmage: {
    id: 'archmage',
    name: 'Archmage',
    baseClass: 2,
    bonuses: { matkPercent: 20, mdefPercent: 20 },
    transforms: [
      { from: 'Fireball', fromId: 201, to: 'Meteor', toId: 253, dmgMul: 2.8, desc: 'AoE damage to all enemies' },
      { from: 'Lightning', fromId: 203, to: 'Arcane Storm', toId: 254, dmgMul: 2.0, desc: 'Reduces enemy ATK by 15%' },
    ],
  },
  // Archer (camp/job 3)
  ranger: {
    id: 'ranger',
    name: 'Ranger',
    baseClass: 3,
    bonuses: { atkPercent: 20, dodgePercent: 20 },
    transforms: [
      { from: 'Arrow Rain', fromId: 301, to: 'Storm Volley', toId: 351, dmgMul: 2.0, desc: 'Hits all enemies 3 times' },
      { from: 'Precise Shot', fromId: 303, to: 'Heartseeker', toId: 352, dmgMul: 2.5, desc: '50% chance to stun' },
    ],
  },
  sniper: {
    id: 'sniper',
    name: 'Sniper',
    baseClass: 3,
    bonuses: { atkPercent: 30, critPercent: 25 },
    transforms: [
      { from: 'Arrow Rain', fromId: 301, to: 'Explosive Shot', toId: 353, dmgMul: 2.8, desc: 'Splash damage to adjacent enemies' },
      { from: 'Precise Shot', fromId: 303, to: 'Assassinate', toId: 354, dmgMul: 3.5, desc: 'Execute: 3x damage below 30% HP' },
    ],
  },
};

const CLASS_SPECS = {
  1: ['dark_knight', 'paladin'],
  2: ['warlock', 'archmage'],
  3: ['ranger', 'sniper'],
};

const TRIALS = [
  { num: 1, name: 'Trial of Strength',   hpMul: 8,  atkMul: 5,  defMul: 4,  bossName: 'Trial Guardian' },
  { num: 2, name: 'Trial of Endurance',   hpMul: 12, atkMul: 7,  defMul: 6,  bossName: 'Trial Sentinel' },
  { num: 3, name: 'Trial of Mastery',     hpMul: 18, atkMul: 10, defMul: 8,  bossName: 'Trial Champion' },
  { num: 4, name: 'Final Ascension Trial', hpMul: 25, atkMul: 14, defMul: 11, bossName: 'Ascension Avatar' },
];

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS class_advance (
      char_id         INTEGER PRIMARY KEY REFERENCES characters(id),
      quest_started   INTEGER DEFAULT 0,
      trials_done     INTEGER DEFAULT 0,
      shards          INTEGER DEFAULT 0,
      specialization  TEXT DEFAULT '',
      advanced        INTEGER DEFAULT 0,
      advanced_at     TEXT DEFAULT ''
    );
  `);
}

function ensureEntry(charId) {
  db.getDatabase().prepare('INSERT OR IGNORE INTO class_advance (char_id) VALUES (?)').run(charId);
}

function getAdvanceInfo(charId) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM class_advance WHERE char_id = ?').get(charId);
  const char = db.getCharacterById(charId);
  if (!char) return { error: 'Character not found' };

  const classId = char.camp || char.job || 1;
  const availableSpecs = (CLASS_SPECS[classId] || []).map(id => {
    const s = SPECIALIZATIONS[id];
    return { id: s.id, name: s.name, bonuses: s.bonuses, transforms: s.transforms.map(t => ({ from: t.from, to: t.to, desc: t.desc })) };
  });

  return {
    level: char.grade,
    minLevel: MIN_LEVEL,
    eligible: char.grade >= MIN_LEVEL,
    questStarted: !!row.quest_started,
    trialsDone: row.trials_done,
    trialsRequired: TRIALS.length,
    shards: row.shards,
    shardsRequired: SHARDS_REQUIRED,
    advanced: !!row.advanced,
    specialization: row.specialization || null,
    specName: row.specialization ? (SPECIALIZATIONS[row.specialization]?.name || null) : null,
    availableSpecs,
    canChoose: row.trials_done >= TRIALS.length && row.shards >= SHARDS_REQUIRED && !row.advanced,
  };
}

function startAdvanceQuest(charId) {
  ensureEntry(charId);
  const char = db.getCharacterById(charId);
  if (!char) return { success: false, msg: 'Character not found' };
  if (char.grade < MIN_LEVEL) return { success: false, msg: `Requires level ${MIN_LEVEL}` };

  const row = db.getDatabase().prepare('SELECT * FROM class_advance WHERE char_id = ?').get(charId);
  if (row.advanced) return { success: false, msg: 'Already advanced' };
  if (row.quest_started) return { success: false, msg: 'Quest already started' };

  db.getDatabase().prepare('UPDATE class_advance SET quest_started = 1 WHERE char_id = ?').run(charId);

  return {
    success: true,
    msg: 'Class advancement quest started! Speak to the Class Trainer to begin your trials.',
    nextStep: 'Complete Trial 1 of 4',
  };
}

function fightTrial(charId, trialNum) {
  ensureEntry(charId);
  const char = db.getCharacterById(charId);
  if (!char) return { success: false, msg: 'Character not found' };
  if (char.grade < MIN_LEVEL) return { success: false, msg: `Requires level ${MIN_LEVEL}` };

  const row = db.getDatabase().prepare('SELECT * FROM class_advance WHERE char_id = ?').get(charId);
  if (!row.quest_started) return { success: false, msg: 'Start the advancement quest first' };
  if (row.advanced) return { success: false, msg: 'Already advanced' };

  const expectedTrial = row.trials_done + 1;
  if (trialNum !== expectedTrial) return { success: false, msg: `Must complete trial ${expectedTrial} next` };

  const trial = TRIALS.find(t => t.num === trialNum);
  if (!trial) return { success: false, msg: 'Invalid trial' };

  const baseHp = 500;
  const baseAtk = 80;
  const baseDef = 40;

  const bossHp = Math.floor(baseHp * trial.hpMul);
  const bossAtk = Math.floor(baseAtk * trial.atkMul);
  const bossDef = Math.floor(baseDef * trial.defMul);

  let playerHp = char.max_hp || char.hp;
  let mHp = bossHp;
  const rounds = [];
  let roundNum = 0;

  while (mHp > 0 && playerHp > 0 && roundNum < 40) {
    roundNum++;
    const pAtk = char.attack + (char.magic_attack || 0);
    const pDmg = Math.max(1, Math.floor(pAtk * pAtk / (pAtk + bossDef)));
    const crit = Math.random() < 0.12;
    const finalDmg = crit ? Math.floor(pDmg * 1.8) : pDmg;
    mHp -= finalDmg;

    let mDmg = 0;
    if (mHp > 0) {
      mDmg = Math.max(1, Math.floor(bossAtk * bossAtk / (bossAtk + char.defence)));
      playerHp -= mDmg;
    }

    rounds.push({ round: roundNum, playerDmg: finalDmg, crit, monsterDmg: mDmg, playerHp, monsterHp: Math.max(0, mHp) });
  }

  const won = mHp <= 0;

  if (won) {
    db.getDatabase().prepare('UPDATE class_advance SET trials_done = ? WHERE char_id = ?')
      .run(trialNum, charId);

    const expReward = 5000 * trialNum;
    db.getDatabase().prepare('UPDATE characters SET exp = exp + ? WHERE id = ?').run(expReward, charId);
  }

  const nextInfo = won && trialNum < TRIALS.length
    ? { nextTrial: trialNum + 1, nextName: TRIALS[trialNum].name }
    : won && trialNum === TRIALS.length
      ? { allTrialsComplete: true, msg: 'All trials complete! Collect 5 Advancement Shards and choose your specialization.' }
      : null;

  return {
    success: true,
    won,
    trialNum,
    trialName: trial.name,
    bossName: trial.bossName,
    rounds: rounds.slice(-5),
    rewards: won ? { exp: 5000 * trialNum } : null,
    next: nextInfo,
  };
}

function addShards(charId, count) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM class_advance WHERE char_id = ?').get(charId);
  if (row.advanced) return { success: false, msg: 'Already advanced' };
  if (!row.quest_started) return { success: false, msg: 'Quest not started' };

  const newShards = Math.min(row.shards + count, SHARDS_REQUIRED);
  db.getDatabase().prepare('UPDATE class_advance SET shards = ? WHERE char_id = ?').run(newShards, charId);
  return { success: true, shards: newShards, needed: SHARDS_REQUIRED };
}

function chooseSpecialization(charId, specId) {
  ensureEntry(charId);
  const char = db.getCharacterById(charId);
  if (!char) return { success: false, msg: 'Character not found' };

  const row = db.getDatabase().prepare('SELECT * FROM class_advance WHERE char_id = ?').get(charId);
  if (row.advanced) return { success: false, msg: 'Already advanced' };
  if (row.trials_done < TRIALS.length) return { success: false, msg: `Complete all ${TRIALS.length} trials first` };
  if (row.shards < SHARDS_REQUIRED) return { success: false, msg: `Need ${SHARDS_REQUIRED} Advancement Shards (have ${row.shards})` };

  const spec = SPECIALIZATIONS[specId];
  if (!spec) return { success: false, msg: 'Invalid specialization' };

  const classId = char.camp || char.job || 1;
  const validSpecs = CLASS_SPECS[classId] || [];
  if (!validSpecs.includes(specId)) return { success: false, msg: 'Specialization not available for your class' };

  db.getDatabase().prepare(`
    UPDATE class_advance SET specialization = ?, advanced = 1, advanced_at = datetime('now'), shards = shards - ?
    WHERE char_id = ?
  `).run(specId, SHARDS_REQUIRED, charId);

  const bonuses = getSpecBonuses(charId);

  return {
    success: true,
    msg: `You have ascended to ${spec.name}!`,
    specialization: spec.id,
    name: spec.name,
    bonuses: spec.bonuses,
    transforms: spec.transforms.map(t => ({ from: t.from, to: t.to, desc: t.desc })),
    statChanges: bonuses,
  };
}

function getSpecBonuses(charId) {
  ensureEntry(charId);
  const row = db.getDatabase().prepare('SELECT * FROM class_advance WHERE char_id = ?').get(charId);
  if (!row.advanced || !row.specialization) return null;

  const spec = SPECIALIZATIONS[row.specialization];
  if (!spec) return null;

  const char = db.getCharacterById(charId);
  if (!char) return null;

  const bonuses = {};
  if (spec.bonuses.atkPercent) bonuses.bonusAtk = Math.floor(char.attack * spec.bonuses.atkPercent / 100);
  if (spec.bonuses.defPercent) bonuses.bonusDef = Math.floor(char.defence * spec.bonuses.defPercent / 100);
  if (spec.bonuses.hpPercent) bonuses.bonusHp = Math.floor((char.max_hp || char.hp) * spec.bonuses.hpPercent / 100);
  if (spec.bonuses.matkPercent) bonuses.bonusMatk = Math.floor((char.magic_attack || 0) * spec.bonuses.matkPercent / 100);
  if (spec.bonuses.mdefPercent) bonuses.bonusMdef = Math.floor((char.magic_defence || 0) * spec.bonuses.mdefPercent / 100);
  if (spec.bonuses.critPercent) bonuses.critBonus = spec.bonuses.critPercent;
  if (spec.bonuses.dodgePercent) bonuses.dodgeBonus = spec.bonuses.dodgePercent;

  bonuses.specId = spec.id;
  bonuses.specName = spec.name;
  bonuses.transforms = spec.transforms;

  return bonuses;
}

module.exports = {
  OPCODES, SPECIALIZATIONS, CLASS_SPECS, TRIALS, MIN_LEVEL, SHARDS_REQUIRED,
  initDB,
  getAdvanceInfo, startAdvanceQuest, fightTrial, addShards, chooseSpecialization, getSpecBonuses,
};
