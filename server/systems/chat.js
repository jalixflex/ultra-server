/**
 * Wartune Ultra — Chat System
 * World chat, guild chat, private messages, system announcements
 */

'use strict';

const { encode, decode } = require('../proto');
const { buildPacket } = require('../packet');
const db = require('../db');

// Chat channel types
const CHANNEL = {
  WORLD:   1,  // Dünya sohbeti
  GUILD:   2,  // Lonca sohbeti
  PRIVATE: 3,  // Özel mesaj
  SYSTEM:  4,  // Sistem duyurusu
  CAMP:    5,  // Kamp sohbeti
  TEAM:    6,  // Takım sohbeti
};

// Opcode'lar (tahmini — client'tan doğrulanmalı)
const OPCODES = {
  C_CHAT_SEND:     0x1388,  // 5000 — Client → Server: mesaj gönder
  S_CHAT_MSG:      0x1004,  // 4100 — Server → Client: mesaj ilet
  S_SYSTEM_NOTICE: 0x1005,  // 4101 — Server → Client: sistem bildirimi
};

function init(protoRoot) {
  // Chat mesaj tanımları proto.js'e eklenecek
}

/**
 * Handle incoming chat message from client
 */
function handleChatSend(ws, body, clients) {
  let req;
  try {
    req = decode('com.road.yishi.proto.chat.ChatSendReq', body);
  } catch (e) {
    // Fallback: try manual parse
    req = { channel: 1, content: '', targetId: 0, targetName: '' };
  }

  const session = ws.session;
  if (!session || !session.charId) return;

  const char = db.getCharacterById(session.charId);
  if (!char) return;

  const msg = {
    senderId: char.id,
    senderName: char.nick_name,
    senderLevel: char.grade,
    senderVip: char.vip_level,
    senderCamp: char.camp,
    channel: req.channel || CHANNEL.WORLD,
    content: sanitize(req.content || ''),
    timestamp: Date.now(),
    targetId: req.targetId || 0,
    targetName: req.targetName || '',
  };

  if (!msg.content) return;

  switch (msg.channel) {
    case CHANNEL.WORLD:
      broadcastChat(msg, clients);
      break;
    case CHANNEL.PRIVATE:
      sendPrivateChat(msg, clients);
      break;
    case CHANNEL.GUILD:
      broadcastGuildChat(msg, char, clients);
      break;
    default:
      broadcastChat(msg, clients);
  }
}

/**
 * Broadcast to all connected players
 */
function broadcastChat(msg, clients) {
  const body = encodeChatMsg(msg);
  const pkt = buildPacket(OPCODES.S_CHAT_MSG, body);
  for (const [, ws] of clients) {
    if (ws.readyState === 1) ws.send(pkt);
  }
}

/**
 * Send private message to target player
 */
function sendPrivateChat(msg, clients) {
  const body = encodeChatMsg(msg);
  const pkt = buildPacket(OPCODES.S_CHAT_MSG, body);

  // Send to target
  const targetWs = clients.get(msg.targetId);
  if (targetWs && targetWs.readyState === 1) {
    targetWs.send(pkt);
  }

  // Echo back to sender
  const senderWs = clients.get(msg.senderId);
  if (senderWs && senderWs.readyState === 1) {
    senderWs.send(pkt);
  }
}

/**
 * Broadcast to guild members only
 */
function broadcastGuildChat(msg, senderChar, clients) {
  if (!senderChar.consortia_id) return;

  const body = encodeChatMsg(msg);
  const pkt = buildPacket(OPCODES.S_CHAT_MSG, body);

  for (const [charId, ws] of clients) {
    const c = db.getCharacterById(charId);
    if (c && c.consortia_id === senderChar.consortia_id && ws.readyState === 1) {
      ws.send(pkt);
    }
  }
}

/**
 * Send system announcement to all players
 */
function sendSystemNotice(text, clients) {
  const msg = {
    senderId: 0,
    senderName: 'System',
    senderLevel: 0,
    senderVip: 0,
    senderCamp: 0,
    channel: CHANNEL.SYSTEM,
    content: text,
    timestamp: Date.now(),
    targetId: 0,
    targetName: '',
  };
  const body = encodeChatMsg(msg);
  const pkt = buildPacket(OPCODES.S_SYSTEM_NOTICE, body);
  for (const [, ws] of clients) {
    if (ws.readyState === 1) ws.send(pkt);
  }
}

function encodeChatMsg(msg) {
  try {
    return encode('com.road.yishi.proto.chat.ChatMsg', msg);
  } catch {
    // Fallback manual encode
    return encode('com.road.yishi.proto.chat.ChatMsg', {
      senderId: msg.senderId,
      senderName: msg.senderName,
      content: msg.content,
      channel: msg.channel,
      timestamp: msg.timestamp,
    });
  }
}

function sanitize(text) {
  // Basic sanitization — strip control chars, limit length
  return text.replace(/[\x00-\x1F]/g, '').slice(0, 500);
}

module.exports = {
  CHANNEL, OPCODES,
  handleChatSend, broadcastChat, sendPrivateChat,
  broadcastGuildChat, sendSystemNotice,
};
