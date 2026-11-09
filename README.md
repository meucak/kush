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

1. **WhatsApp & Instagram DM Tarzı Akıllı Sohbet:**
   - Kendi gönderdiğiniz mesajlar ekranın sağında zümrüt baloncuklar, iletildi çift mavi tık (`✓✓`) ve zaman damgasıyla konumlanır; ağdaki diğer cihazların mesajları ise sol tarafta ad ve cihaz rozetleriyle listelenir.
   - Sayfa yenilense veya bağlantı kopsa dahi kalıcı istemci kimliği (`kush_client_id`) sayesinde mesajlarınız daima sağda kalır.

2. **Gerçek Sesli Mesaj (Voice Note Recording & Playback):**
   - Tek tıkla ses kaydı başlatma, konuşma süresince ses frekansını analiz eden canlı dalga (equalizer) animasyonu, iptal (`✕`) ve gönder (`➤`) butonları.
   - Oynatırken ses dalgası üzerinden tıklanabilir/ilerletilebilir scrubber, süre takibi ve 1x / 1.5x / 2x oynatma hızı seçeneği.

3. **Sesli Dikte (Speech-to-Text):**
   - Web Speech API ile konuşulanları anında Türkçe metne dönüştürerek mesaj kutusuna yazar.

4. **Hızlı Reaksiyon & Emoji Dock:**
   - Mesaj yazma çubuğunun hemen üzerinde yer alan tek dokunuşluk hızlı emoji çubuğu (`👍`, `❤️`, `😂`, `🔥`, `🎉`, `🙏`, `🚀`, `👀`).

5. **Tam Ekran Görsel Önizleme (Lightbox):**
   - Paylaşılan fotoğraflara tıklandığında akrilik bulanık arka planla tam ekran açılır, yüksek çözünürlükte incelenebilir ve tek tıkla indirilebilir.

6. **AirDrop / LocalSend Tarzı Hızlı Dosya Transferi:**
   - Her boyuttaki fotoğraf, video, APK veya arşivi pencereye sürükleyip bırakarak ağdaki tüm cihazlara anında gönderme.
   - HTTP Range desteği ile büyük medya dosyalarında anında ileri/geri sarma.

7. **Evrensel Ortak Pano (Universal Clipboard):**
   - Telefondan kopyalanan bir metin veya bağlantıyı "Ağ Panosuna Gönder" diyerek saniyeler içinde bilgisayara aktarın ve tek tıkla kopyalayın.

8. **Akıllı Cihaz & İşletim Sistemi Algılama:**
   - PC ve dizüstü cihazları otomatik tanır (`Linux (Toshi)`, `Windows (Quasimodo)`, `Android (Telefon)`). Üst çubuktan tek tıkla anında yeniden adlandırılabilir.

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
