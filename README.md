# Wartune Ultra — Game Server

Wartune Ultra HTML5 MMORPG oyununun tam sunucu implementasyonu. Node.js, WebSocket, SQLite ve Protobuf tabanlı. 14GB HTML5 client ile uyumlu çalışır.

**17,000+ satır kod | 58 oyun sistemi | 418 opcode | Tek port (8899)**

## Mimari

```
┌─────────────────────────────────────────────────┐
│              HTML5 Client (14GB)                 │
│         Laya Engine / Protobuf / CFB-XOR        │
└──────────────────┬──────────────────────────────┘
                   │ WebSocket (port 8899)
                   │ Binary packets: 20-byte header
┌──────────────────▼──────────────────────────────┐
│              Node.js Server                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ HTTP API │ │ WS Frame │ │  Packet Handler  │ │
│  │ register │ │ decrypt  │ │  2241 lines      │ │
│  │ login    │ │ parse    │ │  route → systems │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
│  ┌──────────────────────────────────────────────┐│
│  │           58 Game Systems (12400+ lines)     ││
│  │  battle, inventory, guild, quest, city ...   ││
│  └──────────────────────────────────────────────┘│
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │  SQLite  │ │ Protobuf │ │  CFB-XOR Crypto  │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
└─────────────────────────────────────────────────┘
```

## Kurulum

```bash
npm install
node server/server.js
```

Sunucu `0.0.0.0:8899` portunda başlar (HTTP + WebSocket aynı port).

## Ortam Değişkenleri

| Değişken | Varsayılan | Açıklama |
|----------|-----------|----------|
| `PORT` | `8899` | Sunucu portu |
| `HOST` | `0.0.0.0` | Bind adresi |
| `PUBLIC_HOST` | `127.0.0.1` | Client'a gönderilen public IP |
| `WEBROOT` | `webroot_web/` | Statik dosya dizini |

## Protokol

### Binary Packet Format
```
Offset  Size  Field
0       2     Magic (0x71AB)
2       2     Header length (20)
4       2     Command ID (opcode)
6       4     Client ID (charId)
10      4     Body length
14      4     Sequence number
18      2     Checksum
20      N     Body (protobuf or JSON)
```

### Şifreleme
CFB-XOR zincir: Varsayılan anahtar `[0xAE, 0xBF, 0x56, 0x78, 0xAB, 0xCD, 0xEF, 0xF1]`

### Login Akışı
```
Client                          Server
  ├── HTTP POST /api/register ───►  Hesap oluştur
  ├── HTTP POST /api/login ──────►  Login key al
  ├── WS Connect /ws ────────────►  WebSocket bağlantısı
  ├── U_L_PREPARE (0x0F02) ──────►  Login key gönder
  │◄── U_L_PREPARE_RSP (0x0FA1) ─  Gate bilgisi
  ├── G_LOGIN_GATEWAY (0x4E21) ──►  Oyuna giriş
  │◄── U_C_PLAYER_INFO (0x0FA5) ─  Karakter bilgisi
  │◄── S_BAG_INFO ────────────────  Çanta içeriği
  │◄── S_SKILL_LIST ──────────────  Beceriler
  │◄── S_CITY_INFO ───────────────  Şehir binaları
  │◄── S_QUEST_LIST ──────────────  Aktif görevler
  │◄── S_TUTORIAL_INFO ───────────  Tutorial durumu
  │◄── Feature unlock flags ──────  Açık özellikler
```

## 58 Oyun Sistemi

### Core
| Sistem | Dosya | Açıklama |
|--------|-------|----------|
| Login | `handlers.js` | Giriş, karakter seçim, gateway |
| Chat | `chat.js` | Dünya/özel/lonca sohbet |
| Battle | `battle.js` | Sıra tabanlı savaş, rage, skill, troop |
| Inventory | `inventory.js` | Çanta, equip, satış |
| Shop | `shop.js` | Mağaza kataloğu |
| VIP | `vip.js` | VIP seviyeleri ve bonusları |

### Karakter Gelişimi
| Sistem | Dosya | Açıklama |
|--------|-------|----------|
| Skills | `skills.js` | Sınıf becerileri, upgrade |
| Talent | `talent.js` | Yetenek ağacı (lv50+) |
| Rune | `rune.js` | Rün sistemi (lv35+) |
| Wings | `wings.js` | Kanat gelişimi |
| Academy | `academy.js` | Teknoloji araştırma |
| Forge | `forge.js` | Ekipman geliştirme/refine |
| Gem | `gem.js` | Mücevher soketi |
| Henna | `henna.js` | Henna boyası |
| Resistance | `resistance.js` | Direnç sistemi |
| Class Advance | `class-advance.js` | Sınıf ilerleme (lv80+) |
| Clothing | `clothing.js` | Kostüm sistemi |
| Buff | `buff.js` | Buff/debuff yönetimi |

### Sosyal
| Sistem | Dosya | Açıklama |
|--------|-------|----------|
| Guild | `guild.js` | Lonca oluştur/katıl/yönet |
| Guild Extras | `guild-extras.js` | Lonca savaşı/altar/canavar |
| Mail | `mail.js` | Posta sistemi |
| Friend | `friend.js` | Arkadaş listesi |
| Party | `party.js` | Grup/MPD (lv18+) |
| Social | `social.js` | Profil, hediye, blok |

### Görev & Dünya
| Sistem | Dosya | Açıklama |
|--------|-------|----------|
| Quest | `quest.js` | Ana görev zinciri (27 görev) |
| Bounty | `bounty.js` | Ödül panosu (lv17+) |
| Devotion | `devotion.js` | Günlük görevler |
| Circuit Quest | `circuit-quest.js` | Devre görevleri |
| Campaign | `campaign.js` | 6 bölüm, 23 stage |
| World Boss | `world-boss.js` | Dünya bossları (lv20+) |
| Catacombs | `catacombs.js` | Yeraltı mezarları (lv23+) |
| World Map | `world-map.js` | 7 harita bölgesi |
| Tutorial | `tutorial.js` | 9 adımlık yeni oyuncu rehberi |
| Feature Unlock | `feature-unlock.js` | Seviye bazlı özellik açma |

### PvP
| Sistem | Dosya | Açıklama |
|--------|-------|----------|
| Arena | `arena.js` | 1v1 arena (lv13+) |
| Battleground | `battleground.js` | Savaş alanı (lv30+) |
| Honor | `honor.js` | Şeref puanı |
| Ranking | `ranking.js` | Sıralama tabloları |
| Cross-Server | `cross-server.js` | Sunucular arası |

### Companion
| Sistem | Dosya | Açıklama |
|--------|-------|----------|
| Astral | `astral.js` | Astral yakalama (lv25+) |
| Sylph | `sylph.js` | Sylph sistemi |
| Mount | `mount.js` | Binek sistemi |
| Troops | `troops.js` | Birlik sistemi |
| Eudaemon | `eudaemon.js` | Eudaemon (lv70+) |
| Dragon Soul | `dragon-soul.js` | Ejder ruhu |

### Endgame & Dungeons
| Sistem | Dosya | Açıklama |
|--------|-------|----------|
| Spire | `spire.js` | Kule tırmanma (lv46+) |
| Dimensional War | `dimensional-war.js` | Boyut savaşı (lv55+) |
| Holy Forge | `holy-forge.js` | Kutsal dövme (lv80+) |
| Knighthood | `knighthood.js` | Şövalyelik (lv80+) |
| Cloud Adventure | `cloud-adventure.js` | Bulut macerası |
| Purgatory Maze | `purgatory-maze.js` | Araf labirenti |
| Archaeology | `archaeology.js` | Arkeoloji |

### Ekonomi & Etkinlik
| Sistem | Dosya | Açıklama |
|--------|-------|----------|
| City | `city.js` | 10 şehir binası |
| Farm | `farm.js` | Çiftlik (lv11+) |
| Daily Login | `daily-login.js` | Günlük giriş ödülleri |
| Events | `events.js` | Etkinlik sistemi |
| Gacha | `gacha.js` | Şans çarkı |
| Jewel Hunt | `jewel-hunt.js` | Mücevher avı |
| Achievement | `achievement.js` | Başarım sistemi |

## Savaş Sistemi

- **Sıra tabanlı**: Skill seç → Oyuncu → Birlik → Canavar → DoT
- **Rage**: Hit +10, Kritik +20, Kill +15, max 100
- **3 Sınıf**: Knight / Mage / Archer (6 skill)
- **7 Birlik Tipi**: Lancier, Gryphon, Angel, Templar, Warlock, Archer, Paladin
- **Buff/Debuff**: Stun, Shield, Dodge, Taunt, DoT

## Karakter Para Birimleri

| Alan | Oyun İçi | Varsayılan |
|------|----------|-----------|
| `gold` | Altın | 10,000 |
| `bound_gold` | Bağlı Altın | 0 |
| `balens` | Elmas 💎 | 1,000 |
| `bound_balens` | Bağlı Elmas 🔒 | 500 |

## Web Sayfaları

- `/` — Ana sayfa (Wartune Ultra tasarımı, ŞİMDİ OYNA butonu)
- `/login.html` — Giriş/Kayıt sayfası (API entegrasyonu)

## Client Entegrasyonu Notları

Bu sunucu 14GB HTML5 Wartune Ultra client'ı ile çalışacak şekilde tasarlanmıştır. Client Laya Engine tabanlıdır ve tüm UI'ı kendi render eder. Sunucu doğru formatta veri gönderir.

### Client Bağlantı Noktaları
1. Client `/clientsiteinfoservlet` endpoint'inden sunucu listesini alır (deflate JSON)
2. WebSocket bağlantısı `/ws` path'ine yapılır
3. İlk paket `U_L_PREPARE` (0x0F02) ile login key gönderilir
4. `G_LOGIN_GATEWAY` (0x4E21) ile oyuna girilir
5. Sunucu karakter bilgisi + sistem verilerini push eder

### Mevcut Protobuf Mesajları
- `LoginReqMsg`, `LoginRspMsg`, `PlayerMsg` — Login akışı
- `ChatMsg` — Sohbet
- `BattleStartMsg`, `BattleRoundMsg` — Savaş
- `BagInfoMsg` — Envanter
- `SimpleResultMsg` — Genel sonuç
- `SynchronizedTimeMsg` — Zaman senkronizasyonu

### Tamamlanması Gereken Alanlar
- [ ] Item template sistemi (item ID → isim, ikon, stat eşleştirmesi)
- [ ] Protobuf tanımları tüm sistemler için (şu an çoğu JSON)
- [ ] Quest içeriği genişletme (27 → 200+ görev)
- [ ] Campaign stage verileri (6 bölüm → 10+)
- [ ] Monster templates (18 → 500+)
- [ ] Shop kataloğu genişletme (13 → 100+ item)
- [ ] Map zone verileri (7 → 15+)
- [ ] Seviye bazlı stat büyümesi
- [ ] Equipment set bonusları
- [ ] Karakter oluşturma → starter items verme
- [ ] Şifre hashleme
- [ ] VIP bonuslarının tüm sistemlere entegrasyonu
- [ ] Achievement tetikleyicileri
- [ ] Ranking otomatik güncelleme
- [ ] Quest progress → tüm sistem aksiyonlarından tetikleme

## Dosya Yapısı

```
wartune-server/
├── package.json
├── README.md
├── server/
│   ├── server.js          — Ana giriş (248 satır)
│   ├── handlers.js        — Paket yönlendirme (2241 satır)
│   ├── opcodes.js         — 418 opcode (677 satır)
│   ├── db.js              — SQLite veritabanı (190 satır)
│   ├── packet.js          — Binary paket (115 satır)
│   ├── crypto.js          — CFB-XOR şifreleme (42 satır)
│   ├── proto.js           — Protobuf tanımları (225 satır)
│   ├── proto-game.js      — Genişletilmiş proto (123 satır)
│   ├── http-api.js        — HTTP API (206 satır)
│   └── systems/           — 58 oyun sistemi (12400+ satır)
│       ├── academy.js     ├── farm.js
│       ├── achievement.js ├── feature-unlock.js
│       ├── archaeology.js ├── forge.js
│       ├── arena.js       ├── friend.js
│       ├── astral.js      ├── gacha.js
│       ├── battle.js      ├── gem.js
│       ├── battleground.js├── guild-extras.js
│       ├── bounty.js      ├── guild.js
│       ├── buff.js        ├── henna.js
│       ├── campaign.js    ├── holy-forge.js
│       ├── catacombs.js   ├── honor.js
│       ├── chat.js        ├── inventory.js
│       ├── circuit-quest.js├── jewel-hunt.js
│       ├── city.js        ├── knighthood.js
│       ├── class-advance.js├── mail.js
│       ├── clothing.js    ├── mount.js
│       ├── cloud-adventure.js├── party.js
│       ├── cross-server.js├── purgatory-maze.js
│       ├── daily-login.js ├── quest.js
│       ├── devotion.js    ├── ranking.js
│       ├── dimensional-war.js├── resistance.js
│       ├── dragon-soul.js ├── rune.js
│       ├── eudaemon.js    ├── shop.js
│       ├── events.js      ├── skills.js
│       │                  ├── social.js
│       │                  ├── spire.js
│       │                  ├── sylph.js
│       │                  ├── talent.js
│       │                  ├── troops.js
│       │                  ├── tutorial.js
│       │                  ├── vip.js
│       │                  ├── wings.js
│       │                  ├── world-boss.js
│       │                  └── world-map.js
├── webroot_web/
│   ├── index.html         — Ana sayfa
│   └── login.html         — Giriş/Kayıt sayfası
└── data/
    └── wartune.db          — SQLite (otomatik oluşur)
```
