/**
 * Wartune Ultra — Game Protobuf Definitions
 * Extends proto.js with game system message types
 */

'use strict';

const protobuf = require('protobufjs');
const { root } = require('./proto');

// ═══════════════════════════════════════════
// Chat messages
// ═══════════════════════════════════════════
const chatNs = root.define('com.road.yishi.proto.chat');

chatNs.add(new protobuf.Type('ChatSendReq')
  .add(new protobuf.Field('channel', 1, 'int32'))
  .add(new protobuf.Field('content', 2, 'string'))
  .add(new protobuf.Field('targetId', 3, 'int32'))
  .add(new protobuf.Field('targetName', 4, 'string'))
);

chatNs.add(new protobuf.Type('ChatMsg')
  .add(new protobuf.Field('senderId', 1, 'int32'))
  .add(new protobuf.Field('senderName', 2, 'string'))
  .add(new protobuf.Field('senderLevel', 3, 'int32'))
  .add(new protobuf.Field('senderVip', 4, 'int32'))
  .add(new protobuf.Field('senderCamp', 5, 'int32'))
  .add(new protobuf.Field('channel', 6, 'int32'))
  .add(new protobuf.Field('content', 7, 'string'))
  .add(new protobuf.Field('timestamp', 8, 'int64'))
  .add(new protobuf.Field('targetId', 9, 'int32'))
  .add(new protobuf.Field('targetName', 10, 'string'))
);

// ═══════════════════════════════════════════
// Battle messages
// ═══════════════════════════════════════════
const battleNs = root.define('com.road.yishi.proto.battle');

const MonsterInfo = new protobuf.Type('MonsterInfo')
  .add(new protobuf.Field('id', 1, 'int32'))
  .add(new protobuf.Field('templateId', 2, 'int32'))
  .add(new protobuf.Field('name', 3, 'string'))
  .add(new protobuf.Field('level', 4, 'int32'))
  .add(new protobuf.Field('hp', 5, 'int32'))
  .add(new protobuf.Field('maxHp', 6, 'int32'));
battleNs.add(MonsterInfo);

battleNs.add(new protobuf.Type('BattleInitMsg')
  .add(new protobuf.Field('battleId', 1, 'int32'))
  .add(new protobuf.Field('round', 2, 'int32'))
  .add(new protobuf.Field('maxRounds', 3, 'int32'))
  .add(new protobuf.Field('playerId', 4, 'int32'))
  .add(new protobuf.Field('playerHp', 5, 'int32'))
  .add(new protobuf.Field('playerMaxHp', 6, 'int32'))
  .add(new protobuf.Field('monsters', 7, 'com.road.yishi.proto.battle.MonsterInfo', 'repeated'))
);

const BattleAction = new protobuf.Type('BattleAction')
  .add(new protobuf.Field('attackerId', 1, 'int32'))
  .add(new protobuf.Field('attackerType', 2, 'int32'))
  .add(new protobuf.Field('targetId', 3, 'int32'))
  .add(new protobuf.Field('targetType', 4, 'int32'))
  .add(new protobuf.Field('damage', 5, 'int32'))
  .add(new protobuf.Field('skillId', 6, 'int32'))
  .add(new protobuf.Field('targetHp', 7, 'int32'))
  .add(new protobuf.Field('isCrit', 8, 'bool'));
battleNs.add(BattleAction);

battleNs.add(new protobuf.Type('BattleRoundMsg')
  .add(new protobuf.Field('battleId', 1, 'int32'))
  .add(new protobuf.Field('round', 2, 'int32'))
  .add(new protobuf.Field('actions', 3, 'com.road.yishi.proto.battle.BattleAction', 'repeated'))
  .add(new protobuf.Field('playerHp', 4, 'int32'))
);

const DropInfo = new protobuf.Type('DropInfo')
  .add(new protobuf.Field('itemId', 1, 'int32'))
  .add(new protobuf.Field('count', 2, 'int32'))
  .add(new protobuf.Field('quality', 3, 'int32'));
battleNs.add(DropInfo);

battleNs.add(new protobuf.Type('BattleEndMsg')
  .add(new protobuf.Field('battleId', 1, 'int32'))
  .add(new protobuf.Field('result', 2, 'int32'))
  .add(new protobuf.Field('expReward', 3, 'int32'))
  .add(new protobuf.Field('goldReward', 4, 'int32'))
  .add(new protobuf.Field('drops', 5, 'com.road.yishi.proto.battle.DropInfo', 'repeated'))
);

// ═══════════════════════════════════════════
// Item messages
// ═══════════════════════════════════════════
const itemNs = root.define('com.road.yishi.proto.item');

const ItemInfo = new protobuf.Type('ItemInfo')
  .add(new protobuf.Field('dbId', 1, 'int32'))
  .add(new protobuf.Field('itemId', 2, 'int32'))
  .add(new protobuf.Field('slot', 3, 'int32'))
  .add(new protobuf.Field('count', 4, 'int32'))
  .add(new protobuf.Field('enhance', 5, 'int32'))
  .add(new protobuf.Field('quality', 6, 'int32'))
  .add(new protobuf.Field('bound', 7, 'int32'))
  .add(new protobuf.Field('equipSlot', 8, 'int32'));
itemNs.add(ItemInfo);

itemNs.add(new protobuf.Type('BagInfoMsg')
  .add(new protobuf.Field('items', 1, 'com.road.yishi.proto.item.ItemInfo', 'repeated'))
);

// ═══════════════════════════════════════════
// Simple response wrapper (for generic ACK/NACK)
// ═══════════════════════════════════════════
const simpleNs = root.define('com.road.yishi.proto.simple');

simpleNs.add(new protobuf.Type('SimpleResultMsg')
  .add(new protobuf.Field('result', 1, 'int32'))
  .add(new protobuf.Field('message', 2, 'string'))
  .add(new protobuf.Field('value', 3, 'int32'))
);

module.exports = { root };
