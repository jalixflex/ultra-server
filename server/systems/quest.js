'use strict';

const db = require('../db');

const OPCODES = {
  C_QUEST_LIST:       0x6200,
  S_QUEST_LIST:       0x6210,
  C_QUEST_ACCEPT:     0x6201,
  C_QUEST_COMPLETE:   0x6202,
  S_QUEST_UPDATE:     0x6211,
  C_QUEST_NPC_TALK:   0x6203,
  S_QUEST_NPC_TALK:   0x6213,
};

// NPC definitions
const NPCS = {
  berdim:    { id: 1, name: 'Berdim',    location: 'Cloud City Center',    role: 'Main Quest' },
  elise:     { id: 2, name: 'Elise',     location: 'Arena District',       role: 'Arena Guide' },
  brad:      { id: 3, name: 'Brad',      location: 'Cloud City East',      role: 'Knighthood' },
  asima:     { id: 4, name: 'Asima',     location: 'Cloud City Northeast', role: 'Circuit Quests' },
  lancaster: { id: 5, name: 'Lancaster', location: 'Cloud City West',      role: 'Healer' },
  stone:     { id: 6, name: 'Stone',     location: 'Blacksmith',           role: 'Blacksmith' },
  crimson:   { id: 7, name: 'Crimson',   location: 'Weapon Shop',          role: 'Weapon Trader' },
  sylph_npc: { id: 8, name: 'Sylph Keeper', location: 'Cloud City West',   role: 'Sylph Guide' },
};

// Main story quest chain — tutorial through endgame
const QUEST_CHAIN = [
  // === TUTORIAL (Level 1-5) ===
  { id: 1, name: 'Welcome to Wartune', type: 'main', npc: 'berdim', minLevel: 1,
    objective: 'talk_npc', target: 'berdim', count: 1,
    dialog: 'Welcome, brave warrior! Our land is under siege. Follow me and I will teach you the ways of battle.',
    rewards: { exp: 50, gold: 100 }, nextQuest: 2 },

  { id: 2, name: 'First Blood', type: 'main', npc: 'berdim', minLevel: 1,
    objective: 'kill_monster', target: 'grassland_worg', count: 3,
    dialog: 'The Worgs have been terrorizing our farmlands. Defeat 3 of them to prove your strength!',
    rewards: { exp: 100, gold: 200 }, nextQuest: 3 },

  { id: 3, name: 'Building Your City', type: 'main', npc: 'berdim', minLevel: 1,
    objective: 'upgrade_building', target: 'townhall', count: 1,
    dialog: 'Your city is the foundation of your power. Upgrade your Town Hall to begin building.',
    rewards: { exp: 150, gold: 300 }, nextQuest: 4 },

  { id: 4, name: 'Raise an Army', type: 'main', npc: 'berdim', minLevel: 1,
    objective: 'recruit_troop', target: 'any', count: 1,
    dialog: 'No warrior fights alone. Visit the Barracks and recruit your first troops.',
    rewards: { exp: 150, gold: 200 }, nextQuest: 5 },

  { id: 5, name: 'Equip for Battle', type: 'main', npc: 'berdim', minLevel: 2,
    objective: 'equip_item', target: 'any', count: 1,
    dialog: 'You\'ll need proper equipment. Equip a weapon from your inventory.',
    rewards: { exp: 200, gold: 300, items: [{ itemId: 1001, count: 1 }] }, nextQuest: 6 },

  { id: 6, name: 'Learn Your Skills', type: 'main', npc: 'berdim', minLevel: 3,
    objective: 'learn_skill', target: 'any', count: 1,
    dialog: 'Every warrior needs combat skills. Learn your first skill from the skill panel.',
    rewards: { exp: 250, gold: 400 }, nextQuest: 7 },

  { id: 7, name: 'Worg\'s Demise', type: 'main', npc: 'berdim', minLevel: 5,
    objective: 'complete_campaign', target: 'worg_lair', count: 1,
    dialog: 'The Worg Lair must be cleansed. Enter the campaign and defeat the boss Wulfgar!',
    rewards: { exp: 500, gold: 800 }, nextQuest: 8 },

  // === EARLY GAME (Level 5-15) ===
  { id: 8, name: 'Expand Your City', type: 'main', npc: 'berdim', minLevel: 5,
    objective: 'upgrade_building', target: 'townhall', count: 5,
    dialog: 'Your city must grow. Upgrade the Town Hall to level 5.',
    rewards: { exp: 600, gold: 1000 }, nextQuest: 9 },

  { id: 9, name: 'Baylon Plains', type: 'main', npc: 'berdim', minLevel: 9,
    objective: 'complete_campaign', target: 'baylon_plains', count: 1,
    dialog: 'The Karda brothers terrorize Baylon Plains. Defeat them!',
    rewards: { exp: 1000, gold: 1500 }, nextQuest: 10 },

  { id: 10, name: 'The Blacksmith', type: 'main', npc: 'stone', minLevel: 10,
    objective: 'enchant_item', target: 'any', count: 1,
    dialog: 'Greetings! I can enhance your equipment. Try enchanting one of your items.',
    rewards: { exp: 800, gold: 500 }, nextQuest: 11 },

  { id: 11, name: 'Temple of Ibalize', type: 'main', npc: 'berdim', minLevel: 11,
    objective: 'complete_campaign', target: 'temple_ibalize_outer', count: 1,
    dialog: 'An ancient evil stirs in the Temple of Ibalize. Investigate the outer sanctum.',
    rewards: { exp: 1500, gold: 2000 }, nextQuest: 12 },

  { id: 12, name: 'Join a Guild', type: 'main', npc: 'berdim', minLevel: 12,
    objective: 'join_guild', target: 'any', count: 1,
    dialog: 'Strength lies in unity. Join a guild or create your own!',
    rewards: { exp: 1000, gold: 1000 }, nextQuest: 13 },

  { id: 13, name: 'Prove Your Worth', type: 'main', npc: 'elise', minLevel: 13,
    objective: 'arena_battle', target: 'any', count: 3,
    dialog: 'The arena awaits challengers! Complete 3 arena battles.',
    rewards: { exp: 1200, gold: 1500 }, nextQuest: 14 },

  { id: 14, name: 'Temple Inner Sanctum', type: 'main', npc: 'berdim', minLevel: 13,
    objective: 'complete_campaign', target: 'temple_ibalize_inner', count: 1,
    dialog: 'The Divine Statue guards the inner temple. Destroy it!',
    rewards: { exp: 2000, gold: 2500 }, nextQuest: 15 },

  { id: 15, name: 'Socket Your Gems', type: 'main', npc: 'stone', minLevel: 15,
    objective: 'socket_gem', target: 'any', count: 1,
    dialog: 'Now that you\'re stronger, let me teach you about gem socketing.',
    rewards: { exp: 1500, gold: 1000, items: [{ itemId: 3001, count: 2 }] }, nextQuest: 16 },

  { id: 16, name: 'Orc Invasion', type: 'main', npc: 'berdim', minLevel: 15,
    objective: 'complete_campaign', target: 'orc_plains', count: 1,
    dialog: 'Orcs have invaded our borders! Push them back through the Orc Plains.',
    rewards: { exp: 2500, gold: 3000 }, nextQuest: 17 },

  // === MID GAME (Level 17-25) ===
  { id: 17, name: 'Bounty Hunter', type: 'main', npc: 'berdim', minLevel: 17,
    objective: 'complete_bounty', target: 'any', count: 5,
    dialog: 'The bounty board has work for you. Complete 5 bounty quests.',
    rewards: { exp: 3000, gold: 4000 }, nextQuest: 18 },

  { id: 18, name: 'Research & Technology', type: 'main', npc: 'berdim', minLevel: 18,
    objective: 'research_tech', target: 'any', count: 1,
    dialog: 'Your Academy is ready. Research your first technology!',
    rewards: { exp: 2000, gold: 2000 }, nextQuest: 19 },

  { id: 19, name: 'Camp Calorn', type: 'main', npc: 'berdim', minLevel: 19,
    objective: 'complete_campaign', target: 'camp_calorn', count: 1,
    dialog: 'Viscount Remus holds Camp Calorn. It\'s time to take it back.',
    rewards: { exp: 4000, gold: 5000 }, nextQuest: 20 },

  { id: 20, name: 'The World Boss', type: 'main', npc: 'berdim', minLevel: 20,
    objective: 'world_boss', target: 'any', count: 1,
    dialog: 'A fearsome World Boss threatens us all! Join the server-wide battle!',
    rewards: { exp: 5000, gold: 6000 }, nextQuest: 21 },

  { id: 21, name: 'Into Murkan Forest', type: 'main', npc: 'berdim', minLevel: 20,
    objective: 'complete_campaign', target: 'bretheran_abyss', count: 1,
    dialog: 'The darkness spreads to Murkan Forest. Explore the Bretheran Abyss.',
    rewards: { exp: 5000, gold: 5000 }, nextQuest: 22 },

  { id: 22, name: 'Forgotten Depths', type: 'main', npc: 'berdim', minLevel: 23,
    objective: 'catacombs_floor', target: '5', count: 1,
    dialog: 'The Forgotten Catacombs hold ancient treasures. Reach floor 5!',
    rewards: { exp: 6000, gold: 7000 }, nextQuest: 23 },

  { id: 23, name: 'Star Power', type: 'main', npc: 'berdim', minLevel: 25,
    objective: 'capture_astral', target: 'any', count: 1,
    dialog: 'The stars hold great power. Capture your first Astral at the observatory!',
    rewards: { exp: 7000, gold: 8000 }, nextQuest: 24 },

  // === LATE GAME (Level 30-50) ===
  { id: 24, name: 'Battleground', type: 'main', npc: 'elise', minLevel: 30,
    objective: 'battleground', target: 'any', count: 1,
    dialog: 'The Battleground is open! Fight for honor and glory!',
    rewards: { exp: 10000, gold: 12000 }, nextQuest: 25 },

  { id: 25, name: 'Serpent\'s Den', type: 'main', npc: 'berdim', minLevel: 30,
    objective: 'complete_campaign', target: 'serpents_den', count: 1,
    dialog: 'Sycorax lurks in the Serpent\'s Den. End his terror.',
    rewards: { exp: 12000, gold: 15000 }, nextQuest: 26 },

  { id: 26, name: 'Legend of the Sylphs', type: 'main', npc: 'sylph_npc', minLevel: 50,
    objective: 'obtain_sylph', target: 'any', count: 1,
    dialog: 'The ancient Sylphs will lend you their power. Choose your first elemental companion!',
    rewards: { exp: 30000, gold: 20000 }, nextQuest: 27 },

  { id: 27, name: 'Class Advancement', type: 'main', npc: 'brad', minLevel: 80,
    objective: 'class_advance', target: 'any', count: 1,
    dialog: 'You have proven yourself worthy. Complete the trials to advance your class!',
    rewards: { exp: 100000, gold: 50000 }, nextQuest: null },
];

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS quests (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id   INTEGER NOT NULL REFERENCES characters(id),
      quest_id  INTEGER NOT NULL,
      status    TEXT DEFAULT 'active',
      progress  INTEGER DEFAULT 0,
      accepted_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      UNIQUE(char_id, quest_id)
    );
    CREATE INDEX IF NOT EXISTS idx_quests_char ON quests(char_id);
  `);
}

function getActiveQuests(charId) {
  const rows = db.getDatabase()
    .prepare("SELECT * FROM quests WHERE char_id = ? AND status = 'active'")
    .all(charId);
  return rows.map(r => {
    const q = QUEST_CHAIN.find(qq => qq.id === r.quest_id);
    if (!q) return null;
    return { ...q, progress: r.progress, status: r.status };
  }).filter(Boolean);
}

function getCompletedQuests(charId) {
  return db.getDatabase()
    .prepare("SELECT quest_id FROM quests WHERE char_id = ? AND status = 'completed'")
    .all(charId)
    .map(r => r.quest_id);
}

function getAvailableQuests(charId) {
  const char = db.getCharacterById(charId);
  if (!char) return [];

  const completed = new Set(getCompletedQuests(charId));
  const active = new Set(
    db.getDatabase()
      .prepare("SELECT quest_id FROM quests WHERE char_id = ? AND status = 'active'")
      .all(charId)
      .map(r => r.quest_id)
  );

  return QUEST_CHAIN.filter(q => {
    if (completed.has(q.id) || active.has(q.id)) return false;
    if (char.grade < q.minLevel) return false;
    // First quest or previous quest completed
    if (q.id === 1) return true;
    const prev = QUEST_CHAIN.find(p => p.nextQuest === q.id);
    return prev && completed.has(prev.id);
  });
}

function acceptQuest(charId, questId) {
  const char = db.getCharacterById(charId);
  if (!char) return { success: false };

  const q = QUEST_CHAIN.find(qq => qq.id === questId);
  if (!q) return { success: false, msg: 'Unknown quest' };
  if (char.grade < q.minLevel) return { success: false, msg: `Level ${q.minLevel} required` };

  const existing = db.getDatabase()
    .prepare('SELECT * FROM quests WHERE char_id = ? AND quest_id = ?')
    .get(charId, questId);
  if (existing) return { success: false, msg: 'Quest already accepted or completed' };

  db.getDatabase()
    .prepare('INSERT INTO quests (char_id, quest_id) VALUES (?, ?)')
    .run(charId, questId);

  return { success: true, quest: q };
}

function updateProgress(charId, objectiveType, target, amount = 1) {
  const actives = db.getDatabase()
    .prepare("SELECT * FROM quests WHERE char_id = ? AND status = 'active'")
    .all(charId);

  const updated = [];
  for (const row of actives) {
    const q = QUEST_CHAIN.find(qq => qq.id === row.quest_id);
    if (!q) continue;
    if (q.objective !== objectiveType) continue;
    if (q.target !== 'any' && q.target !== target) continue;

    const newProgress = Math.min(row.progress + amount, q.count);
    db.getDatabase()
      .prepare('UPDATE quests SET progress = ? WHERE char_id = ? AND quest_id = ?')
      .run(newProgress, charId, row.quest_id);

    updated.push({ questId: q.id, name: q.name, progress: newProgress, required: q.count, complete: newProgress >= q.count });
  }
  return updated;
}

function completeQuest(charId, questId) {
  const row = db.getDatabase()
    .prepare("SELECT * FROM quests WHERE char_id = ? AND quest_id = ? AND status = 'active'")
    .get(charId, questId);
  if (!row) return { success: false, msg: 'Quest not active' };

  const q = QUEST_CHAIN.find(qq => qq.id === questId);
  if (!q) return { success: false };
  if (row.progress < q.count) return { success: false, msg: 'Quest not finished' };

  db.getDatabase()
    .prepare("UPDATE quests SET status = 'completed', completed_at = datetime('now') WHERE char_id = ? AND quest_id = ?")
    .run(charId, questId);

  // Give rewards
  const char = db.getCharacterById(charId);
  if (q.rewards.exp) {
    db.getDatabase().prepare('UPDATE characters SET exp = exp + ? WHERE id = ?').run(q.rewards.exp, charId);
  }
  if (q.rewards.gold) {
    db.getDatabase().prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').run(q.rewards.gold, charId);
  }

  // Check level up
  checkLevelUp(charId);

  // Auto-accept next quest if available
  let nextQuest = null;
  if (q.nextQuest) {
    const nq = QUEST_CHAIN.find(qq => qq.id === q.nextQuest);
    if (nq && char.grade >= nq.minLevel) {
      acceptQuest(charId, q.nextQuest);
      nextQuest = nq;
    }
  }

  return { success: true, rewards: q.rewards, nextQuest };
}

function checkLevelUp(charId) {
  const char = db.getCharacterById(charId);
  if (!char) return;
  const expNeeded = Math.floor(100 * char.grade * char.grade * 0.8);
  if (char.exp >= expNeeded && char.grade < 100) {
    const newLevel = char.grade + 1;
    db.getDatabase().prepare('UPDATE characters SET grade = ?, exp = exp - ? WHERE id = ?')
      .run(newLevel, expNeeded, charId);
    require('./inventory').recalcStats(charId);
    checkLevelUp(charId);
  }
}

function autoAcceptFirstQuest(charId) {
  const existing = db.getDatabase()
    .prepare('SELECT * FROM quests WHERE char_id = ? AND quest_id = 1')
    .get(charId);
  if (!existing) {
    acceptQuest(charId, 1);
  }
}

function talkToNpc(charId, npcId) {
  const npc = Object.values(NPCS).find(n => n.id === npcId);
  if (!npc) return { success: false, msg: 'Unknown NPC' };

  const npcKey = Object.keys(NPCS).find(k => NPCS[k].id === npcId);

  // Check if any active quest requires talking to this NPC
  const updates = updateProgress(charId, 'talk_npc', npcKey);

  // Find quests this NPC gives
  const available = getAvailableQuests(charId).filter(q => q.npc === npcKey);

  return {
    success: true,
    npc,
    dialog: available.length > 0 ? available[0].dialog : `Greetings, warrior. I am ${npc.name}.`,
    questUpdates: updates,
    availableQuests: available,
  };
}

module.exports = {
  OPCODES, NPCS, QUEST_CHAIN,
  initDB,
  getActiveQuests, getCompletedQuests, getAvailableQuests,
  acceptQuest, updateProgress, completeQuest,
  autoAcceptFirstQuest, talkToNpc, checkLevelUp,
};
