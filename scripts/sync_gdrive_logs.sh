#!/usr/bin/env bash
# ==============================================================================
# kush — Google Drive Chat Log Background Syncer
# ==============================================================================
set -e

SOURCE_DIR="/home/kasa/apps/aura-lan/server/logs"

if [ -f "$SOURCE_DIR/chat_history.json" ]; then
    rclone copy "$SOURCE_DIR/chat_history.json" gdrive:apps/kush/logs/ 2>/dev/null || true
    rclone copy "$SOURCE_DIR/chat_history.txt" gdrive:apps/kush/logs/ 2>/dev/null || true
    
    rclone copy "$SOURCE_DIR/chat_history.json" gdrive:agy/kush/logs/ 2>/dev/null || true
    rclone copy "$SOURCE_DIR/chat_history.txt" gdrive:agy/kush/logs/ 2>/dev/null || true
fi
