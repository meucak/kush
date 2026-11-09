# kush 🌐✨

> **kush**, yerel ağ (Wi-Fi, Ethernet veya Tailscale) üzerindeki tüm cihazlarınız arasında sıfır gecikmeli mesajlaşma, yüksek hızlı doğrudan dosya paylaşımı ve ortak pano eşitlemesi sağlayan, tamamen izole ve kendi sunucunuzda çalışan modern bir yerel iletişim ekosistemidir.

---

## 📱 Desteklenen Platformlar

- **Mobil (Android):** Yerel APK paketi (`kush.apk`) ve kurulabilir PWA desteği.
- **Linux (Toshi / Debian / Arch vb.):** Bağımsız Chromium/Edge app-mode masaüstü kısayolu.
- **Windows (Quasimodo / Windows 10/11):** Doğrudan yerel masaüstü uygulama entegrasyonu.
- **Web (Tüm Tarayıcılar):** Chrome, Safari, Firefox üzerinden anında erişim.

---

## ⚡ Temel Özellikler

1. **Sade & Kusursuz Metin Mesajlaşması:**
   - **Offline-First & İletildi Onayı (Tek Tik ✓ / Çift Tik ✓✓):** Cihaz çevrimdışı olsa bile mesaj hemen yerel havuza alınır ve tek tıkla gösterilir; sunucuya iletildiği an otomatik olarak çift mavi tık (`✓✓`) olur.
   - **Kalıcı Cihaz Hizalama:** Hangi cihazdan bakıyorsanız, o cihazın geçmiş ve anlık gönderdiği tüm mesajlar sağ tarafta zümrüt baloncuklarla dizilir; diğer cihazların mesajları ise sol tarafta listelenir.

2. **AirDrop / LocalSend Tarzı Hızlı Dosya Transferi:**
   - Her boyuttaki belge (PDF, DOCX, ZIP vb.), görsel, video veya arşivi pencereye sürükleyip bırakarak ağdaki tüm cihazlara anında gönderme.
   - Belge türüne göre özel renkli rozetler (PDF, DOC, ZIP, CODE vb.) ve tam ekran görsel önizleme (Lightbox) desteği.
   - Mobilde ve masaüstünde tek tıkla doğrudan indirme.

3. **Google Drive Otomatik Log & Sıfırlama:**
   - Tüm sohbet geçmişi ve loglar düzenli olarak Google Drive üzerindeki `gdrive:apps/kush/logs/` klasöründe tutulur.
   - Toshi veya Windows terminalinde `kush --resetlog` komutuyla tüm sunucu hafızası ve Drive log kayıtları anında temizlenir.

4. **Sıfır İşlemci Tüketimi (Zero Background CPU):**
   - Düşük donanımlı dizüstü bilgisayarlarda (Toshi vb.) pil ve CPU tasarrufu için ağır CSS filtreleri yerine temiz opak katmanlar kullanılmıştır. Boşta CPU tüketimi <%1'dir.

5. **Evrensel Ortak Pano (Universal Clipboard):**
   - Telefondan kopyalanan bir metin veya bağlantıyı "Ağ Panosuna Gönder" diyerek saniyeler içinde bilgisayara aktarın ve tek tıkla kopyalayın.

6. **Apple HIG & Anti-Slop Tasarım Dili:**
   - 8pt ızgara sistemi, WCAG AAA kontrast, akıcı duyarlılık (responsive) ve sistem tercihlerine saygılı Açık / Koyu tema modu.
   - Web Audio API ile Apple tarzı ince bildirim tonları.

---

## 🚀 Kurulum ve Çalıştırma (Docker)

Sunucu Debian (Kasa) üzerinde Docker ve `docker-compose` ile tamamen izole şekilde çalışır:

```bash
# Repoyu klonlayın
git clone https://github.com/meucak/kush.git
cd kush

# Docker container'ı derleyin ve başlatın
docker compose up -d --build
```

Sunucu varsayılan olarak **8088** portunda dinler:
- Yerel Ağ: `http://<sunucu-yerel-ip>:8088`
- Tailscale Ağı: `http://<sunucu-tailscale-ip>:8088`

---

## 📲 Android APK Yükleme

kush sunucusunun ana ekranındaki **"APK"** butonuna basarak veya doğrudan aşağıdaki adresten imzalı APK'yı indirebilirsiniz:

```
http://<sunucu-ip>:8088/download/kush.apk
```

Ayrıca Google Drive (`gdrive:agy/kush/kush.apk`) ve Sarp ile paylaşımlı klasöre (`BaylajımlıGılazör/kush.apk`) otomatik olarak yüklenmiştir.

---

## 📁 Proje Mimarisi

```
kush/
├── Dockerfile              # Hafif Node.js Alpine konteyneri
├── docker-compose.yml      # Port ve hacim yapılandırması
├── package.json            # Node.js bağımlılıkları (ws)
├── kush.apk                # İmzalı ve optimize Android APK
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
    ├── kush.keystore       # Kalıcı sürüm imzalama anahtarı
    └── app/src/main/       # Android manifest ve Java kaynak kodları
```

---

## 📄 Lisans
MIT License — Kişisel ve yerel ağ kullanımı için özgürce geliştirilebilir.
