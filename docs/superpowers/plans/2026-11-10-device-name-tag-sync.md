# Device Name Tag Network Synchronization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow any device in the Kush network to assign/edit a persistent custom name tag for any device (`deviceId`), which immediately and authoritatively syncs across the server and all connected clients (PC, Toshi, Phone, Daemon).

**Architecture:** The Kush Node.js backend maintains an authoritative, disk-persisted `device_names.json` registry keyed by `deviceId`. When a client sends a `set_device_name` WebSocket event, the server persists the new mapping, updates active peer records, and broadcasts a `device_name_updated` event to all connected clients. Clients (`app.js`, `kush-daemon.py`, and Android APK) update their display names, peer lists, chat bubbles, and profile modals dynamically.

**Tech Stack:** Node.js (HTTP + WebSocket), Vanilla JS (ES6+, DOM, Web Audio), Python 3 (Daemon + Test Suite), Docker & Docker Compose, Android SDK CLI (`aapt2`, `d8`, `apksigner`), ADB, Rclone (`gdrive:`).

**Spec:** User prompt: "ben pcden veya başka cihazdan bir cihazın adını değiştirince diğer bütün cihazlar da adı öyle gelsin. mesela ben buradan telefonun adını gocayörük yaptım diyelim, sen yapma tabi de. onu yaparsam diğer bütün cihazlar da onun adını gocayörük görsün. yani bu id nin yanında bir name tag id gibi taşınacak cihaza özel. advanced pro mode kullan superpowers kullan telefona yükle wireless debugging ile ondan sonra drivedaki apkyı da updatele".

## Global Constraints

- Never break existing message alignment logic (`deviceId` matching for left/right bubble layout).
- Host Debian must not be polluted; Kush backend runs inside Docker container `kush` on port 8088.
- Apple HIG & Anti-Slop: clean input UI in profile modal and peer list, zero jarring layout shifts, immediate feedback.
- Offline-resilient: If server is temporarily unreachable, clients fall back to locally cached device names.
- Zero extra dependencies: 100% standard library (Node.js built-ins, Python built-ins).

## Review Focus

1. **Self-Renaming vs Remote-Renaming:** When Device A renames Device B, Device B's own UI must update immediately without requiring page refresh.
2. **Persistence across Server Restarts:** If the Docker container restarts, all previously assigned device names must survive in `logs/device_names.json`.
3. **Empty or Whitespace Names:** Setting an empty string or spaces must cleanly reset/remove the custom name tag back to default device name.
4. **Offline / Late Joiners:** When a new device connects 10 minutes later, the `init` WebSocket handshake must include all existing `deviceNames`.
5. **Daemon Notifications:** `kush-daemon.py` on Linux/Toshi must display the updated custom name tag instead of the raw hostname.

---

### Task 1: Server-Side Device Name Registry & Real-Time Sync

**Files:**
- Modify: `server/index.js`
- Test: `tests/test_device_name_sync.py`

- [ ] **Step 1.1:** Add `DEVICE_NAMES_FILE = path.join(LOGS_DIR, 'device_names.json')` and in-memory `deviceNames = new Map()` or object in `server/index.js`.
- [ ] **Step 1.2:** Add persistence helpers: `loadDeviceNames()` on server boot and `persistDeviceNames()` upon updates.
- [ ] **Step 1.3:** Include `deviceNames: Object.fromEntries(deviceNames)` in WebSocket `init` payload on client connection.
- [ ] **Step 1.4:** In WebSocket message router, handle `set_device_name` message (`targetDeviceId`, `customName`). Validate `targetDeviceId` format (`KUSH-XXXX-YYYY` or client tag). If valid, update memory + disk, update matching peer's `peer.name`, and broadcast `{ type: 'device_name_updated', targetDeviceId, customName, deviceNames: Object.fromEntries(deviceNames) }` and `broadcastPeerList()`.
- [ ] **Step 1.5:** In `identify` message, if `deviceNames.has(currentPeer.deviceId)`, override `currentPeer.name` with the custom name tag so server-side peer list is authoritative.

---

### Task 2: Automated Integration Test Suite (TDD)

**Files:**
- Create: `tests/test_device_name_sync.py`

- [ ] **Step 2.1:** Write automated integration test script connecting 3 virtual WebSocket clients (Client 1: PC, Client 2: Phone, Client 3: Toshi).
- [ ] **Step 2.2:** Verify Client 1 sets Client 2's name to "Gocayörük".
- [ ] **Step 2.3:** Assert Client 2 receives `device_name_updated` with `targetDeviceId` matching its own ID.
- [ ] **Step 2.4:** Assert Client 3 receives `device_name_updated` and updates its peer list for Client 2.
- [ ] **Step 2.5:** Connect a fresh Client 4 and verify `init` contains the "Gocayörük" name tag in `deviceNames`.
- [ ] **Step 2.6:** Run tests and verify 100% pass.

---

### Task 3: Client-Side UI & Network Name Tag Integration

**Files:**
- Modify: `public/app.js`
- Modify: `public/index.html`

- [ ] **Step 3.1:** In `public/app.js`, maintain `networkDeviceNames = {}` populated from `msg.deviceNames` on `init` and `localStorage.getItem('kush_network_device_names')`.
- [ ] **Step 3.2:** Handle incoming `device_name_updated`: update `networkDeviceNames`, persist to localStorage, and if `targetDeviceId === myDeviceId`, update `myName`, update header label, and update self card.
- [ ] **Step 3.3:** Update `getDisplayNameForDevice(deviceId, defaultName)` to resolve from `networkDeviceNames[deviceId]` with highest priority.
- [ ] **Step 3.4:** In `renderDeviceAliasesUI()` (Adres Defteri), update the input change handler to dispatch WebSocket `{ type: 'set_device_name', targetDeviceId: devId, customName: val }` so renaming broadcasts network-wide.
- [ ] **Step 3.5:** Add a quick-rename button or inline pencil icon in the Peer List so any device can be renamed directly from the main sidebar.

---

### Task 4: Background Daemon Name Tag Support

**Files:**
- Modify: `scripts/kush-daemon.py`

- [ ] **Step 4.1:** In `scripts/kush-daemon.py`, maintain `device_names = {}` dictionary.
- [ ] **Step 4.2:** On receiving `init`, load `device_names.update(data.get("deviceNames", {}))`.
- [ ] **Step 4.3:** On receiving `device_name_updated`, update `device_names[targetDeviceId] = customName`.
- [ ] **Step 4.4:** In `new_message` and `file_shared`, resolve sender name via `device_names.get(sender_dev_id, sender_name)` for system notifications.
- [ ] **Step 4.5:** Update running daemon on Toshi.

---

### Task 5: Docker Container Rebuild & Verification

**Files:**
- Rebuild: Container `kush` via `docker compose up -d --build` in `/home/kasa/apps/aura-lan`.

- [ ] **Step 5.1:** Rebuild Docker container `kush`.
- [ ] **Step 5.2:** Verify health and logs on port 8088.
- [ ] **Step 5.3:** Run automated test `tests/test_device_name_sync.py` against live container.

---

### Task 6: Android APK Recompilation

**Files:**
- Execute: `android/build-apk.sh` inside JDK 17 Docker container.

- [ ] **Step 6.1:** Copy updated `public/` web assets into Android build directory.
- [ ] **Step 6.2:** Compile resources, Java code, DEX desugaring, zipalign, and sign with release keystore (`kush.apk`).
- [ ] **Step 6.3:** Verify APK signature using `apksigner verify`.

---

### Task 7: Wireless ADB Deployment to Phone

**Files:**
- Target: `TECNO KJ6` at `192.168.1.228:5555` via Toshi.

- [ ] **Step 7.1:** Transfer newly compiled `kush.apk` to Toshi.
- [ ] **Step 7.2:** Run `adb -s 192.168.1.228:5555 install -r /tmp/kush.apk`.
- [ ] **Step 7.3:** Verify installation success (`Success`) and launch `com.kush.app`.

---

### Task 8: Google Drive / Rclone APK Update

**Files:**
- Update remotes on `gdrive:`.

- [ ] **Step 8.1:** Use `rclone copy` to update:
  - `gdrive:apps/kush/kush.apk`
  - `gdrive:agy/kush/kush.apk`
  - `gdrive:aura-lan.apk`
  - `gdrive:agy/saksogan/saksogan.apk`
- [ ] **Step 8.2:** Verify timestamps and sizes on Google Drive.

---

### Task 9: Multi-Device End-to-End Verification & Delivery

- [ ] **Step 9.1:** Perform live test changing a device name tag from PC/script and confirm all clients see the change in real-time.
- [ ] **Step 9.2:** Confirm zero regressions in chat alignment and file sharing.
- [ ] **Step 9.3:** Present comprehensive completion report to user.
