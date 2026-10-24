/**
 * Wartune Ultra — WebSocket Packet Handlers
 * Processes decoded packets and sends responses.
 */

'use strict';

const { C, S, cmdName } = require('./opcodes');
const { buildPacket } = require('./packet');
const { encode, decode } = require('./proto');
const db = require('./db');
const crypto = require('crypto');

/**
 * Per-connection state stored on the ws object:
 *   ws.session = { accountId, username, loginKey, charId, site, gateKey }
 */

function randomKey() {
  return crypto.randomBytes(8).toString('hex');
}

function sendPacket(ws, cmdId, body = null, clientId = 0) {
  if (ws.readyState !== 1) return; // OPEN
  const pkt = buildPacket(cmdId, body, clientId);
  ws.send(pkt);
}

/**
 * Route a decoded packet to the appropriate handler.
 */
function handlePacket(ws, pkt, serverConfig) {
  const { cmdId, body } = pkt;
  const handler = HANDLERS[cmdId];

  if (handler) {
    console.log(`[WS] ← ${cmdName(cmdId)} from ${ws.session?.username || '?'}`);
    handler(ws, body, pkt, serverConfig);
  } else {
    console.log(`[WS] ← UNHANDLED ${cmdName(cmdId)} (0x${cmdId.toString(16)})`);
    // Silently ignore unknown commands for now
  }
}

// ═══════════════════════════════════════════
// Handler Map
// ═══════════════════════════════════════════
const HANDLERS = {};

// ─── L_CREATE_LOGIN (0x7006) ─────────────
// Client sends username/key/site to authenticate over WS
HANDLERS[C.L_CREATE_LOGIN] = (ws, body, pkt, cfg) => {
  let req;
  try {
    req = decode('com.road.yishi.proto.login.createLoginReq', body);
  } catch (e) {
    console.error('[WS] Failed to decode createLoginReq:', e.message);
    return;
  }

  const { userName, site } = req;
  const account = db.getAccount(userName);

  let result = 0; // 0=ok
  if (!account) {
    result = -1; // account not found
  } else if (account.banned === 1) {
    result = 3; // banned
  }

  if (result === 0) {
    ws.session = ws.session || {};
    ws.session.accountId = account.id;
    ws.session.username = userName;
    ws.session.site = site || 's1';
    db.updateLastLogin(account.id);
  }

  const rspBody = encode('com.road.yishi.proto.login.createLoginRsp', {
    userName,
    site: site || 's1',
    result,
  });
  sendPacket(ws, S.U_L_CREATE_LOGIN_RSP, rspBody);
};

// ─── L_GET_PLAYER_LIST (0x7000) ──────────
HANDLERS[C.L_GET_PLAYER_LIST] = (ws, body) => {
  let req;
  try {
    req = decode('com.road.yishi.proto.login.GetPlayerListReq', body);
  } catch (e) {
    console.error('[WS] Failed to decode GetPlayerListReq:', e.message);
    return;
  }

  const { userName, site } = req;
  const account = db.getAccount(userName);

  if (!account) {
    const rsp = encode('com.road.yishi.proto.login.GetPlayerListRsp', {
      infoList: [],
      userName,
      site: site || 's1',
      loginState: -1,
    });
    sendPacket(ws, S.U_L_GET_PLAYER_LIST, rsp);
    return;
  }

  const chars = db.getCharactersByAccount(account.id);
  const infoList = chars.map(c => ({
    userId: c.id,
    userName: account.username,
    nickName: c.nick_name,
    grade: c.grade,
    repute: c.repute,
    sex: c.sex,
    rename: 0,
    active: c.active === 1,
    site: c.site || 's1',
    isOnline: c.is_online === 1,
  }));

  const rsp = encode('com.road.yishi.proto.login.GetPlayerListRsp', {
    infoList,
    userName,
    site: site || 's1',
    loginState: 0,
  });
  sendPacket(ws, S.U_L_GET_PLAYER_LIST, rsp);
};

// ─── L_REGISTER_ROLE (0x7004) ────────────
HANDLERS[C.L_REGISTER_ROLE] = (ws, body, pkt, cfg) => {
  let req;
  try {
    req = decode('com.road.yishi.proto.login.registerRoleReq', body);
  } catch (e) {
    console.error('[WS] Failed to decode registerRoleReq:', e.message);
    return;
  }

  const { userName, nickName, sex, camp, icon, site } = req;
  const account = db.getAccount(userName);

  if (!account) {
    const rsp = encode('com.road.yishi.proto.login.registerRoleRsp', {
      userName, site: site || 's1', value: false, type: 1,
      message: 'Account not found', gateIp: '', port: 0, userId: 0,
    });
    sendPacket(ws, S.U_L_REGISTER_ROLE_RSP, rsp);
    return;
  }

  // Check if character already exists with same nick
  const existing = db.getCharactersByAccount(account.id);
  if (existing.some(c => c.nick_name === nickName)) {
    const rsp = encode('com.road.yishi.proto.login.registerRoleRsp', {
      userName, site: site || 's1', value: false, type: 1,
      message: 'Nick name already exists', gateIp: '', port: 0, userId: 0,
    });
    sendPacket(ws, S.U_L_REGISTER_ROLE_RSP, rsp);
    return;
  }

  const result = db.createCharacter(account.id, nickName, sex || 1, camp || 1, icon || 0, site || 's1');
  const charId = result.lastInsertRowid;

  const gateKey = randomKey();
  if (ws.session) {
    ws.session.charId = charId;
    ws.session.gateKey = gateKey;
  }

  const rsp = encode('com.road.yishi.proto.login.registerRoleRsp', {
    userName,
    site: site || 's1',
    value: true,
    type: 0,
    message: 'Register Succeed',
    gateIp: cfg.host,
    port: cfg.port,
    userId: Number(charId),
  });
  sendPacket(ws, S.U_L_REGISTER_ROLE_RSP, rsp);
};

// ─── L_PREPARE_LOGIN (0x7002) ────────────
HANDLERS[C.L_PREPARE_LOGIN] = (ws, body, pkt, cfg) => {
  let req;
  try {
    req = decode('com.road.yishi.proto.login.playerLoginReq', body);
  } catch (e) {
    console.error('[WS] Failed to decode playerLoginReq:', e.message);
    return;
  }

  const { userName, userId, site } = req;
  const account = db.getAccount(userName);
  const charId = userId;
  const char = charId ? db.getCharacterById(charId) : null;

  if (!account || !char || char.account_id !== account.id) {
    const rsp = encode('com.road.yishi.proto.login.playerLoginRsp', {
      userName, site: site || 's1', result: false,
      message: 'Login Failed', userId: 0, gateIp: '', port: 0, todayFirstLogin: false,
    });
    sendPacket(ws, S.U_L_PREPARE_LOGIN, rsp);
    return;
  }

  const gateKey = randomKey();
  if (ws.session) {
    ws.session.charId = charId;
    ws.session.gateKey = gateKey;
  }

  // Check if first login today
  const today = new Date().toISOString().slice(0, 10);
  const lastLogin = account.last_login ? account.last_login.slice(0, 10) : '';
  const todayFirst = lastLogin !== today;
  db.updateLastLogin(account.id);

  const rsp = encode('com.road.yishi.proto.login.playerLoginRsp', {
    userName,
    site: site || 's1',
    result: true,
    message: 'Login Succeed',
    userId: charId,
    gateIp: cfg.host,
    port: cfg.port,
    todayFirstLogin: todayFirst,
  });
  sendPacket(ws, S.U_L_PREPARE_LOGIN, rsp);
};

// ─── G_LOGIN_GATEWAY (0x4E21) ────────────
HANDLERS[C.G_LOGIN_GATEWAY] = (ws, body, pkt, cfg) => {
  let req;
  try {
    req = decode('com.road.yishi.proto.player.LoginReqMsg', body);
  } catch (e) {
    console.error('[WS] Failed to decode LoginReqMsg:', e.message);
    return;
  }

  const { playerId } = req;
  const charId = playerId || (ws.session && ws.session.charId);

  // Send gateway login confirmation (header-only, empty body)
  sendPacket(ws, S.U_G_LOGIN_GATEWAY, null, charId || 0);

  // Send full player info
  const char = charId ? db.getCharacterById(charId) : null;
  if (char) {
    db.setCharOnline(charId, true);
    if (ws.session) ws.session.charId = charId;

    const playerBody = encode('com.road.yishi.proto.player.PlayerMsg', {
      playerId: char.id,
      nickName: char.nick_name,
      sex: char.sex,
      pic: char.icon,
      camp: char.camp,
      point: 0,
      giftToken: 0,
      state: 0,
      lastAward: '',
      questSiteLen: 0,
      consortiaId: 0,
      consortiaName: '',
      claimId: 0,
      claimName: '',
      grades: char.grade,
      gp: char.gold,
      repute: char.repute,
      consortiaOffer: 0,
      strategy: 0,
      weary: 0,
      attackLeftCount: 10,
      noviceProcess: 0,
      fightingCapacity: char.fighting,
      gradeProcess: '0/100',
      bagCount: char.bag_count,
      matchWin: 0,
      matchFailed: 0,
      right: 0,
      job: char.job,
      starCount: 0,
      signDate: '',
      signTimes: 0,
      balens: char.balens,
      boundBalens: char.bound_balens,
      gold: char.gold,
      boundGold: char.bound_gold,
      vipLevel: char.vip_level,
      hp: char.hp,
      maxHp: char.max_hp,
      attack: char.attack,
      defence: char.defence,
      magicAttack: char.magic_attack,
      magicDefence: char.magic_defence,
    });
    sendPacket(ws, S.U_C_PLAYER_INFO, playerBody, char.id);
  }
};

// ─── L_SYNC_TIME (0x7008) ────────────────
HANDLERS[C.L_SYNC_TIME] = (ws) => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const sysCurtime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  const body = encode('com.road.yishi.proto.player.SynchronizedTimeMsg', {
    sysCurtime,
    sysMillisecond: now.getTime(),
  });
  sendPacket(ws, S.U_C_SYNCHRONIZED_TIME, body);
};

module.exports = { handlePacket, sendPacket };
