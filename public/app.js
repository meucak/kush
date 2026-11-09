// ==============================================================================
// kush — Reactive LAN & Tailscale Client (Clean, Fast & Apple HIG)
// ==============================================================================

(function() {
  'use strict';

  // --- Client Persistent State ---
  let ws = null;
  let myId = null;
  let myIp = null;
  
  // Persistent Client UUID across reloads / sessions (ensures own messages are ALWAYS on the right)
  let myClientId = localStorage.getItem('kush_client_id');
  if (!myClientId) {
    myClientId = 'c_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
    localStorage.setItem('kush_client_id', myClientId);
  }

  let myDeviceType = detectDeviceType();
  let myName = localStorage.getItem('kush_device_name') || detectDefaultName();
  let isMuted = localStorage.getItem('kush_muted') === 'true';
  let activePeers = [];
  let isTypingTimeout = null;
  let lastMessageDateStr = null;

  // --- DOM Elements ---
  const messagesContainer = document.getElementById('messagesContainer');
  const messageInput = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');
  const attachBtn = document.getElementById('attachBtn');
  const fileInput = document.getElementById('fileInput');
  const dropZone = document.getElementById('dropZone');
  const dragOverlay = document.getElementById('dragOverlay');
  const connectionStatus = document.getElementById('connectionStatus');
  const peerList = document.getElementById('peerList');
  const peerCountBadge = document.getElementById('peerCountBadge');
  const selfNameInput = document.getElementById('selfNameInput');
  const selfAvatar = document.getElementById('selfAvatar');
  const selfIp = document.getElementById('selfIp');
  const sidebar = document.getElementById('sidebar');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const themeToggle = document.getElementById('themeToggle');
  const soundToggleBtn = document.getElementById('soundToggleBtn');
  const downloadApkBtn = document.getElementById('downloadApkBtn');
  const clipboardText = document.getElementById('clipboardText');
  const clipboardSender = document.getElementById('clipboardSender');
  const clipboardInput = document.getElementById('clipboardInput');
  const sendClipboardBtn = document.getElementById('sendClipboardBtn');
  const copyClipboardBtn = document.getElementById('copyClipboardBtn');
  const uploadProgressCard = document.getElementById('uploadProgressCard');
  const uploadFileName = document.getElementById('uploadFileName');
  const uploadPercentage = document.getElementById('uploadPercentage');
  const uploadProgressBar = document.getElementById('uploadProgressBar');
  const typingIndicator = document.getElementById('typingIndicator');
  const typingText = document.getElementById('typingText');
  const imageLightbox = document.getElementById('imageLightbox');
  const lightboxImg = document.getElementById('lightboxImg');
  const lightboxTitle = document.getElementById('lightboxTitle');
  const lightboxDownloadBtn = document.getElementById('lightboxDownloadBtn');
  const lightboxCloseBtn = document.getElementById('lightboxCloseBtn');

  // --- Web Audio Chime ---
  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playChime(type) {
    if (isMuted) return;
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'receive') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1318.51, now);
        osc.frequency.exponentialRampToValueAtTime(1975.53, now + 0.12);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === 'send') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.06);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      }
    } catch (e) {}
  }

  // --- Sound Mute Toggle ---
  function updateSoundToggleUI() {
    if (!soundToggleBtn) return;
    const onIcon = soundToggleBtn.querySelector('.icon-sound-on');
    const offIcon = soundToggleBtn.querySelector('.icon-sound-off');
    if (isMuted) {
      if (onIcon) onIcon.classList.add('hidden');
      if (offIcon) offIcon.classList.remove('hidden');
      soundToggleBtn.title = 'Bildirim Sesleri Kapalı';
    } else {
      if (onIcon) onIcon.classList.remove('hidden');
      if (offIcon) offIcon.classList.add('hidden');
      soundToggleBtn.title = 'Bildirim Sesleri Açık';
    }
  }
  updateSoundToggleUI();

  if (soundToggleBtn) {
    soundToggleBtn.addEventListener('click', () => {
      isMuted = !isMuted;
      localStorage.setItem('kush_muted', isMuted ? 'true' : 'false');
      updateSoundToggleUI();
      if (!isMuted) playChime('send');
    });
  }

  // --- Device & OS Detection ---
  function detectDeviceType() {
    const ua = navigator.userAgent;
    if (/android/i.test(ua)) return 'android';
    if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
    if (/windows/i.test(ua)) return 'windows';
    if (/macintosh|mac os x/i.test(ua)) return 'mac';
    if (/linux/i.test(ua)) return 'linux';
    return 'desktop';
  }

  function detectDefaultName() {
    const type = detectDeviceType();
    const map = {
      android: 'Android Cihazım',
      ios: 'iPhone',
      windows: 'Windows Bilgisayar',
      linux: 'Linux Cihaz',
      mac: 'Mac'
    };
    return map[type] || 'kush Cihazı';
  }

  function getDeviceIcon(type) {
    switch (type) {
      case 'android': return '📱';
      case 'ios': return '📱';
      case 'windows': return '🪟';
      case 'mac': return '🍎';
      case 'linux': return '🐧';
      default: return '💻';
    }
  }

  selfNameInput.value = myName;
  selfAvatar.textContent = getDeviceIcon(myDeviceType);

  selfNameInput.addEventListener('change', () => {
    myName = selfNameInput.value.trim() || detectDefaultName();
    selfNameInput.value = myName;
    localStorage.setItem('kush_device_name', myName);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'identify', clientId: myClientId, name: myName, deviceType: myDeviceType }));
    }
  });

  // --- WebSocket Connection ---
  function connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}/ws`;

    updateStatus('connecting', 'Bağlanıyor...');
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      updateStatus('connected', 'Bağlandı');
      ws.send(JSON.stringify({
        type: 'identify',
        clientId: myClientId,
        name: myName,
        deviceType: myDeviceType
      }));
    };

    ws.onmessage = event => {
      try {
        const data = JSON.parse(event.data);
        handleServerMessage(data);
      } catch (err) {
        console.error('WS message error:', err);
      }
    };

    ws.onclose = () => {
      updateStatus('disconnected', 'Bağlantı koptu (yeniden deneniyor)');
      setTimeout(connect, 2500);
    };

    ws.onerror = err => {
      console.error('WS socket error:', err);
      ws.close();
    };
  }

  function updateStatus(state, label) {
    connectionStatus.className = `status-indicator ${state}`;
    connectionStatus.querySelector('.status-text').textContent = label;
  }

  function handleServerMessage(data) {
    switch (data.type) {
      case 'init':
        myId = data.yourId;
        myIp = data.yourIp;
        selfIp.textContent = myIp;
        if (data.history && data.history.length > 0) {
          clearWelcome();
          data.history.forEach(item => {
            if (item.type === 'file') {
              appendFileCard(item);
            } else {
              appendMessage(item);
            }
          });
          scrollToBottom();
        }
        if (data.clipboard) updateClipboardView(data.clipboard);
        break;

      case 'peer_list':
        activePeers = data.peers || [];
        renderPeerList();
        break;

      case 'new_message':
        clearWelcome();
        appendMessage(data.message);
        scrollToBottom();
        if (!checkIsSelf(data.message)) {
          playChime('receive');
          notifyIfBackground(data.message.senderName, data.message.text);
        }
        break;

      case 'file_shared':
        clearWelcome();
        appendFileCard(data.file);
        scrollToBottom();
        if (!checkIsSelf(data.file)) {
          playChime('receive');
          notifyIfBackground(data.file.senderName, `Dosya paylaştı: ${data.file.originalName}`);
        }
        break;

      case 'peer_typing':
        if (data.isTyping && data.peerId !== myId) {
          typingIndicator.classList.remove('hidden');
          typingText.textContent = `${data.peerName} yazıyor...`;
        } else {
          typingIndicator.classList.add('hidden');
        }
        break;

      case 'clipboard_updated':
        updateClipboardView(data.clipboard);
        break;

      case 'peer_left':
        break;
    }
  }

  // --- Identity Evaluation (WhatsApp / Instagram DM Right-Left Alignment) ---
  function checkIsSelf(item) {
    if (!item) return false;
    if (item.senderClientId && item.senderClientId === myClientId) return true;
    if (item.senderId && item.senderId === myId) return true;
    if (item.senderName && item.senderName === myName) return true;
    return false;
  }

  function clearWelcome() {
    const welcome = document.querySelector('.chat-welcome');
    if (welcome) welcome.remove();
  }

  function renderPeerList() {
    peerList.innerHTML = '';
    peerCountBadge.textContent = activePeers.length;

    activePeers.forEach(peer => {
      const isMe = peer.id === myId || peer.clientId === myClientId;
      const li = document.createElement('li');
      li.className = 'peer-item';
      li.innerHTML = `
        <span class="peer-avatar">${getDeviceIcon(peer.deviceType)}</span>
        <div class="peer-info">
          <span class="peer-name">${escapeHtml(peer.name)} ${isMe ? '(Siz)' : ''}</span>
          <span class="peer-sub">${escapeHtml(peer.ip)}</span>
        </div>
        <span class="status-dot"></span>
      `;
      peerList.appendChild(li);
    });
  }

  // Date Divider Helper
  function appendDateDividerIfNeeded(timestamp) {
    if (!timestamp) return;
    const msgDate = new Date(timestamp);
    const dateStr = msgDate.toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' });
    
    if (lastMessageDateStr !== dateStr) {
      lastMessageDateStr = dateStr;
      const today = new Date().toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' });
      let displayDate = (dateStr === today) ? 'Bugün' : dateStr;

      const div = document.createElement('div');
      div.className = 'chat-date-divider';
      div.innerHTML = `<span class="chat-date-chip">${escapeHtml(displayDate)}</span>`;
      messagesContainer.appendChild(div);
    }
  }

  // Append Standard Text Message (Self right, Peer left)
  function appendMessage(msg) {
    appendDateDividerIfNeeded(msg.timestamp);

    const isSelf = checkIsSelf(msg);
    const row = document.createElement('div');
    row.className = `msg-row ${isSelf ? 'self' : 'peer'}`;

    const timeFormatted = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const checkmarkHtml = isSelf ? `<span class="msg-check" title="İletildi">✓✓</span>` : '';

    row.innerHTML = `
      ${!isSelf ? `<span class="msg-sender">${escapeHtml(msg.senderName)}</span>` : ''}
      <div class="msg-bubble">
        <div class="msg-content">${formatMessageText(msg.text)}</div>
        <div class="msg-meta-row">
          <span class="msg-time">${timeFormatted}</span>
          ${checkmarkHtml}
        </div>
      </div>
    `;

    messagesContainer.appendChild(row);
  }

  // Append File Card
  function appendFileCard(file) {
    appendDateDividerIfNeeded(file.uploadedAt || file.timestamp);

    const isSelf = checkIsSelf(file);
    const row = document.createElement('div');
    row.className = `msg-row ${isSelf ? 'self' : 'peer'}`;

    const sizeFormatted = formatFileSize(file.size || 0);
    const timeFormatted = new Date(file.uploadedAt || file.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const checkmarkHtml = isSelf ? `<span class="msg-check" title="İletildi">✓✓</span>` : '';
    const isImage = (file.mimeType && file.mimeType.startsWith('image/')) || /\.(png|jpe?g|gif|webp|svg)$/i.test(file.originalName);

    let previewHtml = '';
    if (isImage) {
      previewHtml = `<img src="${file.url}" class="img-preview" alt="${escapeHtml(file.originalName)}" loading="lazy" data-filename="${escapeHtml(file.originalName)}">`;
    }

    row.innerHTML = `
      ${!isSelf ? `<span class="msg-sender">${escapeHtml(file.senderName)}</span>` : ''}
      <div class="msg-bubble">
        <div class="file-card">
          <div class="file-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
          </div>
          <div class="file-info">
            <span class="file-name" title="${escapeHtml(file.originalName)}">${escapeHtml(file.originalName)}</span>
            <span class="file-size">${sizeFormatted}</span>
          </div>
          <a href="${file.url}" download="${escapeHtml(file.originalName)}" class="file-download-btn" title="İndir">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          </a>
        </div>
        ${previewHtml}
        <div class="msg-meta-row">
          <span class="msg-time">${timeFormatted}</span>
          ${checkmarkHtml}
        </div>
      </div>
    `;

    if (isImage) {
      const img = row.querySelector('.img-preview');
      if (img) {
        img.addEventListener('click', () => {
          openLightbox(file.url, file.originalName);
        });
      }
    }

    messagesContainer.appendChild(row);
  }

  // --- Image Lightbox Modal ---
  function openLightbox(url, title) {
    if (!imageLightbox) return;
    lightboxImg.src = url;
    lightboxTitle.textContent = title || 'Görsel Önizleme';
    lightboxDownloadBtn.href = url;
    lightboxDownloadBtn.setAttribute('download', title || 'gorsel.jpg');
    imageLightbox.classList.remove('hidden');
  }

  function closeLightbox() {
    if (!imageLightbox) return;
    imageLightbox.classList.add('hidden');
    lightboxImg.src = '';
  }

  if (lightboxCloseBtn) lightboxCloseBtn.addEventListener('click', closeLightbox);
  if (imageLightbox) {
    imageLightbox.addEventListener('click', (e) => {
      if (e.target.classList.contains('lightbox-backdrop') || e.target === imageLightbox) {
        closeLightbox();
      }
    });
  }

  // --- Clipboard Integration ---
  function updateClipboardView(clip) {
    if (clip && clip.text) {
      clipboardText.textContent = clip.text;
      clipboardText.classList.remove('text-dim');
      const time = new Date(clip.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      clipboardSender.textContent = `${clip.sender} (${time})`;
    } else {
      clipboardText.textContent = 'Pano boş...';
      clipboardText.classList.add('text-dim');
      clipboardSender.textContent = '';
    }
  }

  function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // --- Message Sending & Typing ---
  function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(JSON.stringify({
      type: 'chat_message',
      clientId: myClientId,
      text: text
    }));

    playChime('send');
    messageInput.value = '';
    messageInput.style.height = 'auto';

    if (isTypingTimeout) {
      clearTimeout(isTypingTimeout);
      ws.send(JSON.stringify({ type: 'typing', isTyping: false }));
    }
  }

  sendBtn.addEventListener('click', sendMessage);

  messageInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'typing', isTyping: true }));
      clearTimeout(isTypingTimeout);
      isTypingTimeout = setTimeout(() => {
        ws.send(JSON.stringify({ type: 'typing', isTyping: false }));
      }, 1500);
    }
  });

  // --- File Upload & Drag/Drop ---
  attachBtn.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      uploadFiles(Array.from(fileInput.files));
      fileInput.value = '';
    }
  });

  function uploadFiles(files) {
    files.forEach(file => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload', true);
      xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
      xhr.setRequestHeader('X-File-Type', file.type || 'application/octet-stream');
      xhr.setRequestHeader('X-Sender-Name', encodeURIComponent(myName));
      xhr.setRequestHeader('X-Client-Id', myClientId);

      uploadProgressCard.classList.remove('hidden');
      uploadFileName.textContent = file.name;
      uploadPercentage.textContent = '0%';
      uploadProgressBar.style.width = '0%';

      xhr.upload.onprogress = e => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          uploadPercentage.textContent = `${pct}%`;
          uploadProgressBar.style.width = `${pct}%`;
        }
      };

      xhr.onload = () => {
        uploadProgressCard.classList.add('hidden');
        if (xhr.status === 200) {
          playChime('send');
        } else {
          alert('Dosya yükleme başarısız oldu.');
        }
      };

      xhr.onerror = () => {
        uploadProgressCard.classList.add('hidden');
        alert('Dosya yüklenirken ağ hatası oluştu.');
      };

      xhr.send(file);
    });
  }

  // Drag & Drop Handlers
  window.addEventListener('dragover', e => {
    e.preventDefault();
    dragOverlay.classList.remove('hidden');
  });

  dragOverlay.addEventListener('dragleave', e => {
    e.preventDefault();
    dragOverlay.classList.add('hidden');
  });

  window.addEventListener('drop', e => {
    e.preventDefault();
    dragOverlay.classList.add('hidden');
    if (e.dataTransfer.files.length > 0) {
      uploadFiles(Array.from(e.dataTransfer.files));
    }
  });

  // --- Clipboard Integration ---
  sendClipboardBtn.addEventListener('click', () => {
    const text = clipboardInput.value.trim();
    if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'clipboard_broadcast', text }));
    clipboardInput.value = '';
    playChime('send');
  });

  copyClipboardBtn.addEventListener('click', async () => {
    const text = clipboardText.textContent;
    if (!text || text === 'Pano boş...') return;
    try {
      await navigator.clipboard.writeText(text);
      copyClipboardBtn.textContent = 'Kopyalandı!';
      setTimeout(() => { copyClipboardBtn.textContent = 'Kopyala'; }, 1500);
    } catch (err) {
      console.error('Clipboard copy failed:', err);
    }
  });

  // --- Global Keyboard Shortcuts ---
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (imageLightbox && !imageLightbox.classList.contains('hidden')) {
        closeLightbox();
      } else if (sidebar && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
      }
    }
  });

  // --- Theme Toggle ---
  const currentTheme = localStorage.getItem('kush_theme') || 'theme-dark';
  document.body.className = currentTheme;

  themeToggle.addEventListener('click', () => {
    const isDark = document.body.classList.contains('theme-dark');
    const newTheme = isDark ? 'theme-light' : 'theme-dark';
    document.body.className = newTheme;
    localStorage.setItem('kush_theme', newTheme);
  });

  // --- Mobile Sidebar Toggle ---
  sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });

  messagesContainer.addEventListener('click', () => {
    if (sidebar.classList.contains('open')) {
      sidebar.classList.remove('open');
    }
  });

  // --- Direct APK Download ---
  downloadApkBtn.addEventListener('click', () => {
    window.location.href = '/download/kush.apk';
  });

  // --- System Notifications ---
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  function notifyIfBackground(title, body) {
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(`kush: ${title}`, {
        body: body,
        icon: '/icons/icon-192.png'
      });
    }
  }

  // --- Helpers ---
  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatMessageText(text) {
    const escaped = escapeHtml(text);
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return escaped.replace(urlRegex, url => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
  }

  function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // --- Service Worker Registration for PWA ---
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.log('SW registration error:', err);
    });
  }

  // Start connection
  connect();

})();
