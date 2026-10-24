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

  // Party / MPD
  PARTY_CREATE:        0x6A00,
  PARTY_INVITE:        0x6A01,
  PARTY_ACCEPT:        0x6A02,
  PARTY_LEAVE:         0x6A03,
  PARTY_KICK:          0x6A04,
  PARTY_INFO:          0x6A05,
  MPD_LIST:            0x6A06,
  MPD_ENTER:           0x6A07,
  MPD_FIGHT:           0x6A08,
  MPD_INFO:            0x6A09,

  // Battleground
  BG_INFO:             0x6B00,
  BG_JOIN:             0x6B01,
  BG_ATTACK:           0x6B02,
  BG_CAPTURE:          0x6B03,
  BG_RESULTS:          0x6B04,
  BG_RANKING:          0x6B05,

  // Clothing
  CLOTHING_LIST:       0x6C00,
  CLOTHING_EQUIP:      0x6C01,
  CLOTHING_UPGRADE:    0x6C02,
  CLOTHING_SYNTHESIZE: 0x6C03,
  CLOTHING_BUY:        0x6C04,

  // Class Advancement
  ADVANCE_INFO:        0x6D00,
  ADVANCE_START:       0x6D01,
  ADVANCE_TRIAL:       0x6D02,
  ADVANCE_CHOOSE:      0x6D03,

  // Buff
  BUFF_LIST:           0x6E00,

  // World Map
  MAP_ENTER:           0x6F00,
  MAP_MOVE:            0x6F01,
  MAP_NPC_LIST:        0x6F02,
  MAP_NPC_TALK:        0x6F03,
  MAP_TELEPORT:        0x6F04,

  // Talent
  TALENT_INFO:         0x7100,
  TALENT_UPGRADE:      0x7101,
  HOLY_SEAL_INFO:      0x7102,
  HOLY_SEAL_UPGRADE:   0x7103,

  // Rune
  RUNE_INFO:           0x7200,
  RUNE_EQUIP:          0x7201,
  RUNE_UNEQUIP:        0x7202,
  RUNE_UPGRADE:        0x7203,

  // Eudaemon
  EUDAEMON_LIST:       0x7300,
  EUDAEMON_SUMMON:     0x7301,
  EUDAEMON_EQUIP:      0x7302,
  EUDAEMON_LEVEL_UP:   0x7303,
  EUDAEMON_STAR_UP:    0x7304,
  EUDAEMON_SKILL:      0x7305,
  PATROL_START:        0x7306,
  PATROL_COLLECT:      0x7307,
  PATROL_LIST:         0x7308,

  // Honor
  HONOR_INFO:          0x7400,
  MEDALLION_INFO:      0x7401,
  MEDALLION_BUY:       0x7402,
  MEDALLION_EQUIP:     0x7403,
  PVP_SHOP_LIST:       0x7404,
  PVP_SHOP_BUY:        0x7405,

  // Dragon Soul
  DRAGON_SOUL_LIST:    0x7500,
  DRAGON_SOUL_UNLOCK:  0x7501,
  DRAGON_SOUL_UPGRADE: 0x7502,
  DRAGON_SOUL_EQUIP:   0x7503,

  // Holy Forge
  HOLY_FORGE_INFO:     0x7600,
  HOLY_FORGE_UPGRADE:  0x7601,
  HOLY_FORGE_ACTIVATE: 0x7602,

  // Guild Extras
  GUILD_ALTAR_INFO:    0x7700,
  GUILD_ALTAR_SPIN:    0x7701,
  GUILD_BEAST_INFO:    0x7702,
  GUILD_BEAST_ATTACK:  0x7703,
  GUILD_SHOP_LIST:     0x7704,
  GUILD_SHOP_BUY:      0x7705,
  GUILD_WAR_INFO:      0x7706,
  GUILD_WAR_ATTACK:    0x7707,
  GUILD_WAR_RANK:      0x7708,

  // Spire
  SPIRE_INFO:          0x7800,
  SPIRE_FIGHT:         0x7801,
  SPIRE_RESET:         0x7802,

  // Dimensional War
  DIMWAR_INFO:         0x7900,
  DIMWAR_ENTER:        0x7901,
  DIMWAR_FIGHT:        0x7902,
  DIMWAR_COLLECT:      0x7903,

  // Circuit Quest
  CIRCUIT_INFO:        0x7A00,
  CIRCUIT_ACCEPT:      0x7A01,
  CIRCUIT_COMPLETE:    0x7A02,
  CIRCUIT_REFRESH:     0x7A03,

  // Gem
  GEM_LIST:            0x7B00,
  GEM_COMBINE:         0x7B01,

  // Resistance
  RESIST_INFO:         0x7C00,

  // Henna
  HENNA_INFO:          0x7D00,
  HENNA_APPLY:         0x7D01,
  HENNA_REMOVE:        0x7D02,

  // Achievement
  ACHIEVEMENT_LIST:    0x7E00,
  ACHIEVEMENT_CLAIM:   0x7E01,

  // Events
  EVENT_LIST:          0x7F00,
  EVENT_INFO:          0x7F01,
  HOT_EVENT_CLAIM:     0x7F02,

  // Gacha
  GACHA_INFO:          0x8000,
  GACHA_SPIN:          0x8001,
  GACHA_TEN_SPIN:      0x8002,

  // Ranking
  RANKING_LIST:        0x8100,
  RANKING_DETAIL:      0x8101,

  // Social
  PLAYER_SEARCH:       0x8200,
  PLAYER_PROFILE:      0x8201,
  BLOCK_PLAYER:        0x8202,
  UNBLOCK_PLAYER:      0x8203,
  BLOCK_LIST:          0x8204,
  RECENT_CONTACTS:     0x8205,
  TRADE_REQUEST:       0x8206,
  TRADE_CONFIRM:       0x8207,
  TRADE_CANCEL:        0x8208,

  // Knighthood
  KNIGHTHOOD_INFO:     0x8300,
  KNIGHTHOOD_UPGRADE:  0x8301,
  KNIGHTHOOD_SKILL:    0x8302,
  KNIGHTHOOD_BLESSING: 0x8303,
  KNIGHTHOOD_HALL:     0x8304,

  // Jewel Hunt
  JEWEL_HUNT_INFO:     0x8400,
  JEWEL_HUNT_START:    0x8401,
  JEWEL_HUNT_MOVE:     0x8402,
  JEWEL_HUNT_COLLECT:  0x8403,

  // Cloud Adventure
  CLOUD_INFO:          0x8500,
  CLOUD_ENTER:         0x8501,
  CLOUD_COMPLETE:      0x8502,
  CLOUD_REWARDS:       0x8503,

  // Purgatory Maze
  MAZE_INFO:           0x8600,
  MAZE_ENTER:          0x8601,
  MAZE_MOVE:           0x8602,
  MAZE_FIGHT:          0x8603,
  MAZE_BOSS:           0x8604,
  MAZE_COMPLETE:       0x8605,

  // Archaeology
  ARCHAEOLOGY_INFO:    0x8700,
  ARCHAEOLOGY_DIG:     0x8701,
  ARCHAEOLOGY_COLLECTION: 0x8702,
  ARCHAEOLOGY_CLAIM_SET: 0x8703,

  // Cross Server
  CS_ARENA_INFO:       0x8800,
  CS_ARENA_MATCH:      0x8801,
  CS_ARENA_COMPLETE:   0x8802,
  CS_ARENA_RANKING:    0x8803,
  CS_GW_INFO:          0x8804,
  CS_GW_RANKING:       0x8805,
  CS_SEASON_REWARDS:   0x8806,

  // Tutorial
  TUTORIAL_INFO:       0x8900,
  TUTORIAL_STEP:       0x8901,
  TUTORIAL_COMPLETE:   0x8902,
  NPC_DIALOG_NEXT:     0x8903,
  TUTORIAL_SKIP:       0x8904,
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

  // Party / MPD
  PARTY_INFO_RSP:        0x6A10,
  PARTY_INVITE_RSP:      0x6A11,
  MPD_LIST_RSP:          0x6A16,
  MPD_ENTER_RSP:         0x6A17,
  MPD_FIGHT_RSP:         0x6A18,

  // Battleground
  BG_INFO_RSP:           0x6B10,
  BG_JOIN_RSP:           0x6B11,
  BG_ATTACK_RSP:         0x6B12,
  BG_CAPTURE_RSP:        0x6B13,
  BG_RESULTS_RSP:        0x6B14,
  BG_RANKING_RSP:        0x6B15,

  // Clothing
  CLOTHING_LIST_RSP:     0x6C10,
  CLOTHING_UPDATE:       0x6C11,

  // Class Advancement
  ADVANCE_INFO_RSP:      0x6D10,
  ADVANCE_START_RSP:     0x6D11,
  ADVANCE_TRIAL_RSP:     0x6D12,
  ADVANCE_CHOOSE_RSP:    0x6D13,

  // Buff
  BUFF_LIST_RSP:         0x6E10,

  // World Map
  MAP_ENTER_RSP:         0x6F10,
  MAP_MOVE_RSP:          0x6F11,
  MAP_NPC_LIST_RSP:      0x6F12,
  MAP_NPC_DIALOG:        0x6F13,
  MAP_TELEPORT_RSP:      0x6F14,

  // Talent
  TALENT_INFO_RSP:       0x7110,
  TALENT_UPGRADE_RSP:    0x7111,
  HOLY_SEAL_INFO_RSP:    0x7112,
  HOLY_SEAL_UPGRADE_RSP: 0x7113,

  // Rune
  RUNE_INFO_RSP:         0x7210,
  RUNE_UPDATE:           0x7211,

  // Eudaemon
  EUDAEMON_LIST_RSP:     0x7310,
  EUDAEMON_UPDATE:       0x7311,
  PATROL_UPDATE:         0x7316,
  PATROL_LIST_RSP:       0x7318,

  // Honor
  HONOR_INFO_RSP:        0x7410,
  MEDALLION_INFO_RSP:    0x7411,
  MEDALLION_UPDATE:      0x7412,
  PVP_SHOP_LIST_RSP:     0x7414,
  PVP_SHOP_UPDATE:       0x7415,

  // Dragon Soul
  DRAGON_SOUL_LIST_RSP:  0x7510,
  DRAGON_SOUL_UPDATE:    0x7511,

  // Holy Forge
  HOLY_FORGE_INFO_RSP:   0x7610,
  HOLY_FORGE_UPGRADE_RSP:0x7611,
  HOLY_FORGE_ACTIVATE_RSP:0x7612,

  // Guild Extras
  GUILD_ALTAR_INFO_RSP:  0x7710,
  GUILD_ALTAR_SPIN_RSP:  0x7711,
  GUILD_BEAST_INFO_RSP:  0x7712,
  GUILD_BEAST_ATTACK_RSP:0x7713,
  GUILD_SHOP_LIST_RSP:   0x7714,
  GUILD_SHOP_BUY_RSP:    0x7715,
  GUILD_WAR_INFO_RSP:    0x7716,
  GUILD_WAR_ATTACK_RSP:  0x7717,
  GUILD_WAR_RANK_RSP:    0x7718,

  // Spire
  SPIRE_INFO_RSP:        0x7810,
  SPIRE_FIGHT_RSP:       0x7811,
  SPIRE_RESET_RSP:       0x7812,

  // Dimensional War
  DIMWAR_INFO_RSP:       0x7910,
  DIMWAR_ENTER_RSP:      0x7911,
  DIMWAR_FIGHT_RSP:      0x7912,
  DIMWAR_COLLECT_RSP:    0x7913,

  // Circuit Quest
  CIRCUIT_INFO_RSP:      0x7A10,
  CIRCUIT_ACCEPT_RSP:    0x7A11,
  CIRCUIT_COMPLETE_RSP:  0x7A12,
  CIRCUIT_REFRESH_RSP:   0x7A13,

  // Gem
  GEM_LIST_RSP:          0x7B10,
  GEM_COMBINE_RSP:       0x7B11,

  // Resistance
  RESIST_INFO_RSP:       0x7C10,

  // Henna
  HENNA_INFO_RSP:        0x7D10,
  HENNA_APPLY_RSP:       0x7D11,
  HENNA_REMOVE_RSP:      0x7D12,

  // Achievement
  ACHIEVEMENT_LIST_RSP:  0x7E10,
  ACHIEVEMENT_CLAIM_RSP: 0x7E11,

  // Events
  EVENT_LIST_RSP:        0x7F10,
  EVENT_INFO_RSP:        0x7F11,
  HOT_EVENT_CLAIM_RSP:   0x7F12,

  // Gacha
  GACHA_INFO_RSP:        0x8010,
  GACHA_SPIN_RSP:        0x8011,
  GACHA_TEN_SPIN_RSP:    0x8012,

  // Ranking
  RANKING_LIST_RSP:      0x8110,
  RANKING_DETAIL_RSP:    0x8111,

  // Social
  PLAYER_SEARCH_RSP:     0x8210,
  PLAYER_PROFILE_RSP:    0x8211,
  BLOCK_PLAYER_RSP:      0x8212,
  UNBLOCK_PLAYER_RSP:    0x8213,
  BLOCK_LIST_RSP:        0x8214,
  RECENT_CONTACTS_RSP:   0x8215,
  TRADE_REQUEST_RSP:     0x8216,
  TRADE_CONFIRM_RSP:     0x8217,
  TRADE_CANCEL_RSP:      0x8218,

  // Knighthood
  KNIGHTHOOD_INFO_RSP:     0x8310,
  KNIGHTHOOD_UPGRADE_RSP:  0x8311,
  KNIGHTHOOD_SKILL_RSP:    0x8312,
  KNIGHTHOOD_BLESSING_RSP: 0x8313,
  KNIGHTHOOD_HALL_RSP:     0x8314,

  // Jewel Hunt
  JEWEL_HUNT_INFO_RSP:   0x8410,
  JEWEL_HUNT_START_RSP:  0x8411,
  JEWEL_HUNT_MOVE_RSP:   0x8412,
  JEWEL_HUNT_COLLECT_RSP:0x8413,

  // Knighthood
  KNIGHTHOOD_INFO_RSP:   0x8310,
  KNIGHTHOOD_UPGRADE_RSP:0x8311,
  KNIGHTHOOD_SKILL_RSP:  0x8312,
  KNIGHTHOOD_SET_ACTIVE_RSP: 0x8313,

  // Cloud Adventure
  CLOUD_INFO_RSP:        0x8510,
  CLOUD_ENTER_RSP:       0x8511,
  CLOUD_COMPLETE_RSP:    0x8512,
  CLOUD_REWARDS_RSP:     0x8513,

  // Purgatory Maze
  MAZE_INFO_RSP:         0x8610,
  MAZE_ENTER_RSP:        0x8611,
  MAZE_MOVE_RSP:         0x8612,
  MAZE_FIGHT_RSP:        0x8613,
  MAZE_BOSS_RSP:         0x8614,
  MAZE_COMPLETE_RSP:     0x8615,

  // Archaeology
  ARCHAEOLOGY_INFO_RSP:  0x8710,
  ARCHAEOLOGY_DIG_RSP:   0x8711,
  ARCHAEOLOGY_COLLECTION_RSP: 0x8712,
  ARCHAEOLOGY_CLAIM_SET_RSP: 0x8713,

  // Cross Server
  CS_ARENA_INFO_RSP:     0x8810,
  CS_ARENA_MATCH_RSP:    0x8811,
  CS_ARENA_COMPLETE_RSP: 0x8812,
  CS_ARENA_RANKING_RSP:  0x8813,
  CS_GW_INFO_RSP:        0x8814,
  CS_GW_RANKING_RSP:     0x8815,
  CS_SEASON_REWARDS_RSP: 0x8816,

  // Tutorial
  TUTORIAL_INFO_RSP:     0x8910,
  TUTORIAL_STEP_RSP:     0x8911,
  TUTORIAL_COMPLETE_RSP: 0x8912,
  NPC_DIALOG_RSP:        0x8913,
  TUTORIAL_SKIP_RSP:     0x8914,
};

// Reverse lookup: number → name
const NAMES = {};
for (const [k, v] of Object.entries(C)) NAMES[v] = `C:${k}`;
for (const [k, v] of Object.entries(S)) NAMES[v] = `S:${k}`;

function cmdName(id) {
  return NAMES[id] || `0x${id.toString(16).toUpperCase()}`;
}

module.exports = { C, S, cmdName };
