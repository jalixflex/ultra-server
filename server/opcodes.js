/**
 * Wartune Ultra — Opcode Definitions
 * Command IDs for Client↔Server communication.
 */

'use strict';

// ═══════════════════════════════════════════
// Client → Server (Login Flow)
// ═══════════════════════════════════════════
const C = {
  // Login Flow
  L_CREATE_LOGIN:      0x7006,
  L_GET_PLAYER_LIST:   0x7000,
  L_PREPARE_LOGIN:     0x7002,
  L_REGISTER_ROLE:     0x7004,
  L_SYNC_TIME:         0x7008,
  G_LOGIN_GATEWAY:     0x4E21,

  // Chat
  CHAT_SEND:           0x3A98,

  // Inventory / Bag
  BAG_INFO:            0x3E80,
  BAG_USE_ITEM:        0x3E81,
  BAG_SELL:            0x3E82,
  BAG_EQUIP:           0x3E83,
  BAG_UNEQUIP:         0x3E84,

  // Battle / Campaign
  BATTLE_START:        0x4268,
  CAMPAIGN_LIST:       0x4269,
  CAMPAIGN_ENTER:      0x426A,
  CAMPAIGN_SWEEP:      0x426B,

  // Guild
  GUILD_INFO:          0x4650,
  GUILD_CREATE:        0x4651,
  GUILD_JOIN:          0x4652,
  GUILD_LEAVE:         0x4653,
  GUILD_KICK:          0x4654,
  GUILD_PROMOTE:       0x4655,
  GUILD_DONATE:        0x4656,
  GUILD_LIST:          0x4657,

  // Mail
  MAIL_LIST:           0x46A0,
  MAIL_READ:           0x46A1,
  MAIL_SEND:           0x46A2,
  MAIL_COLLECT:        0x46A3,
  MAIL_DELETE:         0x46A4,

  // Friends
  FRIEND_LIST:         0x46F0,
  FRIEND_ADD:          0x46F1,
  FRIEND_REMOVE:       0x46F2,
  FRIEND_SEARCH:       0x46F3,

  // Shop
  SHOP_LIST:           0x4740,
  SHOP_BUY:            0x4741,

  // VIP
  VIP_INFO:            0x4790,

  // Astral
  ASTRAL_LIST:         0x4268 + 0x1000,
  ASTRAL_CAPTURE:      0x4269 + 0x1000,
  ASTRAL_UPGRADE:      0x426A + 0x1000,
  ASTRAL_EQUIP:        0x426B + 0x1000,
  ASTRAL_UNEQUIP:      0x426C + 0x1000,

  // Sylph
  SYLPH_LIST:          0x4E20,
  SYLPH_EQUIP:         0x4E21 + 0x1000,
  SYLPH_UPGRADE:       0x4E22 + 0x1000,
  SYLPH_ENGULF:        0x4E23 + 0x1000,

  // Mount
  MOUNT_LIST:          0x4268 + 0x2000,
  MOUNT_EQUIP:         0x4269 + 0x2000,
  MOUNT_UPGRADE:       0x426A + 0x2000,

  // Troops
  TROOP_LIST:          0x4650 + 0x1000,
  TROOP_RECRUIT:       0x4651 + 0x1000,
  TROOP_UPGRADE:       0x4652 + 0x1000,
  TROOP_EQUIP:         0x4653 + 0x1000,

  // Arena
  ARENA_INFO:          0x4A38,
  ARENA_CHALLENGE:     0x4A39,
  ARENA_RANKING:       0x4A3A,

  // Farm
  FARM_INFO:           0x4E20 + 0x2000,
  FARM_PLANT:          0x4E22 + 0x2000,
  FARM_HARVEST:        0x4E23 + 0x2000,
  FARM_STEAL:          0x4E24 + 0x2000,

  // Academy
  ACADEMY_LIST:        0x5208,
  ACADEMY_RESEARCH:    0x5209,

  // Skills
  SKILL_LIST:          0x5A00,
  SKILL_UPGRADE:       0x5A01,
  SKILL_EQUIP:         0x5A02,

  // Wings
  WINGS_INFO:          0x5E00,
  WINGS_UPGRADE:       0x5E01,

  // Forge
  FORGE_ENCHANT:       0x55F0,
  FORGE_SOCKET:        0x55F1,
  FORGE_REFINE:        0x55F2,
  FORGE_SYNTHESIZE:    0x55F3,

  // Quest
  QUEST_LIST:          0x6200,
  QUEST_ACCEPT:        0x6201,
  QUEST_COMPLETE:      0x6202,
  QUEST_NPC_TALK:      0x6203,

  // City
  CITY_INFO:           0x6100,
  CITY_UPGRADE:        0x6101,
  CITY_COLLECT:        0x6102,

  // Bounty
  BOUNTY_LIST:         0x6300,
  BOUNTY_ACCEPT:       0x6301,
  BOUNTY_COMPLETE:     0x6302,
  BOUNTY_REFRESH:      0x6303,

  // Devotion
  DEVOTION_INFO:       0x6400,
  DEVOTION_CLAIM:      0x6401,

  // Daily Login
  LOGIN_REWARD_INFO:   0x6500,
  LOGIN_REWARD_CLAIM:  0x6501,

  // World Boss
  WORLD_BOSS_INFO:     0x6600,
  WORLD_BOSS_ATTACK:   0x6601,
  WORLD_BOSS_RANK:     0x6602,

  // Catacombs
  CATACOMBS_INFO:      0x6700,
  CATACOMBS_FIGHT:     0x6701,
  CATACOMBS_RESET:     0x6702,
};

// ═══════════════════════════════════════════
// Server → Client (Responses)
// ═══════════════════════════════════════════
const S = {
  // Login
  U_L_CREATE_LOGIN_RSP:   0x0F06,
  U_L_GET_PLAYER_LIST:    0x0F03,
  U_L_PREPARE_LOGIN:      0x0F04,
  U_L_REGISTER_ROLE_RSP:  0x0F05,
  U_G_LOGIN_GATEWAY:      0x0F01,
  U_C_PLAYER_INFO:        0x0003,
  U_C_SYNCHRONIZED_TIME:  0x108A,

  // Generic result
  SIMPLE_RESULT:          0x0100,

  // Chat
  CHAT_MSG:              0x3A99,

  // Inventory
  BAG_INFO_RSP:          0x3E90,
  BAG_UPDATE:            0x3E91,

  // Battle
  BATTLE_INIT:           0x4270,
  BATTLE_ROUND:          0x4271,
  BATTLE_END:            0x4272,
  CAMPAIGN_LIST_RSP:     0x4273,
  CAMPAIGN_RESULT:       0x4274,

  // Guild
  GUILD_INFO_RSP:        0x4660,
  GUILD_LIST_RSP:        0x4667,

  // Mail
  MAIL_LIST_RSP:         0x46B0,

  // Friends
  FRIEND_LIST_RSP:       0x4700,

  // Shop
  SHOP_LIST_RSP:         0x4750,

  // VIP
  VIP_INFO_RSP:          0x47A0,

  // Astral
  ASTRAL_LIST_RSP:       0x5270,
  ASTRAL_UPDATE:         0x5271,

  // Sylph
  SYLPH_LIST_RSP:        0x5E30,
  SYLPH_UPDATE:          0x5E31,

  // Mount
  MOUNT_LIST_RSP:        0x6270,
  MOUNT_UPDATE:          0x6271,

  // Troops
  TROOP_LIST_RSP:        0x5660,
  TROOP_UPDATE:          0x5661,

  // Arena
  ARENA_INFO_RSP:        0x4A40,
  ARENA_RESULT:          0x4A41,
  ARENA_RANKING_RSP:     0x4A42,

  // Farm
  FARM_INFO_RSP:         0x6E30,
  FARM_UPDATE:           0x6E31,

  // Academy
  ACADEMY_LIST_RSP:      0x5210,
  ACADEMY_RESEARCH_RSP:  0x5211,

  // Skills
  SKILL_LIST_RSP:        0x5A10,
  SKILL_UPDATE:          0x5A11,

  // Wings
  WINGS_INFO_RSP:        0x5E10,
  WINGS_UPDATE:          0x5E11,

  // Forge
  FORGE_RESULT:          0x5600,

  // Quest
  QUEST_LIST_RSP:        0x6210,
  QUEST_UPDATE:          0x6211,
  QUEST_NPC_TALK_RSP:    0x6213,

  // City
  CITY_INFO_RSP:         0x6110,
  CITY_UPGRADE_RSP:      0x6111,
  CITY_COLLECT_RSP:      0x6112,

  // Bounty
  BOUNTY_LIST_RSP:       0x6310,
  BOUNTY_UPDATE:         0x6311,

  // Devotion
  DEVOTION_INFO_RSP:     0x6410,
  DEVOTION_CLAIM_RSP:    0x6411,

  // Daily Login
  LOGIN_REWARD_INFO_RSP: 0x6510,
  LOGIN_REWARD_CLAIM_RSP:0x6511,

  // World Boss
  WORLD_BOSS_INFO_RSP:   0x6610,
  WORLD_BOSS_ATTACK_RSP: 0x6611,
  WORLD_BOSS_RANK_RSP:   0x6612,

  // Catacombs
  CATACOMBS_INFO_RSP:    0x6710,
  CATACOMBS_FIGHT_RSP:   0x6711,
};

// Reverse lookup: number → name
const NAMES = {};
for (const [k, v] of Object.entries(C)) NAMES[v] = `C:${k}`;
for (const [k, v] of Object.entries(S)) NAMES[v] = `S:${k}`;

function cmdName(id) {
  return NAMES[id] || `0x${id.toString(16).toUpperCase()}`;
}

module.exports = { C, S, cmdName };
