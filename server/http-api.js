/**
 * Wartune Ultra — HTTP API & Static File Server
 * Handles registration, login, site info, and serves client files.
 */

'use strict';

const http = require('http');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const crypto = require('crypto');
const db = require('./db');

// MIME types for static file serving
const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.css':  'text/css',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.wav':  'audio/wav',
  '.mp3':  'audio/mpeg',
  '.wasm': 'application/wasm',
  '.bin':  'application/octet-stream',
  '.zip':  'application/zip',
  '.xml':  'application/xml',
  '.txt':  'text/plain',
  '.ktx':  'image/ktx',
};

function randomKey() {
  return crypto.randomBytes(8).toString('hex');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored.includes(':')) return password === stored; // legacy plaintext
  const [salt, hash] = stored.split(':');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'));
}


function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function jsonResponse(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

// ─── GM Authentication ────────────────────
const GM_TOKEN = process.env.GM_TOKEN || 'wartune-admin-2024';

function isGM(req) {
  const auth = req.headers['authorization'] || '';
  return auth === `Bearer ${GM_TOKEN}`;
}

function createHttpHandler(config) {
  const webrootPath = config.webroot || path.join(__dirname, '..', 'webroot_web');

  return async (req, res) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      });
      return res.end();
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    try {
      // ─── API: Register ──────────────────
      if (pathname === '/api/register' && req.method === 'POST') {
        const raw = await readBody(req);
        const { username, password } = JSON.parse(raw.toString());

        if (!username || username.length < 3 || !/^[a-zA-Z0-9_]+$/.test(username)) {
          return jsonResponse(res, 400, { ok: false, error: 'Kullanici adi en az 3 karakter, sadece harf/rakam/_ olmali' });
        }
        if (!password || password.length < 4) {
          return jsonResponse(res, 400, { ok: false, error: 'Sifre en az 4 karakter olmali' });
        }
        if (db.getAccount(username)) {
          return jsonResponse(res, 400, { ok: false, error: 'Bu kullanici adi zaten alinmis' });
        }

        db.createAccount(username, hashPassword(password));
        return jsonResponse(res, 200, { ok: true });
      }

      // ─── API: Login ─────────────────────
      if (pathname === '/api/login' && req.method === 'POST') {
        const raw = await readBody(req);
        const { username, password } = JSON.parse(raw.toString());

        const account = db.getAccount(username);
        if (!account || !verifyPassword(password, account.password)) {
          return jsonResponse(res, 401, { ok: false, error: 'Kullanici adi veya sifre hatali' });
        }
        if (account.banned === 1) {
          return jsonResponse(res, 403, { ok: false, error: 'Hesabiniz yasaklanmis' });
        }

        const key = randomKey();
        const ip = req.socket.remoteAddress || '';
        db.createLoginSession(account.id, key, ip);
        db.updateLastLogin(account.id);

        return jsonResponse(res, 200, { ok: true, key, site: 's1' });
      }

      // ─── Site Info (server list) ────────
      if (pathname === '/clientsiteinfoservlet' || pathname === '/order/clientsiteinfoservlet') {
        const siteInfo = {
          ret: 0,
          msg: 'ok',
          isWhiteUser: true,
          platformId: '1',
          platformName: 'local',
          curTime: Date.now(),
          groups: [{
            groupId: 1,
            groupName: 'Wartune Ultra TR',
            order: 1,
            sites: [{
              siteId: 1,
              showName: 'S1 - Wartune Ultra',
              type: 1,
              siteName: 's1',
              loginUrl: `ws://${config.host}:${config.port}/ws`,
              webUrl: `http://${config.host}:${config.port}`,
              mainSite: 's1',
              isOpen: true,
              isRepair: false,
              order: 1,
              openTime: 0,
            }],
          }],
        };

        const jsonStr = JSON.stringify(siteInfo);
        const deflated = zlib.deflateSync(Buffer.from(jsonStr));
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Access-Control-Allow-Origin': '*',
        });
        return res.end(deflated);
      }

      // ─── Order stub ─────────────────────
      if (pathname.startsWith('/order/')) {
        return jsonResponse(res, 200, { ret: 0 });
      }

      // ─── Client log ─────────────────────
      if (pathname === '/clientlog') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end('ok');
      }

      // ─── XML stubs (misc POST) ──────────
      if (req.method === 'POST' && !pathname.startsWith('/api/')) {
        res.writeHead(200, { 'Content-Type': 'application/xml' });
        return res.end('<Result><value>true</value></Result>');
      }

      // ─── GM: Announce ─────────────────────
      if (pathname === '/api/gm/announce' && req.method === 'POST') {
        if (!isGM(req)) return jsonResponse(res, 403, { error: 'Unauthorized' });
        const { message } = JSON.parse((await readBody(req)).toString());
        const wss = global.__wss;
        let sent = 0;
        if (wss) {
          const chat = require('./systems/chat');
          for (const client of wss.clients) {
            if (client.readyState === 1) {
              try { chat.sendSystemNotice(client, message); sent++; } catch (e) { /* skip */ }
            }
          }
        }
        return jsonResponse(res, 200, { ok: true, sent });
      }

      // ─── GM: Give Item ──────────────────────
      if (pathname === '/api/gm/give-item' && req.method === 'POST') {
        if (!isGM(req)) return jsonResponse(res, 403, { error: 'Unauthorized' });
        const { charId, itemId, count, quality } = JSON.parse((await readBody(req)).toString());
        const inventory = require('./systems/inventory');
        const item = inventory.addItem(charId, itemId, count || 1, quality || 0);
        return jsonResponse(res, 200, { ok: !!item, item });
      }

      // ─── GM: Give Currency ──────────────────
      if (pathname === '/api/gm/give-currency' && req.method === 'POST') {
        if (!isGM(req)) return jsonResponse(res, 403, { error: 'Unauthorized' });
        const { charId, type, amount } = JSON.parse((await readBody(req)).toString());
        const validTypes = ['gold', 'balens', 'bound_balens'];
        if (!validTypes.includes(type)) return jsonResponse(res, 400, { ok: false, error: 'Invalid type' });
        db.getDatabase().prepare(`UPDATE characters SET ${type} = ${type} + ? WHERE id = ?`).run(amount, charId);
        return jsonResponse(res, 200, { ok: true });
      }

      // ─── GM: Ban Account ───────────────────
      if (pathname === '/api/gm/ban' && req.method === 'POST') {
        if (!isGM(req)) return jsonResponse(res, 403, { error: 'Unauthorized' });
        const { accountId, reason } = JSON.parse((await readBody(req)).toString());
        db.banAccount(accountId, reason || 'GM ban');
        return jsonResponse(res, 200, { ok: true });
      }

      // ─── GM: Kick Player ───────────────────
      if (pathname === '/api/gm/kick' && req.method === 'POST') {
        if (!isGM(req)) return jsonResponse(res, 403, { error: 'Unauthorized' });
        const { charId } = JSON.parse((await readBody(req)).toString());
        const clients = global.__clients;
        if (clients && clients.has(charId)) {
          clients.get(charId).close();
          return jsonResponse(res, 200, { ok: true, kicked: true });
        }
        return jsonResponse(res, 200, { ok: true, kicked: false, msg: 'Player not online' });
      }

      // ─── GM: Online Players ─────────────────
      if (pathname === '/api/gm/online' && req.method === 'GET') {
        if (!isGM(req)) return jsonResponse(res, 403, { error: 'Unauthorized' });
        const clients = global.__clients;
        const players = [];
        if (clients) {
          for (const [cid, client] of clients) {
            const char = db.getCharacterById(cid);
            if (char) players.push({ charId: char.id, name: char.nick_name, level: char.grade, fighting: char.fighting });
          }
        }
        return jsonResponse(res, 200, { ok: true, count: players.length, players });
      }

      // ─── GM: Set Level ──────────────────────
      if (pathname === '/api/gm/set-level' && req.method === 'POST') {
        if (!isGM(req)) return jsonResponse(res, 403, { error: 'Unauthorized' });
        const { charId, level } = JSON.parse((await readBody(req)).toString());
        db.updateCharacter(charId, { grade: level, exp: 0 });
        require('./systems/inventory').recalcStats(charId);
        return jsonResponse(res, 200, { ok: true });
      }

      // ─── GM: Player Info ────────────────────
      if (pathname.startsWith('/api/gm/player/') && req.method === 'GET') {
        if (!isGM(req)) return jsonResponse(res, 403, { error: 'Unauthorized' });
        const cid = parseInt(pathname.split('/').pop());
        const char = db.getCharacterById(cid);
        if (!char) return jsonResponse(res, 404, { ok: false, error: 'Not found' });
        return jsonResponse(res, 200, { ok: true, player: char });
      }

      // ─── GM: Create Gift Code ───────────────
      if (pathname === '/api/gm/create-gift-code' && req.method === 'POST') {
        if (!isGM(req)) return jsonResponse(res, 403, { error: 'Unauthorized' });
        const { code, rewards, maxUses, expiresAt } = JSON.parse((await readBody(req)).toString());
        const giftCode = require('./systems/gift-code');
        const result = giftCode.createCode(code, rewards, maxUses, expiresAt);
        return jsonResponse(res, 200, result);
      }

      // ─── GM: List Gift Codes ────────────────
      if (pathname === '/api/gm/gift-codes' && req.method === 'GET') {
        if (!isGM(req)) return jsonResponse(res, 403, { error: 'Unauthorized' });
        const giftCode = require('./systems/gift-code');
        return jsonResponse(res, 200, { ok: true, codes: giftCode.listCodes() });
      }

      // ─── GM: Create Event ───────────────────
      if (pathname === '/api/gm/create-event' && req.method === 'POST') {
        if (!isGM(req)) return jsonResponse(res, 403, { error: 'Unauthorized' });
        const { templateId, duration } = JSON.parse((await readBody(req)).toString());
        const evts = require('./systems/events');
        const eventId = evts.createEvent(templateId, duration);
        if (!eventId) return jsonResponse(res, 400, { ok: false, error: 'Invalid template' });
        return jsonResponse(res, 200, { ok: true, eventId });
      }

      // ─── GM: List Events ───────────────────
      if (pathname === '/api/gm/events' && req.method === 'GET') {
        if (!isGM(req)) return jsonResponse(res, 403, { error: 'Unauthorized' });
        const evts = require('./systems/events');
        return jsonResponse(res, 200, { ok: true, ...evts.getActiveEvents(), templates: evts.EVENT_TEMPLATES });
      }

      // ─── Static file serving ────────────
      let filePath = pathname === '/' ? '/index.html' : pathname;
      filePath = path.join(webrootPath, filePath);
      filePath = path.resolve(filePath);

      // Security: prevent directory traversal
      if (!filePath.startsWith(path.resolve(webrootPath))) {
        res.writeHead(403);
        return res.end('Forbidden');
      }

      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const mime = MIME[ext] || 'application/octet-stream';
        res.writeHead(200, {
          'Content-Type': mime,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=3600',
        });
        fs.createReadStream(filePath).pipe(res);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }

    } catch (err) {
      console.error('[HTTP] Error:', err);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
  };
}

module.exports = { createHttpHandler };
