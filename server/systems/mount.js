/**
 * Wartune Ultra — Mount System
 * Mounts provide stat bonuses and visual customization.
 * Upgradeable with Mount Training Whips.
 */

'use strict';

const db = require('../db');

const OPCODES = {
  C_MOUNT_INFO:    0x4268,  // 17000
  S_MOUNT_INFO:    0x10B0,  // 4272
  C_MOUNT_UPGRADE: 0x4269,  // 17001
  S_MOUNT_UPGRADE: 0x10B1,  // 4273
  C_MOUNT_EQUIP:   0x426A,  // 17002
};

const MOUNT_TEMPLATES = [
  { id: 1,  name: 'Brown Horse',     speed: 10, atkBonus: 5,   hpBonus: 50,   rarity: 0, levelReq: 1 },
  { id: 2,  name: 'White Stallion',   speed: 15, atkBonus: 10,  hpBonus: 100,  rarity: 1, levelReq: 10 },
  { id: 3,  name: 'Flaming Steed',    speed: 20, atkBonus: 20,  hpBonus: 200,  rarity: 2, levelReq: 20 },
  { id: 4,  name: 'Shadow Panther',   speed: 25, atkBonus: 30,  hpBonus: 300,  rarity: 2, levelReq: 30 },
  { id: 5,  name: 'Thunder Wolf',     speed: 30, atkBonus: 50,  hpBonus: 500,  rarity: 3, levelReq: 40 },
  { id: 6,  name: 'Golden Dragon',    speed: 40, atkBonus: 80,  hpBonus: 800,  rarity: 4, levelReq: 50 },
  { id: 7,  name: 'Crimson Phoenix',  speed: 50, atkBonus: 100, hpBonus: 1000, rarity: 4, levelReq: 60 },
  { id: 8,  name: 'Celestial Qilin',  speed: 60, atkBonus: 150, hpBonus: 1500, rarity: 5, levelReq: 70 },
];

function initDB() {
  const dbInst = db.getDatabase();
  dbInst.exec(`
    CREATE TABLE IF NOT EXISTS mounts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id     INTEGER NOT NULL REFERENCES characters(id),
      template_id INTEGER NOT NULL,
      level       INTEGER DEFAULT 1,
      exp         INTEGER DEFAULT 0,
      equipped    INTEGER DEFAULT 0,
      created_at  TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_mounts_char ON mounts(char_id);
  `);
}

function getMounts(charId) {
  return db.getDatabase()
    .prepare('SELECT * FROM mounts WHERE char_id = ? ORDER BY equipped DESC, level DESC')
    .all(charId)
    .map(r => {
      const t = MOUNT_TEMPLATES.find(m => m.id === r.template_id) || MOUNT_TEMPLATES[0];
      const mul = 1 + (r.level - 1) * 0.15;
      return {
        id: r.id, templateId: r.template_id, name: t.name,
        level: r.level, exp: r.exp, equipped: r.equipped === 1,
        speed: Math.floor(t.speed * mul),
        atkBonus: Math.floor(t.atkBonus * mul),
        hpBonus: Math.floor(t.hpBonus * mul),
        rarity: t.rarity,
      };
    });
}

function addMount(charId, templateId) {
  const t = MOUNT_TEMPLATES.find(m => m.id === templateId);
  if (!t) return { success: false };

  const result = db.getDatabase()
    .prepare('INSERT INTO mounts (char_id, template_id) VALUES (?, ?)')
    .run(charId, templateId);
  return { success: true, mountId: result.lastInsertRowid };
}

function equipMount(charId, mountId) {
  db.getDatabase().prepare('UPDATE mounts SET equipped = 0 WHERE char_id = ?').run(charId);
  db.getDatabase().prepare('UPDATE mounts SET equipped = 1 WHERE id = ? AND char_id = ?').run(mountId, charId);
  recalcMountStats(charId);
  return { success: true };
}

function upgradeMount(charId, mountId, whipCount = 1) {
  const mount = db.getDatabase()
    .prepare('SELECT * FROM mounts WHERE id = ? AND char_id = ?')
    .get(mountId, charId);
  if (!mount) return { success: false };

  const expPerWhip = 50;
  let newExp = mount.exp + expPerWhip * whipCount;
  let newLevel = mount.level;
  while (newLevel < 30 && newExp >= newLevel * 300) {
    newExp -= newLevel * 300;
    newLevel++;
  }

  db.getDatabase()
    .prepare('UPDATE mounts SET level = ?, exp = ? WHERE id = ?')
    .run(newLevel, newExp, mountId);

  if (mount.equipped) recalcMountStats(charId);
  return { success: true, level: newLevel };
}

function recalcMountStats(charId) {
  const eq = getMounts(charId).find(m => m.equipped);
  db.setPlayerData(charId, 'mount_bonuses', eq ? { attack: eq.atkBonus, hp: eq.hpBonus, speed: eq.speed } : {});
}

function giveStarterMount(charId) {
  return addMount(charId, 1); // Brown Horse
}

module.exports = {
  OPCODES, MOUNT_TEMPLATES,
  initDB,
  getMounts, addMount, equipMount, upgradeMount,
  recalcMountStats, giveStarterMount,
};
