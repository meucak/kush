// ==============================================================================
// AURA LAN — Reactive Client Application
// ==============================================================================

(function() {
  'use strict';

  // State
  let ws = null;
  let myId = null;
  let myIp = null;
  let myName = localStorage.getItem('kush_device_name') || detectDefaultName();
  let myDeviceType = detectDeviceType();
  let activePeers = [];
  let isTypingTimeout = null;

  // DOM Elements
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
  const headerDeviceBtn = document.getElementById('headerDeviceBtn');
  const headerDeviceName = document.getElementById('headerDeviceName');
  const headerDeviceIcon = document.getElementById('headerDeviceIcon');
  const micBtn = document.getElementById('micBtn');

  // --- Web Audio API UI Synthesizer (Zero asset overhead) ---
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  function playChime(type) {
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'receive') {
      // Gentle harmonic Apple-like chime (E6 -> B6)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1318.51, now);
      osc.frequency.exponentialRampToValueAtTime(1975.53, now + 0.12);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === 'send') {
      // Subtle pop click
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.06);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'peer') {
      // Warm welcome chord (C5)
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
    }
  }

  // --- Device Detection ---
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

  // Initialize Self Info
  selfNameInput.value = myName;
  selfAvatar.textContent = getDeviceIcon(myDeviceType);

  function updateHeaderDeviceTag() {
    if (headerDeviceName) headerDeviceName.textContent = myName;
    if (headerDeviceIcon) headerDeviceIcon.textContent = getDeviceIcon(myDeviceType);
  }
  updateHeaderDeviceTag();

  if (headerDeviceBtn) {
    headerDeviceBtn.addEventListener('click', () => {
      const newName = prompt('Cihazınız için bir ad girin:', myName);
      if (newName !== null) {
        const cleanName = newName.trim();
        if (cleanName) {
          myName = cleanName;
          selfNameInput.value = myName;
          updateHeaderDeviceTag();
          localStorage.setItem('kush_device_name', myName);
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'identify', name: myName, deviceType: myDeviceType }));
          }
        }
      }
    });
  }

  selfNameInput.addEventListener('change', () => {
    myName = selfNameInput.value.trim() || detectDefaultName();
    selfNameInput.value = myName;
    updateHeaderDeviceTag();
    localStorage.setItem('kush_device_name', myName);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'identify', name: myName, deviceType: myDeviceType }));
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
          data.history.forEach(appendMessage);
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
        if (data.message.senderId !== myId) {
          playChime('receive');
          notifyIfBackground(data.message.senderName, data.message.text);
        }
        break;

      case 'file_shared':
        clearWelcome();
        appendFileCard(data.file);
        scrollToBottom();
        if (data.file.senderName !== myName) {
          playChime('receive');
          notifyIfBackground(data.file.senderName, `Bir dosya paylaştı: ${data.file.originalName}`);
        }
        break;

      case 'peer_typing':
        if (data.isTyping) {
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
        // optional toast
        break;
    }
  }

  // --- Rendering UI ---
  function clearWelcome() {
    const welcome = document.querySelector('.chat-welcome');
    if (welcome) welcome.remove();
  }

  function renderPeerList() {
    peerList.innerHTML = '';
    peerCountBadge.textContent = activePeers.length;

    activePeers.forEach(peer => {
      const isMe = peer.id === myId;
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

  function appendMessage(msg) {
    const isSelf = msg.senderId === myId;
    const row = document.createElement('div');
    row.className = `msg-row ${isSelf ? 'self' : 'peer'}`;

    const timeFormatted = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    row.innerHTML = `
      ${!isSelf ? `<span class="msg-sender">${escapeHtml(msg.senderName)}</span>` : ''}
      <div class="msg-bubble">${formatMessageText(msg.text)}</div>
      <span class="msg-time">${timeFormatted}</span>
    `;

    messagesContainer.appendChild(row);
  }

  function appendFileCard(file) {
    const isSelf = file.senderName === myName;
    const row = document.createElement('div');
    row.className = `msg-row ${isSelf ? 'self' : 'peer'}`;

    const sizeFormatted = formatFileSize(file.size);
    const timeFormatted = new Date(file.uploadedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const isImage = file.mimeType.startsWith('image/');

    let previewHtml = '';
    if (isImage) {
      previewHtml = `<a href="${file.url}" target="_blank"><img src="${file.url}" class="img-preview" alt="${escapeHtml(file.originalName)}" loading="lazy"></a>`;
    }

    row.innerHTML = `
      ${!isSelf ? `<span class="msg-sender">${escapeHtml(file.senderName)}</span>` : ''}
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
      <span class="msg-time">${timeFormatted}</span>
    `;

    messagesContainer.appendChild(row);
  }

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

  // --- Voice Dictation (Web Speech API) ---
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let isRecording = false;

  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'tr-TR';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
      isRecording = true;
      if (micBtn) {
        micBtn.classList.add('recording');
        micBtn.title = 'Dinleniyor... (Durdurmak için tıklayın)';
      }
      playChime('send');
    };

    recognition.onresult = (event) => {
      let interim = '';
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        const cur = messageInput.value;
        const sep = cur && !cur.endsWith(' ') ? ' ' : '';
        messageInput.value = cur + sep + finalTranscript.trim();
        messageInput.dispatchEvent(new Event('input'));
      }
    };

    recognition.onerror = (event) => {
      console.warn('Speech recognition error:', event.error);
      stopRecording();
    };

    recognition.onend = () => {
      stopRecording();
    };
  }

  function stopRecording() {
    isRecording = false;
    if (micBtn) {
      micBtn.classList.remove('recording');
      micBtn.title = 'Sesli Dikte (Konuşarak Yaz)';
    }
  }

  if (micBtn) {
    micBtn.addEventListener('click', () => {
      if (!recognition) {
        alert('Cihazınızda doğrudan web ses tanıma desteklenmiyor. Klavyenizdeki mikrofon tuşunu kullanabilirsiniz.');
        return;
      }
      if (isRecording) {
        recognition.stop();
        stopRecording();
      } else {
        try {
          recognition.start();
        } catch (err) {
          console.error('Speech start error:', err);
          stopRecording();
        }
      }
    });
  }

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
    // Simple URL linking
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
