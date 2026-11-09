#!/usr/bin/env bash
# ==============================================================================
# kush — Linux Client Launcher & Management CLI (Tailscale & LAN)
# ==============================================================================

SERVER_URL="http://100.69.155.110:8088"

# Check Tailscale first, fallback to LAN if needed
if ! curl -s --connect-timeout 1 "$SERVER_URL/api/info" >/dev/null 2>&1; then
    if curl -s --connect-timeout 1 "http://192.168.1.102:8088/api/info" >/dev/null 2>&1; then
        SERVER_URL="http://192.168.1.102:8088"
    elif curl -s --connect-timeout 1 "http://192.168.1.27:8088/api/info" >/dev/null 2>&1; then
        SERVER_URL="http://192.168.1.27:8088"
    fi
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
    echo "Kullanım:"
    echo "  kush             : kush uygulamasını bağımsız pencerede başlatır"
    echo "  kush --resetlog  : Sunucu ve Google Drive üzerindeki tüm sohbet loglarını sıfırlar"
    echo "  kush --help      : Bu yardım mesajını gösterir"
    exit 0
fi

echo "kush başlatılıyor: $SERVER_URL"

if command -v chromium >/dev/null 2>&1; then
    exec chromium --app="$SERVER_URL" --user-data-dir="$HOME/.config/kush-app" "$@"
elif command -v google-chrome >/dev/null 2>&1; then
    exec google-chrome --app="$SERVER_URL" --user-data-dir="$HOME/.config/kush-app" "$@"
elif command -v xdg-open >/dev/null 2>&1; then
    exec xdg-open "$SERVER_URL"
else
    echo "Lütfen tarayıcınızda açın: $SERVER_URL"
fi
