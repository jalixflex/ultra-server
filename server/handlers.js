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

// Game systems
const chat = require('./systems/chat');
const inventory = require('./systems/inventory');
const battle = require('./systems/battle');
const guild = require('./systems/guild');
const campaign = require('./systems/campaign');
const mail = require('./systems/mail');
const friend = require('./systems/friend');
const shop = require('./systems/shop');
const vip = require('./systems/vip');
const astral = require('./systems/astral');
const sylph = require('./systems/sylph');
const mount = require('./systems/mount');
const troops = require('./systems/troops');
const arena = require('./systems/arena');
const farm = require('./systems/farm');
const academy = require('./systems/academy');
const skills = require('./systems/skills');
const wings = require('./systems/wings');
const forge = require('./systems/forge');
const quest = require('./systems/quest');
const city = require('./systems/city');
const bounty = require('./systems/bounty');
const devotion = require('./systems/devotion');
const dailyLogin = require('./systems/daily-login');
const worldBoss = require('./systems/world-boss');
const catacombs = require('./systems/catacombs');
const party = require('./systems/party');
const battleground = require('./systems/battleground');
const clothing = require('./systems/clothing');
const classAdvance = require('./systems/class-advance');
const buff = require('./systems/buff');
const worldMap = require('./systems/world-map');

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

    // Trigger daily login reward tracking
    try { dailyLogin.onLogin(charId); } catch (e) { console.error('[LOGIN] dailyLogin error:', e.message); }

    // Auto-accept first quest for new characters
    try { quest.autoAcceptFirstQuest(charId); } catch (e) { console.error('[LOGIN] quest error:', e.message); }
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

// ═══════════════════════════════════════════
// Game System Handlers
// ═══════════════════════════════════════════

function sendSimpleResult(ws, success, msg) {
  const body = encode('com.road.yishi.proto.simple.SimpleResultMsg', {
    result: success ? 0 : -1,
    msg: msg || '',
  });
  sendPacket(ws, S.SIMPLE_RESULT, body);
}

function sendJson(ws, cmdId, data) {
  const body = Buffer.from(JSON.stringify(data));
  sendPacket(ws, cmdId, body);
}

function charId(ws) {
  return ws.session && ws.session.charId;
}

// ─── Chat ───────────────────────────────────
HANDLERS[C.CHAT_SEND] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const char = db.getCharacterById(cid);
    const msg = { sender: char.nick_name, senderId: cid, channel: req.channel || 'world', content: req.content, time: Date.now() };

    if (req.channel === 'world' || !req.channel) {
      chat.broadcast(msg);
      const clients = global.__clients;
      if (clients) {
        for (const [, ws2] of clients) {
          sendJson(ws2, S.CHAT_MSG, msg);
        }
      }
    } else if (req.channel === 'private' && req.targetId) {
      const target = global.__clients && global.__clients.get(req.targetId);
      if (target) sendJson(target, S.CHAT_MSG, msg);
      sendJson(ws, S.CHAT_MSG, msg);
    }
  } catch (e) { /* ignore malformed */ }
};

// ─── Inventory ──────────────────────────────
HANDLERS[C.BAG_INFO] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const items = inventory.getItems(cid);
  sendJson(ws, S.BAG_INFO_RSP, { items });
};

HANDLERS[C.BAG_EQUIP] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = inventory.equipItem(cid, req.itemDbId, req.slot);
    sendJson(ws, S.BAG_UPDATE, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.BAG_UNEQUIP] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = inventory.unequipItem(cid, req.slot);
    sendJson(ws, S.BAG_UPDATE, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.BAG_SELL] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = inventory.sellItem(cid, req.itemDbId);
    sendJson(ws, S.BAG_UPDATE, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

// ─── Battle / Campaign ──────────────────────
HANDLERS[C.BATTLE_START] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = battle.startPvE(cid, req.monsterId || 1);
    sendJson(ws, S.BATTLE_INIT, result);
  } catch (e) { sendSimpleResult(ws, false, 'Battle error'); }
};

HANDLERS[C.CAMPAIGN_LIST] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const stages = campaign.getStages(cid);
  sendJson(ws, S.CAMPAIGN_LIST_RSP, { stages });
};

HANDLERS[C.CAMPAIGN_ENTER] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = campaign.enterStage(cid, req.stageId);
    sendJson(ws, S.CAMPAIGN_RESULT, result);
  } catch (e) { sendSimpleResult(ws, false, 'Campaign error'); }
};

HANDLERS[C.CAMPAIGN_SWEEP] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = campaign.sweep(cid, req.stageId, req.count || 1);
    sendJson(ws, S.CAMPAIGN_RESULT, result);
  } catch (e) { sendSimpleResult(ws, false, 'Sweep error'); }
};

// ─── Guild ──────────────────────────────────
HANDLERS[C.GUILD_INFO] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const info = guild.getGuildForPlayer(cid);
  sendJson(ws, S.GUILD_INFO_RSP, info || { msg: 'No guild' });
};

HANDLERS[C.GUILD_CREATE] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = guild.createGuild(cid, req.name);
    sendJson(ws, S.GUILD_INFO_RSP, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.GUILD_JOIN] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = guild.joinGuild(cid, req.guildId);
    sendSimpleResult(ws, result.success, result.msg);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.GUILD_LEAVE] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const result = guild.leaveGuild(cid);
  sendSimpleResult(ws, result.success, result.msg);
};

HANDLERS[C.GUILD_LIST] = (ws) => {
  const list = guild.listGuilds();
  sendJson(ws, S.GUILD_LIST_RSP, { guilds: list });
};

HANDLERS[C.GUILD_DONATE] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = guild.donate(cid, req.amount || 100);
    sendSimpleResult(ws, result.success, result.msg);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

// ─── Mail ───────────────────────────────────
HANDLERS[C.MAIL_LIST] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const mails = mail.getMailList(cid);
  sendJson(ws, S.MAIL_LIST_RSP, { mails });
};

HANDLERS[C.MAIL_SEND] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = mail.sendMail(cid, req.targetId, req.title, req.content, req.attachments);
    sendSimpleResult(ws, result.success, result.msg);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.MAIL_COLLECT] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = mail.collectAttachments(cid, req.mailId);
    sendSimpleResult(ws, result.success, result.msg);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.MAIL_DELETE] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    mail.deleteMail(cid, req.mailId);
    sendSimpleResult(ws, true);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

// ─── Friends ────────────────────────────────
HANDLERS[C.FRIEND_LIST] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const friends = friend.getFriends(cid);
  sendJson(ws, S.FRIEND_LIST_RSP, { friends });
};

HANDLERS[C.FRIEND_ADD] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = friend.addFriend(cid, req.targetId);
    sendSimpleResult(ws, result.success, result.msg);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.FRIEND_REMOVE] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = friend.removeFriend(cid, req.targetId);
    sendSimpleResult(ws, result.success, result.msg);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.FRIEND_SEARCH] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const results = friend.searchByNick(req.nickname);
    sendJson(ws, S.FRIEND_LIST_RSP, { friends: results });
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

// ─── Shop ───────────────────────────────────
HANDLERS[C.SHOP_LIST] = (ws) => {
  const catalog = shop.getCatalog();
  sendJson(ws, S.SHOP_LIST_RSP, { items: catalog });
};

HANDLERS[C.SHOP_BUY] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = shop.buyItem(cid, req.itemId, req.count || 1);
    sendSimpleResult(ws, result.success, result.msg);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

// ─── VIP ────────────────────────────────────
HANDLERS[C.VIP_INFO] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const info = vip.getVipInfo(cid);
  sendJson(ws, S.VIP_INFO_RSP, info);
};

// ─── Astral ─────────────────────────────────
HANDLERS[C.ASTRAL_LIST] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const list = astral.getAstrals(cid);
  sendJson(ws, S.ASTRAL_LIST_RSP, { astrals: list });
};

HANDLERS[C.ASTRAL_CAPTURE] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const result = astral.capture(cid);
  sendJson(ws, S.ASTRAL_UPDATE, result);
};

HANDLERS[C.ASTRAL_UPGRADE] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = astral.upgrade(cid, req.astralId, req.feedIds || []);
    sendJson(ws, S.ASTRAL_UPDATE, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.ASTRAL_EQUIP] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = astral.equip(cid, req.astralId, req.slot);
    sendJson(ws, S.ASTRAL_UPDATE, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.ASTRAL_UNEQUIP] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = astral.unequip(cid, req.slot);
    sendJson(ws, S.ASTRAL_UPDATE, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

// ─── Sylph ──────────────────────────────────
HANDLERS[C.SYLPH_LIST] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const list = sylph.getSylphs(cid);
  sendJson(ws, S.SYLPH_LIST_RSP, { sylphs: list });
};

HANDLERS[C.SYLPH_EQUIP] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = sylph.equipSylph(cid, req.sylphId);
    sendJson(ws, S.SYLPH_UPDATE, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.SYLPH_UPGRADE] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = sylph.upgradeSylph(cid, req.sylphId);
    sendJson(ws, S.SYLPH_UPDATE, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.SYLPH_ENGULF] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = sylph.engulf(cid, req.sylphId, req.feedId);
    sendJson(ws, S.SYLPH_UPDATE, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

// ─── Mount ──────────────────────────────────
HANDLERS[C.MOUNT_LIST] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const list = mount.getMounts(cid);
  sendJson(ws, S.MOUNT_LIST_RSP, { mounts: list });
};

HANDLERS[C.MOUNT_EQUIP] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = mount.equipMount(cid, req.mountId);
    sendJson(ws, S.MOUNT_UPDATE, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.MOUNT_UPGRADE] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = mount.upgradeMount(cid, req.mountId);
    sendJson(ws, S.MOUNT_UPDATE, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

// ─── Troops ─────────────────────────────────
HANDLERS[C.TROOP_LIST] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const list = troops.getTroops(cid);
  sendJson(ws, S.TROOP_LIST_RSP, { troops: list });
};

HANDLERS[C.TROOP_RECRUIT] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = troops.recruitTroop(cid, req.typeId, req.count || 50);
    sendJson(ws, S.TROOP_UPDATE, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.TROOP_UPGRADE] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = troops.upgradeTroop(cid, req.typeId);
    sendJson(ws, S.TROOP_UPDATE, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.TROOP_EQUIP] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = troops.equipTroop(cid, req.troopId);
    sendJson(ws, S.TROOP_UPDATE, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

// ─── Arena ──────────────────────────────────
HANDLERS[C.ARENA_INFO] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const info = arena.getArenaInfo(cid);
  const opponents = arena.getOpponents(cid);
  sendJson(ws, S.ARENA_INFO_RSP, { info, opponents });
};

HANDLERS[C.ARENA_CHALLENGE] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = arena.challenge(cid, req.targetId);
    sendJson(ws, S.ARENA_RESULT, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.ARENA_RANKING] = (ws) => {
  const ranking = arena.getRanking();
  sendJson(ws, S.ARENA_RANKING_RSP, { ranking });
};

// ─── Farm ───────────────────────────────────
HANDLERS[C.FARM_INFO] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const plots = farm.getFarmInfo(cid);
  sendJson(ws, S.FARM_INFO_RSP, { plots });
};

HANDLERS[C.FARM_PLANT] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = farm.plant(cid, req.plotIdx, req.seedId);
    sendJson(ws, S.FARM_UPDATE, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.FARM_HARVEST] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = farm.harvest(cid, req.plotIdx);
    sendJson(ws, S.FARM_UPDATE, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.FARM_STEAL] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = farm.steal(cid, req.targetId, req.plotIdx);
    sendJson(ws, S.FARM_UPDATE, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

// ─── Academy ────────────────────────────────
HANDLERS[C.ACADEMY_LIST] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const techs = academy.getTechLevels(cid);
  sendJson(ws, S.ACADEMY_LIST_RSP, { technologies: techs });
};

HANDLERS[C.ACADEMY_RESEARCH] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = academy.research(cid, req.techId);
    sendJson(ws, S.ACADEMY_RESEARCH_RSP, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

// ─── Skills ─────────────────────────────────
HANDLERS[C.SKILL_LIST] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const list = skills.getSkills(cid);
  sendJson(ws, S.SKILL_LIST_RSP, { skills: list });
};

HANDLERS[C.SKILL_UPGRADE] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = skills.learnOrUpgrade(cid, req.skillId);
    sendJson(ws, S.SKILL_UPDATE, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.SKILL_EQUIP] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = skills.equipSkill(cid, req.skillId, req.slot);
    sendJson(ws, S.SKILL_UPDATE, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

// ─── Wings ──────────────────────────────────
HANDLERS[C.WINGS_INFO] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const info = wings.getWingsInfo(cid);
  sendJson(ws, S.WINGS_INFO_RSP, info);
};

HANDLERS[C.WINGS_UPGRADE] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const result = wings.upgradeWings(cid);
  sendJson(ws, S.WINGS_UPDATE, result);
};

// ─── Forge ──────────────────────────────────
HANDLERS[C.FORGE_ENCHANT] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = forge.enchantItem(cid, req.itemDbId);
    sendJson(ws, S.FORGE_RESULT, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.FORGE_SOCKET] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = forge.socketGem(cid, req.itemDbId, req.gemType, req.gemLevel);
    sendJson(ws, S.FORGE_RESULT, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.FORGE_REFINE] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = forge.refineItem(cid, req.itemDbId);
    sendJson(ws, S.FORGE_RESULT, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.FORGE_SYNTHESIZE] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = forge.synthesizeGems(cid, req.gemType, req.gemLevel);
    sendJson(ws, S.FORGE_RESULT, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

// ─── Quest ──────────────────────────────────
HANDLERS[C.QUEST_LIST] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const active = quest.getActiveQuests(cid);
  const available = quest.getAvailableQuests(cid);
  const completed = quest.getCompletedQuests(cid);
  sendJson(ws, S.QUEST_LIST_RSP, { active, available, completedIds: completed });
};

HANDLERS[C.QUEST_ACCEPT] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = quest.acceptQuest(cid, req.questId);
    sendJson(ws, S.QUEST_UPDATE, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.QUEST_COMPLETE] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = quest.completeQuest(cid, req.questId);
    sendJson(ws, S.QUEST_UPDATE, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.QUEST_NPC_TALK] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = quest.talkToNpc(cid, req.npcId);
    sendJson(ws, S.QUEST_NPC_TALK_RSP, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

// ─── City ───────────────────────────────────
HANDLERS[C.CITY_INFO] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const buildings = city.getCityInfo(cid);
  sendJson(ws, S.CITY_INFO_RSP, { buildings });
};

HANDLERS[C.CITY_UPGRADE] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = city.upgradeBuilding(cid, req.buildingId);
    sendJson(ws, S.CITY_UPGRADE_RSP, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.CITY_COLLECT] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const result = city.collectGold(cid);
  sendJson(ws, S.CITY_COLLECT_RSP, result);
};

// ─── Bounty ─────────────────────────────────
HANDLERS[C.BOUNTY_LIST] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const info = bounty.getBountyInfo(cid);
  sendJson(ws, S.BOUNTY_LIST_RSP, info);
};

HANDLERS[C.BOUNTY_ACCEPT] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const result = bounty.generateBounty(cid);
  sendJson(ws, S.BOUNTY_UPDATE, result);
};

HANDLERS[C.BOUNTY_COMPLETE] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const result = bounty.completeBounty(cid);
  sendJson(ws, S.BOUNTY_UPDATE, result);
};

HANDLERS[C.BOUNTY_REFRESH] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const result = bounty.refreshBounty(cid);
  sendJson(ws, S.BOUNTY_UPDATE, result);
};

// ─── Devotion ───────────────────────────────
HANDLERS[C.DEVOTION_INFO] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const info = devotion.getDevotionInfo(cid);
  sendJson(ws, S.DEVOTION_INFO_RSP, info);
};

HANDLERS[C.DEVOTION_CLAIM] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = devotion.claimTierReward(cid, req.tierIndex);
    sendJson(ws, S.DEVOTION_CLAIM_RSP, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

// ─── Daily Login ────────────────────────────
HANDLERS[C.LOGIN_REWARD_INFO] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const info = dailyLogin.getLoginInfo(cid);
  sendJson(ws, S.LOGIN_REWARD_INFO_RSP, info);
};

HANDLERS[C.LOGIN_REWARD_CLAIM] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const result = dailyLogin.claimReward(cid);
  sendJson(ws, S.LOGIN_REWARD_CLAIM_RSP, result);
};

// ─── World Boss ─────────────────────────────
HANDLERS[C.WORLD_BOSS_INFO] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const info = worldBoss.getBossInfo(cid);
  sendJson(ws, S.WORLD_BOSS_INFO_RSP, info);
};

HANDLERS[C.WORLD_BOSS_ATTACK] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const result = worldBoss.attackBoss(cid);
  sendJson(ws, S.WORLD_BOSS_ATTACK_RSP, result);
};

HANDLERS[C.WORLD_BOSS_RANK] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const result = worldBoss.getRanking(cid);
  sendJson(ws, S.WORLD_BOSS_RANK_RSP, result);
};

// ─── Catacombs ──────────────────────────────
HANDLERS[C.CATACOMBS_INFO] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const info = catacombs.getInfo(cid);
  sendJson(ws, S.CATACOMBS_INFO_RSP, info);
};

HANDLERS[C.CATACOMBS_FIGHT] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const result = catacombs.fightFloor(cid);
  sendJson(ws, S.CATACOMBS_FIGHT_RSP, result);
};

HANDLERS[C.CATACOMBS_RESET] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const result = catacombs.resetFloor(cid);
  sendSimpleResult(ws, result.success, result.msg);
};

// ─── Party / MPD ────────────────────────────
HANDLERS[C.PARTY_CREATE] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const result = party.createParty(cid);
  sendJson(ws, S.PARTY_INFO_RSP, result);
};

HANDLERS[C.PARTY_INVITE] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = party.inviteToParty(cid, req.targetId);
    sendJson(ws, S.PARTY_INVITE_RSP, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.PARTY_ACCEPT] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = party.acceptInvite(cid, req.partyId);
    sendJson(ws, S.PARTY_INFO_RSP, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.PARTY_LEAVE] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const result = party.leaveParty(cid);
  sendSimpleResult(ws, result.success, result.msg);
};

HANDLERS[C.PARTY_KICK] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = party.kickMember(cid, req.targetId);
    sendSimpleResult(ws, result.success, result.msg);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.PARTY_INFO] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const info = party.getPartyInfo(cid);
  sendJson(ws, S.PARTY_INFO_RSP, info);
};

HANDLERS[C.MPD_LIST] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const list = party.getDungeonList(cid);
  sendJson(ws, S.MPD_LIST_RSP, list);
};

HANDLERS[C.MPD_ENTER] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = party.enterDungeon(cid, req.dungeonId, req.difficulty);
    sendJson(ws, S.MPD_ENTER_RSP, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.MPD_FIGHT] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const result = party.fightBoss(cid);
  sendJson(ws, S.MPD_FIGHT_RSP, result);
};

// ─── Battleground ───────────────────────────
HANDLERS[C.BG_INFO] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const info = battleground.getBGInfo(cid);
  sendJson(ws, S.BG_INFO_RSP, info);
};

HANDLERS[C.BG_JOIN] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = battleground.joinBattleground(cid, req.mode || 0);
    sendJson(ws, S.BG_JOIN_RSP, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.BG_ATTACK] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = battleground.attackPlayer(cid, req.targetId);
    sendJson(ws, S.BG_ATTACK_RSP, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.BG_CAPTURE] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = battleground.capturePoint(cid, req.pointId);
    sendJson(ws, S.BG_CAPTURE_RSP, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.BG_RESULTS] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const result = battleground.getBGResults(cid);
  sendJson(ws, S.BG_RESULTS_RSP, result);
};

HANDLERS[C.BG_RANKING] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const result = battleground.getBGRanking(cid);
  sendJson(ws, S.BG_RANKING_RSP, result);
};

// ─── Clothing ───────────────────────────────
HANDLERS[C.CLOTHING_LIST] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const list = clothing.getClothingList(cid);
  sendJson(ws, S.CLOTHING_LIST_RSP, list);
};

HANDLERS[C.CLOTHING_EQUIP] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = clothing.equipClothing(cid, req.clothingId);
    sendJson(ws, S.CLOTHING_UPDATE, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.CLOTHING_UPGRADE] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = clothing.upgradeClothing(cid, req.clothingId);
    sendJson(ws, S.CLOTHING_UPDATE, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.CLOTHING_SYNTHESIZE] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = clothing.synthesizeClothing(cid, req.materialIds);
    sendJson(ws, S.CLOTHING_UPDATE, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.CLOTHING_BUY] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = clothing.buyClothing(cid, req.setId);
    sendJson(ws, S.CLOTHING_UPDATE, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

// ─── Class Advancement ──────────────────────
HANDLERS[C.ADVANCE_INFO] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const info = classAdvance.getAdvanceInfo(cid);
  sendJson(ws, S.ADVANCE_INFO_RSP, info);
};

HANDLERS[C.ADVANCE_START] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const result = classAdvance.startAdvanceQuest(cid);
  sendJson(ws, S.ADVANCE_START_RSP, result);
};

HANDLERS[C.ADVANCE_TRIAL] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = classAdvance.fightTrial(cid, req.trialNum);
    sendJson(ws, S.ADVANCE_TRIAL_RSP, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.ADVANCE_CHOOSE] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = classAdvance.chooseSpecialization(cid, req.specId);
    sendJson(ws, S.ADVANCE_CHOOSE_RSP, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

// ─── Buff ───────────────────────────────────
HANDLERS[C.BUFF_LIST] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const buffs = buff.getActiveBuffs(cid);
  sendJson(ws, S.BUFF_LIST_RSP, { buffs });
};

// ─── World Map ──────────────────────────────
HANDLERS[C.MAP_ENTER] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = worldMap.enterMap(cid, req.mapId);
    sendJson(ws, S.MAP_ENTER_RSP, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.MAP_MOVE] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = worldMap.movePlayer(cid, req.x, req.y);
    sendJson(ws, S.MAP_MOVE_RSP, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.MAP_NPC_LIST] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const result = worldMap.getNpcList(cid);
  sendJson(ws, S.MAP_NPC_LIST_RSP, result);
};

HANDLERS[C.MAP_NPC_TALK] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = worldMap.talkToNpc(cid, req.npcId);
    sendJson(ws, S.MAP_NPC_DIALOG, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.MAP_TELEPORT] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = worldMap.teleport(cid, req.mapId);
    sendJson(ws, S.MAP_TELEPORT_RSP, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

module.exports = { handlePacket, sendPacket };
