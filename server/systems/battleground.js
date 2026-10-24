'use strict';

const db = require('../db');

const OPCODES = {
  C_BG_INFO:      0x6B00,
  S_BG_INFO:      0x6B10,
  C_BG_JOIN:      0x6B01,
  S_BG_JOIN:      0x6B11,
  C_BG_ATTACK:    0x6B02,
  S_BG_ATTACK:    0x6B12,
  C_BG_CAPTURE:   0x6B03,
  S_BG_CAPTURE:   0x6B13,
  C_BG_RESULTS:   0x6B04,
  S_BG_RESULTS:   0x6B14,
  C_BG_RANKING:   0x6B05,
  S_BG_RANKING:   0x6B15,
};

const DAILY_LIMIT = 3;

const BG_MODES = [
  { id: 1, name: 'Crystal Capture', minLevel: 30, winScore: 1000, crystals: 3,
    description: 'Hold crystals to earn points. First team to 1000 wins.' },
  { id: 2, name: 'Deathmatch', minLevel: 40, winScore: 50, crystals: 0,
    description: 'Eliminate enemies. First team to 50 kills wins.' },
  { id: 3, name: 'Sylph Arena', minLevel: 55, winScore: 500, crystals: 2,
    description: 'Sylph-powered combat. Capture flags for points.' },
];

const REWARD_TABLE = {
  1: { baseInsignia: 30, baseHonor: 200, baseGold: 5000,  baseExp: 3000 },
  2: { baseInsignia: 45, baseHonor: 300, baseGold: 8000,  baseExp: 5000 },
  3: { baseInsignia: 60, baseHonor: 450, baseGold: 12000, baseExp: 8000 },
};

function initDB() {
  db.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS bg_sessions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      mode_id     INTEGER NOT NULL,
      team_light_score INTEGER DEFAULT 0,
      team_shadow_score INTEGER DEFAULT 0,
      status      TEXT DEFAULT 'waiting',
      started_at  TEXT,
      ended_at    TEXT,
      winner_team TEXT
    );
    CREATE TABLE IF NOT EXISTS bg_participants (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      bg_id       INTEGER NOT NULL REFERENCES bg_sessions(id),
      char_id     INTEGER NOT NULL REFERENCES characters(id),
      team        TEXT NOT NULL,
      kills       INTEGER DEFAULT 0,
      deaths      INTEGER DEFAULT 0,
      assists     INTEGER DEFAULT 0,
      captures    INTEGER DEFAULT 0,
      score       INTEGER DEFAULT 0,
      hp_left     INTEGER DEFAULT 0,
      rewarded    INTEGER DEFAULT 0,
      UNIQUE(bg_id, char_id)
    );
    CREATE TABLE IF NOT EXISTS bg_daily (
      char_id     INTEGER NOT NULL REFERENCES characters(id),
      date        TEXT NOT NULL,
      runs        INTEGER DEFAULT 0,
      PRIMARY KEY(char_id, date)
    );
  `);
}

function getDailyRuns(charId) {
  const today = new Date().toISOString().slice(0, 10);
  db.getDatabase().prepare('INSERT OR IGNORE INTO bg_daily (char_id, date, runs) VALUES (?, ?, 0)').run(charId, today);
  const row = db.getDatabase().prepare('SELECT runs FROM bg_daily WHERE char_id = ? AND date = ?').get(charId, today);
  return row ? row.runs : 0;
}

function incrementDailyRuns(charId) {
  const today = new Date().toISOString().slice(0, 10);
  db.getDatabase().prepare('INSERT INTO bg_daily (char_id, date, runs) VALUES (?, ?, 1) ON CONFLICT(char_id, date) DO UPDATE SET runs = runs + 1').run(charId, today);
}

function getActiveSession(charId) {
  return db.getDatabase().prepare(`
    SELECT s.*, p.team, p.kills, p.deaths, p.assists, p.captures, p.score, p.hp_left
    FROM bg_participants p
    JOIN bg_sessions s ON p.bg_id = s.id
    WHERE p.char_id = ? AND s.status IN ('waiting', 'active')
    ORDER BY s.id DESC LIMIT 1
  `).get(charId);
}

function findOrCreateSession(modeId) {
  // Try to find a waiting session with room
  const waiting = db.getDatabase().prepare(`
    SELECT s.id, COUNT(p.id) as player_count
    FROM bg_sessions s
    LEFT JOIN bg_participants p ON p.bg_id = s.id
    WHERE s.mode_id = ? AND s.status = 'waiting'
    GROUP BY s.id
    HAVING player_count < 40
    ORDER BY s.id DESC LIMIT 1
  `).get(modeId);

  if (waiting) return waiting.id;

  const result = db.getDatabase().prepare(`
    INSERT INTO bg_sessions (mode_id, status) VALUES (?, 'waiting')
  `).run(modeId);
  return result.lastInsertRowid;
}

function assignTeam(bgId) {
  const lightCount = db.getDatabase().prepare(
    "SELECT COUNT(*) as c FROM bg_participants WHERE bg_id = ? AND team = 'light'"
  ).get(bgId).c;
  const shadowCount = db.getDatabase().prepare(
    "SELECT COUNT(*) as c FROM bg_participants WHERE bg_id = ? AND team = 'shadow'"
  ).get(bgId).c;
  return lightCount <= shadowCount ? 'light' : 'shadow';
}

function joinBattleground(charId, modeId) {
  const char = db.getCharacterById(charId);
  if (!char) return { success: false, msg: 'Character not found' };

  const mode = BG_MODES.find(m => m.id === modeId);
  if (!mode) return { success: false, msg: 'Invalid mode' };
  if (char.grade < mode.minLevel) return { success: false, msg: `Level ${mode.minLevel} required` };

  const runs = getDailyRuns(charId);
  if (runs >= DAILY_LIMIT) return { success: false, msg: 'Daily limit reached (3/3)' };

  const existing = getActiveSession(charId);
  if (existing) return { success: false, msg: 'Already in a battleground' };

  const bgId = findOrCreateSession(modeId);
  const team = assignTeam(bgId);

  db.getDatabase().prepare(`
    INSERT INTO bg_participants (bg_id, char_id, team, hp_left) VALUES (?, ?, ?, ?)
  `).run(bgId, charId, team, char.max_hp || char.hp);

  // Check if we have enough players to start (at least 2 per team)
  const lightCount = db.getDatabase().prepare(
    "SELECT COUNT(*) as c FROM bg_participants WHERE bg_id = ? AND team = 'light'"
  ).get(bgId).c;
  const shadowCount = db.getDatabase().prepare(
    "SELECT COUNT(*) as c FROM bg_participants WHERE bg_id = ? AND team = 'shadow'"
  ).get(bgId).c;

  if (lightCount >= 2 && shadowCount >= 2) {
    db.getDatabase().prepare("UPDATE bg_sessions SET status = 'active', started_at = datetime('now') WHERE id = ? AND status = 'waiting'").run(bgId);
  }

  incrementDailyRuns(charId);

  const session = db.getDatabase().prepare('SELECT * FROM bg_sessions WHERE id = ?').get(bgId);

  return {
    success: true,
    bgId,
    team,
    mode: mode.name,
    status: session.status,
    lightCount,
    shadowCount,
  };
}

function attackPlayer(charId, targetId) {
  if (charId === targetId) return { success: false, msg: 'Cannot attack yourself' };

  const mySession = getActiveSession(charId);
  if (!mySession || mySession.status !== 'active') return { success: false, msg: 'Not in active battleground' };

  const targetParticipant = db.getDatabase().prepare(`
    SELECT p.*, c.nick_name, c.attack, c.defence, c.hp, c.max_hp, c.grade
    FROM bg_participants p JOIN characters c ON p.char_id = c.id
    WHERE p.bg_id = ? AND p.char_id = ?
  `).get(mySession.id, targetId);

  if (!targetParticipant) return { success: false, msg: 'Target not in this battleground' };
  if (targetParticipant.team === mySession.team) return { success: false, msg: 'Cannot attack teammate' };
  if (targetParticipant.hp_left <= 0) return { success: false, msg: 'Target already defeated' };
  if (mySession.hp_left <= 0) return { success: false, msg: 'You are defeated, wait for respawn' };

  const char = db.getCharacterById(charId);
  if (!char) return { success: false };

  // PvP damage: attacker_atk^2 / (attacker_atk + target_def) with variance
  const baseDmg = Math.max(1, Math.floor(char.attack * char.attack / (char.attack + targetParticipant.defence)));
  const variance = 0.85 + Math.random() * 0.3;
  const crit = Math.random() < 0.12;
  const damage = Math.floor(baseDmg * variance * (crit ? 1.8 : 1.0));

  // Counter-attack
  const counterBase = Math.max(1, Math.floor(targetParticipant.attack * targetParticipant.attack / (targetParticipant.attack + char.defence)));
  const counterVariance = 0.85 + Math.random() * 0.3;
  const counterDmg = Math.floor(counterBase * counterVariance * 0.5);

  const newTargetHp = Math.max(0, targetParticipant.hp_left - damage);
  const newMyHp = Math.max(0, mySession.hp_left - counterDmg);

  db.getDatabase().prepare('UPDATE bg_participants SET hp_left = ? WHERE bg_id = ? AND char_id = ?').run(newTargetHp, mySession.id, targetId);
  db.getDatabase().prepare('UPDATE bg_participants SET hp_left = ? WHERE bg_id = ? AND char_id = ?').run(newMyHp, mySession.id, charId);

  const targetKilled = newTargetHp <= 0;
  const selfKilled = newMyHp <= 0;

  if (targetKilled) {
    db.getDatabase().prepare('UPDATE bg_participants SET kills = kills + 1, score = score + 10 WHERE bg_id = ? AND char_id = ?').run(mySession.id, charId);
    db.getDatabase().prepare('UPDATE bg_participants SET deaths = deaths + 1 WHERE bg_id = ? AND char_id = ?').run(mySession.id, targetId);

    // Update team score for deathmatch mode
    const mode = BG_MODES.find(m => m.id === mySession.mode_id);
    if (mode && mode.id === 2) {
      const teamCol = mySession.team === 'light' ? 'team_light_score' : 'team_shadow_score';
      db.getDatabase().prepare(`UPDATE bg_sessions SET ${teamCol} = ${teamCol} + 1 WHERE id = ?`).run(mySession.id);
    }

    // Respawn target after 10 seconds (simulated: restore HP to 70%)
    const respawnHp = Math.floor((targetParticipant.max_hp || targetParticipant.hp) * 0.7);
    db.getDatabase().prepare('UPDATE bg_participants SET hp_left = ? WHERE bg_id = ? AND char_id = ?').run(respawnHp, mySession.id, targetId);
  }

  if (selfKilled) {
    db.getDatabase().prepare('UPDATE bg_participants SET deaths = deaths + 1 WHERE bg_id = ? AND char_id = ?').run(mySession.id, charId);
    const myChar = db.getCharacterById(charId);
    const respawnHp = Math.floor((myChar.max_hp || myChar.hp) * 0.7);
    db.getDatabase().prepare('UPDATE bg_participants SET hp_left = ? WHERE bg_id = ? AND char_id = ?').run(respawnHp, mySession.id, charId);
  }

  // Check win condition
  checkWinCondition(mySession.id);

  return {
    success: true,
    damage,
    crit,
    counterDmg,
    targetName: targetParticipant.nick_name,
    targetHpLeft: newTargetHp,
    myHpLeft: newMyHp,
    targetKilled,
    selfKilled,
  };
}

function capturePoint(charId, pointId) {
  const session = getActiveSession(charId);
  if (!session || session.status !== 'active') return { success: false, msg: 'Not in active battleground' };

  const mode = BG_MODES.find(m => m.id === session.mode_id);
  if (!mode || mode.crystals === 0) return { success: false, msg: 'No capture points in this mode' };
  if (pointId < 1 || pointId > mode.crystals) return { success: false, msg: 'Invalid capture point' };
  if (session.hp_left <= 0) return { success: false, msg: 'You are defeated' };

  db.getDatabase().prepare('UPDATE bg_participants SET captures = captures + 1, score = score + 25 WHERE bg_id = ? AND char_id = ?').run(session.id, charId);

  const teamCol = session.team === 'light' ? 'team_light_score' : 'team_shadow_score';
  const pointValue = mode.id === 3 ? 50 : 30;
  db.getDatabase().prepare(`UPDATE bg_sessions SET ${teamCol} = ${teamCol} + ? WHERE id = ?`).run(pointValue, session.id);

  checkWinCondition(session.id);

  const updated = db.getDatabase().prepare('SELECT * FROM bg_sessions WHERE id = ?').get(session.id);

  return {
    success: true,
    pointId,
    team: session.team,
    lightScore: updated.team_light_score,
    shadowScore: updated.team_shadow_score,
  };
}

function checkWinCondition(bgId) {
  const session = db.getDatabase().prepare('SELECT * FROM bg_sessions WHERE id = ?').get(bgId);
  if (!session || session.status !== 'active') return;

  const mode = BG_MODES.find(m => m.id === session.mode_id);
  if (!mode) return;

  let winner = null;
  if (session.team_light_score >= mode.winScore) winner = 'light';
  else if (session.team_shadow_score >= mode.winScore) winner = 'shadow';

  if (winner) {
    db.getDatabase().prepare("UPDATE bg_sessions SET status = 'ended', winner_team = ?, ended_at = datetime('now') WHERE id = ?").run(winner, bgId);
    distributeRewards(bgId);
  }
}

function distributeRewards(bgId) {
  const session = db.getDatabase().prepare('SELECT * FROM bg_sessions WHERE id = ?').get(bgId);
  if (!session) return;

  const rewards = REWARD_TABLE[session.mode_id] || REWARD_TABLE[1];
  const participants = db.getDatabase().prepare('SELECT * FROM bg_participants WHERE bg_id = ?').all(bgId);

  for (const p of participants) {
    if (p.rewarded) continue;

    const isWinner = p.team === session.winner_team;
    const teamMul = isWinner ? 2.0 : 1.0;
    const scoreMul = 1 + (p.score / 100);

    const insignia = Math.floor(rewards.baseInsignia * teamMul * scoreMul);
    const honor = Math.floor(rewards.baseHonor * teamMul * scoreMul);
    const gold = Math.floor(rewards.baseGold * teamMul * scoreMul);
    const exp = Math.floor(rewards.baseExp * teamMul * scoreMul);

    db.getDatabase().prepare('UPDATE characters SET gold = gold + ?, exp = exp + ?, repute = repute + ? WHERE id = ?')
      .run(gold, exp, honor, p.char_id);

    db.getDatabase().prepare('UPDATE bg_participants SET rewarded = 1 WHERE bg_id = ? AND char_id = ?').run(bgId, p.char_id);
  }
}

function getBGInfo(charId) {
  const runs = getDailyRuns(charId);
  const active = getActiveSession(charId);

  if (active && (active.status === 'waiting' || active.status === 'active')) {
    const participants = db.getDatabase().prepare(`
      SELECT p.char_id, p.team, p.kills, p.deaths, p.captures, p.score, p.hp_left,
             c.nick_name, c.grade
      FROM bg_participants p JOIN characters c ON p.char_id = c.id
      WHERE p.bg_id = ?
    `).all(active.id);

    const mode = BG_MODES.find(m => m.id === active.mode_id);

    return {
      inBattle: true,
      bgId: active.id,
      mode: mode ? mode.name : 'Unknown',
      modeId: active.mode_id,
      status: active.status,
      myTeam: active.team,
      myKills: active.kills,
      myDeaths: active.deaths,
      myCaptures: active.captures,
      myScore: active.score,
      myHpLeft: active.hp_left,
      lightScore: active.team_light_score,
      shadowScore: active.team_shadow_score,
      participants: participants.map(p => ({
        charId: p.char_id,
        name: p.nick_name,
        level: p.grade,
        team: p.team,
        kills: p.kills,
        deaths: p.deaths,
        score: p.score,
        hpLeft: p.hp_left,
      })),
      dailyRuns: runs,
      maxDailyRuns: DAILY_LIMIT,
    };
  }

  return {
    inBattle: false,
    modes: BG_MODES.map(m => ({ id: m.id, name: m.name, minLevel: m.minLevel, description: m.description })),
    dailyRuns: runs,
    maxDailyRuns: DAILY_LIMIT,
  };
}

function getBGResults(charId) {
  const last = db.getDatabase().prepare(`
    SELECT s.*, p.team, p.kills, p.deaths, p.assists, p.captures, p.score
    FROM bg_participants p
    JOIN bg_sessions s ON p.bg_id = s.id
    WHERE p.char_id = ? AND s.status = 'ended'
    ORDER BY s.id DESC LIMIT 1
  `).get(charId);

  if (!last) return { hasResults: false };

  const mode = BG_MODES.find(m => m.id === last.mode_id);
  const isWinner = last.team === last.winner_team;
  const rewards = REWARD_TABLE[last.mode_id] || REWARD_TABLE[1];
  const scoreMul = 1 + (last.score / 100);
  const teamMul = isWinner ? 2.0 : 1.0;

  return {
    hasResults: true,
    mode: mode ? mode.name : 'Unknown',
    won: isWinner,
    team: last.team,
    winnerTeam: last.winner_team,
    lightScore: last.team_light_score,
    shadowScore: last.team_shadow_score,
    kills: last.kills,
    deaths: last.deaths,
    assists: last.assists,
    captures: last.captures,
    score: last.score,
    rewards: {
      insignia: Math.floor(rewards.baseInsignia * teamMul * scoreMul),
      honor: Math.floor(rewards.baseHonor * teamMul * scoreMul),
      gold: Math.floor(rewards.baseGold * teamMul * scoreMul),
      exp: Math.floor(rewards.baseExp * teamMul * scoreMul),
    },
  };
}

function getBGRanking(charId) {
  const rows = db.getDatabase().prepare(`
    SELECT p.char_id, c.nick_name, c.grade,
           SUM(p.kills) as total_kills, SUM(p.deaths) as total_deaths,
           SUM(p.captures) as total_captures, SUM(p.score) as total_score,
           COUNT(DISTINCT p.bg_id) as matches
    FROM bg_participants p
    JOIN characters c ON p.char_id = c.id
    GROUP BY p.char_id
    ORDER BY total_score DESC
    LIMIT 50
  `).all();

  return {
    ranking: rows.map((r, i) => ({
      rank: i + 1,
      charId: r.char_id,
      name: r.nick_name,
      level: r.grade,
      kills: r.total_kills,
      deaths: r.total_deaths,
      captures: r.total_captures,
      score: r.total_score,
      matches: r.matches,
    })),
  };
}

module.exports = {
  OPCODES, BG_MODES, DAILY_LIMIT,
  initDB,
  joinBattleground, attackPlayer, capturePoint,
  getBGInfo, getBGResults, getBGRanking,
};
