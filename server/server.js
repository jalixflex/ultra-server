/**
 * Wartune Ultra — Main Server Entry Point
 *
 * Single-port server: HTTP + WebSocket on the same port (default 8899).
 * HTTP handles: API (register/login), site info, static files
 * WebSocket handles: game protocol (binary packets, protobuf, encrypted)
 */

'use strict';

const http = require('http');
const { WebSocketServer } = require('ws');
const db = require('./db');
const { createHttpHandler } = require('./http-api');
const { readFrames } = require('./packet');
const { handlePacket } = require('./handlers');

// Load game protobuf definitions (extends proto.js)
require('./proto-game');

// Load game systems
const inventory = require('./systems/inventory');
const guild = require('./systems/guild');
const campaign = require('./systems/campaign');
const mail = require('./systems/mail');
const friend = require('./systems/friend');
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
const featureUnlock = require('./systems/feature-unlock');
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
const jewelHunt = require('./systems/jewel-hunt');
const knighthood = require('./systems/knighthood');
const cloudAdventure = require('./systems/cloud-adventure');
const purgatoryMaze = require('./systems/purgatory-maze');
const archaeology = require('./systems/archaeology');
const crossServer = require('./systems/cross-server');
const tutorial = require('./systems/tutorial');
const giftCode = require('./systems/gift-code');
const titles = require('./systems/titles');
const gm = require('./systems/gm');
const hotEvents = require('./systems/hot-events');

// ─── Configuration ───────────────────────
const PORT = parseInt(process.env.PORT, 10) || 8899;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_HOST = process.env.PUBLIC_HOST || '127.0.0.1';
const WEBROOT = process.env.WEBROOT || undefined;

const config = {
  port: PORT,
  host: PUBLIC_HOST,
  webroot: WEBROOT,
};

// ─── Initialize Database ─────────────────
console.log('[DB] Initializing database...');
db.init();

// Initialize game system tables
inventory.initDB();
guild.initDB();
campaign.initDB();
mail.initDB();
friend.initDB();
astral.initDB();
sylph.initDB();
mount.initDB();
troops.initDB();
arena.initDB();
farm.initDB();
academy.initDB();
skills.initDB();
wings.initDB();
quest.initDB();
city.initDB();
bounty.initDB();
devotion.initDB();
dailyLogin.initDB();
worldBoss.initDB();
catacombs.initDB();
party.initDB();
battleground.initDB();
clothing.initDB();
classAdvance.initDB();
buff.initDB();
worldMap.initDB();
talent.initDB();
rune.initDB();
eudaemon.initDB();
honor.initDB();
dragonSoul.initDB();
holyForge.initDB();
guildExtras.initDB();
spire.initDB();
dimensionalWar.initDB();
circuitQuest.initDB();
gem.initDB();
resistance.initDB();
henna.initDB();
achievement.initDB();
events.initDB();
gacha.initDB();
ranking.initDB();
social.initDB();
jewelHunt.initDB();
knighthood.initDB();
cloudAdventure.initDB();
purgatoryMaze.initDB();
archaeology.initDB();
crossServer.initDB();
tutorial.initDB();
giftCode.initDB();
titles.initDB();
gm.initDB();
hotEvents.initDB();
console.log('[DB] Database ready (62 systems).');

// ─── Create HTTP Server ──────────────────
const httpHandler = createHttpHandler(config);
const server = http.createServer(httpHandler);

// ─── Create WebSocket Server ─────────────
const wss = new WebSocketServer({ server, path: '/ws' });
global.__wss = wss;

// Track all connected clients (shared with handlers and systems)
const clients = new Map(); // charId → ws
// Make clients accessible to handlers
global.__clients = clients;

wss.on('connection', (ws, req) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  console.log(`[WS] New connection from ${ip}`);

  ws.session = { ip };
  ws.buffer = Buffer.alloc(0);
  gm.registerClient(ws);

  ws.on('message', (data) => {
    // Accumulate data into buffer
    const incoming = Buffer.isBuffer(data) ? data : Buffer.from(data);
    ws.buffer = Buffer.concat([ws.buffer, incoming]);

    // Try to extract complete frames
    const { packets, remainder } = readFrames(ws.buffer);
    ws.buffer = remainder;

    for (const pkt of packets) {
      try {
        handlePacket(ws, pkt, config);
      } catch (err) {
        console.error(`[WS] Error handling packet 0x${pkt.cmdId.toString(16)}:`, err);
      }
    }

    // Track connected player
    if (ws.session && ws.session.charId && !clients.has(ws.session.charId)) {
      clients.set(ws.session.charId, ws);
    }
  });

  ws.on('close', () => {
    console.log(`[WS] Disconnected: ${ws.session?.username || ip}`);
    gm.removeClient(ws);
    if (ws.session && ws.session.charId) {
      clients.delete(ws.session.charId);
      try {
        db.setCharOnline(ws.session.charId, false);
      } catch (e) { /* ignore */ }
    }
  });

  ws.on('error', (err) => {
    console.error(`[WS] Error from ${ws.session?.username || ip}:`, err.message);
  });
});

// ─── Start Server ────────────────────────
server.listen(PORT, HOST, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║       Wartune Ultra Server v5.0.0            ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  HTTP + WS : ${HOST}:${PORT}                    ║`);
  console.log(`║  Public    : ${PUBLIC_HOST}:${PORT}              ║`);
  console.log('║  Database  : SQLite (data/wartune.db)        ║');
  console.log('║  62 Systems Loaded — Complete Edition        ║');
  console.log('║  Core: Login, Chat, Battle, Inventory        ║');
  console.log('║  Social: Guild, Mail, Friends, Party, Social ║');
  console.log('║  Quest: Story, Bounty, Devotion, Circuit     ║');
  console.log('║  World: Campaign, World Boss, Catacombs, Map ║');
  console.log('║  PvP: Arena, BG, Honor, Ranking, Cross-Srv   ║');
  console.log('║  Progress: Skills, Wings, Academy, Forge     ║');
  console.log('║  Companion: Astral, Sylph, Mount, Troops     ║');
  console.log('║  Endgame: Talent, Rune, Dragon Soul, Spire   ║');
  console.log('║  Eudaemon, Holy Forge, Dim War, Achievement  ║');
  console.log('║  Gem, Resistance, Henna, Events, Gacha       ║');
  console.log('║  Economy: Shop, VIP, Farm, City, Clothing    ║');
  console.log('║  Extras: Guild War/Altar/Beast, Jewel Hunt   ║');
  console.log('║  Cloud Adventure, Purgatory Maze, Archaeology║');
  console.log('║  Knighthood, Tutorial, Class Advance         ║');
  console.log('║  Daily Login, Feature Unlock, Buff           ║');
  console.log('║  GM Tools, Hot Events, Gift Codes, Titles    ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
});

// ─── Graceful Shutdown ───────────────────
process.on('SIGINT', () => {
  console.log('\n[SERVER] Shutting down...');
  try {
    const dbInst = db.getDatabase();
    dbInst.prepare('UPDATE characters SET is_online = 0').run();
  } catch (e) { /* ignore */ }

  wss.close(() => {
    server.close(() => {
      console.log('[SERVER] Goodbye.');
      process.exit(0);
    });
  });
});
