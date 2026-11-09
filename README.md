# Saksoğan 🌐🧅✨

> **Saksoğan**, yerel ağ (Wi-Fi, Ethernet veya Tailscale) üzerindeki tüm cihazlarınız arasında sıfır gecikmeli mesajlaşma, yüksek hızlı doğrudan dosya paylaşımı ve ortak pano eşitlemesi sağlayan, tamamen izole ve kendi sunucunuzda çalışan modern bir yerel iletişim ekosistemidir.

---

## 📱 Desteklenen Platformlar

- **Mobil (Android):** Yerel APK paketi (`saksogan.apk`) ve kurulabilir PWA desteği.
- **Linux (Toshi / Debian / Arch vb.):** Bağımsız Chromium/Edge app-mode masaüstü kısayolu.
- **Windows (Quasimodo / Windows 10/11):** Doğrudan yerel masaüstü uygulama entegrasyonu.
- **Web (Tüm Tarayıcılar):** Chrome, Safari, Firefox üzerinden anında erişim.

---

## ⚡ Temel Özellikler

1. **Sıfır Gecikmeli Yerel Mesajlaşma (WebSockets):**
   - İnternet kotası harcamadan, bulut sunuculara bağımlı kalmadan tamamen yerel ağ üzerinden anlık mesajlaşma.
   - Yazıyor... (typing) göstergeleri, otomatik scroll ve Web Audio API ile sentezlenen Apple tarzı bildirim tonları.

2. **AirDrop / LocalSend Tarzı Hızlı Dosya Transferi:**
   - Her boyuttaki fotoğraf, video, APK veya arşivi pencereye sürükleyip bırakarak ağdaki tüm cihazlara anında gönderme.
   - İlerleme çubuğu, resim önizlemeleri ve doğrudan tarayıcıdan indirme linkleri.

3. **Evrensel Ortak Pano (Universal Clipboard):**
   - Telefondan kopyalanan bir metin veya bağlantıyı "Ağ Panosuna Gönder" diyerek saniyeler içinde bilgisayara aktarın ve tek tıkla kopyalayın.

4. **Apple HIG & Anti-Slop Tasarım Dili:**
   - 8pt ızgara sistemi, WCAG AAA kontrast, akrilik yarı saydamlık (`backdrop-filter: blur(28px)`), net tipografi hiyerarşisi.
   - Sistem tercihlerine saygılı Açık / Koyu tema modu.

5. **Tamamen Bağımsız ve Güvenli:**
   - Dış dünya ile veri paylaşımı yoktur. Tüm veriler yalnızca kendi yerel ağınızda (veya özel Tailscale tünelinizde) akar.

---

## 🚀 Kurulum ve Çalıştırma (Docker)

Sunucu Debian (Kasa) üzerinde Docker ve `docker-compose` ile tamamen izole şekilde çalışır:

```bash
# Repoyu klonlayın
git clone https://github.com/meucak/saksogan.git
cd saksogan

# Docker container'ı derleyin ve başlatın
docker compose up -d --build
```

Sunucu varsayılan olarak **8088** portunda dinler:
- Yerel Ağ: `http://<sunucu-yerel-ip>:8088`
- Tailscale Ağı: `http://<sunucu-tailscale-ip>:8088`

---

## 📲 Android APK Yükleme

Saksoğan sunucusunun ana ekranındaki **"APK"** butonuna basarak veya doğrudan aşağıdaki adresten imzalı APK'yı indirebilirsiniz:

```
http://<sunucu-ip>:8088/download/saksogan.apk
```

Ayrıca Google Drive (`gdrive:agy/saksogan/saksogan.apk`) ve Sarp ile paylaşımlı klasöre (`BaylajımlıGılazör/saksogan.apk`) otomatik olarak yüklenmiştir.

---

## 📁 Proje Mimarisi

```
saksogan/
├── Dockerfile              # Hafif Node.js Alpine konteyneri
├── docker-compose.yml      # Port ve hacim yapılandırması
├── package.json            # Node.js bağımlılıkları (ws)
├── saksogan.apk            # İmzalı ve optimize Android APK
├── server/
│   ├── index.js            # HTTP API + WebSocket sunucusu
│   └── uploads/            # Paylaşılan dosya depolama alanı
├── public/
│   ├── index.html          # Apple HIG uyumlu ana arayüz
│   ├── style.css           # Cam efekti, 8pt ızgara ve responsive stiller
│   ├── app.js              # WebSocket istemcisi, dosya akışı ve ses sentezleyici
│   ├── manifest.json       # PWA manifestosu
│   ├── sw.js               # Offline Service Worker
│   └── icons/              # Vektörel SVG ve yüksek çözünürlüklü PNG ikonlar
└── android/                # Yerel Android WebView APK derleme kaynakları
    ├── build-apk.sh        # Aapt2 + d8 + apksigner derleme pipeline'ı
    └── app/src/main/       # Android manifest ve Java kaynak kodları
```

---

## 📄 Lisans
MIT License — Kişisel ve yerel ağ kullanımı için özgürce geliştirilebilir.
