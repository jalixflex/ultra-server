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

  // === LEVELS 25-35 ===
  { id: 27, name: 'Rune Gücü', type: 'main', npc: 'stone', minLevel: 25,
    objective: 'equip_rune', target: 'any', count: 1,
    dialog: 'Rune stones can amplify your power. Equip your first rune!',
    rewards: { exp: 8000, gold: 9000 }, nextQuest: 28 },

  { id: 28, name: 'Derinliklerde', type: 'main', npc: 'berdim', minLevel: 26,
    objective: 'catacombs_floor', target: '10', count: 1,
    dialog: 'The Catacombs grow darker. Reach floor 10 and defeat Lawrence the Wretched!',
    rewards: { exp: 9000, gold: 10000 }, nextQuest: 29 },

  { id: 29, name: 'Arena Şampiyonu', type: 'main', npc: 'elise', minLevel: 28,
    objective: 'arena_battle', target: 'any', count: 10,
    dialog: 'True champions fight in the Arena! Complete 10 arena battles.',
    rewards: { exp: 10000, gold: 12000, items: [{ itemId: 3003, count: 1 }] }, nextQuest: 30 },

  { id: 30, name: 'Lonca Bağışı', type: 'main', npc: 'berdim', minLevel: 28,
    objective: 'guild_donate', target: 'any', count: 3,
    dialog: 'A strong guild needs resources. Donate 3 times to your guild treasury!',
    rewards: { exp: 8000, gold: 8000 }, nextQuest: 31 },

  { id: 31, name: 'Yetenek Ağacı', type: 'main', npc: 'berdim', minLevel: 30,
    objective: 'learn_talent', target: 'any', count: 3,
    dialog: 'Invest in your talent tree. Unlock 3 talent nodes.',
    rewards: { exp: 12000, gold: 15000 }, nextQuest: 32 },

  { id: 32, name: 'Forgotten Tomb', type: 'main', npc: 'berdim', minLevel: 30,
    objective: 'complete_campaign', target: 'forgotten_tomb', count: 1,
    dialog: 'The Forgotten Tomb holds dark secrets. Clear it and uncover the truth.',
    rewards: { exp: 14000, gold: 16000 }, nextQuest: 33 },

  { id: 33, name: 'Forge Ustası', type: 'main', npc: 'stone', minLevel: 32,
    objective: 'enchant_item', target: 'any', count: 5,
    dialog: 'Master the art of enchanting! Enchant items 5 times.',
    rewards: { exp: 13000, gold: 14000 }, nextQuest: 34 },

  { id: 34, name: 'Mücevher Koleksiyoncusu', type: 'main', npc: 'stone', minLevel: 33,
    objective: 'socket_gem', target: 'any', count: 3,
    dialog: 'Socket 3 gems into your equipment to enhance your power.',
    rewards: { exp: 14000, gold: 15000 }, nextQuest: 35 },

  { id: 35, name: 'Gölgeler Vadisi', type: 'main', npc: 'berdim', minLevel: 35,
    objective: 'complete_campaign', target: 'shadow_valley', count: 1,
    dialog: 'The Shadow Valley harbors creatures of darkness. Push through and cleanse it!',
    rewards: { exp: 18000, gold: 20000 }, nextQuest: 36 },

  // === LEVELS 35-45 ===
  { id: 36, name: 'Dünya Bossu Avcısı', type: 'main', npc: 'berdim', minLevel: 35,
    objective: 'world_boss', target: 'any', count: 5,
    dialog: 'The World Boss threatens our world. Attack it 5 times!',
    rewards: { exp: 20000, gold: 22000 }, nextQuest: 37 },

  { id: 37, name: 'Kanat Uyanışı', type: 'main', npc: 'berdim', minLevel: 36,
    objective: 'equip_wings', target: 'any', count: 1,
    dialog: 'Your wings are ready to unfurl. Equip them and soar above your enemies!',
    rewards: { exp: 18000, gold: 15000 }, nextQuest: 38 },

  { id: 38, name: 'Birlik Gücü', type: 'main', npc: 'berdim', minLevel: 37,
    objective: 'recruit_troop', target: 'any', count: 200,
    dialog: 'Build a mighty army! Recruit 200 troops for the battles ahead.',
    rewards: { exp: 20000, gold: 25000 }, nextQuest: 39 },

  { id: 39, name: 'Demir Kalesi', type: 'main', npc: 'berdim', minLevel: 38,
    objective: 'complete_campaign', target: 'iron_fortress', count: 1,
    dialog: 'The Iron Fortress stands between us and victory. Storm its gates!',
    rewards: { exp: 22000, gold: 25000 }, nextQuest: 40 },

  { id: 40, name: 'Astral Ustası', type: 'main', npc: 'berdim', minLevel: 40,
    objective: 'capture_astral', target: 'any', count: 5,
    dialog: 'Master the power of the stars. Capture 5 Astrals from the observatory!',
    rewards: { exp: 25000, gold: 30000, items: [{ itemId: 3005, count: 2 }] }, nextQuest: 41 },

  { id: 41, name: 'Katakomplar Derinliği', type: 'main', npc: 'berdim', minLevel: 40,
    objective: 'catacombs_floor', target: '20', count: 1,
    dialog: 'Descend to floor 20 of the Catacombs and defeat the Shadow Assassin!',
    rewards: { exp: 26000, gold: 28000 }, nextQuest: 42 },

  { id: 42, name: 'Savaş Alanı Gazisi', type: 'main', npc: 'elise', minLevel: 42,
    objective: 'battleground', target: 'any', count: 5,
    dialog: 'Participate in 5 Battleground matches. Win or lose, experience is the reward.',
    rewards: { exp: 28000, gold: 30000 }, nextQuest: 43 },

  { id: 43, name: 'Kara Orman', type: 'main', npc: 'berdim', minLevel: 43,
    objective: 'complete_campaign', target: 'dark_forest', count: 1,
    dialog: 'The Dark Forest conceals ancient evils. Clear a path through its heart.',
    rewards: { exp: 30000, gold: 32000 }, nextQuest: 44 },

  { id: 44, name: 'Ejderha Ruhu', type: 'main', npc: 'berdim', minLevel: 45,
    objective: 'equip_dragon_soul', target: 'any', count: 1,
    dialog: 'The Dragon Soul will grant you immense power. Activate it now!',
    rewards: { exp: 32000, gold: 35000 }, nextQuest: 45 },

  // === LEVELS 45-60 ===
  { id: 45, name: 'Cehennem Kapısı', type: 'main', npc: 'berdim', minLevel: 47,
    objective: 'complete_campaign', target: 'hell_gate', count: 1,
    dialog: 'The gates of Hell have opened. Enter and survive the infernal trials!',
    rewards: { exp: 35000, gold: 38000 }, nextQuest: 46 },

  { id: 46, name: 'Sylph Eğitimi', type: 'main', npc: 'sylph_npc', minLevel: 50,
    objective: 'upgrade_sylph', target: 'any', count: 3,
    dialog: 'Your Sylph needs training! Upgrade it 3 times to unlock its true potential.',
    rewards: { exp: 40000, gold: 40000 }, nextQuest: 47 },

  { id: 47, name: 'Kutsal Dövme', type: 'main', npc: 'berdim', minLevel: 52,
    objective: 'apply_henna', target: 'any', count: 3,
    dialog: 'Sacred tattoos grant hidden power. Apply 3 henna tattoos.',
    rewards: { exp: 42000, gold: 42000 }, nextQuest: 48 },

  { id: 48, name: 'Buz Tapınağı', type: 'main', npc: 'berdim', minLevel: 53,
    objective: 'complete_campaign', target: 'ice_temple', count: 1,
    dialog: 'The Ice Temple freezes all who enter unprepared. Shatter its guardian!',
    rewards: { exp: 45000, gold: 48000 }, nextQuest: 49 },

  { id: 49, name: 'Eudaemon Çağrısı', type: 'main', npc: 'berdim', minLevel: 55,
    objective: 'summon_eudaemon', target: 'any', count: 1,
    dialog: 'Summon your Eudaemon, a divine companion to fight alongside you!',
    rewards: { exp: 50000, gold: 50000 }, nextQuest: 50 },

  { id: 50, name: 'Katakomplar 50', type: 'main', npc: 'berdim', minLevel: 55,
    objective: 'catacombs_floor', target: '50', count: 1,
    dialog: 'Descend to floor 50 and defeat Demon Lord Krath!',
    rewards: { exp: 55000, gold: 55000, items: [{ itemId: 3008, count: 1, quality: 4 }] }, nextQuest: 51 },

  { id: 51, name: 'Cross-Server Arena', type: 'main', npc: 'elise', minLevel: 57,
    objective: 'cross_server_battle', target: 'any', count: 1,
    dialog: 'You are ready for the ultimate challenge. Enter the Cross-Server Arena!',
    rewards: { exp: 55000, gold: 60000 }, nextQuest: 52 },

  { id: 52, name: 'Volkanik Geçit', type: 'main', npc: 'berdim', minLevel: 58,
    objective: 'complete_campaign', target: 'volcanic_pass', count: 1,
    dialog: 'The Volcanic Pass is ablaze with fire elementals. Survive the heat!',
    rewards: { exp: 60000, gold: 60000 }, nextQuest: 53 },

  // === LEVELS 60-80 ===
  { id: 53, name: 'Boyut Savaşı', type: 'main', npc: 'berdim', minLevel: 60,
    objective: 'dimensional_war', target: 'any', count: 1,
    dialog: 'Dimensional rifts tear through our world. Join the Dimensional War!',
    rewards: { exp: 70000, gold: 70000 }, nextQuest: 54 },

  { id: 54, name: 'Antik Rune', type: 'main', npc: 'stone', minLevel: 62,
    objective: 'upgrade_rune', target: 'any', count: 5,
    dialog: 'Upgrade 5 runes to amplify their ancient power.',
    rewards: { exp: 72000, gold: 70000 }, nextQuest: 55 },

  { id: 55, name: 'Şövalye Loncası', type: 'main', npc: 'brad', minLevel: 63,
    objective: 'knighthood_quest', target: 'any', count: 1,
    dialog: 'The Knighthood calls. Prove your valor and join their ranks!',
    rewards: { exp: 75000, gold: 75000 }, nextQuest: 56 },

  { id: 56, name: 'Lanetli Kale', type: 'main', npc: 'berdim', minLevel: 65,
    objective: 'complete_campaign', target: 'cursed_castle', count: 1,
    dialog: 'The Cursed Castle radiates dark energy. Destroy the source of the curse!',
    rewards: { exp: 80000, gold: 80000 }, nextQuest: 57 },

  { id: 57, name: 'Sylph Uyanışı', type: 'main', npc: 'sylph_npc', minLevel: 67,
    objective: 'upgrade_sylph', target: 'any', count: 10,
    dialog: 'Awaken your Sylph to its ultimate form. Upgrade it 10 times!',
    rewards: { exp: 85000, gold: 85000, items: [{ itemId: 3010, count: 1, quality: 5 }] }, nextQuest: 58 },

  { id: 58, name: 'Arena Efsanesi', type: 'main', npc: 'elise', minLevel: 68,
    objective: 'arena_battle', target: 'any', count: 50,
    dialog: 'Win 50 arena battles to earn the title of Arena Legend!',
    rewards: { exp: 88000, gold: 90000 }, nextQuest: 59 },

  { id: 59, name: 'Katakomplar 80', type: 'main', npc: 'berdim', minLevel: 70,
    objective: 'catacombs_floor', target: '80', count: 1,
    dialog: 'Floor 80 holds the Chaos Emperor. Only the mightiest can reach it!',
    rewards: { exp: 90000, gold: 95000 }, nextQuest: 60 },

  { id: 60, name: 'Tanrıların Savaşı', type: 'main', npc: 'berdim', minLevel: 72,
    objective: 'complete_campaign', target: 'gods_battlefield', count: 1,
    dialog: 'The Gods\' Battlefield awaits. Enter and face divine trials!',
    rewards: { exp: 95000, gold: 100000 }, nextQuest: 61 },

  { id: 61, name: 'Ejderha Efendisi', type: 'main', npc: 'berdim', minLevel: 74,
    objective: 'upgrade_dragon_soul', target: 'any', count: 10,
    dialog: 'Feed your Dragon Soul 10 times. It hungers for power!',
    rewards: { exp: 100000, gold: 100000 }, nextQuest: 62 },

  { id: 62, name: 'Son Sınav', type: 'main', npc: 'berdim', minLevel: 76,
    objective: 'catacombs_floor', target: '100', count: 1,
    dialog: 'The 100th floor of the Catacombs is the ultimate test. Defeat the Abyssal Overlord!',
    rewards: { exp: 120000, gold: 120000, balens: 500 }, nextQuest: 63 },

  { id: 63, name: 'Class Advancement', type: 'main', npc: 'brad', minLevel: 80,
    objective: 'class_advance', target: 'any', count: 1,
    dialog: 'You have proven yourself worthy. Complete the trials to advance your class!',
    rewards: { exp: 150000, gold: 100000, balens: 1000 }, nextQuest: null },
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

  // Achievement progress
  try {
    const achievement = require('./achievement');
    achievement.incrementStat(charId, 'quests_completed', 1);
  } catch (e) { /* ignore */ }

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
    try { require('./ranking').updatePlayerRanking(charId); } catch (e) {}
    try { require('./title').checkAndAwardTitles(charId); } catch (e) {}
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
