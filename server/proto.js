/**
 * Wartune Ultra — Protobuf Message Definitions
 *
 * Field numbers are unknown (marked ? in the client), so we use
 * sequential numbering starting from 1. If the client sends with
 * different field numbers, update these to match.
 *
 * Uses protobufjs for runtime message building (no .proto files needed).
 */

'use strict';

const protobuf = require('protobufjs');

const root = new protobuf.Root();

// ═══════════════════════════════════════════
// Namespace: com.road.yishi.proto.login
// ═══════════════════════════════════════════
const loginNs = root.define('com.road.yishi.proto.login');

// createLoginReq
loginNs.add(new protobuf.Type('createLoginReq')
  .add(new protobuf.Field('userName', 1, 'string'))
  .add(new protobuf.Field('pass', 2, 'string'))
  .add(new protobuf.Field('site', 3, 'string'))
  .add(new protobuf.Field('from', 4, 'string'))
  .add(new protobuf.Field('appId', 5, 'int32'))
  .add(new protobuf.Field('packageId', 6, 'int32'))
  .add(new protobuf.Field('channelId', 7, 'string'))
  .add(new protobuf.Field('channelName', 8, 'string'))
  .add(new protobuf.Field('token', 9, 'string'))
  .add(new protobuf.Field('deviceId', 10, 'string'))
  .add(new protobuf.Field('clientVersion', 11, 'string'))
  .add(new protobuf.Field('systemSoftware', 12, 'string'))
  .add(new protobuf.Field('systemHardware', 13, 'string'))
  .add(new protobuf.Field('telecomOper', 14, 'string'))
  .add(new protobuf.Field('network', 15, 'string'))
  .add(new protobuf.Field('screenWidth', 16, 'int32'))
  .add(new protobuf.Field('screenHight', 17, 'int32'))
  .add(new protobuf.Field('density', 18, 'int32'))
  .add(new protobuf.Field('cpuHardware', 19, 'string'))
  .add(new protobuf.Field('memory', 20, 'int32'))
  .add(new protobuf.Field('glRender', 21, 'string'))
  .add(new protobuf.Field('glVersion', 22, 'string'))
  .add(new protobuf.Field('platId', 23, 'int32'))
  .add(new protobuf.Field('siteId', 24, 'int32'))
  .add(new protobuf.Field('clientIp', 25, 'string'))
  .add(new protobuf.Field('medium', 26, 'string'))
  .add(new protobuf.Field('serverName', 27, 'string'))
  .add(new protobuf.Field('clientLan', 28, 'int32'))
  .add(new protobuf.Field('area', 29, 'int32'))
  .add(new protobuf.Field('os', 30, 'string'))
  .add(new protobuf.Field('osVersion', 31, 'string'))
);

// createLoginRsp
loginNs.add(new protobuf.Type('createLoginRsp')
  .add(new protobuf.Field('userName', 1, 'string'))
  .add(new protobuf.Field('site', 2, 'string'))
  .add(new protobuf.Field('result', 3, 'int32'))
);

// GetPlayerListReq
loginNs.add(new protobuf.Type('GetPlayerListReq')
  .add(new protobuf.Field('userName', 1, 'string'))
  .add(new protobuf.Field('key', 2, 'string'))
  .add(new protobuf.Field('site', 3, 'string'))
);

// SimpleUserInfo
loginNs.add(new protobuf.Type('SimpleUserInfo')
  .add(new protobuf.Field('userId', 1, 'int32'))
  .add(new protobuf.Field('userName', 2, 'string'))
  .add(new protobuf.Field('nickName', 3, 'string'))
  .add(new protobuf.Field('grade', 4, 'int32'))
  .add(new protobuf.Field('repute', 5, 'int32'))
  .add(new protobuf.Field('sex', 6, 'int32'))
  .add(new protobuf.Field('rename', 7, 'int32'))
  .add(new protobuf.Field('active', 8, 'bool'))
  .add(new protobuf.Field('site', 9, 'string'))
  .add(new protobuf.Field('isOnline', 10, 'bool'))
);

// GetPlayerListRsp
loginNs.add(new protobuf.Type('GetPlayerListRsp')
  .add(new protobuf.Field('infoList', 1, 'com.road.yishi.proto.login.SimpleUserInfo', 'repeated'))
  .add(new protobuf.Field('userName', 2, 'string'))
  .add(new protobuf.Field('site', 3, 'string'))
  .add(new protobuf.Field('loginState', 4, 'int32'))
);

// playerLoginReq (Prepare Login)
loginNs.add(new protobuf.Type('playerLoginReq')
  .add(new protobuf.Field('userName', 1, 'string'))
  .add(new protobuf.Field('loginKey', 2, 'string'))
  .add(new protobuf.Field('password', 3, 'string'))
  .add(new protobuf.Field('site', 4, 'string'))
  .add(new protobuf.Field('userId', 5, 'int32'))
);

// playerLoginRsp
loginNs.add(new protobuf.Type('playerLoginRsp')
  .add(new protobuf.Field('userName', 1, 'string'))
  .add(new protobuf.Field('site', 2, 'string'))
  .add(new protobuf.Field('result', 3, 'bool'))
  .add(new protobuf.Field('message', 4, 'string'))
  .add(new protobuf.Field('userId', 5, 'int32'))
  .add(new protobuf.Field('gateIp', 6, 'string'))
  .add(new protobuf.Field('port', 7, 'int32'))
  .add(new protobuf.Field('todayFirstLogin', 8, 'bool'))
);

// registerRoleReq
loginNs.add(new protobuf.Type('registerRoleReq')
  .add(new protobuf.Field('userId', 1, 'int32'))
  .add(new protobuf.Field('userName', 2, 'string'))
  .add(new protobuf.Field('nickName', 3, 'string'))
  .add(new protobuf.Field('sex', 4, 'int32'))
  .add(new protobuf.Field('camp', 5, 'int32'))
  .add(new protobuf.Field('icon', 6, 'int32'))
  .add(new protobuf.Field('site', 7, 'string'))
  .add(new protobuf.Field('md5Password', 8, 'string'))
  .add(new protobuf.Field('inviterSite', 9, 'string'))
  .add(new protobuf.Field('inviterUserName', 10, 'string'))
);

// registerRoleRsp
loginNs.add(new protobuf.Type('registerRoleRsp')
  .add(new protobuf.Field('userName', 1, 'string'))
  .add(new protobuf.Field('site', 2, 'string'))
  .add(new protobuf.Field('value', 3, 'bool'))
  .add(new protobuf.Field('type', 4, 'int32'))
  .add(new protobuf.Field('message', 5, 'string'))
  .add(new protobuf.Field('gateIp', 6, 'string'))
  .add(new protobuf.Field('port', 7, 'int32'))
  .add(new protobuf.Field('userId', 8, 'int32'))
);

// SynchronizedTimeReq
loginNs.add(new protobuf.Type('SynchronizedTimeReq'));

// ═══════════════════════════════════════════
// Namespace: com.road.yishi.proto.player
// ═══════════════════════════════════════════
const playerNs = root.define('com.road.yishi.proto.player');

// LoginReqMsg (Gateway Login)
playerNs.add(new protobuf.Type('LoginReqMsg')
  .add(new protobuf.Field('playerId', 1, 'int32'))
  .add(new protobuf.Field('key', 2, 'string'))
  .add(new protobuf.Field('ekeys', 3, 'string', 'repeated'))
);

// SynchronizedTimeMsg
playerNs.add(new protobuf.Type('SynchronizedTimeMsg')
  .add(new protobuf.Field('sysCurtime', 1, 'string'))
  .add(new protobuf.Field('sysMillisecond', 2, 'int64'))
);

// PlayerMsg (full player data sent after gateway login)
playerNs.add(new protobuf.Type('PlayerMsg')
  .add(new protobuf.Field('playerId', 1, 'int32'))
  .add(new protobuf.Field('nickName', 2, 'string'))
  .add(new protobuf.Field('sex', 3, 'int32'))
  .add(new protobuf.Field('pic', 4, 'int32'))
  .add(new protobuf.Field('camp', 5, 'int32'))
  .add(new protobuf.Field('point', 6, 'int32'))
  .add(new protobuf.Field('giftToken', 7, 'int32'))
  .add(new protobuf.Field('state', 8, 'int32'))
  .add(new protobuf.Field('lastAward', 9, 'string'))
  .add(new protobuf.Field('questSiteLen', 10, 'int32'))
  .add(new protobuf.Field('consortiaId', 11, 'int32'))
  .add(new protobuf.Field('consortiaName', 12, 'string'))
  .add(new protobuf.Field('claimId', 13, 'int32'))
  .add(new protobuf.Field('claimName', 14, 'string'))
  .add(new protobuf.Field('grades', 15, 'int32'))
  .add(new protobuf.Field('gp', 16, 'int32'))
  .add(new protobuf.Field('repute', 17, 'int32'))
  .add(new protobuf.Field('consortiaOffer', 18, 'int32'))
  .add(new protobuf.Field('strategy', 19, 'int32'))
  .add(new protobuf.Field('weary', 20, 'int32'))
  .add(new protobuf.Field('attackLeftCount', 21, 'int32'))
  .add(new protobuf.Field('noviceProcess', 22, 'int32'))
  .add(new protobuf.Field('fightingCapacity', 23, 'int32'))
  .add(new protobuf.Field('gradeProcess', 24, 'string'))
  .add(new protobuf.Field('bagCount', 25, 'int32'))
  .add(new protobuf.Field('matchWin', 26, 'int32'))
  .add(new protobuf.Field('matchFailed', 27, 'int32'))
  .add(new protobuf.Field('right', 28, 'int32'))
  .add(new protobuf.Field('job', 29, 'int32'))
  .add(new protobuf.Field('starCount', 30, 'int32'))
  .add(new protobuf.Field('signDate', 31, 'string'))
  .add(new protobuf.Field('signTimes', 32, 'int32'))
  .add(new protobuf.Field('balens', 33, 'int32'))
  .add(new protobuf.Field('boundBalens', 34, 'int32'))
  .add(new protobuf.Field('gold', 35, 'int32'))
  .add(new protobuf.Field('boundGold', 36, 'int32'))
  .add(new protobuf.Field('vipLevel', 37, 'int32'))
  .add(new protobuf.Field('hp', 38, 'int32'))
  .add(new protobuf.Field('maxHp', 39, 'int32'))
  .add(new protobuf.Field('attack', 40, 'int32'))
  .add(new protobuf.Field('defence', 41, 'int32'))
  .add(new protobuf.Field('magicAttack', 42, 'int32'))
  .add(new protobuf.Field('magicDefence', 43, 'int32'))
);

// ─── Helper: get a type by full name ─────
function getType(fullName) {
  return root.lookupType(fullName);
}

// ─── Shortcut encode/decode ──────────────
function encode(typeName, payload) {
  const T = getType(typeName);
  const msg = T.create(payload);
  return Buffer.from(T.encode(msg).finish());
}

function decode(typeName, buffer) {
  const T = getType(typeName);
  return T.decode(buffer);
}

module.exports = { root, getType, encode, decode };
