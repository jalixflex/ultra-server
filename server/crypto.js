/**
 * Wartune Ultra — Packet Encryption/Decryption
 * CFB-style XOR chain cipher. Key resets per packet.
 */

'use strict';

const DEFAULT_KEY = [0xAE, 0xBF, 0x56, 0x78, 0xAB, 0xCD, 0xEF, 0xF1];

function freshKey() {
  return Uint8Array.from(DEFAULT_KEY);
}

/**
 * Encrypt buffer for sending to client (Server → Client).
 */
function encrypt(buf) {
  const key = freshKey();
  const out = Buffer.alloc(buf.length);
  out[0] = (buf[0] ^ key[0]) & 0xFF;
  for (let i = 1; i < buf.length; i++) {
    key[i % 8] = ((key[i % 8] + out[i - 1]) ^ i) & 0xFF;
    out[i] = ((buf[i] ^ key[i % 8]) + out[i - 1]) & 0xFF;
  }
  return out;
}

/**
 * Decrypt buffer received from client (Client → Server).
 */
function decrypt(buf) {
  const key = freshKey();
  const out = Buffer.alloc(buf.length);
  out[0] = (buf[0] ^ key[0]) & 0xFF;
  for (let i = 1; i < buf.length; i++) {
    key[i % 8] = ((key[i % 8] + buf[i - 1]) ^ i) & 0xFF;
    out[i] = (((buf[i] - buf[i - 1]) & 0xFF) ^ key[i % 8]) & 0xFF;
  }
  return out;
}

module.exports = { encrypt, decrypt, DEFAULT_KEY, freshKey };
