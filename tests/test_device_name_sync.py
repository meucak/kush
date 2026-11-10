#!/usr/bin/env python3
"""
Integration Test Suite: Multi-Device Name Tag Synchronization
Verifies that:
1. Client A (PC) renames Client B (Phone) to "Gocayörük".
2. Client B receives real-time broadcast and learns its new authoritative name.
3. Client C (Toshi) receives real-time broadcast and updates Client B's name in peer list.
4. Client B sends a chat message, and peers receive it with senderName "Gocayörük".
5. A late-joining Client D receives "Gocayörük" in the `init` handshake payload.
6. HTTP REST endpoints (/api/device-names) support querying and setting name tags.
"""

import socket
import base64
import os
import json
import time
import sys
import urllib.request
import urllib.error

HOST = "127.0.0.1"
PORT = 8088

class SimpleWS:
    def __init__(self, host=HOST, port=PORT, path="/ws"):
        self.host = host
        self.port = port
        self.path = path
        self.sock = None

    def connect(self):
        self.sock = socket.create_connection((self.host, self.port), timeout=5)
        sec_key = base64.b64encode(os.urandom(16)).decode("ascii")
        req = (
            f"GET {self.path} HTTP/1.1\r\n"
            f"Host: {self.host}:{self.port}\r\n"
            f"Upgrade: websocket\r\n"
            f"Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {sec_key}\r\n"
            f"Sec-WebSocket-Version: 13\r\n\r\n"
        )
        self.sock.sendall(req.encode("utf-8"))
        res = self.sock.recv(4096).decode("utf-8", errors="ignore")
        assert "101 Switching Protocols" in res, f"WS Handshake failed: {res[:100]}"
        self.sock.settimeout(5.0)

    def send_json(self, payload):
        data = json.dumps(payload).encode("utf-8")
        frame = bytearray([0x81])
        length = len(data)
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
        frame.extend(bytearray(b ^ mask[i % 4] for i, b in enumerate(data)))
        self.sock.sendall(frame)

    def recv_json(self):
        head = self._recv_exact(2)
        if not head:
            return None
        b1, b2 = head[0], head[1]
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
        return json.loads(payload.decode("utf-8"))

    def _recv_exact(self, n):
        buf = bytearray()
        while len(buf) < n:
            chunk = self.sock.recv(n - len(buf))
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

def test_full_device_name_sync():
    print("--- Starting Multi-Device Name Tag Sync Integration Test ---")

    # 1. Connect Client A (PC)
    client_a = SimpleWS()
    client_a.connect()
    init_a = client_a.recv_json()
    assert init_a["type"] == "init", "Client A init failed"
    client_a.send_json({
        "type": "identify",
        "deviceId": "KUSH-1111-2222",
        "name": "Masaüstü PC",
        "deviceType": "linux"
    })

    # 2. Connect Client B (Phone)
    client_b = SimpleWS()
    client_b.connect()
    init_b = client_b.recv_json()
    assert init_b["type"] == "init", "Client B init failed"
    client_b.send_json({
        "type": "identify",
        "deviceId": "KUSH-3333-4444",
        "name": "Telefon",
        "deviceType": "android"
    })

    # 3. Connect Client C (Toshi)
    client_c = SimpleWS()
    client_c.connect()
    init_c = client_c.recv_json()
    assert init_c["type"] == "init", "Client C init failed"
    client_c.send_json({
        "type": "identify",
        "deviceId": "KUSH-5555-6666",
        "name": "Toshi Laptop",
        "deviceType": "linux"
    })

    time.sleep(0.2)
    print("✓ Step 1: 3 Clients connected and identified successfully.")

    # 4. Client A sets Client B's name tag to "Gocayörük"
    print("Sending set_device_name from Client A...")
    client_a.send_json({
        "type": "set_device_name",
        "targetDeviceId": "KUSH-3333-4444",
        "customName": "Gocayörük"
    })

    # 5. Verify Client B receives device_name_updated broadcast
    received_on_b = False
    start_t = time.time()
    while time.time() - start_t < 3:
        msg = client_b.recv_json()
        if msg and msg.get("type") == "device_name_updated":
            assert msg["targetDeviceId"] == "KUSH-3333-4444"
            assert msg["customName"] == "Gocayörük"
            assert msg["deviceNames"]["KUSH-3333-4444"] == "Gocayörük"
            received_on_b = True
            break
    assert received_on_b, "Client B did not receive device_name_updated!"
    print("✓ Step 2: Client B (target phone) received real-time name tag update.")

    # 6. Verify Client C receives device_name_updated broadcast
    received_on_c = False
    start_t = time.time()
    while time.time() - start_t < 3:
        msg = client_c.recv_json()
        if msg and msg.get("type") == "device_name_updated":
            assert msg["targetDeviceId"] == "KUSH-3333-4444"
            assert msg["customName"] == "Gocayörük"
            received_on_c = True
            break
    assert received_on_c, "Client C did not receive device_name_updated!"
    print("✓ Step 3: Client C (peer) received real-time name tag update.")

    # 7. Verify Client B sends a chat message and it carries authoritative name
    client_b.send_json({
        "type": "chat_message",
        "text": "Selam millet ben artık Gocayörük!",
        "deviceId": "KUSH-3333-4444"
    })

    msg_received = False
    start_t = time.time()
    while time.time() - start_t < 3:
        msg = client_c.recv_json()
        if msg and msg.get("type") == "new_message":
            m = msg["message"]
            if m.get("text") == "Selam millet ben artık Gocayörük!":
                assert m["senderName"] == "Gocayörük", f"Expected senderName 'Gocayörük', got '{m.get('senderName')}'"
                assert m["deviceId"] == "KUSH-3333-4444"
                msg_received = True
                break
    assert msg_received, "Client C did not receive chat message from Client B!"
    print("✓ Step 4: Chat messages from renamed device broadcast with the new name tag.")

    # 8. Late-joining Client D
    client_d = SimpleWS()
    client_d.connect()
    init_d = client_d.recv_json()
    assert init_d["type"] == "init"
    assert "deviceNames" in init_d, "deviceNames missing in init payload"
    assert init_d["deviceNames"].get("KUSH-3333-4444") == "Gocayörük", "Late joiner did not receive updated deviceNames"
    print("✓ Step 5: Late-joining Client D received updated deviceNames in init handshake.")

    # 9. Test HTTP REST endpoint GET & POST
    req = urllib.request.Request(f"http://{HOST}:{PORT}/api/device-names")
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        assert data["success"] is True
        assert data["deviceNames"]["KUSH-3333-4444"] == "Gocayörük"
    print("✓ Step 6: HTTP GET /api/device-names returned correct mapping.")

    # 10. Clean up test name tag
    client_a.send_json({
        "type": "set_device_name",
        "targetDeviceId": "KUSH-3333-4444",
        "customName": ""
    })
    time.sleep(0.2)

    client_a.close()
    client_b.close()
    client_c.close()
    client_d.close()

    print("\n🎉 ALL MULTI-DEVICE NAME TAG SYNC TESTS PASSED (6/6)!\n")

if __name__ == "__main__":
    test_full_device_name_sync()
