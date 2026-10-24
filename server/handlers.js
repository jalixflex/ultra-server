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
const talent = require('./systems/talent');
const rune = require('./systems/rune');
const eudaemon = require('./systems/eudaemon');
const honor = require('./systems/honor');
const dragonSoul = require('./systems/dragon-soul');
const holyForge = require('./systems/holy-forge');
const guildExtras = require('./systems/guild-extras');
const spire = require('./systems/spire');
const dimensionalWar = require('./systems/dimensional-war');
const circuitQuest = require('./systems/circuit-quest');
const gem = require('./systems/gem');
const resistance = require('./systems/resistance');
const henna = require('./systems/henna');
const achievement = require('./systems/achievement');
const events = require('./systems/events');
const gacha = require('./systems/gacha');
const ranking = require('./systems/ranking');
const social = require('./systems/social');
const knighthood = require('./systems/knighthood');
const jewelHunt = require('./systems/jewel-hunt');
const cloudAdventure = require('./systems/cloud-adventure');
const purgatoryMaze = require('./systems/purgatory-maze');
const archaeology = require('./systems/archaeology');
const crossServer = require('./systems/cross-server');
const tutorial = require('./systems/tutorial');
const featureUnlock = require('./systems/feature-unlock');

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

  const job = camp || 1;
  const result = db.createCharacter(account.id, nickName, sex || 1, camp || 1, icon || 0, site || 's1', job);
  const charId = result.lastInsertRowid;

  // Give starter equipment and items
  try { inventory.giveStarterItems(charId, job); } catch(e) { console.error('[REGISTER] starter items error:', e.message); }

  // Give starter skills
  try { skills.giveStarterSkills(charId, job); } catch(e) { console.error('[REGISTER] starter skills error:', e.message); }

  // Initialize tutorial
  try { tutorial.onFirstLogin(charId); } catch(e) { console.error('[REGISTER] tutorial error:', e.message); }

  // Recalc stats with equipment
  try { inventory.recalcStats(charId); } catch(e) { console.error('[REGISTER] recalc error:', e.message); }

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
      gradeProcess: `${char.exp}/${battle.expForLevel(char.grade)}`,
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

    // Send bag contents
    try { inventory.handleBagInfo(ws); } catch (e) { console.error('[LOGIN] bag error:', e.message); }

    // Send equipped skills
    try { sendJson(ws, S.SKILL_LIST, skills.getSkills(charId)); } catch (e) { console.error('[LOGIN] skills error:', e.message); }

    // Send city buildings
    try { sendJson(ws, S.CITY_INFO, city.getCityInfo(charId)); } catch (e) { console.error('[LOGIN] city error:', e.message); }

    // Send active quests
    try { sendJson(ws, S.QUEST_LIST, quest.getActiveQuests(charId)); } catch (e) { console.error('[LOGIN] quest error:', e.message); }

    // Send feature unlock flags
    try { sendJson(ws, 0x8810, featureUnlock.getUnlockedFeatures(char.grade)); } catch (e) { console.error('[LOGIN] featureUnlock error:', e.message); }

    // Send mail count
    try { sendJson(ws, S.MAIL_LIST, { unread: mail.getUnreadCount(charId) }); } catch (e) { console.error('[LOGIN] mail error:', e.message); }

    // Tutorial state for new players
    try {
      const tut = tutorial.getTutorialInfo(charId);
      if (tut && !tut.completed) {
        sendJson(ws, S.TUTORIAL_INFO, tut);
        if (char.grade <= 1) tutorial.onFirstLogin(charId);
      }
    } catch (e) { console.error('[LOGIN] tutorial error:', e.message); }

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
    message: msg || '',
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
      chat.broadcastChat(msg);
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
    if (result.success) {
      try { quest.updateProgress(cid, 'equip_item', 'any'); } catch(e) {}
    }
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
    const result = battle.startBattle(cid, req.monsterId || 1);
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
  const info = guild.getPlayerGuild(cid);
  sendJson(ws, S.GUILD_INFO_RSP, info || { msg: 'No guild' });
};

HANDLERS[C.GUILD_CREATE] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = guild.createGuild(cid, req.name);
    sendJson(ws, S.GUILD_INFO_RSP, result);
    if (result.success !== false) {
      try { quest.updateProgress(cid, 'join_guild', 'any'); } catch(e) {}
    }
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.GUILD_JOIN] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = guild.joinGuild(cid, req.guildId);
    sendSimpleResult(ws, result.success, result.msg);
    if (result.success) {
      try { quest.updateProgress(cid, 'join_guild', 'any'); } catch(e) {}
    }
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.GUILD_LEAVE] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  const result = guild.leaveGuild(cid);
  sendSimpleResult(ws, result.success, result.msg);
};

HANDLERS[C.GUILD_LIST] = (ws) => {
  const list = guild.getGuildList();
  sendJson(ws, S.GUILD_LIST_RSP, { guilds: list });
};

HANDLERS[C.GUILD_DONATE] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = guild.donateToGuild(cid, req.amount || 100);
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
    const result = mail.claimAttachments(cid, req.mailId);
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
  const friends = friend.getFriendList(cid);
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
  const catalog = shop.getShopList();
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
  const result = astral.captureAstral(cid);
  sendJson(ws, S.ASTRAL_UPDATE, result);
};

HANDLERS[C.ASTRAL_UPGRADE] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = astral.upgradeAstral(cid, req.astralId, req.feedIds || []);
    sendJson(ws, S.ASTRAL_UPDATE, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.ASTRAL_EQUIP] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = astral.equipAstral(cid, req.astralId, req.slot);
    sendJson(ws, S.ASTRAL_UPDATE, result);
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.ASTRAL_UNEQUIP] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    const result = astral.sellAstral(cid, req.slot);
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
    const result = sylph.engulfSylph(cid, req.sylphId, req.feedId);
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
    try { quest.updateProgress(cid, 'arena_battle', 'any'); } catch(e) {}
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

// ─── Talent ────────────────────────────────
HANDLERS[C.TALENT_INFO] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.TALENT_INFO_RSP, talent.getTalentInfo(cid));
};

HANDLERS[C.TALENT_UPGRADE] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.TALENT_UPGRADE_RSP, talent.upgradeTalent(cid, req.talentId));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.HOLY_SEAL_INFO] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.HOLY_SEAL_INFO_RSP, talent.getHolySealInfo(cid));
};

HANDLERS[C.HOLY_SEAL_UPGRADE] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.HOLY_SEAL_UPGRADE_RSP, talent.upgradeHolySeal(cid));
};

// ─── Rune ──────────────────────────────────
HANDLERS[C.RUNE_INFO] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.RUNE_INFO_RSP, rune.getRuneInfo(cid));
};

HANDLERS[C.RUNE_EQUIP] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.RUNE_UPDATE, rune.equipRune(cid, req.runeId, req.slot));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.RUNE_UNEQUIP] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.RUNE_UPDATE, rune.unequipRune(cid, req.slot));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.RUNE_UPGRADE] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.RUNE_UPDATE, rune.upgradeRune(cid, req.runeId));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

// ─── Eudaemon ──────────────────────────────
HANDLERS[C.EUDAEMON_LIST] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.EUDAEMON_LIST_RSP, eudaemon.getEudaemonList(cid));
};

HANDLERS[C.EUDAEMON_SUMMON] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.EUDAEMON_UPDATE, eudaemon.summonEudaemon(cid, req.typeId));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.EUDAEMON_EQUIP] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.EUDAEMON_UPDATE, eudaemon.equipEudaemon(cid, req.eudaemonId));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.EUDAEMON_LEVEL_UP] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.EUDAEMON_UPDATE, eudaemon.levelUpEudaemon(cid, req.eudaemonId));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.EUDAEMON_STAR_UP] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.EUDAEMON_UPDATE, eudaemon.starUpEudaemon(cid, req.eudaemonId));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.EUDAEMON_SKILL] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.EUDAEMON_UPDATE, eudaemon.learnSkill(cid, req.eudaemonId, req.skillId));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.PATROL_START] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.PATROL_UPDATE, eudaemon.startPatrol(cid, req.eudaemonId, req.difficulty));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.PATROL_COLLECT] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.PATROL_UPDATE, eudaemon.collectPatrol(cid, req.patrolId));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.PATROL_LIST] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.PATROL_LIST_RSP, eudaemon.getPatrolList(cid));
};

// ─── Honor ─────────────────────────────────
HANDLERS[C.HONOR_INFO] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.HONOR_INFO_RSP, honor.getHonorInfo(cid));
};

HANDLERS[C.MEDALLION_INFO] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.MEDALLION_INFO_RSP, honor.getMedallionInfo(cid));
};

HANDLERS[C.MEDALLION_BUY] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.MEDALLION_UPDATE, honor.buyMedallion(cid, req.tierId));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.MEDALLION_EQUIP] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.MEDALLION_UPDATE, honor.equipMedallion(cid, req.medallionId));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

// ─── Dragon Soul ───────────────────────────
HANDLERS[C.DRAGON_SOUL_LIST] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.DRAGON_SOUL_LIST_RSP, dragonSoul.getDragonSouls(cid));
};

HANDLERS[C.DRAGON_SOUL_UNLOCK] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.DRAGON_SOUL_UPDATE, dragonSoul.unlockDragonSoul(cid, req.element));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.DRAGON_SOUL_UPGRADE] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.DRAGON_SOUL_UPDATE, dragonSoul.upgradeDragonSoul(cid, req.soulId));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.DRAGON_SOUL_EQUIP] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.DRAGON_SOUL_UPDATE, dragonSoul.equipDragonSoul(cid, req.soulId));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

// ─── Holy Forge ────────────────────────────
HANDLERS[C.HOLY_FORGE_INFO] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.HOLY_FORGE_INFO_RSP, holyForge.getInfo(cid));
};

HANDLERS[C.HOLY_FORGE_UPGRADE] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.HOLY_FORGE_UPGRADE_RSP, holyForge.upgrade(cid, req.slot));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.HOLY_FORGE_ACTIVATE] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.HOLY_FORGE_ACTIVATE_RSP, holyForge.activate(cid, req.slot));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

// ─── Guild Extras ──────────────────────────
HANDLERS[C.GUILD_ALTAR_INFO] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.GUILD_ALTAR_INFO_RSP, guildExtras.getAltarInfo(cid));
};

HANDLERS[C.GUILD_ALTAR_SPIN] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.GUILD_ALTAR_SPIN_RSP, guildExtras.spinAltar(cid));
};

HANDLERS[C.GUILD_BEAST_INFO] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.GUILD_BEAST_INFO_RSP, guildExtras.getBeastInfo(cid));
};

HANDLERS[C.GUILD_BEAST_ATTACK] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.GUILD_BEAST_ATTACK_RSP, guildExtras.attackBeast(cid));
};

HANDLERS[C.GUILD_SHOP_LIST] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.GUILD_SHOP_LIST_RSP, guildExtras.getGuildShopList(cid));
};

HANDLERS[C.GUILD_SHOP_BUY] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.GUILD_SHOP_BUY_RSP, guildExtras.buyGuildShopItem(cid, req.itemId));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.GUILD_WAR_INFO] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.GUILD_WAR_INFO_RSP, guildExtras.getWarInfo(cid));
};

HANDLERS[C.GUILD_WAR_ATTACK] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.GUILD_WAR_ATTACK_RSP, guildExtras.attackTower(cid, req.towerId));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.GUILD_WAR_RANK] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.GUILD_WAR_RANK_RSP, guildExtras.getWarRanking(cid));
};

// ─── Spire ─────────────────────────────────
HANDLERS[C.SPIRE_INFO] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.SPIRE_INFO_RSP, spire.getSpireInfo(cid));
};

HANDLERS[C.SPIRE_FIGHT] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.SPIRE_FIGHT_RSP, spire.fightFloor(cid));
};

HANDLERS[C.SPIRE_RESET] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.SPIRE_RESET_RSP, spire.resetSpire(cid));
};

// ─── Dimensional War ───────────────────────
HANDLERS[C.DIMWAR_INFO] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.DIMWAR_INFO_RSP, dimensionalWar.getDimWarInfo(cid));
};

HANDLERS[C.DIMWAR_ENTER] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.DIMWAR_ENTER_RSP, dimensionalWar.enterFloor(cid, req.floor));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.DIMWAR_FIGHT] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.DIMWAR_FIGHT_RSP, dimensionalWar.fightRoom(cid, req.roomIndex));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.DIMWAR_COLLECT] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.DIMWAR_COLLECT_RSP, dimensionalWar.collectRewards(cid));
};

// ─── Circuit Quest ─────────────────────────
HANDLERS[C.CIRCUIT_INFO] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.CIRCUIT_INFO_RSP, circuitQuest.getCircuitInfo(cid));
};

HANDLERS[C.CIRCUIT_ACCEPT] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.CIRCUIT_ACCEPT_RSP, circuitQuest.acceptCircuitQuest(cid, req.questIndex));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.CIRCUIT_COMPLETE] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.CIRCUIT_COMPLETE_RSP, circuitQuest.completeCircuitQuest(cid));
};

HANDLERS[C.CIRCUIT_REFRESH] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.CIRCUIT_REFRESH_RSP, circuitQuest.refreshCircuitQuest(cid));
};

// ─── Gem ───────────────────────────────────
HANDLERS[C.GEM_LIST] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.GEM_LIST_RSP, gem.getGemInventory(cid));
};

HANDLERS[C.GEM_COMBINE] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.GEM_COMBINE_RSP, gem.combineGems(cid, req.gemType, req.gemLevel));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

// ─── Resistance ────────────────────────────
HANDLERS[C.RESIST_INFO] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.RESIST_INFO_RSP, resistance.getResistInfo(cid));
};

// ─── Henna ─────────────────────────────────
HANDLERS[C.HENNA_INFO] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.HENNA_INFO_RSP, henna.getHennaInfo(cid));
};

HANDLERS[C.HENNA_APPLY] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.HENNA_APPLY_RSP, henna.applyHenna(cid, req.slot, req.hennaId, req.grade));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.HENNA_REMOVE] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.HENNA_REMOVE_RSP, henna.removeHenna(cid, req.slot));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

// ─── Achievement ───────────────────────────
HANDLERS[C.ACHIEVEMENT_LIST] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.ACHIEVEMENT_LIST_RSP, achievement.getAchievementList(cid));
};

HANDLERS[C.ACHIEVEMENT_CLAIM] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.ACHIEVEMENT_CLAIM_RSP, achievement.claimAchievement(cid, req.achievementId));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

// ─── Events ────────────────────────────────
HANDLERS[C.EVENT_LIST] = (ws) => {
  sendJson(ws, S.EVENT_LIST_RSP, events.getActiveEvents());
};

HANDLERS[C.EVENT_INFO] = (ws, body) => {
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.EVENT_INFO_RSP, events.getEventInfo(req.eventId));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.HOT_EVENT_CLAIM] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.HOT_EVENT_CLAIM_RSP, events.claimHotEventReward(cid, req.tierId));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

// ─── Gacha ─────────────────────────────────
HANDLERS[C.GACHA_INFO] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.GACHA_INFO_RSP, gacha.getGachaInfo(cid));
};

HANDLERS[C.GACHA_SPIN] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.GACHA_SPIN_RSP, gacha.pull(cid, req.poolId, 1));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.GACHA_TEN_SPIN] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.GACHA_TEN_SPIN_RSP, gacha.pull(cid, req.poolId, 10));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

// ─── Ranking ───────────────────────────────
HANDLERS[C.RANKING_LIST] = (ws, body) => {
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.RANKING_LIST_RSP, ranking.getRankingList(req.rankingType));
  } catch (e) {
    sendJson(ws, S.RANKING_LIST_RSP, ranking.getRankingList('br'));
  }
};

HANDLERS[C.RANKING_DETAIL] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.RANKING_DETAIL_RSP, ranking.getSelfRank(cid, req.rankingType));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

// ─── Social ────────────────────────────────
HANDLERS[C.PLAYER_SEARCH] = (ws, body) => {
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.PLAYER_SEARCH_RSP, social.searchPlayers(req.query, req.limit));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.PLAYER_PROFILE] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.PLAYER_PROFILE_RSP, social.getProfile(req.targetId || cid));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.BLOCK_PLAYER] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.BLOCK_PLAYER_RSP, social.blockPlayer(cid, req.targetId));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.UNBLOCK_PLAYER] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.UNBLOCK_PLAYER_RSP, social.unblockPlayer(cid, req.targetId));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.BLOCK_LIST] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.BLOCK_LIST_RSP, social.getBlockList(cid));
};

HANDLERS[C.RECENT_CONTACTS] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.RECENT_CONTACTS_RSP, social.getRecommendedFriends(cid));
};

HANDLERS[C.TRADE_REQUEST] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.TRADE_REQUEST_RSP, social.sendGift(cid, req.targetId, req.giftId || 'flower'));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.TRADE_CONFIRM] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.TRADE_CONFIRM_RSP, social.sendGift(cid, req.targetId, req.giftId || 'ring'));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.TRADE_CANCEL] = (ws) => {
  sendJson(ws, S.TRADE_CANCEL_RSP, { success: true, msg: 'Trade cancelled' });
};

// ─── Knighthood ────────────────────────────
HANDLERS[C.KNIGHTHOOD_INFO] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.KNIGHTHOOD_INFO_RSP, knighthood.getKnighthoodInfo(cid));
};

HANDLERS[C.KNIGHTHOOD_UPGRADE] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.KNIGHTHOOD_UPGRADE_RSP, knighthood.trainKnight(cid, req.knightId || 1));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.KNIGHTHOOD_SKILL] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.KNIGHTHOOD_SKILL_RSP, knighthood.recruitKnight(cid, req.knightId || 1));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.KNIGHTHOOD_SET_ACTIVE] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.KNIGHTHOOD_SET_ACTIVE_RSP, knighthood.doQuest(cid, req.questId || 1));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

// ─── Jewel Hunt ────────────────────────────
HANDLERS[C.JEWEL_HUNT_INFO] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.JEWEL_HUNT_INFO_RSP, jewelHunt.getJewelHuntInfo(cid));
};

HANDLERS[C.JEWEL_HUNT_START] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.JEWEL_HUNT_START_RSP, jewelHunt.startJewelHunt(cid));
};

HANDLERS[C.JEWEL_HUNT_MOVE] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.JEWEL_HUNT_MOVE_RSP, jewelHunt.makeMove(cid, req.fromRow, req.fromCol, req.toRow, req.toCol));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.JEWEL_HUNT_COLLECT] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.JEWEL_HUNT_COLLECT_RSP, jewelHunt.collectJewelReward(cid));
};

// ─── Cloud Adventure ───────────────────────
HANDLERS[C.CLOUD_INFO] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.CLOUD_INFO_RSP, cloudAdventure.getCloudInfo(cid));
};

HANDLERS[C.CLOUD_ENTER] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.CLOUD_ENTER_RSP, cloudAdventure.rollDice(cid));
};

HANDLERS[C.CLOUD_COMPLETE] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.CLOUD_COMPLETE_RSP, cloudAdventure.collectMilestone(cid, req.milestoneId || 0));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.CLOUD_REWARDS] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.CLOUD_REWARDS_RSP, cloudAdventure.getCloudInfo(cid));
};

// ─── Purgatory Maze ────────────────────────
HANDLERS[C.MAZE_INFO] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.MAZE_INFO_RSP, purgatoryMaze.getMazeInfo(cid));
};

HANDLERS[C.MAZE_ENTER] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.MAZE_ENTER_RSP, purgatoryMaze.enterMaze(cid));
};

HANDLERS[C.MAZE_MOVE] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.MAZE_MOVE_RSP, purgatoryMaze.moveMaze(cid, req.direction || req.roomId));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.MAZE_FIGHT] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.MAZE_FIGHT_RSP, purgatoryMaze.getMazeInfo(cid));
};

HANDLERS[C.MAZE_BOSS] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.MAZE_BOSS_RSP, purgatoryMaze.getMazeInfo(cid));
};

HANDLERS[C.MAZE_COMPLETE] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.MAZE_COMPLETE_RSP, purgatoryMaze.exitMaze(cid));
};

// ─── Archaeology ───────────────────────────
HANDLERS[C.ARCHAEOLOGY_INFO] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.ARCHAEOLOGY_INFO_RSP, archaeology.getArchInfo(cid));
};

HANDLERS[C.ARCHAEOLOGY_DIG] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.ARCHAEOLOGY_DIG_RSP, archaeology.dig(cid));
};

HANDLERS[C.ARCHAEOLOGY_COLLECTION] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.ARCHAEOLOGY_COLLECTION_RSP, archaeology.getArchInfo(cid));
};

HANDLERS[C.ARCHAEOLOGY_CLAIM_SET] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.ARCHAEOLOGY_CLAIM_SET_RSP, archaeology.collectSet(cid, req.setId));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

// ─── Cross Server ──────────────────────────
HANDLERS[C.CS_ARENA_INFO] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.CS_ARENA_INFO_RSP, crossServer.getCrossArenaInfo(cid));
};

HANDLERS[C.CS_ARENA_MATCH] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.CS_ARENA_MATCH_RSP, crossServer.crossArenaFight(cid));
};

HANDLERS[C.CS_ARENA_COMPLETE] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.CS_ARENA_COMPLETE_RSP, crossServer.getCrossArenaInfo(cid));
};

HANDLERS[C.CS_ARENA_RANKING] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.CS_ARENA_RANKING_RSP, crossServer.getCrossArenaInfo(cid));
};

HANDLERS[C.CS_GW_INFO] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.CS_GW_INFO_RSP, crossServer.getCrossGWInfo(cid));
};

HANDLERS[C.CS_GW_RANKING] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.CS_GW_RANKING_RSP, crossServer.getCrossGWInfo(cid));
};

HANDLERS[C.CS_SEASON_REWARDS] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.CS_SEASON_REWARDS_RSP, crossServer.getSeasonInfo(cid));
};

// ─── Tutorial ──────────────────────────────
HANDLERS[C.TUTORIAL_INFO] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.TUTORIAL_INFO_RSP, tutorial.getTutorialInfo(cid));
};

HANDLERS[C.TUTORIAL_STEP] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.TUTORIAL_STEP_RSP, tutorial.onAction(cid, req.stepId));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.TUTORIAL_COMPLETE] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.TUTORIAL_COMPLETE_RSP, tutorial.skipTutorial(cid));
};

HANDLERS[C.NPC_DIALOG_NEXT] = (ws, body) => {
  const cid = charId(ws);
  if (!cid) return;
  try {
    const req = JSON.parse(body.toString());
    sendJson(ws, S.NPC_DIALOG_RSP, tutorial.advanceDialog(cid, req.npcId));
  } catch (e) { sendSimpleResult(ws, false, 'Error'); }
};

HANDLERS[C.TUTORIAL_SKIP] = (ws) => {
  const cid = charId(ws);
  if (!cid) return;
  sendJson(ws, S.TUTORIAL_SKIP_RSP, tutorial.skipTutorial(cid));
};

module.exports = { handlePacket, sendPacket };
