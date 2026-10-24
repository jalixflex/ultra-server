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

function createHttpHandler(config) {
  const webrootPath = config.webroot || path.join(__dirname, '..', 'webroot_web');

  return async (req, res) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
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

        db.createAccount(username, password);
        return jsonResponse(res, 200, { ok: true });
      }

      // ─── API: Login ─────────────────────
      if (pathname === '/api/login' && req.method === 'POST') {
        const raw = await readBody(req);
        const { username, password } = JSON.parse(raw.toString());

        const account = db.getAccount(username);
        if (!account || account.password !== password) {
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
