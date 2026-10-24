/**
 * Wartune Ultra — Campaign / Dungeon System
 * PvE campaign stages, dungeon instances
 */

'use strict';

const { encode } = require('../proto');
const { buildPacket } = require('../packet');
const db = require('../db');
const battle = require('./battle');

const OPCODES = {
  C_CAMPAIGN_LIST:    0x2328,  // 9000
  S_CAMPAIGN_LIST:    0x1040,  // 4160
  C_CAMPAIGN_ENTER:   0x2329,  // 9001
  S_CAMPAIGN_ENTER:   0x1041,  // 4161
  C_CAMPAIGN_SWEEP:   0x232A,  // 9002 — Auto-clear (blitz)
  S_CAMPAIGN_SWEEP:   0x1042,  // 4162
};

// Campaign chapters and stages
const CAMPAIGNS = [
  {
    chapterId: 1,
    name: 'Forgotten Forest',
    stages: [
      { stageId: 101, name: 'Forest Edge', levelReq: 1, stamina: 6, monsters: [1001, 1001], rewards: { exp: 50, gold: 30 } },
      { stageId: 102, name: 'Dark Path', levelReq: 2, stamina: 6, monsters: [1001, 1002], rewards: { exp: 80, gold: 50 } },
      { stageId: 103, name: 'Wolf Den', levelReq: 3, stamina: 6, monsters: [1002, 1002], rewards: { exp: 110, gold: 70 } },
      { stageId: 104, name: 'Ancient Ruins', levelReq: 4, stamina: 8, monsters: [1002, 1003], rewards: { exp: 150, gold: 100 } },
      { stageId: 105, name: 'Forest Heart (Boss)', levelReq: 5, stamina: 10, monsters: [2001], rewards: { exp: 300, gold: 200 } },
    ],
  },
  {
    chapterId: 2,
    name: 'Shadow Caves',
    stages: [
      { stageId: 201, name: 'Cave Entrance', levelReq: 6, stamina: 8, monsters: [1003, 1003], rewards: { exp: 200, gold: 150 } },
      { stageId: 202, name: 'Crystal Chamber', levelReq: 7, stamina: 8, monsters: [1003, 1004], rewards: { exp: 250, gold: 180 } },
      { stageId: 203, name: 'Underground River', levelReq: 8, stamina: 8, monsters: [1004, 1004], rewards: { exp: 300, gold: 220 } },
      { stageId: 204, name: 'Dark Throne', levelReq: 9, stamina: 10, monsters: [1004, 1005], rewards: { exp: 400, gold: 300 } },
      { stageId: 205, name: 'Lich Lair (Boss)', levelReq: 10, stamina: 12, monsters: [2002], rewards: { exp: 800, gold: 500 } },
    ],
  },
  {
    chapterId: 3,
    name: 'Dragon Peak',
    stages: [
      { stageId: 301, name: 'Mountain Pass', levelReq: 11, stamina: 10, monsters: [1005, 1005], rewards: { exp: 500, gold: 350 } },
      { stageId: 302, name: 'Eagle Nest', levelReq: 13, stamina: 10, monsters: [1005, 1006], rewards: { exp: 650, gold: 450 } },
      { stageId: 303, name: 'Frozen Summit', levelReq: 15, stamina: 10, monsters: [1006, 1006], rewards: { exp: 800, gold: 600 } },
      { stageId: 304, name: 'Dragon Gate', levelReq: 18, stamina: 12, monsters: [1006, 1007], rewards: { exp: 1000, gold: 800 } },
      { stageId: 305, name: 'Ancient Dragon (Boss)', levelReq: 20, stamina: 15, monsters: [2003], rewards: { exp: 2000, gold: 1500 } },
    ],
  },
];

function initDB() {
  const dbInst = db.getDatabase();
  dbInst.exec(`
    CREATE TABLE IF NOT EXISTS campaign_progress (
      char_id    INTEGER NOT NULL REFERENCES characters(id),
      stage_id   INTEGER NOT NULL,
      stars      INTEGER DEFAULT 0,
      clear_count INTEGER DEFAULT 0,
      best_time  INTEGER DEFAULT 0,
      PRIMARY KEY (char_id, stage_id)
    );
  `);
}

/**
 * Get campaign list with player progress
 */
function getCampaignList(charId) {
  const progress = db.getDatabase()
    .prepare('SELECT * FROM campaign_progress WHERE char_id = ?')
    .all(charId);
  const progressMap = new Map(progress.map(p => [p.stage_id, p]));

  const char = db.getCharacterById(charId);
  const playerLevel = char ? char.grade : 1;

  return CAMPAIGNS.map(chapter => ({
    chapterId: chapter.chapterId,
    name: chapter.name,
    stages: chapter.stages.map(stage => {
      const prog = progressMap.get(stage.stageId);
      return {
        stageId: stage.stageId,
        name: stage.name,
        levelReq: stage.levelReq,
        stamina: stage.stamina,
        unlocked: playerLevel >= stage.levelReq,
        stars: prog ? prog.stars : 0,
        clearCount: prog ? prog.clear_count : 0,
      };
    }),
  }));
}

/**
 * Enter a campaign stage (start battle)
 */
function enterStage(ws, stageId, clients) {
  const charId = ws.session?.charId;
  if (!charId) return { success: false, msg: 'Not logged in' };

  const char = db.getCharacterById(charId);
  if (!char) return { success: false, msg: 'Character not found' };

  // Find stage
  let stage = null;
  for (const ch of CAMPAIGNS) {
    stage = ch.stages.find(s => s.stageId === stageId);
    if (stage) break;
  }
  if (!stage) return { success: false, msg: 'Stage not found' };

  // Check level requirement
  if (char.grade < stage.levelReq) {
    return { success: false, msg: `Level ${stage.levelReq} required` };
  }

  // Start battle with stage monsters
  const battleId = battle.startBattle(ws, stage.monsters, stageId);

  return { success: true, battleId };
}

/**
 * Record stage completion
 */
function completeStage(charId, stageId, won) {
  if (!won) return;

  const stars = 3; // Full stars for now (can be calculated based on HP remaining, etc.)

  db.getDatabase().prepare(`
    INSERT INTO campaign_progress (char_id, stage_id, stars, clear_count)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(char_id, stage_id) DO UPDATE SET
      stars = MAX(stars, excluded.stars),
      clear_count = clear_count + 1
  `).run(charId, stageId, stars);
}

/**
 * Sweep (auto-clear) a previously completed stage
 */
function sweepStage(charId, stageId, count = 1) {
  const progress = db.getDatabase()
    .prepare('SELECT * FROM campaign_progress WHERE char_id = ? AND stage_id = ?')
    .get(charId, stageId);

  if (!progress || progress.stars < 3) {
    return { success: false, msg: 'Must 3-star clear before sweeping' };
  }

  let stage = null;
  for (const ch of CAMPAIGNS) {
    stage = ch.stages.find(s => s.stageId === stageId);
    if (stage) break;
  }
  if (!stage) return { success: false, msg: 'Stage not found' };

  const totalExp = stage.rewards.exp * count;
  const totalGold = stage.rewards.gold * count;

  const char = db.getCharacterById(charId);
  if (char) {
    db.updateCharacter(charId, {
      exp: char.exp + totalExp,
      gold: char.gold + totalGold,
    });
  }

  // Update clear count
  db.getDatabase()
    .prepare('UPDATE campaign_progress SET clear_count = clear_count + ? WHERE char_id = ? AND stage_id = ?')
    .run(count, charId, stageId);

  return { success: true, exp: totalExp, gold: totalGold };
}

module.exports = {
  OPCODES, CAMPAIGNS,
  initDB,
  getCampaignList, enterStage, completeStage, sweepStage,
};
