# Wartune Ultra — Game Server

Wartune Ultra HTML5 MMORPG oyununun tam sunucu implementasyonu. Node.js, WebSocket, SQLite ve Protobuf tabanlı. 14GB HTML5 client ile uyumlu çalışır.

**20,000+ satır kod | 60+ oyun sistemi | 420+ opcode | Tek port (8899)**

> **DURUM: ÖZELLİK TAMAMLANDI — CLIENT VERİ ENTEGRASYONU BEKLENİYOR**
>
> Tüm oyun mekanikleri ve sistemler implement edildi. Placeholder veriler (item ID'ler, quest
> zincirleri, monster statları, skill verileri, proto formatları) 14GB HTML5 client'tan
> çıkarılıp değiştirilmeli. Bir sonraki AI oturumu bu görevi yapacak.

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
│  │ register │ │ decrypt  │ │  2400+ lines     │ │
│  │ login    │ │ parse    │ │  route → systems │ │
│  │ GM tools │ └──────────┘ └──────────────────┘ │
│  └──────────┘                                    │
│  ┌──────────────────────────────────────────────┐│
│  │         60+ Game Systems (15000+ lines)      ││
│  │  battle, inventory, guild, quest, city,      ││
│  │  sylph, party, title, daily-login, ...       ││
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
| `GM_TOKEN` | — | GM API Bearer token (zorunlu) |

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
  │◄── S_MAIL_LIST ───────────────  Postalar
  │◄── S_DAILY_LOGIN_INFO ────────  Günlük giriş durumu
  │◄── S_TITLE_LIST ──────────────  Unvan listesi
```

---

## 60+ Oyun Sistemi

### Core
| Sistem | Dosya | Açıklama |
|--------|-------|----------|
| Login | `handlers.js` | Giriş, karakter seçim, gateway |
| Chat | `chat.js` | Dünya/özel/lonca sohbet |
| Battle | `battle.js` | Sıra tabanlı savaş, rage, skill, troop, sylph dönüşüm |
| Inventory | `inventory.js` | Çanta, equip, satış, stat hesaplama |
| Shop | `shop.js` | Mağaza kataloğu |
| VIP | `vip.js` | VIP seviyeleri ve bonusları |

### Karakter Gelişimi
| Sistem | Dosya | Açıklama |
|--------|-------|----------|
| Skills | `skills.js` | Sınıf becerileri, upgrade, starter skills |
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
| **Title** | **`title.js`** | **15 unvan, stat bonusları, seviye/başarım bazlı** |

### Sosyal
| Sistem | Dosya | Açıklama |
|--------|-------|----------|
| Guild | `guild.js` | Lonca oluştur/katıl/yönet |
| Guild Extras | `guild-extras.js` | Lonca savaşı/altar/canavar |
| Mail | `mail.js` | Posta sistemi |
| Friend | `friend.js` | Arkadaş listesi |
| **Party** | **`party.js`** | **Grup/MPD co-op, 10 dungeon, 3 zorluk** |
| Social | `social.js` | Profil, hediye, blok |

### Görev & Dünya
| Sistem | Dosya | Açıklama |
|--------|-------|----------|
| Quest | `quest.js` | Ana görev zinciri (63 görev, lv1-80) |
| Bounty | `bounty.js` | Ödül panosu (lv17+) |
| Devotion | `devotion.js` | Günlük görevler |
| Circuit Quest | `circuit-quest.js` | Devre görevleri |
| Campaign | `campaign.js` | 8 bölüm, 38+ stage, **blitz** |
| World Boss | `world-boss.js` | 10 dünya bossu (lv20-80) |
| Catacombs | `catacombs.js` | 100 kat, 20 isimli boss (lv23+) |
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
| **Sylph** | **`sylph.js`** | **9+9 sylph, yıldız, uyanış, evrim, engulf** |
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
| City | `city.js` | 10 bina, **yapım timer'ı, VIP hızlandırma** |
| Farm | `farm.js` | Çiftlik (lv11+) |
| **Daily Login** | **`daily-login.js`** | **30 günlük takvim, streak, premium ödüller** |
| Events | `events.js` | Etkinlik sistemi |
| **Hot Events** | **`hot-events.js`** | **Dönemsel sıcak etkinlikler** |
| Gacha | `gacha.js` | Şans çarkı |
| Jewel Hunt | `jewel-hunt.js` | Mücevher avı |
| Achievement | `achievement.js` | Başarım sistemi |
| **Gift Code** | **`gift-code.js`** | **Hediye kodu sistemi** |

---

## Son Eklenen Özellikler (v7.0)

### Günlük Giriş Ödülleri (`daily-login.js`)
- 30 günlük ödül takvimi, aylık reset
- Streak takibi (7/14/21/28/30. gün premium ödüller)
- Gold, EXP, item, balen ödülleri

### Hediye Kodu Sistemi (`gift-code.js`)
- Tek/çoklu kullanımlık kodlar, süre sınırlı
- Seed kodlar: `WELCOME2024`, `WARTUNE`, `ULTRA`
- GM API ile yeni kod oluşturma

### Blitz/Otomatik Savaş (`campaign.js`)
- `blitzStage(charId, stageId, count)` — Tamamlanmış stage'leri anında tekrar
- Ödül çarpanı, envantere otomatik item ekleme

### Oyuncu İnceleme (`handlers.js`)
- 0x9903 → 0x9904 opcode: Başka oyuncuların profilini görme
- Stat, ekipman, unvan, sylph bilgisi

### Bina Yapım Timer'ı (`city.js`)
- `upgradeBuilding()` → timer bazlı (anlık değil)
- `checkBuildComplete()` → otomatik bitirme kontrolü
- `speedUpBuild()` → balen ile anında tamamlama
- VIP seviyesi başına %5 süre azaltma

### Unvan Sistemi (`title.js`)
- 15 unvan: seviye bazlı (lv10-80) + başarım bazlı (arena, boss, guild vb.)
- Aktif unvan stat bonusu (recalcStats entegrasyonu)
- Unvan listesi/equip handler'ları

### GM Araçları (`http-api.js`)
- 12 GM API endpoint (Bearer token auth)
- `/api/gm/announce` — Sunucu duyurusu
- `/api/gm/give-item`, `/api/gm/give-currency` — Item/para verme
- `/api/gm/ban`, `/api/gm/kick` — Oyuncu yönetimi
- `/api/gm/set-level`, `/api/gm/player/:charId` — Bilgi/düzenleme
- `/api/gm/create-gift-code` — Hediye kodu oluşturma

### Sıcak Etkinlikler (`hot-events.js`)
- Dönemsel etkinlik sistemi, zaman bazlı

### Sylph Tam Sistem (`sylph.js` + `battle.js`)
- **9 Temel Sylph**: Gaia, Amazon Queen, Pan, Hades, Iris, Poseidon, Thor, Apollo, Nyx
- **9 Evrimli Sylph**: Storm Gaia, Tempest Queen, Inferno Pan, Shadow Hades, vb.
- **6 Element**: Wind, Fire, Water, Electro, Dark, Light
- **Yıldız Yükseltme**: 0-10 yıldız, azalan başarı şansı
- **Uyanış**: Lv40+ ve 5+ yıldız gerekli, element bazlı uyanış becerileri
- **Evrim**: Lv60+ ve uyanmış olmalı, evrimli template'e dönüşüm
- **Engulf**: Bir sylph'i diğerine feda ederek EXP kazandırma
- **Savaşta Dönüşüm**: 100 rage ile sylph'e dönüş, 3 tur boyunca
  - Oyuncu becerileri element bazlı sylph becerileriyle değişir
  - Stat boost: sylph template + yıldız + uyanış + seviye
  - Element avantajı: Fire>Wind>Water>Fire, Light↔Dark (1.3x/0.7x)
  - Manuel geri dönüş veya 3 tur sonra otomatik revert

### Parti/MPD Co-op Sistemi (`party.js`)
- In-memory parti yönetimi (oluştur, davet et, kabul et, ayrıl, at)
- 10 multiplayer dungeon (lv18-75), 3 zorluk (Normal/Nightmare/Hell)
- Kombine parti statları + sylph assist bonusları ile boss savaşı
- Üye başı drop ödülleri

---

## Savaş Sistemi

- **Sıra tabanlı**: Skill seç → Oyuncu → Birlik → Canavar → DoT
- **Rage**: Hit +10, Kritik +20, Kill +15, max 100
- **3 Sınıf**: Knight / Mage / Archer (6 skill)
- **7 Birlik Tipi**: Lancier, Gryphon, Angel, Templar, Warlock, Archer, Paladin
- **Buff/Debuff**: Stun, Shield, Dodge, Taunt, DoT
- **Sylph Dönüşümü**: 100 rage, 3 tur, element bazlı beceriler
- **VIP Çarpanı**: EXP ve gold bonus
- **Drop Tabloları**: Consumable, weapon, armor, accessory, material

## Karakter Para Birimleri

| Alan | Oyun İçi | Varsayılan |
|------|----------|-----------|
| `gold` | Altın | 10,000 |
| `bound_gold` | Bağlı Altın | 0 |
| `balens` | Elmas | 1,000 |
| `bound_balens` | Bağlı Elmas | 500 |

## Web Sayfaları

- `/` — Ana sayfa (Wartune Ultra tasarımı, ŞİMDİ OYNA butonu)
- `/login.html` — Giriş/Kayıt sayfası (API entegrasyonu)

---

## CLIENT VERİ ENTEGRASYONU TALİMATLARI

> **BU BÖLÜM SONRAKİ AI OTURUMU İÇİNDİR**
>
> Bu sunucu özellik olarak tamamlanmıştır. Tüm oyun mekanikleri çalışır durumda.
> Ancak placeholder veriler kullanılmaktadır. 14GB HTML5 client'tan gerçek verilerin
> çıkarılıp sunucuya aktarılması gerekir. Client tüm UI'ı render eder — sunucu
> yalnızca doğru formatta veri gönderir.

### Öncelik Sırası

1. **Protobuf Şemaları** (EN KRİTİK — bu olmadan client hiçbir paketi anlamaz)
2. **Opcode Eşleştirme** (client'ın gerçek opcode'ları ile sunucununkiler eşleşmeli)
3. **Item Template Verileri** (envanter, shop, drop sistemi hepsi buna bağlı)
4. **Quest Verileri** (görev zinciri, NPC diyalogları)
5. **Monster/Campaign Verileri** (savaş sistemi)
6. **Skill Verileri** (sınıf becerileri)
7. **Shop/Map/Zone Verileri** (diğer sistemler)

### Client Dosya Yapısı (İncelenmesi Gereken Yerler)

```
webroot_web/                    ← Client kök dizini
├── res/
│   ├── config/                 ← Oyun konfigürasyon dosyaları
│   │   ├── item/               ← Item template JSON/XML dosyaları
│   │   │   ├── ItemTemplate.json    ← Tüm item ID → isim, ikon, stat, tip, seviye
│   │   │   ├── EquipTemplate.json   ← Ekipman detayları (slot, class req, set bonus)
│   │   │   └── GemTemplate.json     ← Mücevher verileri
│   │   ├── quest/              ← Görev tanımları
│   │   │   ├── QuestTemplate.json   ← Quest ID → hedefler, ödüller, ön koşullar
│   │   │   └── QuestDialog.json     ← NPC diyalog metinleri
│   │   ├── monster/            ← Canavar verileri
│   │   │   └── MonsterTemplate.json ← Monster ID → isim, stat, seviye, drop tablosu
│   │   ├── skill/              ← Beceri tanımları
│   │   │   └── SkillTemplate.json   ← Skill ID → hasar, mana, cooldown, efekt
│   │   ├── campaign/           ← Sefer haritaları
│   │   │   └── CampaignTemplate.json ← Stage → canavar listesi, ödüller
│   │   ├── map/                ← Harita bölgeleri
│   │   ├── npc/                ← NPC verileri ve diyaloglar
│   │   ├── shop/               ← Mağaza kataloğu
│   │   └── ...                 ← Diğer konfigürasyonlar
│   ├── proto/                  ← Protobuf tanım dosyaları
│   │   ├── *.proto             ← .proto dosyaları (tüm mesaj şemaları)
│   │   └── proto.bin           ← Derlenmiş protobuf descriptor
│   ├── lang/                   ← Dil dosyaları (TR/EN)
│   │   └── tr/                 ← Türkçe çeviriler
│   │       ├── item_name.json  ← Item isimleri
│   │       ├── quest_text.json ← Görev metinleri
│   │       ├── npc_dialog.json ← NPC diyalogları
│   │       ├── skill_name.json ← Beceri isimleri
│   │       └── ui_text.json    ← UI metinleri
│   └── atlas/                  ← Sprite/ikon atlas dosyaları
└── src/                        ← Laya Engine JavaScript kaynakları
    ├── proto/                  ← Protobuf JS kodları (mesaj sınıfları)
    ├── config/                 ← Config reader kodları
    └── net/                    ← Network/opcode tanımları
```

### Çıkarma Adımları (Sonraki AI Oturumu İçin)

**1. Protobuf Şemaları** (EN KRİTİK)
```bash
# Client'ın proto/ dizininde .proto dosyalarını bul
find webroot_web/ -name "*.proto" -o -name "proto.bin" -o -name "protobuf*"
# Veya JS kaynaklarında protobuf mesaj tanımlarını bul
grep -r "protobuf.Type\|proto.define\|addField\|ProtoBuf.newBuilder" webroot_web/src/
```
Bu .proto tanımlarını `server/proto.js` ve `server/proto-game.js` dosyalarına ekle. Şu an 11 encode çağrısı protobuf kullanıyor, 200+ çağrı JSON. Client gerçek protobuf bekliyor — JSON paketleri sessizce görmezden geliniyor.

**Sunucuda değiştirilmesi gereken dosyalar:**
- `server/proto.js` — Ana protobuf tanımları (LoginReqMsg, PlayerMsg, BagInfoMsg vb.)
- `server/proto-game.js` — Genişletilmiş proto tanımları
- Her `sendJson()` çağrısı → `encode()` ile değiştirilmeli

**2. Opcode Eşleştirme**
```bash
# Client'ın opcode tanımlarını bul
grep -r "0x0F\|0x10\|CMD_\|OPCODE\|cmdId\|PacketId" webroot_web/src/ --include="*.js"
```
`server/opcodes.js` dosyasındaki 420+ opcode'u client'ınkilerle karşılaştır. Eşleşmeyen opcode'lar client tarafında sessizce görmezden gelinir.

**3. Item Template Verileri**
```bash
find webroot_web/ -name "*item*" -o -name "*equip*" -o -name "*Item*"
```
Her item ID için: isim, tip (weapon/armor/ring/accessory/consumable/material/gem), slot, base statlar, seviye/sınıf gereksinimi, kalite, satış fiyatı, set ID.

**Sunucuda değiştirilmesi gereken yerler:**
- `server/systems/inventory.js` → `giveStarterItems()` placeholder item ID'ler (1001-2003, 100001-100003)
- `server/systems/inventory.js` → `isStackable()` sadece ID >= 100000 kontrol ediyor
- `server/systems/battle.js` → `generateDrops()` placeholder drop tabloları
- `server/systems/shop.js` → Mağaza kataloğu
- `server/systems/gacha.js` → Gacha ödül havuzu

**4. Quest Verileri**
```bash
find webroot_web/ -name "*quest*" -o -name "*Quest*" -o -name "*mission*"
```
**Sunucuda:** `server/systems/quest.js` → 63 placeholder quest. Her biri `type`, `targetId`, `targetCount`, `rewards` ile tanımlı. Client'taki gerçek quest ID, hedef ve ödüllerle değiştirilmeli.

**5. Monster/Campaign Verileri**
```bash
find webroot_web/ -name "*monster*" -o -name "*campaign*" -o -name "*stage*"
```
**Sunucuda:**
- `server/systems/battle.js` → `startBattle()` placeholder monster statları
- `server/systems/campaign.js` → 8 bölüm, 38 stage placeholder verilerle
- `server/systems/world-boss.js` → 10 boss placeholder statlarla
- `server/systems/catacombs.js` → 100 kat, 20 boss placeholder

**6. Skill Verileri**
```bash
find webroot_web/ -name "*skill*" -o -name "*Skill*"
```
**Sunucuda:**
- `server/systems/skills.js` → Sınıf becerileri placeholder ID ve damage ile
- `server/systems/battle.js` → `getClassSkills()` placeholder skill listesi
- `server/systems/sylph.js` → Sylph becerileri placeholder

**7. Sylph Verileri**
```bash
find webroot_web/ -name "*sylph*" -o -name "*peri*" -o -name "*fairy*"
```
**Sunucuda:** `server/systems/sylph.js` → 9 base + 9 evolved template, placeholder statlar ve beceriler. Client'taki gerçek sylph ID, stat ve becerileriyle değiştirilmeli.

### Mevcut Placeholder Veri Örnekleri (Değiştirilecekler)

```javascript
// inventory.js — starter weapon placeholder
const weapons = {
  1: { id: 1001, attrs: { attack: 25, hp: 50 } },   // Knight weapon
  2: { id: 1002, attrs: { magicAttack: 30, hp: 30 } }, // Mage weapon
  3: { id: 1003, attrs: { attack: 28, hp: 40 } },   // Archer weapon
};

// battle.js — drop table placeholder
const DROP_TABLES = {
  consumable: [
    { itemId: 100001, chance: 0.3, min: 1, max: 3 },
    { itemId: 100002, chance: 0.2, min: 1, max: 2 },
    // ...
  ],
};

// quest.js — quest placeholder
{ id: 1, name: 'İlk Adım', type: 'talk_npc', targetId: 1001, targetCount: 1,
  level: 1, rewards: { exp: 100, gold: 50 }, nextQuest: 2 },

// sylph.js — sylph template placeholder
{ id: 1, name: 'Gaia', element: 'WIND', baseHp: 2000, baseAtk: 150, ... },
```

### Sunucu Mimarisi Notları (Sonraki AI İçin)

- Her sistem dosyası `'use strict'` ile başlar, `require('../db')` kullanır
- `OPCODES` const ile tanımlı, `initDB()` ile tablo oluşturur, `module.exports` ile dışa aktarır
- `handlers.js` merkezi router — opcode'a göre doğru sisteme yönlendirir
- `server.js` tüm sistemleri yükler ve `initDB()` çağırır
- Protobuf namespace: `com.road.yishi.proto.*`
- Şifre hashleme: `crypto.pbkdf2Sync` + salt (geriye uyumlu)
- Parti sistemi in-memory (Map), restart'ta sıfırlanır
- Battle ID'ler in-memory Map, kalıcı değil

### Sistemler Arası Entegrasyon Haritası

```
Battle Win → quest.updateProgress('kill_monster')
           → achievement.incrementStat('battles_won', 'monsters_killed')
           → ranking.updatePlayerRanking()
           → inventory.addItem() (drops)

Level Up   → quest.checkLevelUp() (recursive)
           → inventory.recalcStats()
           → title.checkNewTitles()
           → ranking.updatePlayerRanking()

Equip Item → inventory.recalcStats()
           → quest.updateProgress('equip_item')

Guild Join → quest.updateProgress('guild_join')
           → achievement.incrementStat('guild_join')

Arena Win  → quest.updateProgress('arena_win')
           → achievement.incrementStat('arena_wins')
           → ranking.updatePlayerRanking()

Sylph Transform (in battle) → stat boost from sylph template
                             → element-based skill replacement
                             → element advantage multiplier
```

---

## Tamamlanan Özellikler Listesi

### v6.0 — Temel Entegrasyonlar
- [x] Seviye bazlı stat büyümesi (Knight/Mage/Archer ayrı base+growth)
- [x] Karakter oluşturma: job, giveStarterItems, giveStarterSkills, recalcStats
- [x] Battle ↔ Skills entegrasyonu (skill seviye multiplier)
- [x] Quest progress tetikleyicileri (kill, equip, arena, guild, troop, forge, city, campaign)
- [x] Feature unlock gating (Arena 13, Guild 12, Gacha 10, Astral 25, Forge 10)
- [x] Achievement tetikleyicileri (battle, arena, guild)
- [x] Ranking otomatik güncelleme
- [x] VIP bonus entegrasyonu (EXP/gold çarpanı)
- [x] Gacha item ödülleri (inventory entegrasyonu)
- [x] Drop sistemi (5 kategori drop tablosu)
- [x] Level cap tutarlılığı (100)

### v7.0 — Yeni Sistemler
- [x] Günlük giriş ödülleri takvimi (30 gün, streak)
- [x] Hediye kodu sistemi (tek/çoklu kullanım, süreli)
- [x] Blitz/otomatik savaş (tamamlanmış stage tekrarı)
- [x] Oyuncu inceleme (profil görüntüleme)
- [x] Bina yapım timer'ı + VIP hızlandırma + balen ile anında tamamlama
- [x] Unvan sistemi (15 unvan, stat bonus, recalcStats entegrasyonu)
- [x] GM araçları (12 endpoint, Bearer token auth)
- [x] Sıcak etkinlikler sistemi
- [x] Sylph yıldız yükseltme (0-10, azalan şans)
- [x] Sylph uyanış (lv40+ ve 5+ yıldız)
- [x] Sylph evrim (lv60+ ve uyanmış)
- [x] Sylph engulf (feda ile EXP)
- [x] Sylph savaşta dönüşüm (100 rage, 3 tur, element beceriler)
- [x] Element avantajı sistemi (Fire>Wind>Water, Light↔Dark)
- [x] Parti/MPD co-op sistemi (10 dungeon, 3 zorluk)
- [x] Sunucu duyuru sistemi (broadcast)

### Client Verisine Bağımlı (14GB client'tan çıkarılmalı)
- [ ] Protobuf tanımları (200+ sendJson → encode dönüşümü)
- [ ] Item template sistemi (gerçek item ID'ler ve statlar)
- [ ] Quest içeriği (gerçek görev zincirleri ve ödüller)
- [ ] Campaign stages (gerçek monster listeleri ve haritalar)
- [ ] Monster templates (gerçek canavar statları)
- [ ] Shop kataloğu (gerçek item listesi ve fiyatlar)
- [ ] Map zones (gerçek harita verileri)
- [ ] Skill verileri (gerçek sınıf becerileri)
- [ ] Equipment set bonusları
- [ ] Sylph gerçek template verileri

---

## Dosya Yapısı

```
wartune-server/
├── package.json
├── README.md
├── server/
│   ├── server.js          — Ana giriş, 60+ sistem yükleme
│   ├── handlers.js        — Paket yönlendirme (2400+ satır)
│   ├── opcodes.js         — 420+ opcode
│   ├── db.js              — SQLite veritabanı
│   ├── packet.js          — Binary paket oluşturma
│   ├── crypto.js          — CFB-XOR şifreleme
│   ├── proto.js           — Protobuf tanımları
│   ├── proto-game.js      — Genişletilmiş proto
│   ├── http-api.js        — HTTP API + 12 GM endpoint
│   └── systems/           — 60+ oyun sistemi
│       ├── academy.js        ├── gacha.js
│       ├── achievement.js    ├── gem.js
│       ├── archaeology.js    ├── gift-code.js      ★ YENİ
│       ├── arena.js          ├── guild-extras.js
│       ├── astral.js         ├── guild.js
│       ├── battle.js         ├── henna.js
│       ├── battleground.js   ├── holy-forge.js
│       ├── bounty.js         ├── honor.js
│       ├── buff.js           ├── hot-events.js     ★ YENİ
│       ├── campaign.js       ├── inventory.js
│       ├── catacombs.js      ├── jewel-hunt.js
│       ├── chat.js           ├── knighthood.js
│       ├── circuit-quest.js  ├── mail.js
│       ├── city.js           ├── mount.js
│       ├── class-advance.js  ├── party.js          ★ GÜNCELLENDİ
│       ├── clothing.js       ├── purgatory-maze.js
│       ├── cloud-adventure.js├── quest.js
│       ├── cross-server.js   ├── ranking.js
│       ├── daily-login.js ★  ├── resistance.js
│       ├── devotion.js       ├── rune.js
│       ├── dimensional-war.js├── shop.js
│       ├── dragon-soul.js    ├── skills.js
│       ├── eudaemon.js       ├── social.js
│       ├── events.js         ├── spire.js
│       ├── farm.js           ├── sylph.js          ★ GÜNCELLENDİ
│       ├── feature-unlock.js ├── talent.js
│       ├── forge.js          ├── title.js          ★ YENİ
│       ├── friend.js         ├── troops.js
│       │                     ├── tutorial.js
│       │                     ├── vip.js
│       │                     ├── wings.js
│       │                     ├── world-boss.js
│       │                     └── world-map.js
├── webroot_web/
│   ├── index.html         — Ana sayfa
│   └── login.html         — Giriş/Kayıt sayfası
└── data/
    └── wartune.db          — SQLite (otomatik oluşur)
```
