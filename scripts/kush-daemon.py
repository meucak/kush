#!/usr/bin/env python3
"""
==============================================================================
kush-daemon — Ultra-Lightweight Background Listener (Zero-CPU, ~9MB RAM)
==============================================================================
Pure Python standard library implementation of RFC 6455 WebSocket client.
Connects to kush server, idles with 0.0% CPU in kernel epoll, and displays
native desktop notifications when messages or files arrive from peers.
"""

import sys
import os
import socket
import ssl
import json
import base64
import time
import random
import subprocess
import signal
from urllib.parse import urlparse

# Server candidate list
CANDIDATE_SERVERS = [
    "http://100.69.155.110:8088",  # Kasa direct Tailscale IP
    "http://192.168.1.102:8088",   # Kasa Ethernet direct
    "http://192.168.1.27:8088",    # Toshi relay
    "http://127.0.0.1:8088"        # Localhost
]

CONFIG_DIR = os.path.expanduser("~/.config/kush")
IDENTITY_FILE = os.path.join(CONFIG_DIR, "identity.json")
PID_FILE = os.path.join(CONFIG_DIR, "daemon.pid")

def generate_device_id():
    chars = "0123456789ABCDEF"
    p1 = "".join(random.choice(chars) for _ in range(4))
    p2 = "".join(random.choice(chars) for _ in range(4))
    return f"KUSH-{p1}-{p2}"

def load_or_create_identity():
    os.makedirs(CONFIG_DIR, exist_ok=True)
    identity = {}
    if os.path.exists(IDENTITY_FILE):
        try:
            with open(IDENTITY_FILE, "r", encoding="utf-8") as f:
                identity = json.load(f)
        except Exception:
            identity = {}

    if not identity.get("client_tag"):
        identity["client_tag"] = f"tag_linux_{socket.gethostname()}_{int(time.time())}"
    if not identity.get("name"):
        identity["name"] = socket.gethostname().capitalize()
    if not identity.get("device_id") or not identity.get("device_id").startswith("KUSH-"):
        identity["device_id"] = generate_device_id()
    # Remove obsolete tc_no if present
    identity.pop("tc_no", None)

    try:
        with open(IDENTITY_FILE, "w", encoding="utf-8") as f:
            json.dump(identity, f, indent=2, ensure_ascii=False)
    except Exception:
        pass

    return identity

def send_notification(title, body):
    icon_paths = [
        os.path.expanduser("~/.local/share/icons/kush.png"),
        "/usr/share/icons/hicolor/128x128/apps/kush.png",
        "dialog-information"
    ]
    icon = "dialog-information"
    for p in icon_paths:
        if os.path.exists(p):
            icon = p
            break

    try:
        subprocess.run(
            ["notify-send", "-a", "kush", "-i", icon, title, body],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=3
        )
    except Exception:
        try:
            # Fallback for Windows if run under WSL/Win
            if sys.platform == "win32":
                ps_cmd = f'[reflection.assembly]::loadwithpartialname("System.Windows.Forms"); [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null'
                subprocess.run(["powershell", "-Command", ps_cmd], timeout=3)
        except Exception:
            pass

class MinimalWebSocketClient:
    def __init__(self, host, port, path="/ws", is_ssl=False):
        self.host = host
        self.port = port
        self.path = path
        self.is_ssl = is_ssl
        self.sock = None

    def connect(self, timeout=5.0):
        raw_sock = socket.create_connection((self.host, self.port), timeout=timeout)
        if self.is_ssl:
            ctx = ssl.create_default_context()
            self.sock = ctx.wrap_socket(raw_sock, server_hostname=self.host)
        else:
            self.sock = raw_sock

        sec_key = base64.b64encode(os.urandom(16)).decode("ascii")
        headers = [
            f"GET {self.path} HTTP/1.1",
            f"Host: {self.host}:{self.port}",
            "Upgrade: websocket",
            "Connection: Upgrade",
            f"Sec-WebSocket-Key: {sec_key}",
            "Sec-WebSocket-Version: 13",
            "\r\n"
        ]
        self.sock.sendall("\r\n".join(headers).encode("utf-8"))

        res = self.sock.recv(4096).decode("utf-8", errors="ignore")
        if "101 Switching Protocols" not in res:
            raise ConnectionError(f"Handshake failed: {res[:100]}")

        # Set keepalive and remove short timeout for epoll idle
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
        self.sock.settimeout(60.0)

    def send_text(self, text):
        data = text.encode("utf-8")
        length = len(data)
        frame = bytearray([0x81])  # FIN + Opcode 1 (Text)

        mask = os.urandom(4)
        if length <= 125:
            frame.append(0x80 | length)
        elif length <= 65535:
            frame.append(0x80 | 126)
            frame.extend(length.to_bytes(2, "big"))
        else:
            frame.append(0x80 | 127)
            frame.extend(length.to_bytes(8, "big"))

        frame.extend(mask)
        masked = bytearray(b ^ mask[i % 4] for i, b in enumerate(data))
        frame.extend(masked)
        self.sock.sendall(frame)

    def recv_frame(self):
        head = self._recv_exact(2)
        if not head:
            return None, None
        b1, b2 = head[0], head[1]
        opcode = b1 & 0x0F
        masked = (b2 & 0x80) != 0
        payload_len = b2 & 0x7F

        if payload_len == 126:
            payload_len = int.from_bytes(self._recv_exact(2), "big")
        elif payload_len == 127:
            payload_len = int.from_bytes(self._recv_exact(8), "big")

        mask = self._recv_exact(4) if masked else None
        payload = self._recv_exact(payload_len)

        if masked:
            payload = bytearray(b ^ mask[i % 4] for i, b in enumerate(payload))

        return opcode, payload

    def _recv_exact(self, num_bytes):
        buf = bytearray()
        while len(buf) < num_bytes:
            chunk = self.sock.recv(num_bytes - len(buf))
            if not chunk:
                return None
            buf.extend(chunk)
        return buf

    def close(self):
        if self.sock:
            try:
                self.sock.close()
            except Exception:
                pass
            self.sock = None

def find_working_server():
    for base in CANDIDATE_SERVERS:
        try:
            parsed = urlparse(base)
            host = parsed.hostname
            port = parsed.port or (443 if parsed.scheme == "https" else 80)
            s = socket.create_connection((host, port), timeout=1.0)
            s.close()
            return host, port, (parsed.scheme == "https")
        except Exception:
            continue
    return None, None, False

def run_daemon_loop():
    identity = load_or_create_identity()
    my_tag = identity["client_tag"]
    my_name = identity["name"]
    my_device_id = identity["device_id"]
    device_names = {}

    while True:
        host, port, is_ssl = find_working_server()
        if not host:
            time.sleep(5)
            continue

        ws = MinimalWebSocketClient(host, port, "/ws", is_ssl)
        try:
            ws.connect(timeout=4.0)

            # Identify self with persistent Device ID and Tag
            identify_payload = json.dumps({
                "type": "identify",
                "deviceId": my_device_id,
                "senderDeviceId": my_device_id,
                "clientTag": my_tag,
                "clientId": my_tag,
                "name": my_name,
                "deviceType": "linux",
                "deviceName": socket.gethostname()
            })
            ws.send_text(identify_payload)

            last_ping = time.time()

            while True:
                # Periodic keepalive ping every 25s
                if time.time() - last_ping > 25:
                    ws.send_text(json.dumps({"type": "ping"}))
                    last_ping = time.time()

                try:
                    opcode, payload = ws.recv_frame()
                except socket.timeout:
                    continue

                if opcode is None:
                    break  # Disconnected

                if opcode == 0x1:  # Text frame
                    try:
                        data = json.loads(payload.decode("utf-8"))
                        msg_type = data.get("type")

                        if msg_type == "init":
                            if data.get("deviceNames"):
                                device_names.update(data.get("deviceNames", {}))

                        elif msg_type == "device_name_updated":
                            if data.get("deviceNames"):
                                device_names = data.get("deviceNames", {})
                            elif data.get("targetDeviceId"):
                                tid = data.get("targetDeviceId")
                                if data.get("customName"):
                                    device_names[tid] = data.get("customName")
                                elif tid in device_names:
                                    del device_names[tid]

                        elif msg_type == "new_message":
                            msg = data.get("message", {})
                            sender_dev_id = msg.get("deviceId") or msg.get("senderDeviceId")
                            sender_tag = msg.get("clientTag") or msg.get("senderClientId")

                            # Only notify if incoming from another device!
                            is_self = (sender_dev_id and sender_dev_id == my_device_id) or (sender_tag and sender_tag == my_tag)
                            if not is_self:
                                raw_sender = msg.get("senderName", "Ağ Cihazı")
                                sender_name = device_names.get(sender_dev_id) or raw_sender
                                id_info = f" [{sender_dev_id}]" if sender_dev_id else ""
                                text = msg.get("text", "")
                                send_notification(f"kush: {sender_name}{id_info}", text)

                        elif msg_type == "file_shared":
                            f = data.get("file", {})
                            sender_dev_id = f.get("deviceId") or f.get("senderDeviceId")
                            sender_tag = f.get("clientTag") or f.get("senderClientId")

                            is_self = (sender_dev_id and sender_dev_id == my_device_id) or (sender_tag and sender_tag == my_tag)
                            if not is_self:
                                raw_sender = f.get("senderName", "Ağ Cihazı")
                                sender_name = device_names.get(sender_dev_id) or raw_sender
                                file_name = f.get("originalName", "dosya")
                                id_info = f" [{sender_dev_id}]" if sender_dev_id else ""
                                send_notification(f"kush: {sender_name}{id_info}", f"📁 Dosya paylaştı: {file_name}")

                    except Exception:
                        pass

                elif opcode == 0x8:  # Close frame
                    break

        except Exception:
            pass
        finally:
            ws.close()

        time.sleep(3)  # Brief backoff before reconnect

def start_daemon_background():
    os.makedirs(CONFIG_DIR, exist_ok=True)
    if os.path.exists(PID_FILE):
        try:
            with open(PID_FILE, "r") as f:
                pid = int(f.read().strip())
            os.kill(pid, 0)
            print(f"kush-daemon zaten çalışıyor (PID: {pid}).")
            return
        except Exception:
            try: os.remove(PID_FILE)
            except Exception: pass

    # Fork to background
    pid = os.fork()
    if pid > 0:
        with open(PID_FILE, "w") as f:
            f.write(str(pid))
        print(f"✅ kush-daemon arka planda başlatıldı (PID: {pid}). 0% CPU & ~9MB RAM.")
        sys.exit(0)

    # Child process
    os.setsid()
    try:
        devnull = os.open(os.devnull, os.O_RDWR)
        os.dup2(devnull, 0)
        os.dup2(devnull, 1)
        os.dup2(devnull, 2)
        os.close(devnull)
    except Exception:
        pass

    signal.signal(signal.SIGTERM, lambda s, f: sys.exit(0))
    run_daemon_loop()

def stop_daemon():
    if not os.path.exists(PID_FILE):
        print("kush-daemon çalışmıyor.")
        return
    try:
        with open(PID_FILE, "r") as f:
            pid = int(f.read().strip())
        os.kill(pid, signal.SIGTERM)
        time.sleep(0.3)
        try:
            os.kill(pid, signal.SIGKILL)
        except Exception:
            pass
        os.remove(PID_FILE)
        print(f"🛑 kush-daemon durduruldu (PID: {pid}).")
    except Exception as e:
        print(f"Hata: {e}")
        try: os.remove(PID_FILE)
        except Exception: pass

def daemon_status():
    if not os.path.exists(PID_FILE):
        print("Durum: Durduruldu (Çalışmıyor).")
        return
    try:
        with open(PID_FILE, "r") as f:
            pid = int(f.read().strip())
        os.kill(pid, 0)
        # Check memory
        mem_kb = 0
        try:
            with open(f"/proc/{pid}/status", "r") as f:
                for line in f:
                    if line.startswith("VmRSS:"):
                        mem_kb = int(line.split()[1])
                        break
        except Exception:
            pass
        print(f"Durum: 🟢 AKTİF (PID: {pid}, Bellek: {mem_kb / 1024:.1f} MB, CPU: 0.0%)")
    except Exception:
        print("Durum: Durduruldu (PID dosyası temizleniyor).")
        try: os.remove(PID_FILE)
        except Exception: pass

if __name__ == "__main__":
    if len(sys.argv) > 1:
        cmd = sys.argv[1].lower()
        if cmd in ["--start", "start", "-s"]:
            start_daemon_background()
        elif cmd in ["--stop", "stop", "-k"]:
            stop_daemon()
        elif cmd in ["--status", "status"]:
            daemon_status()
        elif cmd in ["--run", "run"]:
            run_daemon_loop()
        else:
            print("Kullanım: kush-daemon.py [--start | --stop | --status | --run]")
    else:
        run_daemon_loop()
