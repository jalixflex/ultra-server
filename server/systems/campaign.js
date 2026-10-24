'use strict';

const db = require('../db');

const OPCODES = {
  C_CAMPAIGN_LIST:  0x4269,
  S_CAMPAIGN_LIST:  0x4273,
  C_CAMPAIGN_ENTER: 0x426A,
  S_CAMPAIGN_RESULT:0x4274,
  C_CAMPAIGN_SWEEP: 0x426B,
  C_CAMPAIGN_BLITZ: 0x426C,
  S_CAMPAIGN_BLITZ: 0x4275,
};

const STAMINA_PER_RUN = 20;
const STAMINA_CAP = 200;
const DAILY_STAMINA = 100;

const CHAPTERS = [
  {
    id: 'autaric_plains', name: 'Autaric Plains', minLevel: 1, maxLevel: 20,
    stages: [
      { id: 'worg_lair',             name: 'Worg Lair',              chapter: 1, order: 1, minLevel: 5,
        monsters: [{ name: 'Grassland Worg', hp: 200, atk: 30, def: 10, exp: 50, gold: 40 }],
        boss: { name: 'Wulfgar', hp: 800, atk: 60, def: 25, exp: 200, gold: 150 }, waves: 5 },
      { id: 'baylon_plains',         name: 'Baylon Plains',          chapter: 1, order: 2, minLevel: 9,
        monsters: [{ name: 'Baylon Raider', hp: 350, atk: 45, def: 15, exp: 80, gold: 60 }],
        boss: { name: 'Karda', hp: 1500, atk: 90, def: 35, exp: 400, gold: 300 }, waves: 5 },
      { id: 'temple_ibalize_outer',  name: 'Temple of Ibalize Outer', chapter: 1, order: 3, minLevel: 11,
        monsters: [{ name: 'Temple Guardian', hp: 500, atk: 55, def: 20, exp: 120, gold: 80 }],
        boss: { name: 'Sheena', hp: 2200, atk: 120, def: 45, exp: 600, gold: 500 }, waves: 6 },
      { id: 'temple_ibalize_inner',  name: 'Temple of Ibalize Inner', chapter: 1, order: 4, minLevel: 13,
        monsters: [{ name: 'Dark Acolyte', hp: 650, atk: 65, def: 25, exp: 150, gold: 100 }],
        boss: { name: 'Divine Statue', hp: 3000, atk: 150, def: 60, exp: 800, gold: 700 }, waves: 6 },
      { id: 'orc_plains',            name: 'Orc Plains',             chapter: 1, order: 5, minLevel: 15,
        monsters: [{ name: 'Orc Warrior', hp: 800, atk: 80, def: 30, exp: 200, gold: 120 }],
        boss: { name: 'Orc Chief', hp: 4000, atk: 180, def: 70, exp: 1000, gold: 900 }, waves: 7 },
      { id: 'tribal_plateau',        name: 'Tribal Plateau',         chapter: 1, order: 6, minLevel: 17,
        monsters: [{ name: 'Tribal Shaman', hp: 1000, atk: 95, def: 35, exp: 250, gold: 150 }],
        boss: { name: 'Kronos', hp: 5500, atk: 220, def: 85, exp: 1500, gold: 1200 }, waves: 7 },
      { id: 'camp_calorn',           name: 'Camp Calorn',            chapter: 1, order: 7, minLevel: 19,
        monsters: [{ name: 'Calorn Soldier', hp: 1200, atk: 110, def: 40, exp: 300, gold: 180 }],
        boss: { name: 'Viscount Remus', hp: 7000, atk: 260, def: 100, exp: 2000, gold: 1500 }, waves: 8 },
    ],
  },
  {
    id: 'murkan_forest', name: 'Murkan Forest', minLevel: 20, maxLevel: 30,
    stages: [
      { id: 'bretheran_abyss', name: 'Bretheran Abyss', chapter: 2, order: 1, minLevel: 20,
        monsters: [{ name: 'Abyss Crawler', hp: 1500, atk: 130, def: 50, exp: 400, gold: 250 }],
        boss: { name: 'Anotar', hp: 9000, atk: 300, def: 120, exp: 3000, gold: 2000 }, waves: 8 },
      { id: 'serpents_den', name: 'Serpent\'s Den', chapter: 2, order: 2, minLevel: 23,
        monsters: [{ name: 'Venom Serpent', hp: 1800, atk: 150, def: 55, exp: 500, gold: 300 }],
        boss: { name: 'Sycorax', hp: 12000, atk: 350, def: 140, exp: 4000, gold: 3000 }, waves: 9 },
      { id: 'roaring_wetlands', name: 'Roaring Wetlands', chapter: 2, order: 3, minLevel: 21,
        monsters: [{ name: 'Swamp Beast', hp: 1600, atk: 140, def: 52, exp: 450, gold: 280 }],
        boss: { name: 'Spiny Serpentus', hp: 10000, atk: 320, def: 130, exp: 3500, gold: 2500 }, waves: 8 },
      { id: 'duskin_arena', name: 'Duskin Arena', chapter: 2, order: 4, minLevel: 23,
        monsters: [{ name: 'Arena Gladiator', hp: 2000, atk: 160, def: 60, exp: 550, gold: 350 }],
        boss: { name: 'Headless Marauder', hp: 14000, atk: 380, def: 150, exp: 5000, gold: 3500 }, waves: 9 },
      { id: 'forest_of_doom', name: 'Forest of Doom', chapter: 2, order: 5, minLevel: 24,
        monsters: [{ name: 'Doom Treant', hp: 2200, atk: 170, def: 65, exp: 600, gold: 400 }],
        boss: { name: 'Morrigan', hp: 16000, atk: 420, def: 170, exp: 6000, gold: 4000 }, waves: 10 },
      { id: 'edena_village', name: 'Edena Village', chapter: 2, order: 6, minLevel: 26,
        monsters: [{ name: 'Corrupted Villager', hp: 2500, atk: 185, def: 70, exp: 700, gold: 450 }],
        boss: { name: 'Eletos', hp: 18000, atk: 450, def: 180, exp: 7000, gold: 5000 }, waves: 10 },
      { id: 'termini_cliff', name: 'Termini Cliff', chapter: 2, order: 7, minLevel: 28,
        monsters: [{ name: 'Cliff Watcher', hp: 2800, atk: 200, def: 80, exp: 800, gold: 500 }],
        boss: { name: 'Merloch', hp: 22000, atk: 500, def: 200, exp: 8000, gold: 6000 }, waves: 10 },
    ],
  },
  {
    id: 'fetid_swamp', name: 'Fetid Swamp', minLevel: 30, maxLevel: 40,
    stages: [
      { id: 'banshee_wetlands', name: 'Banshee Wetlands', chapter: 3, order: 1, minLevel: 30,
        monsters: [{ name: 'Swamp Banshee', hp: 3200, atk: 220, def: 90, exp: 1000, gold: 600 }],
        boss: { name: 'Banshee Queen', hp: 28000, atk: 550, def: 220, exp: 10000, gold: 8000 }, waves: 10 },
      { id: 'cursed_marshes', name: 'Cursed Marshes', chapter: 3, order: 2, minLevel: 33,
        monsters: [{ name: 'Marsh Wraith', hp: 3800, atk: 250, def: 100, exp: 1200, gold: 700 }],
        boss: { name: 'Plague Lord', hp: 35000, atk: 620, def: 250, exp: 12000, gold: 10000 }, waves: 11 },
      { id: 'rotting_depths', name: 'Rotting Depths', chapter: 3, order: 3, minLevel: 36,
        monsters: [{ name: 'Depth Horror', hp: 4500, atk: 280, def: 110, exp: 1500, gold: 850 }],
        boss: { name: 'Abyssal Devourer', hp: 42000, atk: 700, def: 280, exp: 15000, gold: 12000 }, waves: 12 },
    ],
  },
  {
    id: 'deathly_sands', name: 'Deathly Sands', minLevel: 40, maxLevel: 50,
    stages: [
      { id: 'blazing_desert', name: 'Blazing Desert', chapter: 4, order: 1, minLevel: 40,
        monsters: [{ name: 'Sand Scorpion', hp: 5000, atk: 300, def: 120, exp: 2000, gold: 1000 }],
        boss: { name: 'Krankor', hp: 50000, atk: 800, def: 320, exp: 18000, gold: 15000 }, waves: 12 },
      { id: 'desert_of_curses', name: 'Desert of Curses', chapter: 4, order: 2, minLevel: 43,
        monsters: [{ name: 'Cursed Mummy', hp: 5800, atk: 340, def: 135, exp: 2500, gold: 1200 }],
        boss: { name: 'Agorfa', hp: 60000, atk: 900, def: 360, exp: 22000, gold: 18000 }, waves: 12 },
      { id: 'desert_of_despair', name: 'Desert of Despair', chapter: 4, order: 3, minLevel: 46,
        monsters: [{ name: 'Desert Wraith', hp: 6500, atk: 380, def: 150, exp: 3000, gold: 1500 }],
        boss: { name: 'Karnova', hp: 75000, atk: 1000, def: 400, exp: 28000, gold: 22000 }, waves: 13 },
    ],
  },
  {
    id: 'erandel', name: 'Erandel', minLevel: 50, maxLevel: 60,
    stages: [
      { id: 'desert_of_palms', name: 'Desert of Palms', chapter: 5, order: 1, minLevel: 50,
        monsters: [{ name: 'Sand Elemental', hp: 8000, atk: 420, def: 170, exp: 4000, gold: 2000 }],
        boss: { name: 'Farinel', hp: 90000, atk: 1200, def: 480, exp: 35000, gold: 28000 }, waves: 13 },
      { id: 'nightmare_ruins', name: 'Nightmare Ruins', chapter: 5, order: 2, minLevel: 54,
        monsters: [{ name: 'Nightmare Shade', hp: 9500, atk: 480, def: 190, exp: 5000, gold: 2500 }],
        boss: { name: 'Mortis', hp: 110000, atk: 1400, def: 560, exp: 42000, gold: 35000 }, waves: 14 },
      { id: 'soul_trials', name: 'Soul Trials', chapter: 5, order: 3, minLevel: 58,
        monsters: [{ name: 'Soul Wraith', hp: 11000, atk: 540, def: 210, exp: 6000, gold: 3000 }],
        boss: { name: 'Jilan', hp: 130000, atk: 1600, def: 640, exp: 50000, gold: 40000 }, waves: 15 },
    ],
  },
  {
    id: 'shadow_realm', name: 'Shadow Realm', minLevel: 60, maxLevel: 70,
    stages: [
      { id: 'twilight_gate', name: 'Twilight Gate', chapter: 6, order: 1, minLevel: 60,
        monsters: [{ name: 'Twilight Sentinel', hp: 12000, atk: 560, def: 220, exp: 6500, gold: 3200 }],
        boss: { name: 'Shadow Warden', hp: 140000, atk: 1700, def: 680, exp: 55000, gold: 44000 }, waves: 14 },
      { id: 'dark_citadel', name: 'Dark Citadel', chapter: 6, order: 2, minLevel: 62,
        monsters: [{ name: 'Dark Legionnaire', hp: 13000, atk: 590, def: 235, exp: 7000, gold: 3500 }],
        boss: { name: 'Necros', hp: 155000, atk: 1800, def: 720, exp: 60000, gold: 48000 }, waves: 14 },
      { id: 'phantom_bridge', name: 'Phantom Bridge', chapter: 6, order: 3, minLevel: 64,
        monsters: [{ name: 'Phantom Knight', hp: 14000, atk: 620, def: 248, exp: 7500, gold: 3800 }],
        boss: { name: 'Wraithbone', hp: 165000, atk: 1900, def: 760, exp: 65000, gold: 52000 }, waves: 15 },
      { id: 'void_sanctum', name: 'Void Sanctum', chapter: 6, order: 4, minLevel: 66,
        monsters: [{ name: 'Void Acolyte', hp: 14500, atk: 640, def: 256, exp: 7800, gold: 3900 }],
        boss: { name: 'Voidseer Kael', hp: 175000, atk: 1950, def: 780, exp: 68000, gold: 54000 }, waves: 15 },
      { id: 'abyssal_throne', name: 'Abyssal Throne', chapter: 6, order: 5, minLevel: 68,
        monsters: [{ name: 'Abyssal Guardian', hp: 15000, atk: 660, def: 264, exp: 8000, gold: 4000 }],
        boss: { name: 'Abyss King Mordan', hp: 190000, atk: 2100, def: 840, exp: 75000, gold: 60000 }, waves: 16 },
    ],
  },
  {
    id: 'immortal_pass', name: 'Immortal Pass', minLevel: 70, maxLevel: 80,
    stages: [
      { id: 'eternal_sanctuary', name: 'Eternal Sanctuary', chapter: 7, order: 1, minLevel: 70,
        monsters: [{ name: 'Eternal Knight', hp: 15000, atk: 650, def: 260, exp: 8000, gold: 4000 }],
        boss: { name: 'Tyrath', hp: 180000, atk: 2000, def: 800, exp: 70000, gold: 55000 }, waves: 15 },
      { id: 'celestial_forge', name: 'Celestial Forge', chapter: 7, order: 2, minLevel: 72,
        monsters: [{ name: 'Forge Guardian', hp: 16500, atk: 700, def: 280, exp: 8500, gold: 4200 }],
        boss: { name: 'Ignis Rex', hp: 200000, atk: 2200, def: 880, exp: 80000, gold: 65000 }, waves: 15 },
      { id: 'starfall_summit', name: 'Starfall Summit', chapter: 7, order: 3, minLevel: 74,
        monsters: [{ name: 'Star Sentinel', hp: 18000, atk: 750, def: 300, exp: 9000, gold: 4500 }],
        boss: { name: 'Stellaris', hp: 220000, atk: 2350, def: 940, exp: 88000, gold: 70000 }, waves: 16 },
      { id: 'frostbound_peak', name: 'Frostbound Peak', chapter: 7, order: 4, minLevel: 76,
        monsters: [{ name: 'Frost Colossus', hp: 19500, atk: 780, def: 312, exp: 9500, gold: 4800 }],
        boss: { name: 'Glacius', hp: 235000, atk: 2450, def: 980, exp: 95000, gold: 76000 }, waves: 16 },
      { id: 'endless_path', name: 'Endless Path', chapter: 7, order: 5, minLevel: 78,
        monsters: [{ name: 'Void Walker', hp: 20000, atk: 800, def: 320, exp: 10000, gold: 5000 }],
        boss: { name: 'Darmir', hp: 250000, atk: 2500, def: 1000, exp: 100000, gold: 80000 }, waves: 16 },
    ],
  },
  {
    id: 'divine_ascent', name: 'Divine Ascent', minLevel: 80, maxLevel: 90,
    stages: [
      { id: 'heavenly_gate', name: 'Heavenly Gate', chapter: 8, order: 1, minLevel: 80,
        monsters: [{ name: 'Divine Sentry', hp: 22000, atk: 850, def: 340, exp: 11000, gold: 5500 }],
        boss: { name: 'Seraph Protector', hp: 280000, atk: 2700, def: 1080, exp: 110000, gold: 88000 }, waves: 16 },
      { id: 'golden_palace', name: 'Golden Palace', chapter: 8, order: 2, minLevel: 82,
        monsters: [{ name: 'Golden Golem', hp: 24000, atk: 900, def: 360, exp: 12000, gold: 6000 }],
        boss: { name: 'Emperor Auros', hp: 310000, atk: 2900, def: 1160, exp: 120000, gold: 96000 }, waves: 17 },
      { id: 'thundercrown_spire', name: 'Thundercrown Spire', chapter: 8, order: 3, minLevel: 84,
        monsters: [{ name: 'Thunder Lord', hp: 26000, atk: 950, def: 380, exp: 13000, gold: 6500 }],
        boss: { name: 'Voltaris', hp: 340000, atk: 3100, def: 1240, exp: 135000, gold: 108000 }, waves: 17 },
      { id: 'world_tree', name: 'World Tree', chapter: 8, order: 4, minLevel: 86,
        monsters: [{ name: 'Ancient Treant', hp: 28000, atk: 1000, def: 400, exp: 14000, gold: 7000 }],
        boss: { name: 'Yggdrasil Avatar', hp: 380000, atk: 3300, def: 1320, exp: 150000, gold: 120000 }, waves: 18 },
      { id: 'gods_throne', name: 'God\'s Throne', chapter: 8, order: 5, minLevel: 88,
        monsters: [{ name: 'Celestial Champion', hp: 30000, atk: 1050, def: 420, exp: 15000, gold: 7500 }],
        boss: { name: 'Archon Supreme', hp: 420000, atk: 3500, def: 1400, exp: 180000, gold: 150000 }, waves: 18 },
    ],
  },
];

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS campaign_progress (
      char_id   INTEGER NOT NULL REFERENCES characters(id),
      stage_id  TEXT NOT NULL,
      stars     INTEGER DEFAULT 0,
      clears    INTEGER DEFAULT 0,
      best_time INTEGER DEFAULT 0,
      PRIMARY KEY (char_id, stage_id)
    );
    CREATE TABLE IF NOT EXISTS stamina (
      char_id     INTEGER PRIMARY KEY REFERENCES characters(id),
      current     INTEGER DEFAULT 100,
      last_reset  TEXT DEFAULT ''
    );
  `);
}

function getAllStages() {
  const all = [];
  for (const ch of CHAPTERS) {
    for (const s of ch.stages) {
      all.push({ ...s, chapterId: ch.id, chapterName: ch.name });
    }
  }
  return all;
}

function findStage(stageId) {
  for (const ch of CHAPTERS) {
    const s = ch.stages.find(ss => ss.id === stageId);
    if (s) return { ...s, chapterId: ch.id, chapterName: ch.name };
  }
  return null;
}

function getStages(charId) {
  const char = db.getCharacterById(charId);
  if (!char) return [];

  const progress = db.getDatabase()
    .prepare('SELECT * FROM campaign_progress WHERE char_id = ?')
    .all(charId);
  const progressMap = new Map(progress.map(p => [p.stage_id, p]));

  const result = [];
  for (const ch of CHAPTERS) {
    if (char.grade < ch.minLevel) continue;
    const stages = ch.stages.map((s, idx) => {
      const p = progressMap.get(s.id);
      let locked = false;
      if (idx > 0) {
        const prev = progressMap.get(ch.stages[idx - 1].id);
        if (!prev || prev.stars === 0) locked = true;
      }
      return {
        id: s.id, name: s.name, minLevel: s.minLevel,
        chapter: ch.name, order: s.order,
        stars: p ? p.stars : 0, clears: p ? p.clears : 0,
        locked: locked || char.grade < s.minLevel,
        bossName: s.boss.name, waves: s.waves,
      };
    });
    result.push({ id: ch.id, name: ch.name, minLevel: ch.minLevel, stages });
  }
  return result;
}

function getStamina(charId) {
  db.getDatabase().prepare('INSERT OR IGNORE INTO stamina (char_id) VALUES (?)').run(charId);
  resetDailyStamina(charId);
  return db.getDatabase().prepare('SELECT * FROM stamina WHERE char_id = ?').get(charId);
}

function resetDailyStamina(charId) {
  const today = new Date().toISOString().slice(0, 10);
  const row = db.getDatabase().prepare('SELECT * FROM stamina WHERE char_id = ?').get(charId);
  if (row && row.last_reset !== today) {
    const newStamina = Math.min(row.current + DAILY_STAMINA, STAMINA_CAP);
    db.getDatabase().prepare('UPDATE stamina SET current = ?, last_reset = ? WHERE char_id = ?')
      .run(newStamina, today, charId);
  }
}

function useStamina(charId, amount) {
  const s = getStamina(charId);
  if (s.current < amount) return false;
  db.getDatabase().prepare('UPDATE stamina SET current = current - ? WHERE char_id = ?').run(amount, charId);
  return true;
}

function enterStage(charId, stageId) {
  const stage = findStage(stageId);
  if (!stage) return { success: false, msg: 'Unknown stage' };

  const char = db.getCharacterById(charId);
  if (!char) return { success: false };
  if (char.grade < stage.minLevel) return { success: false, msg: `Level ${stage.minLevel} required` };

  if (!useStamina(charId, STAMINA_PER_RUN)) {
    return { success: false, msg: 'Not enough stamina' };
  }

  let playerHp = char.max_hp || char.hp;
  const playerAtk = char.attack;
  const playerDef = char.defence;
  const rounds = [];
  let won = true;

  for (let w = 0; w < stage.waves; w++) {
    const isLast = w === stage.waves - 1;
    const m = isLast ? stage.boss : stage.monsters[0];
    let mHp = m.hp;

    let roundNum = 0;
    while (mHp > 0 && playerHp > 0 && roundNum < 20) {
      roundNum++;
      const pDmg = Math.max(1, Math.floor(playerAtk * playerAtk / (playerAtk + m.def)));
      const crit = Math.random() < 0.1;
      const finalPDmg = crit ? Math.floor(pDmg * 1.5) : pDmg;
      mHp -= finalPDmg;

      if (mHp > 0) {
        const mDmg = Math.max(1, Math.floor(m.atk * m.atk / (m.atk + playerDef)));
        playerHp -= mDmg;
      }
    }

    rounds.push({ wave: w + 1, enemy: m.name, isBoss: isLast, result: mHp <= 0 ? 'win' : 'lose' });
    if (playerHp <= 0) { won = false; break; }
  }

  let stars = 0;
  if (won) {
    const hpPct = playerHp / (char.max_hp || char.hp);
    stars = hpPct > 0.8 ? 3 : hpPct > 0.4 ? 2 : 1;
  }

  let totalExp = 0, totalGold = 0;
  if (won) {
    for (const m of stage.monsters) { totalExp += m.exp * (stage.waves - 1); totalGold += m.gold * (stage.waves - 1); }
    totalExp += stage.boss.exp;
    totalGold += stage.boss.gold;

    db.getDatabase().prepare('UPDATE characters SET exp = exp + ?, gold = gold + ? WHERE id = ?')
      .run(totalExp, totalGold, charId);

    const existing = db.getDatabase()
      .prepare('SELECT * FROM campaign_progress WHERE char_id = ? AND stage_id = ?')
      .get(charId, stageId);
    if (existing) {
      db.getDatabase().prepare('UPDATE campaign_progress SET stars = MAX(stars, ?), clears = clears + 1 WHERE char_id = ? AND stage_id = ?')
        .run(stars, charId, stageId);
    } else {
      db.getDatabase().prepare('INSERT INTO campaign_progress (char_id, stage_id, stars, clears) VALUES (?, ?, ?, 1)')
        .run(charId, stageId, stars);
    }

    const quest = require('./quest');
    quest.updateProgress(charId, 'complete_campaign', stageId);
    quest.checkLevelUp(charId);
  }

  return { success: true, won, stars, rounds, rewards: won ? { exp: totalExp, gold: totalGold } : null, stageId, stageName: stage.name, bossName: stage.boss.name };
}

function sweep(charId, stageId, count = 1) {
  const stage = findStage(stageId);
  if (!stage) return { success: false, msg: 'Unknown stage' };

  const progress = db.getDatabase()
    .prepare('SELECT * FROM campaign_progress WHERE char_id = ? AND stage_id = ?')
    .get(charId, stageId);
  if (!progress || progress.stars < 3) return { success: false, msg: 'Need 3 stars to sweep' };

  const totalStamina = STAMINA_PER_RUN * count;
  if (!useStamina(charId, totalStamina)) return { success: false, msg: 'Not enough stamina' };

  let totalExp = 0, totalGold = 0;
  for (let i = 0; i < count; i++) {
    for (const m of stage.monsters) { totalExp += m.exp * (stage.waves - 1); totalGold += m.gold * (stage.waves - 1); }
    totalExp += stage.boss.exp;
    totalGold += stage.boss.gold;
  }

  db.getDatabase().prepare('UPDATE characters SET exp = exp + ?, gold = gold + ? WHERE id = ?').run(totalExp, totalGold, charId);
  db.getDatabase().prepare('UPDATE campaign_progress SET clears = clears + ? WHERE char_id = ? AND stage_id = ?').run(count, charId, stageId);

  const quest = require('./quest');
  quest.checkLevelUp(charId);

  return { success: true, count, rewards: { exp: totalExp, gold: totalGold } };
}

function blitzStage(charId, stageId, count = 1) {
  const char = db.getCharacterById(charId);
  if (!char) return { success: false, msg: 'Character not found' };

  const progress = db.getDatabase()
    .prepare('SELECT * FROM campaign_progress WHERE char_id = ? AND stage_id = ?')
    .get(charId, stageId);
  if (!progress || progress.clears < 1) return { success: false, msg: 'Clear the stage first' };

  const stage = findStage(stageId);
  if (!stage) return { success: false, msg: 'Invalid stage' };

  count = Math.max(1, Math.min(count, 10));
  const goldCost = 500 * count;
  if (char.gold < goldCost) return { success: false, msg: 'Not enough gold' };

  db.getDatabase().prepare('UPDATE characters SET gold = gold - ? WHERE id = ?').run(goldCost, charId);

  let totalExp = 0, totalGold = 0;
  for (let i = 0; i < count; i++) {
    for (const m of stage.monsters) { totalExp += m.exp; totalGold += m.gold; }
    totalExp += stage.boss.exp;
    totalGold += stage.boss.gold;
  }

  db.getDatabase().prepare('UPDATE characters SET exp = exp + ?, gold = gold + ? WHERE id = ?')
    .run(totalExp, totalGold, charId);
  db.getDatabase().prepare('UPDATE campaign_progress SET clears = clears + ? WHERE char_id = ? AND stage_id = ?')
    .run(count, charId, stageId);

  const allDrops = [];
  try {
    const inventoryMod = require('./inventory');
    const battleMod = require('./battle');
    for (let i = 0; i < count; i++) {
      const drops = battleMod.generateDrops ? battleMod.generateDrops(stage.monsters, char.grade) : [];
      for (const drop of drops) {
        inventoryMod.addItem(charId, drop.itemId, drop.count, drop.quality || 0);
        allDrops.push(drop);
      }
    }
  } catch (e) { /* drop generation optional */ }

  try { require('./quest').checkLevelUp(charId); } catch (e) {}

  return { success: true, count, rewards: { exp: totalExp, gold: totalGold, drops: allDrops } };
}

module.exports = {
  OPCODES, CHAPTERS, STAMINA_PER_RUN, STAMINA_CAP,
  initDB, getAllStages, findStage, getStages, getStamina,
  enterStage, sweep, blitzStage,
};
