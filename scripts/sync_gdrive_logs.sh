#!/usr/bin/env bash
# ==============================================================================
# kush — Google Drive Chat Log Background Syncer (Fast Batch Transfer)
# ==============================================================================
set -e

SOURCE_DIR="/home/kasa/apps/aura-lan/server/logs"

if [ -f "$SOURCE_DIR/chat_history.json" ]; then
    # Perform fast batched copies with max 4 transfers
    rclone copy "$SOURCE_DIR" gdrive:apps/kush/logs/ --include "chat_history.*" --transfers 4 2>/dev/null || true
    rclone copy "$SOURCE_DIR" gdrive:agy/kush/logs/ --include "chat_history.*" --transfers 4 2>/dev/null || true
fi
