'use strict';

const db = require('../db');

const OPCODES = {
  C_KNIGHTHOOD_INFO:    0x8300,
  S_KNIGHTHOOD_INFO:    0x8310,
  C_KNIGHTHOOD_RECRUIT: 0x8301,
  S_KNIGHTHOOD_RECRUIT: 0x8311,
  C_KNIGHTHOOD_TRAIN:   0x8302,
  S_KNIGHTHOOD_TRAIN:   0x8312,
  C_KNIGHTHOOD_QUEST:   0x8304,
  S_KNIGHTHOOD_QUEST:   0x8314,
  C_KNIGHTHOOD_SHOP:    0x8305,
  S_KNIGHTHOOD_SHOP:    0x8315,
};

const MAX_KNIGHTS = 6;
const UNLOCK_LEVEL = 45;
const DAILY_QUESTS = 3;
const MAX_KNIGHT_LEVEL = 50;
const TRAIN_COST = 5000;

const KNIGHT_TEMPLATES = [
  { id: 1, name: 'Sir Galahad',   class: 'knight', basePower: 500,  cost: 50000 },
  { id: 2, name: 'Lady Morgana',  class: 'mage',   basePower: 480,  cost: 50000 },
  { id: 3, name: 'Robin',         class: 'archer', basePower: 490,  cost: 50000 },
  { id: 4, name: 'Sir Lancelot',  class: 'knight', basePower: 700,  cost: 100000 },
  { id: 5, name: 'Merlin',        class: 'mage',   basePower: 720,  cost: 100000 },
  { id: 6, name: 'Artemis',       class: 'archer', basePower: 710,  cost: 100000 },
  { id: 7, name: 'Titan Guard',   class: 'knight', basePower: 1000, cost: 200000 },
  { id: 8, name: 'Archmage',      class: 'mage',   basePower: 1050, cost: 200000 },
  { id: 9, name: 'Shadow Hunter', class: 'archer', basePower: 1020, cost: 200000 },
];

const KH_QUESTS = [
  { id: 1, name: 'Patrol the Realm',   reward: { gold: 10000, khExp: 20 } },
  { id: 2, name: 'Gather Resources',   reward: { gold: 8000,  khExp: 15 } },
  { id: 3, name: 'Defend the Gate',    reward: { gold: 15000, khExp: 30 } },
  { id: 4, name: 'Hunt Bandits',       reward: { gold: 12000, khExp: 25 } },
  { id: 5, name: 'Escort the Caravan', reward: { gold: 20000, khExp: 40 } },
];

const KH_SHOP = [
  { id: 1, name: 'Knight EXP Scroll', cost: 100 },
  { id: 2, name: 'Knight Armor',      cost: 200 },
  { id: 3, name: 'Knight Weapon',     cost: 300 },
  { id: 4, name: 'Power Potion',      cost: 150 },
  { id: 5, name: 'Gold Chest',        cost: 500 },
];

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS knighthood (
      char_id    INTEGER PRIMARY KEY REFERENCES characters(id),
      kh_level   INTEGER DEFAULT 1,
      kh_exp     INTEGER DEFAULT 0,
      kh_points  INTEGER DEFAULT 0,
      quests_done INTEGER DEFAULT 0,
      quest_date TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS knights (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id     INTEGER NOT NULL REFERENCES characters(id),
      template_id INTEGER NOT NULL,
      level       INTEGER DEFAULT 1,
      power       INTEGER DEFAULT 0,
      slot        INTEGER DEFAULT 0
    );
  `);
}

function ensureEntry(charId) {
  db.getDatabase().prepare('INSERT OR IGNORE INTO knighthood (char_id) VALUES (?)').run(charId);
}

function getKnighthoodInfo(charId) {
  const char = db.getCharacterById(charId);
  if (!char || char.grade < UNLOCK_LEVEL) return { success: false, msg: 'Reach level ' + UNLOCK_LEVEL };
  ensureEntry(charId);
  const kh = db.getDatabase().prepare('SELECT * FROM knighthood WHERE char_id = ?').get(charId);
  const knights = db.getDatabase().prepare('SELECT * FROM knights WHERE char_id = ? ORDER BY slot').all(charId);
  const today = new Date().toISOString().slice(0, 10);
  return {
    success: true, level: kh.kh_level, exp: kh.kh_exp, nextExp: kh.kh_level * 100, points: kh.kh_points,
    questsDone: kh.quest_date === today ? kh.quests_done : 0, maxQuests: DAILY_QUESTS,
    knights: knights.map(k => { const t = KNIGHT_TEMPLATES.find(tt => tt.id === k.template_id); return { id: k.id, name: t?.name, class: t?.class, level: k.level, power: k.power, slot: k.slot }; }),
    availableRecruits: KNIGHT_TEMPLATES.filter(t => !knights.find(k => k.template_id === t.id)).map(t => ({ id: t.id, name: t.name, class: t.class, basePower: t.basePower, cost: t.cost })),
  };
}

function recruitKnight(charId, templateId) {
  const char = db.getCharacterById(charId);
  if (!char || char.grade < UNLOCK_LEVEL) return { success: false, msg: 'Not unlocked' };
  const tmpl = KNIGHT_TEMPLATES.find(t => t.id === templateId);
  if (!tmpl) return { success: false, msg: 'Invalid knight' };
  ensureEntry(charId);
  const knights = db.getDatabase().prepare('SELECT * FROM knights WHERE char_id = ?').all(charId);
  if (knights.length >= MAX_KNIGHTS) return { success: false, msg: 'Max knights' };
  if (knights.find(k => k.template_id === templateId)) return { success: false, msg: 'Already recruited' };
  if (char.gold < tmpl.cost) return { success: false, msg: 'Not enough gold' };
  db.getDatabase().prepare('UPDATE characters SET gold = gold - ? WHERE id = ?').run(tmpl.cost, charId);
  db.getDatabase().prepare('INSERT INTO knights (char_id, template_id, level, power, slot) VALUES (?, ?, 1, ?, ?)').run(charId, templateId, tmpl.basePower, knights.length);
  return { success: true, knight: { name: tmpl.name, class: tmpl.class, power: tmpl.basePower } };
}

function trainKnight(charId, knightId) {
  const knight = db.getDatabase().prepare('SELECT * FROM knights WHERE id = ? AND char_id = ?').get(knightId, charId);
  if (!knight) return { success: false, msg: 'Not found' };
  if (knight.level >= MAX_KNIGHT_LEVEL) return { success: false, msg: 'Max level' };
  const cost = TRAIN_COST * knight.level;
  const char = db.getCharacterById(charId);
  if (!char || char.gold < cost) return { success: false, msg: 'Not enough gold' };
  const tmpl = KNIGHT_TEMPLATES.find(t => t.id === knight.template_id);
  const newLevel = knight.level + 1;
  const newPower = Math.floor((tmpl?.basePower || 500) * (1 + (newLevel - 1) * 0.15));
  db.getDatabase().prepare('UPDATE characters SET gold = gold - ? WHERE id = ?').run(cost, charId);
  db.getDatabase().prepare('UPDATE knights SET level = ?, power = ? WHERE id = ?').run(newLevel, newPower, knightId);
  return { success: true, knightId, newLevel, newPower };
}

function doQuest(charId) {
  ensureEntry(charId);
  const today = new Date().toISOString().slice(0, 10);
  const kh = db.getDatabase().prepare('SELECT * FROM knighthood WHERE char_id = ?').get(charId);
  const done = kh.quest_date === today ? kh.quests_done : 0;
  if (done >= DAILY_QUESTS) return { success: false, msg: 'Done for today' };
  const quest = KH_QUESTS[Math.floor(Math.random() * KH_QUESTS.length)];
  db.getDatabase().prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').run(quest.reward.gold, charId);
  const newExp = kh.kh_exp + quest.reward.khExp;
  let newLevel = kh.kh_level;
  let remExp = newExp;
  if (newExp >= kh.kh_level * 100) { newLevel++; remExp = newExp - kh.kh_level * 100; }
  db.getDatabase().prepare('UPDATE knighthood SET kh_exp = ?, kh_level = ?, kh_points = kh_points + ?, quests_done = ?, quest_date = ? WHERE char_id = ?')
    .run(remExp, newLevel, quest.reward.khExp, done + 1, today, charId);
  return { success: true, quest: quest.name, reward: quest.reward, questsDone: done + 1 };
}

function buyFromShop(charId, itemId) {
  ensureEntry(charId);
  const item = KH_SHOP.find(i => i.id === itemId);
  if (!item) return { success: false, msg: 'Invalid item' };
  const kh = db.getDatabase().prepare('SELECT * FROM knighthood WHERE char_id = ?').get(charId);
  if (kh.kh_points < item.cost) return { success: false, msg: 'Not enough points' };
  db.getDatabase().prepare('UPDATE knighthood SET kh_points = kh_points - ? WHERE char_id = ?').run(item.cost, charId);
  return { success: true, item: item.name };
}

module.exports = { OPCODES, KNIGHT_TEMPLATES, KH_QUESTS, KH_SHOP, MAX_KNIGHTS, UNLOCK_LEVEL, initDB, getKnighthoodInfo, recruitKnight, trainKnight, doQuest, buyFromShop };
