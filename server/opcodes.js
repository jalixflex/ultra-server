/**
 * Wartune Ultra — Opcode Definitions
 * Command IDs for Client↔Server communication.
 */

'use strict';

// ═══════════════════════════════════════════
// Client → Server (Login Flow)
// ═══════════════════════════════════════════
const C = {
  L_CREATE_LOGIN:      0x7006,  // 28678 — Hesap doğrulama (WS login)
  L_GET_PLAYER_LIST:   0x7000,  // 28672 — Karakter listesi iste
  L_PREPARE_LOGIN:     0x7002,  // 28674 — Oyuna giriş hazırlığı
  L_REGISTER_ROLE:     0x7004,  // 28676 — Karakter oluştur
  L_SYNC_TIME:         0x7008,  // 28680 — Zaman senkronizasyonu
  G_LOGIN_GATEWAY:     0x4E21,  // 20001 — Gateway login
};

// ═══════════════════════════════════════════
// Server → Client (Responses)
// ═══════════════════════════════════════════
const S = {
  U_L_CREATE_LOGIN_RSP:   0x0F06,  // 3846
  U_L_GET_PLAYER_LIST:    0x0F03,  // 3843
  U_L_PREPARE_LOGIN:      0x0F04,  // 3844
  U_L_REGISTER_ROLE_RSP:  0x0F05,  // 3845
  U_G_LOGIN_GATEWAY:      0x0F01,  // 3841
  U_C_PLAYER_INFO:        0x0003,  // 3
  U_C_SYNCHRONIZED_TIME:  0x108A,  // 4234
};

// Reverse lookup: number → name
const NAMES = {};
for (const [k, v] of Object.entries(C)) NAMES[v] = `C:${k}`;
for (const [k, v] of Object.entries(S)) NAMES[v] = `S:${k}`;

function cmdName(id) {
  return NAMES[id] || `0x${id.toString(16).toUpperCase()}`;
}

module.exports = { C, S, cmdName };
