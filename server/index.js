const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');
const os = require('os');
const crypto = require('crypto');

const PORT = process.env.PORT || 8088;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const LOGS_DIR = path.join(__dirname, 'logs');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

const CHAT_LOG_FILE = path.join(LOGS_DIR, 'chat_history.json');
const READABLE_LOG_FILE = path.join(LOGS_DIR, 'chat_history.txt');

// In-memory state
const peers = new Map(); // ws -> { id, name, deviceType, ip, joinedAt, lastSeen }
const messageHistory = []; // last 150 messages
const MAX_HISTORY = 150;
let sharedClipboard = { text: '', sender: 'System', updatedAt: Date.now() };

// Load persisted history on startup
if (fs.existsSync(CHAT_LOG_FILE)) {
  try {
    const raw = fs.readFileSync(CHAT_LOG_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      messageHistory.push(...parsed);
    }
  } catch (err) {
    console.error('Failed to load chat history:', err);
  }
}

function persistMessages() {
  try {
    fs.writeFileSync(CHAT_LOG_FILE, JSON.stringify(messageHistory, null, 2), 'utf8');
    const readable = messageHistory.map(m => {
      const time = new Date(m.timestamp).toLocaleString('tr-TR');
      if (m.type === 'file') {
        return `[${time}] ${m.senderName} (${m.deviceType || 'cihaz'}) [DOSYA]: ${m.originalName} (${(m.size / 1024).toFixed(1)} KB) -> /api/download/${m.id}`;
      }
      return `[${time}] ${m.senderName} (${m.deviceType || 'cihaz'}): ${m.text}`;
    }).join('\n');
    fs.writeFileSync(READABLE_LOG_FILE, readable, 'utf8');
  } catch (err) {
    console.error('Failed to persist chat history:', err);
  }
}

// MIME lookup
const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.apk': 'application/vnd.android.package-archive',
  '.zip': 'application/zip'
};

function getNetworkAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push({ iface: name, address: net.address });
      }
    }
  }
  return addresses;
}

const server = http.createServer((req, res) => {
  // CORS & Security Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, X-File-Name, X-File-Type, X-Sender-Name');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(parsedUrl.pathname);

  // --- API: Info ---
  if (pathname === '/api/info' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      appName: 'kush',
      version: '1.0.0',
      uptime: process.uptime(),
      addresses: getNetworkAddresses(),
      activePeers: peers.size,
      sharedClipboard
    }));
    return;
  }

  // --- API: Chat Logs ---
  if (pathname === '/api/logs/chat' && req.method === 'GET') {
    if (fs.existsSync(READABLE_LOG_FILE)) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=UTF-8' });
      fs.createReadStream(READABLE_LOG_FILE).pipe(res);
      return;
    } else {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=UTF-8' });
      res.end('Henüz sohbet kaydı bulunmuyor.');
      return;
    }
  }

  // --- API: Upload File ---
  if (pathname === '/api/upload' && req.method === 'POST') {
    const rawFileName = req.headers['x-file-name'] || 'file_' + Date.now();
    const fileName = decodeURIComponent(rawFileName);
    const mimeType = req.headers['x-file-type'] || 'application/octet-stream';
    const senderName = decodeURIComponent(req.headers['x-sender-name'] || 'Anonymous');
    const fileId = crypto.randomUUID();
    const safeStorageName = `${fileId}_${path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const targetPath = path.join(UPLOADS_DIR, safeStorageName);

    const writeStream = fs.createWriteStream(targetPath);
    let bytesReceived = 0;

    req.on('data', chunk => {
      bytesReceived += chunk.length;
    });

    req.pipe(writeStream);

    writeStream.on('finish', () => {
      const fileMeta = {
        id: fileId,
        storageName: safeStorageName,
        originalName: fileName,
        size: bytesReceived,
        mimeType,
        senderName,
        url: `/api/files/${safeStorageName}`,
        uploadedAt: Date.now()
      };

      // Broadcast file notification via WebSocket
      broadcast({
        type: 'file_shared',
        file: fileMeta
      });

      // Add to history and persist
      messageHistory.push({
        id: fileId,
        type: 'file',
        senderName,
        originalName: fileName,
        size: bytesReceived,
        url: fileMeta.url,
        timestamp: Date.now()
      });
      persistMessages();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, file: fileMeta }));
    });

    writeStream.on('error', err => {
      console.error('File upload error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    });
    return;
  }

  // --- API: Serve Uploaded Files with Range Support ---
  if (pathname.startsWith('/api/files/')) {
    const requestedFile = path.basename(pathname.replace('/api/files/', ''));
    const filePath = path.join(UPLOADS_DIR, requestedFile);

    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File Not Found');
      return;
    }

    const stat = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Range support for audio/video streaming
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(filePath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType
      });
      file.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${requestedFile.split('_').slice(1).join('_') || requestedFile}"`
      });
      fs.createReadStream(filePath).pipe(res);
    }
    return;
  }

  // --- API: Direct APK Download ---
  if (pathname === '/download/kush.apk' || pathname === '/download/saksogan.apk' || pathname === '/download/aura.apk' || pathname === '/download/app.apk') {
    const apkPath = path.join(__dirname, '..', 'kush.apk');
    if (fs.existsSync(apkPath)) {
      const stat = fs.statSync(apkPath);
      res.writeHead(200, {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Length': stat.size,
        'Content-Disposition': 'attachment; filename="kush.apk"'
      });
      fs.createReadStream(apkPath).pipe(res);
      return;
    }
  }

  // --- Static Files Serving ---
  let safePath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(PUBLIC_DIR, safePath);

  // Prevent directory traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback to index.html for SPA/PWA routing
      const indexFallback = path.join(PUBLIC_DIR, 'index.html');
      fs.readFile(indexFallback, (err2, data) => {
        if (err2) {
          res.writeHead(404);
          res.end('Not Found');
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
          res.end(data);
        }
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const cacheControl = ext === '.html' || ext === '.json'
      ? 'no-cache, must-revalidate'
      : 'public, max-age=86400';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': cacheControl
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

// --- WebSocket Server ---
const wss = new WebSocketServer({ server, path: '/ws' });

function getClientIp(req) {
  return req.headers['x-forwarded-for']
    ? req.headers['x-forwarded-for'].split(',')[0].trim()
    : req.socket.remoteAddress.replace(/^.*:/, '');
}

function broadcast(data, excludeWs = null) {
  const payload = JSON.stringify(data);
  for (const [clientWs] of peers) {
    if (clientWs !== excludeWs && clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(payload);
    }
  }
}

function broadcastPeerList() {
  const peerList = Array.from(peers.values());
  broadcast({
    type: 'peer_list',
    peers: peerList
  });
}

wss.on('connection', (ws, req) => {
  const peerId = crypto.randomUUID();
  const remoteIp = getClientIp(req);

  peers.set(ws, {
    id: peerId,
    name: `Peer-${peerId.slice(0, 4)}`,
    deviceType: 'unknown',
    ip: remoteIp,
    joinedAt: Date.now(),
    lastSeen: Date.now()
  });

  // Send initial handshake state to the connecting client
  ws.send(JSON.stringify({
    type: 'init',
    yourId: peerId,
    yourIp: remoteIp,
    peers: Array.from(peers.values()),
    history: messageHistory,
    clipboard: sharedClipboard
  }));

  ws.on('message', rawMessage => {
    try {
      const msg = JSON.parse(rawMessage.toString());
      const currentPeer = peers.get(ws);
      if (!currentPeer) return;

      currentPeer.lastSeen = Date.now();

      switch (msg.type) {
        case 'identify':
          if (msg.name) currentPeer.name = msg.name.trim().slice(0, 32);
          if (msg.deviceType) currentPeer.deviceType = msg.deviceType;
          broadcastPeerList();
          break;

        case 'chat_message':
          if (!msg.text || !msg.text.trim()) return;
          const newMsg = {
            id: crypto.randomUUID(),
            senderId: currentPeer.id,
            senderName: currentPeer.name,
            deviceType: currentPeer.deviceType,
            text: msg.text.trim().slice(0, 5000),
            timestamp: Date.now()
          };
          messageHistory.push(newMsg);
          if (messageHistory.length > MAX_HISTORY) messageHistory.shift();
          persistMessages();
          broadcast({ type: 'new_message', message: newMsg });
          break;

        case 'typing':
          broadcast({
            type: 'peer_typing',
            peerId: currentPeer.id,
            peerName: currentPeer.name,
            isTyping: !!msg.isTyping
          }, ws);
          break;

        case 'clipboard_broadcast':
          if (msg.text) {
            sharedClipboard = {
              text: msg.text.slice(0, 10000),
              sender: currentPeer.name,
              updatedAt: Date.now()
            };
            broadcast({ type: 'clipboard_updated', clipboard: sharedClipboard });
          }
          break;

        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;
      }
    } catch (e) {
      console.error('WS parse error:', e);
    }
  });

  ws.on('close', () => {
    const departing = peers.get(ws);
    peers.delete(ws);
    if (departing) {
      broadcast({
        type: 'peer_left',
        peerId: departing.id,
        peerName: departing.name
      });
      broadcastPeerList();
    }
  });

  ws.on('error', err => {
    console.error('WS socket error:', err);
  });
});

// Clean up stale connections every 30s
setInterval(() => {
  const now = Date.now();
  for (const [ws, peer] of peers) {
    if (now - peer.lastSeen > 60000) {
      ws.terminate();
      peers.delete(ws);
      broadcastPeerList();
    }
  }
}, 30000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(` kush Server running on port ${PORT}`);
  console.log(` Local Addresses:`);
  getNetworkAddresses().forEach(addr => {
    console.log(`  -> http://${addr.address}:${PORT} (${addr.iface})`);
  });
  console.log(`====================================================`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully.');
  server.close(() => process.exit(0));
});
