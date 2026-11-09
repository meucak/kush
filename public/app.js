// ==============================================================================
// kush — Reactive LAN & Tailscale Client Application (Apple HIG & Anti-Slop)
// ==============================================================================

(function() {
  'use strict';

  // --- Client Persistent State ---
  let ws = null;
  let myId = null;
  let myIp = null;
  
  // Persistent Client UUID across reloads / sessions
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

  // Active audio player instance tracking
  let currentPlayingAudio = null;
  let currentPlayingBtn = null;
  let currentPlayingWave = null;

  // Voice note recording state
  let mediaRecorder = null;
  let audioStream = null;
  let audioChunks = [];
  let recordingStartTime = 0;
  let recordingTimerInterval = null;
  let audioCtx = null;
  let analyserNode = null;
  let liveWaveformAnimId = null;

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
  const headerDeviceBtn = document.getElementById('headerDeviceBtn');
  const headerDeviceName = document.getElementById('headerDeviceName');
  const headerDeviceIcon = document.getElementById('headerDeviceIcon');
  const micBtn = document.getElementById('micBtn');
  const voiceNoteBtn = document.getElementById('voiceNoteBtn');
  const standardInputCard = document.getElementById('standardInputCard');
  const voiceRecordingCard = document.getElementById('voiceRecordingCard');
  const cancelVoiceBtn = document.getElementById('cancelVoiceBtn');
  const sendVoiceBtn = document.getElementById('sendVoiceBtn');
  const voiceDurationText = document.getElementById('voiceDurationText');
  const voiceWaveformLive = document.getElementById('voiceWaveformLive');
  const emojiDock = document.getElementById('emojiDock');
  const imageLightbox = document.getElementById('imageLightbox');
  const lightboxImg = document.getElementById('lightboxImg');
  const lightboxTitle = document.getElementById('lightboxTitle');
  const lightboxDownloadBtn = document.getElementById('lightboxDownloadBtn');
  const lightboxCloseBtn = document.getElementById('lightboxCloseBtn');

  // --- Sound Synthesizer (Apple HIG chimes via Web Audio API) ---
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
      } else if (type === 'peer') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, now);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
      }
    } catch (e) {
      // AudioContext policy suppression fallback
    }
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
      android: 'Android (Telefon)',
      ios: 'iPhone',
      windows: 'Windows (Quasimodo)',
      linux: 'Linux (Toshi)',
      mac: 'MacBook'
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

  // Initialize Self Header & Avatar
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
            ws.send(JSON.stringify({ type: 'identify', clientId: myClientId, name: myName, deviceType: myDeviceType }));
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
            if (item.isVoiceNote || item.type === 'voice' || item.type === 'file') {
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
          const notifyDesc = data.file.isVoiceNote ? 'Sesli mesaj gönderdi' : `Dosya paylaştı: ${data.file.originalName}`;
          notifyIfBackground(data.file.senderName, notifyDesc);
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

  // --- Identity Evaluation (WhatsApp / Instagram DM Alignment) ---
  function checkIsSelf(item) {
    if (!item) return false;
    if (item.senderClientId && item.senderClientId === myClientId) return true;
    if (item.senderId && item.senderId === myId) return true;
    if (item.senderName && item.senderName === myName) return true;
    return false;
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
      let displayDate = dateStr;
      if (dateStr === today) {
        displayDate = 'Bugün';
      }

      const div = document.createElement('div');
      div.className = 'chat-date-divider';
      div.innerHTML = `<span class="chat-date-chip">${escapeHtml(displayDate)}</span>`;
      messagesContainer.appendChild(div);
    }
  }

  // Append Standard Text Message
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

  // Append File Card or Voice Note Bubble
  function appendFileCard(file) {
    appendDateDividerIfNeeded(file.uploadedAt || file.timestamp);

    if (file.isVoiceNote || file.type === 'voice') {
      appendVoiceNote(file);
      return;
    }

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

    // Lightbox image click trigger
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

  // --- Voice Message Rendering (WhatsApp / Telegram style) ---
  function appendVoiceNote(file) {
    const isSelf = checkIsSelf(file);
    const row = document.createElement('div');
    row.className = `msg-row ${isSelf ? 'self' : 'peer'}`;

    const durationSec = file.duration || 0;
    const durMins = Math.floor(durationSec / 60);
    const durRemSec = Math.floor(durationSec % 60);
    const initialDurationStr = `${durMins}:${durRemSec < 10 ? '0' : ''}${durRemSec}`;
    const timeFormatted = new Date(file.uploadedAt || file.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const checkmarkHtml = isSelf ? `<span class="msg-check" title="İletildi">✓✓</span>` : '';

    // Generate 26 aesthetic waveform bar heights based on hash of id
    const barCount = 26;
    let waveBarsHtml = '';
    const seed = (file.id || file.url || 'kush').split('').reduce((acc, c) => acc + c.charCodeAt(0), 42);
    for (let i = 0; i < barCount; i++) {
      const pseudoHeight = 5 + Math.round((Math.sin(seed + i * 1.3) * 0.5 + 0.5) * 14);
      waveBarsHtml += `<span class="voice-wave-bar" style="height: ${pseudoHeight}px;" data-index="${i}"></span>`;
    }

    row.innerHTML = `
      ${!isSelf ? `<span class="msg-sender">${escapeHtml(file.senderName)}</span>` : ''}
      <div class="msg-bubble">
        <div class="voice-bubble">
          <button type="button" class="voice-play-btn" aria-label="Oynat">
            <svg class="icon-play" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            <svg class="icon-pause hidden" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
          </button>
          <div class="voice-body">
            <div class="voice-scrubber-wrap" title="İlerletmek için tıklayın">
              <div class="voice-wave-bars">
                ${waveBarsHtml}
              </div>
            </div>
            <div class="voice-meta-row">
              <span class="voice-time-label">${initialDurationStr}</span>
              <button type="button" class="voice-speed-chip">1x</button>
            </div>
          </div>
        </div>
        <div class="msg-meta-row">
          <span class="msg-time">${timeFormatted}</span>
          ${checkmarkHtml}
        </div>
      </div>
    `;

    // Wire up Voice Audio Controls
    const playBtn = row.querySelector('.voice-play-btn');
    const playIcon = row.querySelector('.icon-play');
    const pauseIcon = row.querySelector('.icon-pause');
    const timeLabel = row.querySelector('.voice-time-label');
    const speedChip = row.querySelector('.voice-speed-chip');
    const scrubberWrap = row.querySelector('.voice-scrubber-wrap');
    const waveBars = row.querySelectorAll('.voice-wave-bar');

    const audio = new Audio(file.url);
    audio.preload = 'metadata';

    const speeds = [1, 1.5, 2];
    let currentSpeedIdx = 0;

    speedChip.addEventListener('click', (e) => {
      e.stopPropagation();
      currentSpeedIdx = (currentSpeedIdx + 1) % speeds.length;
      const speed = speeds[currentSpeedIdx];
      audio.playbackRate = speed;
      speedChip.textContent = `${speed}x`;
    });

    function setPlayingState(playing) {
      if (playing) {
        playIcon.classList.add('hidden');
        pauseIcon.classList.remove('hidden');
      } else {
        playIcon.classList.remove('hidden');
        pauseIcon.classList.add('hidden');
      }
    }

    function updateBars(progressRatio) {
      const activeBarCount = Math.floor(progressRatio * waveBars.length);
      waveBars.forEach((bar, idx) => {
        if (idx <= activeBarCount && progressRatio > 0) {
          bar.classList.add('played');
        } else {
          bar.classList.remove('played');
        }
      });
    }

    playBtn.addEventListener('click', () => {
      if (currentPlayingAudio && currentPlayingAudio !== audio) {
        currentPlayingAudio.pause();
        if (currentPlayingBtn) currentPlayingBtn(false);
      }

      if (audio.paused) {
        audio.play().then(() => {
          setPlayingState(true);
          currentPlayingAudio = audio;
          currentPlayingBtn = setPlayingState;
          currentPlayingWave = updateBars;
        }).catch(err => {
          console.error('Audio play error:', err);
        });
      } else {
        audio.pause();
        setPlayingState(false);
      }
    });

    audio.addEventListener('timeupdate', () => {
      const cur = audio.currentTime || 0;
      const dur = audio.duration || durationSec || 0;
      const mins = Math.floor(cur / 60);
      const secs = Math.floor(cur % 60);
      timeLabel.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
      
      const ratio = dur > 0 ? (cur / dur) : 0;
      updateBars(ratio);
    });

    audio.addEventListener('ended', () => {
      setPlayingState(false);
      updateBars(0);
      timeLabel.textContent = initialDurationStr;
      currentPlayingAudio = null;
    });

    scrubberWrap.addEventListener('click', (e) => {
      const rect = scrubberWrap.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, clickX / rect.width));
      const targetTime = (audio.duration || durationSec) * pct;
      if (!isNaN(targetTime)) {
        audio.currentTime = targetTime;
        updateBars(pct);
      }
    });

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

  // --- Voice Message Recording (Live MediaRecorder & Web Audio Waveform) ---
  async function startVoiceRecording() {
    try {
      audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      audioChunks = [];
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' :
                   MediaRecorder.isTypeSupported('audio/ogg') ? 'audio/ogg' :
                   MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
      }

      mediaRecorder = mimeType ? new MediaRecorder(audioStream, { mimeType }) : new MediaRecorder(audioStream);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunks.push(e.data);
        }
      };

      // Set up Web Audio Analyser for live pulsating equalizer bars
      const ctx = getAudioContext();
      const source = ctx.createMediaStreamSource(audioStream);
      analyserNode = ctx.createAnalyser();
      analyserNode.fftSize = 32;
      source.connect(analyserNode);

      const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
      const liveBars = voiceWaveformLive ? voiceWaveformLive.querySelectorAll('.wbar') : [];

      function animateLiveWaveform() {
        if (!mediaRecorder || mediaRecorder.state !== 'recording') return;
        analyserNode.getByteFrequencyData(dataArray);
        liveBars.forEach((bar, idx) => {
          const val = dataArray[idx % dataArray.length] || 10;
          const height = Math.max(4, Math.min(22, (val / 255) * 22));
          bar.style.height = `${height}px`;
        });
        liveWaveformAnimId = requestAnimationFrame(animateLiveWaveform);
      }

      mediaRecorder.start(100);
      recordingStartTime = Date.now();

      // UI Switch
      standardInputCard.classList.add('hidden');
      voiceRecordingCard.classList.remove('hidden');
      voiceDurationText.textContent = '00:00';

      recordingTimerInterval = setInterval(() => {
        const elapsedSec = Math.floor((Date.now() - recordingStartTime) / 1000);
        const mins = Math.floor(elapsedSec / 60);
        const secs = elapsedSec % 60;
        voiceDurationText.textContent = `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
      }, 500);

      animateLiveWaveform();
      playChime('send');
    } catch (err) {
      console.error('Microphone access failed:', err);
      alert('Mikrofon erişimi sağlanamadı. Lütfen tarayıcı izinlerini kontrol edin.');
    }
  }

  function cleanupRecording() {
    if (recordingTimerInterval) {
      clearInterval(recordingTimerInterval);
      recordingTimerInterval = null;
    }
    if (liveWaveformAnimId) {
      cancelAnimationFrame(liveWaveformAnimId);
      liveWaveformAnimId = null;
    }
    if (audioStream) {
      audioStream.getTracks().forEach(t => t.stop());
      audioStream = null;
    }
    voiceRecordingCard.classList.add('hidden');
    standardInputCard.classList.remove('hidden');
  }

  function cancelVoiceRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.onstop = null;
      mediaRecorder.stop();
    }
    cleanupRecording();
    audioChunks = [];
  }

  function finishAndSendVoiceRecording() {
    if (!mediaRecorder || mediaRecorder.state !== 'recording') return;
    const durationSec = Math.max(1, (Date.now() - recordingStartTime) / 1000);

    mediaRecorder.onstop = () => {
      const mimeType = mediaRecorder.mimeType || 'audio/webm';
      const audioBlob = new Blob(audioChunks, { type: mimeType });
      uploadVoiceNote(audioBlob, durationSec, mimeType);
      cleanupRecording();
    };

    mediaRecorder.stop();
  }

  function uploadVoiceNote(blob, durationSec, mimeType) {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload', true);
    
    const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'm4a' : 'webm';
    const fileName = `Ses_Kaydi_${Date.now()}.${ext}`;

    xhr.setRequestHeader('X-File-Name', encodeURIComponent(fileName));
    xhr.setRequestHeader('X-File-Type', mimeType);
    xhr.setRequestHeader('X-Sender-Name', encodeURIComponent(myName));
    xhr.setRequestHeader('X-Client-Id', myClientId);
    xhr.setRequestHeader('X-Is-Voice-Note', 'true');
    xhr.setRequestHeader('X-Voice-Duration', durationSec.toFixed(1));

    xhr.onload = () => {
      if (xhr.status === 200) {
        playChime('send');
      } else {
        alert('Sesli mesaj gönderilemedi.');
      }
    };

    xhr.onerror = () => {
      alert('Sesli mesaj gönderilirken bağlantı hatası oluştu.');
    };

    xhr.send(blob);
  }

  if (voiceNoteBtn) voiceNoteBtn.addEventListener('click', startVoiceRecording);
  if (cancelVoiceBtn) cancelVoiceBtn.addEventListener('click', cancelVoiceRecording);
  if (sendVoiceBtn) sendVoiceBtn.addEventListener('click', finishAndSendVoiceRecording);

  // --- Quick Reactions Dock ---
  if (emojiDock) {
    emojiDock.querySelectorAll('.btn-emoji').forEach(btn => {
      btn.addEventListener('click', () => {
        const emoji = btn.getAttribute('data-emoji');
        if (emoji) {
          const cur = messageInput.value;
          messageInput.value = cur + emoji;
          messageInput.dispatchEvent(new Event('input'));
          messageInput.focus();
        }
      });
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

  // --- Voice Dictation (Speech-to-Text via Web Speech API) ---
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let isDictating = false;

  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'tr-TR';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
      isDictating = true;
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
      stopDictation();
    };

    recognition.onend = () => {
      stopDictation();
    };
  }

  function stopDictation() {
    isDictating = false;
    if (micBtn) {
      micBtn.classList.remove('recording');
      micBtn.title = 'Sesli Dikte (Konuşarak Yaz)';
    }
  }

  if (micBtn) {
    micBtn.addEventListener('click', () => {
      if (!recognition) {
        alert('Cihazınızda web ses tanıma desteklenmiyor. Klavyenizdeki mikrofon tuşunu kullanabilirsiniz.');
        return;
      }
      if (isDictating) {
        recognition.stop();
        stopDictation();
      } else {
        try {
          recognition.start();
        } catch (err) {
          console.error('Speech start error:', err);
          stopDictation();
        }
      }
    });
  }

  // --- Global Keyboard Shortcuts ---
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (imageLightbox && !imageLightbox.classList.contains('hidden')) {
        closeLightbox();
      } else if (voiceRecordingCard && !voiceRecordingCard.classList.contains('hidden')) {
        cancelVoiceRecording();
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
