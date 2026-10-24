/**
 * Wartune Ultra — Binary Packet Builder & Parser
 *
 * Header (20 bytes):
 *   0-1   uint16 BE  Magic: 0x71AB
 *   2-3   uint16 BE  Total length (header + body)
 *   4-5   uint16 BE  Checksum
 *   6-7   uint16 BE  Command ID (opcode)
 *   8-11  int32  BE  Client ID (character ID)
 *   12-15 int32  BE  Ext1
 *   16-19 int32  BE  Ext2
 *   20+   bytes      Protobuf body
 */

'use strict';

const { encrypt, decrypt } = require('./crypto');

const MAGIC = 0x71AB;
const HEADER_SIZE = 20;
const MAX_PACKET = 65535;

/**
 * Calculate checksum for a raw (unencrypted) packet buffer.
 */
function calcChecksum(buf) {
  let sum = 119;
  for (let i = 6; i < buf.length; i++) {
    sum += buf[i];
  }
  return sum & 0x7EFF;
}

/**
 * Build a packet buffer ready to send (encrypted).
 * @param {number} cmdId - Command opcode
 * @param {Buffer|null} body - Protobuf-encoded body (or null)
 * @param {number} clientId - Character/player ID
 * @param {number} ext1
 * @param {number} ext2
 * @returns {Buffer} Encrypted packet
 */
function buildPacket(cmdId, body, clientId = 0, ext1 = 0, ext2 = 0) {
  const bodyLen = body ? body.length : 0;
  const totalLen = HEADER_SIZE + bodyLen;
  const buf = Buffer.alloc(totalLen);

  // Write header
  buf.writeUInt16BE(MAGIC, 0);
  buf.writeUInt16BE(totalLen, 2);
  // checksum placeholder at 4
  buf.writeUInt16BE(cmdId, 6);
  buf.writeInt32BE(clientId, 8);
  buf.writeInt32BE(ext1, 12);
  buf.writeInt32BE(ext2, 16);

  // Write body
  if (body && bodyLen > 0) {
    body.copy(buf, HEADER_SIZE);
  }

  // Compute and write checksum
  const checksum = calcChecksum(buf);
  buf.writeUInt16BE(checksum, 4);

  // Encrypt entire packet
  return encrypt(buf);
}

/**
 * Frame reader: extracts complete packets from a cumulative buffer.
 * Returns { packets: [{ cmdId, clientId, ext1, ext2, body }], remainder: Buffer }
 */
function readFrames(buffer) {
  const packets = [];
  let offset = 0;

  while (offset + HEADER_SIZE <= buffer.length) {
    // We need to decrypt at least the first 4 bytes to read magic + length
    const peekBuf = decrypt(buffer.slice(offset, offset + Math.min(HEADER_SIZE, buffer.length - offset)));
    const magic = peekBuf.readUInt16BE(0);
    const totalLen = peekBuf.readUInt16BE(2);

    if (magic !== MAGIC) {
      // Bad magic — skip one byte and retry
      offset++;
      continue;
    }

    if (totalLen < HEADER_SIZE || totalLen > MAX_PACKET) {
      offset++;
      continue;
    }

    if (offset + totalLen > buffer.length) {
      // Incomplete packet — wait for more data
      break;
    }

    // Decrypt full packet
    const raw = decrypt(buffer.slice(offset, offset + totalLen));
    const cmdId = raw.readUInt16BE(6);
    const clientId = raw.readInt32BE(8);
    const ext1 = raw.readInt32BE(12);
    const ext2 = raw.readInt32BE(16);
    const body = totalLen > HEADER_SIZE ? raw.slice(HEADER_SIZE) : null;

    packets.push({ cmdId, clientId, ext1, ext2, body });
    offset += totalLen;
  }

  return { packets, remainder: buffer.slice(offset) };
}

module.exports = { buildPacket, readFrames, HEADER_SIZE, MAGIC, calcChecksum };
