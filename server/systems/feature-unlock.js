'use strict';

const UNLOCKS = [
  { level: 1,  features: ['campaign_worg_lair', 'city_townhall', 'city_barracks', 'city_cottage', 'basic_combat'] },
  { level: 5,  features: ['campaign_baylon', 'city_warehouse', 'city_gold_refinery'] },
  { level: 10, features: ['blacksmith_enchant', 'shop'] },
  { level: 12, features: ['guild'] },
  { level: 13, features: ['arena'] },
  { level: 15, features: ['blacksmith_socket', 'blacksmith_synthesize', 'cloud_city'] },
  { level: 17, features: ['bounty_quests'] },
  { level: 18, features: ['academy'] },
  { level: 19, features: ['blacksmith_refine'] },
  { level: 20, features: ['world_boss', 'mpd_hall_of_heroes', 'afk_mode', 'campaign_murkan'] },
  { level: 23, features: ['forgotten_catacombs'] },
  { level: 25, features: ['astral'] },
  { level: 30, features: ['battleground', 'campaign_fetid_swamp'] },
  { level: 35, features: ['runes', 'circuit_quests', 'soul_engraving'] },
  { level: 40, features: ['clothing', 'sylph_preview', 'campaign_deathly_sands'] },
  { level: 45, features: ['advanced_dungeons'] },
  { level: 50, features: ['sylph', 'talents', 'campaign_erandel'] },
  { level: 55, features: ['sylph_arena', 'dimensional_war'] },
  { level: 60, features: ['sylph_expedition'] },
  { level: 70, features: ['eudaemon', 'campaign_immortal_pass'] },
  { level: 80, features: ['class_advancement', 'knighthood'] },
];

function getUnlockedFeatures(level) {
  const features = new Set();
  for (const u of UNLOCKS) {
    if (level >= u.level) {
      for (const f of u.features) features.add(f);
    }
  }
  return [...features];
}

function getNewUnlocks(oldLevel, newLevel) {
  const unlocked = [];
  for (const u of UNLOCKS) {
    if (oldLevel < u.level && newLevel >= u.level) {
      unlocked.push(...u.features);
    }
  }
  return unlocked;
}

function isFeatureUnlocked(level, feature) {
  for (const u of UNLOCKS) {
    if (level >= u.level && u.features.includes(feature)) return true;
  }
  return false;
}

module.exports = { UNLOCKS, getUnlockedFeatures, getNewUnlocks, isFeatureUnlocked };
