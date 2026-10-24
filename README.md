# Wartune Ultra Server

Wartune Ultra HTML5 oyun client'ına uyumlu Node.js sunucu.

## Özellikler

- **HTTP API**: Hesap kayıt/giriş, sunucu listesi
- **WebSocket**: Şifreli binary protokol (CFB-XOR)
- **Protobuf**: Client ile aynı mesaj formatı
- **SQLite**: Hafif, dosya tabanlı veritabanı
- **Tek Port**: HTTP + WebSocket aynı port üzerinde (8899)

## Kurulum

```bash
# Bağımlılıkları yükle
npm install

# Sunucuyu başlat
npm start

# Geliştirme modu (auto-restart)
npm run dev
```

## Ortam Değişkenleri

| Değişken | Varsayılan | Açıklama |
|----------|-----------|----------|
| `PORT` | `8899` | Sunucu portu |
| `HOST` | `0.0.0.0` | Dinleme adresi |
| `PUBLIC_HOST` | `127.0.0.1` | Client'ın bağlanacağı IP |
| `WEBROOT` | `./webroot_web` | Statik dosya klasörü |

## Client Bağlantısı

1. `webroot_web/siteConfig.json` dosyasında `SUNUCU_IP` yerine sunucu IP'nizi yazın
2. Client dosyalarını `webroot_web/` klasörüne kopyalayın
3. Tarayıcıda `http://SUNUCU_IP:8899` adresine gidin

## Proje Yapısı

```
wartune-server/
├── server/
│   ├── server.js      ← Ana giriş noktası
│   ├── http-api.js    ← HTTP API + statik dosya servisi
│   ├── handlers.js    ← WebSocket paket işleyicileri
│   ├── packet.js      ← Binary paket oluşturucu/ayrıştırıcı
│   ├── crypto.js      ← CFB-XOR şifreleme/çözme
│   ├── opcodes.js     ← Komut ID tanımları
│   ├── proto.js       ← Protobuf mesaj tanımları
│   └── db.js          ← SQLite veritabanı katmanı
├── data/              ← Veritabanı dosyası (otomatik oluşur)
├── webroot_web/       ← Client dosyaları (siz kopyalayacaksınız)
├── package.json
└── README.md
```

## Login Akışı

```
Tarayıcı → POST /api/register (hesap oluştur)
Tarayıcı → POST /api/login (key al)
Tarayıcı → WebSocket /ws (bağlan)
         → L_CREATE_LOGIN (doğrula)
         → L_GET_PLAYER_LIST (karakter listele)
         → L_REGISTER_ROLE (karakter oluştur, yoksa)
         → L_PREPARE_LOGIN (giriş hazırlığı)
         → G_LOGIN_GATEWAY (gateway bağlantısı)
         ← U_C_PLAYER_INFO (oyuncu verisi)
         → L_SYNC_TIME (zaman senkronizasyonu)
```

## Durum

✅ Hesap sistemi (kayıt/giriş)
✅ Karakter oluşturma/listeleme
✅ WebSocket şifreli protokol
✅ Login akışı (tam)
✅ Gateway login + PlayerMsg
✅ Zaman senkronizasyonu
⬜ Savaş sistemi
⬜ Envanter/eşya
⬜ Sohbet
⬜ Lonca
⬜ Dungeon/kampanya
⬜ Diğer 1200+ opcode
