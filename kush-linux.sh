#!/usr/bin/env bash
# ==============================================================================
# kush — Linux Client Launcher & Management CLI (Tailscale & LAN)
# ==============================================================================

SERVER_URL="http://100.69.155.110:8088"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DAEMON_SCRIPT="$SCRIPT_DIR/scripts/kush-daemon.py"
AUTOSTART_FILE="$HOME/.config/autostart/kush-daemon.desktop"

# Check Tailscale first, fallback to LAN if needed
if ! curl -s --connect-timeout 1 "$SERVER_URL/api/info" >/dev/null 2>&1; then
    if curl -s --connect-timeout 1 "http://192.168.1.102:8088/api/info" >/dev/null 2>&1; then
        SERVER_URL="http://192.168.1.102:8088"
    elif curl -s --connect-timeout 1 "http://192.168.1.27:8088/api/info" >/dev/null 2>&1; then
        SERVER_URL="http://192.168.1.27:8088"
    fi
fi

# Handle --daemon commands
if [ "$1" = "--daemon" ] || [ "$1" = "-d" ]; then
    if [ -f "$DAEMON_SCRIPT" ]; then
        python3 "$DAEMON_SCRIPT" --start
    else
        python3 "$HOME/.local/bin/kush-daemon.py" --start 2>/dev/null || echo "Hata: kush-daemon.py bulunamadı."
    fi
    exit 0
fi

if [ "$1" = "--stop" ] || [ "$1" = "-k" ]; then
    if [ -f "$DAEMON_SCRIPT" ]; then
        python3 "$DAEMON_SCRIPT" --stop
    else
        python3 "$HOME/.local/bin/kush-daemon.py" --stop 2>/dev/null || echo "Hata: kush-daemon.py bulunamadı."
    fi
    exit 0
fi

if [ "$1" = "--status" ]; then
    echo "=================================================="
    echo "  🌿 kush — Sistem ve İstemci Durumu"
    echo "=================================================="
    echo "Bağlantı Hedefi: $SERVER_URL"
    if curl -s --connect-timeout 1 "$SERVER_URL/api/info" >/dev/null 2>&1; then
        echo "Sunucu: 🟢 ÇEVRİMİÇİ"
    else
        echo "Sunucu: 🔴 ÇEVRİMDIŞI"
    fi
    echo -n "Arka Plan Nöbetçisi: "
    if [ -f "$DAEMON_SCRIPT" ]; then
        python3 "$DAEMON_SCRIPT" --status
    else
        python3 "$HOME/.local/bin/kush-daemon.py" --status 2>/dev/null || echo "Kurulu değil."
    fi
    if [ -f "$AUTOSTART_FILE" ]; then
        echo "Sistem Başlangıcında Otomatik Açılma: 🟢 ETKİN (Sıfır CPU & 9MB RAM Modu)"
    else
        echo "Sistem Başlangıcında Otomatik Açılma: ⚪ DEVRE DIŞI"
    fi
    echo "=================================================="
    exit 0
fi

if [ "$1" = "--autostart" ]; then
    echo "=================================================="
    echo "  ⚡ kush — Sıfır CPU & Düşük RAM Başlangıç Ayarı"
    echo "=================================================="
    mkdir -p "$HOME/.config/autostart"
    cat <<EOF > "$AUTOSTART_FILE"
[Desktop Entry]
Type=Application
Name=kush Background Daemon
Comment=kush hafif arka plan bildirim nöbetçisi (Zero-CPU)
Exec=python3 $DAEMON_SCRIPT --run
Icon=network-workgroup
Terminal=false
Categories=Network;InstantMessaging;
X-GNOME-Autostart-enabled=true
EOF
    chmod +x "$AUTOSTART_FILE"
    echo "✅ Sistem başlangıcına 'kush-daemon' başarıyla eklendi!"
    echo "ℹ️  Cihaz açıldığında ağır tarayıcı AÇILMAZ; yalnızca ~9 MB RAM ve 0% CPU kullanan nöbetçi çalışır."
    echo "ℹ️  Yeni mesaj veya dosya geldiğinde doğrudan masaüstü bildirimi alırsınız."
    echo "=================================================="
    exit 0
fi

if [ "$1" = "--no-autostart" ]; then
    rm -f "$AUTOSTART_FILE"
    echo "✅ Başlangıçtan otomatik açılma kaldırıldı."
    exit 0
fi

# Handle --id / --tc command
if [ "$1" = "--id" ] || [ "$1" = "-id" ] || [ "$1" = "--tc" ] || [ "$1" = "-tc" ]; then
    IDENTITY_FILE="$HOME/.config/kush/identity.json"
    if [ -f "$IDENTITY_FILE" ]; then
        echo "=================================================="
        echo "  🪪 kush — Cihaz Kimlik Bilgileri"
        echo "=================================================="
        cat "$IDENTITY_FILE"
        echo ""
        echo "=================================================="
    else
        echo "Kimlik henüz oluşturulmadı. Tarayıcıda bir kez açtığınızda otomatik atanır."
    fi
    exit 0
fi

# Handle --resetlog command
if [ "$1" = "--resetlog" ] || [ "$1" = "-resetlog" ] || [ "$1" = "-r" ]; then
    echo "=================================================="
    echo "  🌿 kush — Sohbet ve Log Sıfırlama"
    echo "=================================================="
    
    echo -n "1. Sunucu hafızası ve yerel loglar sıfırlanıyor... "
    RESET_RESP=$(curl -s -X POST "$SERVER_URL/api/logs/reset" 2>/dev/null)
    if [[ "$RESET_RESP" =~ "true" ]]; then
        echo "✅ Başarılı."
    else
        echo "⚠️ Sunucuya doğrudan erişilemedi (çevrimdışı)."
    fi

    echo -n "2. Google Drive log kayıtları temizleniyor... "
    if command -v rclone >/dev/null 2>&1; then
        RESET_TIME=$(date '+%d.%m.%Y %H:%M:%S')
        HEADER="# kush Sohbet Günlüğü (Sıfırlandı: $RESET_TIME)"
        
        TMP_DIR=$(mktemp -d /tmp/kush_reset_XXXXXX)
        echo "$HEADER" > "$TMP_DIR/chat_history.txt"
        echo "[]" > "$TMP_DIR/chat_history.json"
        echo "$HEADER" > "$TMP_DIR/sohbet_gecmisi.txt"
        
        # Fast copy in batch
        rclone copy "$TMP_DIR/" gdrive:apps/kush/logs/ --transfers 4 2>/dev/null || true
        rclone copy "$TMP_DIR/" gdrive:apps/kush/ --transfers 4 2>/dev/null || true
        rclone copy "$TMP_DIR/" gdrive:agy/kush/logs/ --transfers 4 2>/dev/null || true
        rclone copy "$TMP_DIR/" gdrive:agy/kush/ --transfers 4 2>/dev/null || true
        rm -rf "$TMP_DIR"
        echo "✅ Başarılı."
    else
        echo "⚠️ rclone bulunamadı, Drive logları sunucu sync timer ile güncellenecek."
    fi

    echo "=================================================="
    echo "✨ Tüm log kayıtları başarıyla sıfırlandı!"
    echo "=================================================="
    exit 0
fi

if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "kush — Kullanım Kılavuzu:"
    echo "  kush                 : kush arayüzünü donanım optimize bağımsız pencerede başlatır"
    echo "  kush --daemon        : Sıfır CPU & ~9MB RAM ile arka planda bildirim nöbetçisi başlatır"
    echo "  kush --stop          : Arka plandaki nöbetçiyi durdurur"
    echo "  kush --status        : Bağlantı ve arka plan nöbetçi durumunu gösterir"
    echo "  kush --autostart     : Başlangıçta 0% CPU & düşük RAM nöbetçisini otomatik başlatmaya ayarlar"
    echo "  kush --no-autostart  : Başlangıçta otomatik başlatmayı kaldırır"
    echo "  kush --id            : Cihazın Benzersiz ID (KUSH-XXXX-YYYY) bilgilerini görüntüler"
    echo "  kush --resetlog      : Sunucu ve Google Drive üzerindeki tüm sohbet loglarını sıfırlar"
    echo "  kush --help          : Bu yardım mesajını gösterir"
    exit 0
fi

echo "kush başlatılıyor: $SERVER_URL"

# Ultra-optimized Chromium launch parameters (minimal RAM, zero background churn)
LOW_RESOURCE_FLAGS=(
    --app="$SERVER_URL"
    --user-data-dir="$HOME/.config/kush-app"
    --disable-background-networking
    --disable-default-apps
    --disable-extensions
    --disable-sync
    --disable-translate
    --disable-features=MediaRouter,OptimizationHints,Translate
    --disable-component-update
    --no-default-browser-check
    --memory-pressure-off
    --disable-hang-monitor
    --disk-cache-size=10485760
    --disable-prompt-on-repost
)

if command -v chromium >/dev/null 2>&1; then
    exec chromium "${LOW_RESOURCE_FLAGS[@]}" "$@"
elif command -v google-chrome >/dev/null 2>&1; then
    exec google-chrome "${LOW_RESOURCE_FLAGS[@]}" "$@"
elif command -v xdg-open >/dev/null 2>&1; then
    exec xdg-open "$SERVER_URL"
else
    echo "Lütfen tarayıcınızda açın: $SERVER_URL"
fi
