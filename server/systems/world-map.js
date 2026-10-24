'use strict';

const db = require('../db');

const OPCODES = {
  C_MAP_ENTER:       0x6F00,
  S_MAP_ENTER_RSP:   0x6F10,
  C_MAP_MOVE:        0x6F01,
  S_MAP_MOVE_RSP:    0x6F11,
  C_MAP_NPC_LIST:    0x6F02,
  S_MAP_NPC_LIST_RSP:0x6F12,
  C_MAP_NPC_TALK:    0x6F03,
  S_MAP_NPC_DIALOG:  0x6F13,
  C_MAP_TELEPORT:    0x6F04,
  S_MAP_TELEPORT_RSP:0x6F14,
};

// Map definitions
const MAPS = {
  city: {
    id: 'city',
    name: 'Cloud City',
    minLevel: 1,
    npcs: ['berdim', 'elise', 'brad', 'asima', 'blacksmith', 'academy_master', 'arena_master',
           'guild_master', 'shop_keeper', 'mount_trainer', 'sylph_keeper', 'class_trainer'],
    connections: ['autaric_plains', 'murkan_forest'],
  },
  autaric_plains: {
    id: 'autaric_plains',
    name: 'Autaric Plains',
    minLevel: 1,
    npcs: ['lancaster', 'scout_elena'],
    connections: ['city', 'murkan_forest'],
    monsters: true,
  },
  murkan_forest: {
    id: 'murkan_forest',
    name: 'Murkan Forest',
    minLevel: 10,
    npcs: ['stone', 'ranger_kael'],
    connections: ['city', 'autaric_plains', 'fetid_swamp'],
    monsters: true,
  },
  fetid_swamp: {
    id: 'fetid_swamp',
    name: 'Fetid Swamp',
    minLevel: 20,
    npcs: ['hermit_grol'],
    connections: ['murkan_forest', 'deathly_sands'],
    monsters: true,
  },
  deathly_sands: {
    id: 'deathly_sands',
    name: 'Deathly Sands',
    minLevel: 30,
    npcs: ['crimson'],
    connections: ['fetid_swamp', 'erandel'],
    monsters: true,
  },
  erandel: {
    id: 'erandel',
    name: 'Erandel',
    minLevel: 45,
    npcs: ['sage_aeryn'],
    connections: ['deathly_sands', 'immortal_pass'],
    monsters: true,
  },
  immortal_pass: {
    id: 'immortal_pass',
    name: 'Immortal Pass',
    minLevel: 60,
    npcs: ['guardian_vex'],
    connections: ['erandel'],
    monsters: true,
  },
};

// NPC definitions
const NPCS = {
  berdim:          { name: 'Commander Berdim', title: 'City Commander',     mapId: 'city', x: 150, y: 200,
    dialog: ['Welcome to Cloud City, hero.', 'The forces of darkness grow stronger every day.', 'Complete your training and join the fight!'] },
  elise:           { name: 'Elise',            title: 'Quest Guide',        mapId: 'city', x: 200, y: 180,
    dialog: ['I can help you find your next quest.', 'Check your quest log for available missions.'] },
  brad:            { name: 'Captain Brad',     title: 'Military Advisor',   mapId: 'city', x: 250, y: 220,
    dialog: ['Our troops need training, commander.', 'Visit the barracks to recruit soldiers.'] },
  asima:           { name: 'Asima',            title: 'Mystic Scholar',     mapId: 'city', x: 300, y: 160,
    dialog: ['The ancient astrals hold great power.', 'Capture them to strengthen yourself.'] },
  blacksmith:      { name: 'Gort the Smith',   title: 'Blacksmith',         mapId: 'city', x: 180, y: 250,
    dialog: ['Need your gear enchanted?', 'I can refine, socket gems, and synthesize equipment.'] },
  academy_master:  { name: 'Scholar Theron',   title: 'Academy Master',     mapId: 'city', x: 350, y: 200,
    dialog: ['Knowledge is power, young one.', 'Research technologies to boost your abilities.'] },
  arena_master:    { name: 'Gladius',          title: 'Arena Champion',     mapId: 'city', x: 400, y: 180,
    dialog: ['Think you can fight? Prove it in the arena!', 'Top fighters earn great rewards.'] },
  guild_master:    { name: 'Lord Falken',      title: 'Guild Registrar',    mapId: 'city', x: 120, y: 300,
    dialog: ['Guilds are the backbone of our defense.', 'Create or join a guild to fight together.'] },
  shop_keeper:     { name: 'Merchant Petra',   title: 'Shop Keeper',        mapId: 'city', x: 280, y: 280,
    dialog: ['Looking to buy something?', 'I have the finest wares in Cloud City!'] },
  mount_trainer:   { name: 'Stable Master Ren',title: 'Mount Trainer',      mapId: 'city', x: 420, y: 250,
    dialog: ['A good mount makes all the difference.', 'Feed your mount whips to make it stronger!'] },
  sylph_keeper:    { name: 'Sylph Keeper Aria', title: 'Sylph Master',      mapId: 'city', x: 350, y: 300,
    dialog: ['Sylphs are magical companions of great power.', 'Bond with one and it will fight by your side.'] },
  class_trainer:   { name: 'Grand Master Kael', title: 'Class Trainer',     mapId: 'city', x: 200, y: 320,
    dialog: ['At level 80, you may choose your specialization.', 'The path you choose will define your destiny.'] },
  lancaster:       { name: 'Sergeant Lancaster', title: 'Field Commander', mapId: 'autaric_plains', x: 100, y: 100,
    dialog: ['The plains are overrun with Wulfgar\'s forces.', 'Clear them out and report back!'] },
  scout_elena:     { name: 'Scout Elena',      title: 'Scout',             mapId: 'autaric_plains', x: 200, y: 150,
    dialog: ['I\'ve spotted enemy patrols ahead.', 'Be careful out there.'] },
  stone:           { name: 'Ranger Stone',     title: 'Forest Warden',     mapId: 'murkan_forest', x: 150, y: 100,
    dialog: ['The forest grows darker by the day.', 'Something evil lurks in Murkan.'] },
  ranger_kael:     { name: 'Ranger Kael',      title: 'Hunter',            mapId: 'murkan_forest', x: 250, y: 200,
    dialog: ['Wild beasts have been corrupted by dark magic.', 'Help me thin their numbers.'] },
  hermit_grol:     { name: 'Hermit Grol',      title: 'Swamp Sage',        mapId: 'fetid_swamp', x: 150, y: 150,
    dialog: ['The swamp holds many secrets...', 'Not all of them pleasant.'] },
  crimson:         { name: 'Captain Crimson',   title: 'Desert Ranger',     mapId: 'deathly_sands', x: 200, y: 100,
    dialog: ['The sands hide ancient evils.', 'Watch your step here, hero.'] },
  sage_aeryn:      { name: 'Sage Aeryn',       title: 'Elven Lorekeeper',  mapId: 'erandel', x: 150, y: 150,
    dialog: ['Erandel was once a paradise.', 'Now the corruption has reached even here.'] },
  guardian_vex:    { name: 'Guardian Vex',      title: 'Gate Keeper',       mapId: 'immortal_pass', x: 100, y: 100,
    dialog: ['Only the strongest may pass.', 'Prove your worth or turn back.'] },
};

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS player_location (
      char_id   INTEGER PRIMARY KEY REFERENCES characters(id),
      map_id    TEXT DEFAULT 'city',
      x         INTEGER DEFAULT 200,
      y         INTEGER DEFAULT 200,
      last_move TEXT DEFAULT (datetime('now'))
    );
  `);
}

function ensureEntry(charId) {
  db.getDatabase().prepare('INSERT OR IGNORE INTO player_location (char_id) VALUES (?)').run(charId);
}

function getLocation(charId) {
  ensureEntry(charId);
  return db.getDatabase().prepare('SELECT * FROM player_location WHERE char_id = ?').get(charId);
}

function enterMap(charId, mapId) {
  const map = MAPS[mapId];
  if (!map) return { success: false, msg: 'Unknown map' };

  const char = db.getCharacterById(charId);
  if (!char) return { success: false };
  if (char.grade < map.minLevel) return { success: false, msg: `Level ${map.minLevel} required` };

  const loc = getLocation(charId);
  const currentMap = MAPS[loc.map_id];
  if (currentMap && !currentMap.connections.includes(mapId)) {
    return { success: false, msg: 'Cannot travel to that map from here' };
  }

  db.getDatabase().prepare(`
    UPDATE player_location SET map_id = ?, x = 200, y = 200, last_move = datetime('now')
    WHERE char_id = ?
  `).run(mapId, charId);

  return {
    success: true,
    map: { id: map.id, name: map.name },
    npcs: map.npcs.map(npcId => {
      const npc = NPCS[npcId];
      return npc ? { id: npcId, name: npc.name, title: npc.title, x: npc.x, y: npc.y } : null;
    }).filter(Boolean),
  };
}

function movePlayer(charId, x, y) {
  ensureEntry(charId);
  x = Math.max(0, Math.min(800, x));
  y = Math.max(0, Math.min(600, y));
  db.getDatabase().prepare('UPDATE player_location SET x = ?, y = ?, last_move = datetime(\'now\') WHERE char_id = ?')
    .run(x, y, charId);
  return { success: true, x, y };
}

function getNpcList(charId) {
  const loc = getLocation(charId);
  const map = MAPS[loc.map_id];
  if (!map) return { npcs: [] };

  return {
    mapId: map.id,
    mapName: map.name,
    npcs: map.npcs.map(npcId => {
      const npc = NPCS[npcId];
      return npc ? { id: npcId, name: npc.name, title: npc.title, x: npc.x, y: npc.y } : null;
    }).filter(Boolean),
  };
}

function talkToNpc(charId, npcId) {
  const npc = NPCS[npcId];
  if (!npc) return { success: false, msg: 'NPC not found' };

  const loc = getLocation(charId);
  if (npc.mapId !== loc.map_id) return { success: false, msg: 'NPC is not on this map' };

  // Update quest progress for talk_npc objectives
  const quest = require('./quest');
  quest.updateProgress(charId, 'talk_npc', npcId);

  return {
    success: true,
    npcId,
    name: npc.name,
    title: npc.title,
    dialog: npc.dialog,
  };
}

function teleport(charId, mapId) {
  const map = MAPS[mapId];
  if (!map) return { success: false, msg: 'Unknown map' };

  const char = db.getCharacterById(charId);
  if (!char) return { success: false };
  if (char.grade < map.minLevel) return { success: false, msg: `Level ${map.minLevel} required` };

  // Teleport costs 5000 gold (skip adjacency check)
  if (char.gold < 5000) return { success: false, msg: 'Need 5000 gold to teleport' };

  db.getDatabase().prepare('UPDATE characters SET gold = gold - 5000 WHERE id = ?').run(charId);
  db.getDatabase().prepare(`
    UPDATE player_location SET map_id = ?, x = 200, y = 200, last_move = datetime('now')
    WHERE char_id = ?
  `).run(mapId, charId);

  return {
    success: true,
    map: { id: map.id, name: map.name },
    goldSpent: 5000,
  };
}

function getMapList(charId) {
  const char = db.getCharacterById(charId);
  if (!char) return { maps: [] };

  return {
    maps: Object.values(MAPS).map(m => ({
      id: m.id,
      name: m.name,
      minLevel: m.minLevel,
      unlocked: char.grade >= m.minLevel,
      hasMonsters: !!m.monsters,
      connections: m.connections,
    })),
  };
}

module.exports = {
  OPCODES, MAPS, NPCS,
  initDB,
  getLocation, enterMap, movePlayer, getNpcList, talkToNpc, teleport, getMapList,
};
