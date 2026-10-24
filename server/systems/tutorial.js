'use strict';

const db = require('../db');

const OPCODES = {
  C_TUTORIAL_INFO:      0x8900,
  S_TUTORIAL_INFO:      0x8910,
  C_TUTORIAL_STEP:      0x8901,
  S_TUTORIAL_STEP:      0x8911,
  C_TUTORIAL_COMPLETE:  0x8902,
  S_TUTORIAL_COMPLETE:  0x8912,
  C_NPC_DIALOG_NEXT:    0x8903,
  S_NPC_DIALOG:         0x8913,
  C_TUTORIAL_SKIP:      0x8904,
  S_TUTORIAL_SKIP:      0x8914,
  S_SPAWN_MONSTERS:     0x8915,
  S_QUEST_TRACKER:      0x8916,
  S_UI_GUIDE:           0x8917,
  S_INTRO_CUTSCENE:     0x8918,
};

// Starting map — Lane's Road (the first area in Wartune Ultra)
const STARTING_MAP = {
  id: 'lanes_road',
  name: "Lane's Road",
  bgAsset: 'map_lanes_road',
  spawnX: 640,
  spawnY: 500,
};

// Tutorial NPC — the guide character that greets the player
const TUTORIAL_NPC = {
  id: 'freya',
  name: 'Freya',
  portrait: 'npc_freya',
  x: 600,
  y: 420,
};

// Monsters on the starting map
const STARTING_MONSTERS = [
  { id: 'hunter_1', templateId: 'hunter', name: 'Avcı', level: 1, hp: 150, attack: 20, defence: 5, x: 950, y: 280, respawnSec: 30 },
  { id: 'hunter_2', templateId: 'hunter', name: 'Avcı', level: 1, hp: 150, attack: 20, defence: 5, x: 1100, y: 180, respawnSec: 30 },
  { id: 'hunter_3', templateId: 'hunter', name: 'Avcı', level: 2, hp: 200, attack: 25, defence: 8, x: 1250, y: 350, respawnSec: 30 },
  { id: 'hunter_4', templateId: 'hunter', name: 'Avcı', level: 2, hp: 200, attack: 25, defence: 8, x: 800,  y: 150, respawnSec: 30 },
];

// Tutorial steps — the guided experience from character creation to first quest
const TUTORIAL_STEPS = [
  // Step 0: Intro cutscene + NPC dialog
  {
    id: 0,
    type: 'npc_dialog',
    npcId: 'freya',
    dialogChain: [
      "Burası Lane'in Yolu. Son zamanlarda bu bölgeden geçen çok sayıda kervan saldırıya uğradı.",
      "Olayın gerçeğini öğrenmek için bunu araştırmalıyız!",
      "Önce bu bölgedeki düşmanları temizlememiz gerekiyor. Savunma hattını geç!",
    ],
    autoQuest: { id: 1, name: '[Ana]Savunma Hattını Geç', objective: 'Düşmanları Geç', target: 'hunter', count: 1 },
  },
  // Step 1: Kill first monster
  {
    id: 1,
    type: 'combat',
    objective: 'kill_monster',
    target: 'hunter',
    count: 1,
    uiGuide: { element: 'monster_hunter_1', text: 'Düşmana tıklayarak savaşa başla!', arrow: 'right' },
    onComplete: {
      dialog: ['İyi iş! İlk düşmanı yendin. Şimdi daha güçlü olmalısın.'],
      rewards: { exp: 100, gold: 200 },
    },
  },
  // Step 2: Open bag / check inventory
  {
    id: 2,
    type: 'ui_action',
    action: 'open_bag',
    uiGuide: { element: 'btn_bag', text: 'Çantanı aç ve eşyalarını kontrol et!', arrow: 'down' },
    onComplete: {
      dialog: ['Çantan her türlü eşyayı saklar. Savaşta kazandığın ödülleri burada bulabilirsin.'],
      rewards: { exp: 50 },
    },
  },
  // Step 3: Equip weapon
  {
    id: 3,
    type: 'ui_action',
    action: 'equip_item',
    uiGuide: { element: 'btn_equip', text: 'Silahını kuşan!', arrow: 'left' },
    onComplete: {
      dialog: ['Silahın savaş gücünü artırır. Daha güçlü ekipmanlar buldukça güçleneceksin.'],
      rewards: { exp: 50, gold: 100 },
    },
  },
  // Step 4: Kill more enemies to pass defense line
  {
    id: 4,
    type: 'combat',
    objective: 'kill_monster',
    target: 'hunter',
    count: 3,
    uiGuide: { element: 'quest_tracker', text: 'Görevi tamamlamak için 3 düşman daha yen!', arrow: 'left' },
    onComplete: {
      dialog: [
        'Harika! Savunma hattını geçtin!',
        "Şimdi Cloud City'ye dönelim. Orada seni bekleyen görevler var.",
      ],
      rewards: { exp: 300, gold: 500 },
      unlockMap: 'city',
    },
  },
  // Step 5: Enter Cloud City
  {
    id: 5,
    type: 'travel',
    destination: 'city',
    uiGuide: { element: 'btn_world_map', text: "Dünya haritasını aç ve Cloud City'ye git!", arrow: 'up' },
    onComplete: {
      dialog: [
        "Cloud City'ye hoş geldin! Burası senin ana üssün.",
        'Sol üstteki ikonlardan farklı sistemlere erişebilirsin.',
        'Görevleri takip ederek güçlenmeye devam et!',
      ],
      rewards: { exp: 200, gold: 300 },
      tutorialComplete: true,
    },
  },
  // Step 6: Talk to Commander Berdim
  {
    id: 6,
    type: 'npc_dialog',
    npcId: 'berdim',
    dialogChain: [
      "Hoş geldin kahraman! Cloud City'nin savunması senin gibi savaşçılara bağlı.",
      'Seni eğiteceğim. Önce becerilerini öğrenmelisin.',
      'Sol menüdeki Beceri butonuna tıkla ve ilk becerinizi öğren!',
    ],
    uiGuide: { element: 'btn_skills', text: 'Beceri panelini aç!', arrow: 'down' },
  },
  // Step 7: Learn first skill
  {
    id: 7,
    type: 'ui_action',
    action: 'learn_skill',
    uiGuide: { element: 'skill_panel', text: 'Bir beceri öğren!', arrow: 'right' },
    onComplete: {
      dialog: ['Mükemmel! İlk becerinizi öğrendiniz. Savaşta bu beceriyi kullanabilirsiniz.'],
      rewards: { exp: 150, gold: 200 },
    },
  },
  // Step 8: First campaign stage
  {
    id: 8,
    type: 'campaign',
    action: 'complete_campaign_stage',
    stage: 1,
    uiGuide: { element: 'btn_campaign', text: 'Sefere çık! İlk bölümü tamamla.', arrow: 'right' },
    onComplete: {
      dialog: ['İlk sefer bölümünü tamamladın! Sefer bölümleri seni güçlendirecek harika ödüller verir.'],
      rewards: { exp: 200, gold: 300 },
      fullTutorialComplete: true,
    },
  },
];

// UI guide icons that appear during tutorial (the icons visible in the screenshot)
const UI_ICONS = [
  { id: 'btn_quest',      icon: 'icon_quest',      name: 'Görevler',     unlockStep: 0, position: 'left_panel', order: 1 },
  { id: 'btn_bag',        icon: 'icon_bag',         name: 'Çanta',        unlockStep: 2, position: 'left_panel', order: 2 },
  { id: 'btn_equip',      icon: 'icon_equip',       name: 'Ekipman',      unlockStep: 3, position: 'left_panel', order: 3 },
  { id: 'btn_skills',     icon: 'icon_skills',      name: 'Beceriler',    unlockStep: 6, position: 'left_panel', order: 4 },
  { id: 'btn_campaign',   icon: 'icon_campaign',    name: 'Sefer',        unlockStep: 8, position: 'bottom_bar', order: 1 },
  { id: 'btn_world_map',  icon: 'icon_world_map',   name: 'Dünya Haritası', unlockStep: 5, position: 'top_bar', order: 1 },
  { id: 'btn_avatar',     icon: 'icon_avatar',      name: 'Karakter',     unlockStep: 0, position: 'top_left', order: 1 },
  { id: 'btn_chat',       icon: 'icon_chat',        name: 'Sohbet',       unlockStep: 4, position: 'bottom_bar', order: 2 },
];

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS tutorial_progress (
      char_id       INTEGER PRIMARY KEY REFERENCES characters(id),
      current_step  INTEGER DEFAULT 0,
      completed     INTEGER DEFAULT 0,
      skipped       INTEGER DEFAULT 0,
      kills_count   INTEGER DEFAULT 0,
      dialog_index  INTEGER DEFAULT 0,
      created_at    TEXT DEFAULT (datetime('now'))
    );
  `);
}

function ensureEntry(charId) {
  db.getDatabase().prepare('INSERT OR IGNORE INTO tutorial_progress (char_id) VALUES (?)').run(charId);
}

function getTutorialInfo(charId) {
  ensureEntry(charId);
  const progress = db.getDatabase().prepare('SELECT * FROM tutorial_progress WHERE char_id = ?').get(charId);

  if (progress.completed || progress.skipped) {
    return { success: true, completed: true, skipped: !!progress.skipped };
  }

  const step = TUTORIAL_STEPS[progress.current_step];
  if (!step) {
    return { success: true, completed: true };
  }

  return {
    success: true,
    completed: false,
    currentStep: progress.current_step,
    totalSteps: TUTORIAL_STEPS.length,
    step: {
      id: step.id,
      type: step.type,
      uiGuide: step.uiGuide || null,
      objective: step.objective || step.action || null,
      target: step.target || null,
      count: step.count || 1,
      dialogChain: step.dialogChain || null,
      npcId: step.npcId || null,
    },
    killsCount: progress.kills_count,
    dialogIndex: progress.dialog_index,
  };
}

function onFirstLogin(charId) {
  ensureEntry(charId);
  const progress = db.getDatabase().prepare('SELECT * FROM tutorial_progress WHERE char_id = ?').get(charId);
  if (progress.completed || progress.skipped) return null;

  const step = TUTORIAL_STEPS[0];
  return {
    type: 'intro',
    startingMap: STARTING_MAP,
    tutorialNpc: TUTORIAL_NPC,
    monsters: STARTING_MONSTERS,
    introCutscene: {
      npcId: TUTORIAL_NPC.id,
      npcName: TUTORIAL_NPC.name,
      npcPortrait: TUTORIAL_NPC.portrait,
      dialogChain: step.dialogChain,
      autoQuest: step.autoQuest,
    },
    uiIcons: UI_ICONS.filter(i => i.unlockStep <= 0),
    questTracker: step.autoQuest ? {
      questName: step.autoQuest.name,
      objective: step.autoQuest.objective,
      progress: 0,
      total: step.autoQuest.count,
    } : null,
  };
}

function advanceDialog(charId) {
  ensureEntry(charId);
  const progress = db.getDatabase().prepare('SELECT * FROM tutorial_progress WHERE char_id = ?').get(charId);
  if (progress.completed || progress.skipped) return { success: false, msg: 'Tutorial already done' };

  const step = TUTORIAL_STEPS[progress.current_step];
  if (!step || !step.dialogChain) return { success: false };

  const nextIdx = progress.dialog_index + 1;
  if (nextIdx >= step.dialogChain.length) {
    db.getDatabase().prepare('UPDATE tutorial_progress SET dialog_index = 0 WHERE char_id = ?').run(charId);
    if (step.type === 'npc_dialog' && !step.objective) {
      return advanceStep(charId);
    }
    return {
      success: true,
      dialogComplete: true,
      nextAction: step.uiGuide || null,
    };
  }

  db.getDatabase().prepare('UPDATE tutorial_progress SET dialog_index = ? WHERE char_id = ?').run(nextIdx, charId);
  return {
    success: true,
    dialogComplete: false,
    dialogIndex: nextIdx,
    text: step.dialogChain[nextIdx],
    npcId: step.npcId || TUTORIAL_NPC.id,
  };
}

function onAction(charId, actionType, actionTarget) {
  ensureEntry(charId);
  const progress = db.getDatabase().prepare('SELECT * FROM tutorial_progress WHERE char_id = ?').get(charId);
  if (progress.completed || progress.skipped) return null;

  const step = TUTORIAL_STEPS[progress.current_step];
  if (!step) return null;

  if (step.type === 'combat' && actionType === 'kill_monster') {
    if (step.target && actionTarget !== step.target) return null;
    const newKills = progress.kills_count + 1;
    db.getDatabase().prepare('UPDATE tutorial_progress SET kills_count = ? WHERE char_id = ?').run(newKills, charId);

    if (newKills >= (step.count || 1)) {
      return advanceStep(charId);
    }
    return {
      type: 'progress',
      current: newKills,
      required: step.count || 1,
      questTracker: {
        objective: step.objective || 'kill_monster',
        progress: newKills,
        total: step.count || 1,
      },
    };
  }

  if (step.type === 'ui_action' && actionType === step.action) {
    return advanceStep(charId);
  }

  if (step.type === 'travel' && actionType === 'enter_map' && actionTarget === step.destination) {
    return advanceStep(charId);
  }

  if (step.type === 'campaign' && actionType === 'complete_campaign_stage') {
    return advanceStep(charId);
  }

  return null;
}

function advanceStep(charId) {
  const progress = db.getDatabase().prepare('SELECT * FROM tutorial_progress WHERE char_id = ?').get(charId);
  const currentStep = TUTORIAL_STEPS[progress.current_step];

  const result = {
    type: 'step_complete',
    stepId: progress.current_step,
    rewards: currentStep?.onComplete?.rewards || null,
    dialog: currentStep?.onComplete?.dialog || null,
  };

  // Grant rewards
  if (currentStep?.onComplete?.rewards) {
    const r = currentStep.onComplete.rewards;
    const char = db.getCharacterById(charId);
    if (char) {
      const updates = {};
      if (r.exp) updates.exp = (char.exp || 0) + r.exp;
      if (r.gold) updates.gold = (char.gold || 0) + r.gold;
      db.updateCharacter(charId, updates);
    }
  }

  const nextStepIdx = progress.current_step + 1;

  if (nextStepIdx >= TUTORIAL_STEPS.length || currentStep?.onComplete?.fullTutorialComplete) {
    db.getDatabase().prepare('UPDATE tutorial_progress SET current_step = ?, completed = 1, kills_count = 0, dialog_index = 0 WHERE char_id = ?')
      .run(nextStepIdx, charId);
    result.tutorialComplete = true;
    result.unlockedIcons = UI_ICONS;
    return result;
  }

  db.getDatabase().prepare('UPDATE tutorial_progress SET current_step = ?, kills_count = 0, dialog_index = 0 WHERE char_id = ?')
    .run(nextStepIdx, charId);

  const nextStep = TUTORIAL_STEPS[nextStepIdx];
  result.nextStep = {
    id: nextStep.id,
    type: nextStep.type,
    uiGuide: nextStep.uiGuide || null,
    dialogChain: nextStep.dialogChain || null,
    npcId: nextStep.npcId || null,
  };
  result.newIcons = UI_ICONS.filter(i => i.unlockStep === nextStepIdx);

  if (currentStep?.onComplete?.unlockMap) {
    result.unlockMap = currentStep.onComplete.unlockMap;
  }

  return result;
}

function skipTutorial(charId) {
  ensureEntry(charId);
  db.getDatabase().prepare('UPDATE tutorial_progress SET skipped = 1, completed = 1 WHERE char_id = ?').run(charId);

  // Grant all tutorial rewards
  let totalExp = 0, totalGold = 0;
  for (const step of TUTORIAL_STEPS) {
    if (step.onComplete?.rewards) {
      totalExp += step.onComplete.rewards.exp || 0;
      totalGold += step.onComplete.rewards.gold || 0;
    }
  }
  const char = db.getCharacterById(charId);
  if (char) {
    db.updateCharacter(charId, {
      exp: (char.exp || 0) + totalExp,
      gold: (char.gold || 0) + totalGold,
    });
  }

  return {
    success: true,
    skipped: true,
    rewardsGranted: { exp: totalExp, gold: totalGold },
    unlockedIcons: UI_ICONS,
    teleportTo: 'city',
  };
}

function isTutorialComplete(charId) {
  ensureEntry(charId);
  const progress = db.getDatabase().prepare('SELECT completed, skipped FROM tutorial_progress WHERE char_id = ?').get(charId);
  return !!(progress.completed || progress.skipped);
}

module.exports = {
  OPCODES,
  STARTING_MAP, TUTORIAL_NPC, STARTING_MONSTERS, TUTORIAL_STEPS, UI_ICONS,
  initDB,
  getTutorialInfo, onFirstLogin, advanceDialog, onAction,
  skipTutorial, isTutorialComplete,
};
