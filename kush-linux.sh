#!/usr/bin/env bash
# ==============================================================================
# kush — Linux Client Launcher (Tailscale & Local LAN)
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
