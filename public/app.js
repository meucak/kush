// ==============================================================================
// kush — Reactive LAN & Tailscale Client (Offline-First, Zero-CPU, Apple HIG)
// ==============================================================================

(function() {
  'use strict';

  // --- Persistent Device ID Generator (KUSH-XXXX-YYYY) ---
  function generateDeviceId() {
    const chars = '0123456789ABCDEF';
    let p1 = '';
    let p2 = '';
    for (let i = 0; i < 4; i++) p1 += chars[Math.floor(Math.random() * chars.length)];
    for (let i = 0; i < 4; i++) p2 += chars[Math.floor(Math.random() * chars.length)];
    return `KUSH-${p1}-${p2}`;
  }

  // --- Client Persistent State ---
  let ws = null;
  let myId = null;
  let myIp = null;
  
  // Persistent Device / Client Tag across sessions
  let myClientTag = localStorage.getItem('kush_client_tag') || localStorage.getItem('kush_client_id');
  if (!myClientTag) {
    myClientTag = 'tag_' + detectDeviceType() + '_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
    localStorage.setItem('kush_client_tag', myClientTag);
    localStorage.setItem('kush_client_id', myClientTag);
  }

  // Persistent Unique Device ID (KUSH-XXXX-YYYY)
  let myDeviceId = localStorage.getItem('kush_device_id');
  if (!myDeviceId || !/^KUSH-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(myDeviceId)) {
    myDeviceId = generateDeviceId();
    localStorage.setItem('kush_device_id', myDeviceId);
  }
  localStorage.removeItem('kush_user_tc');

  // Network Device Name Tags (Authoritative Network Registry)
  let networkDeviceNames = {};
  try {
    networkDeviceNames = JSON.parse(localStorage.getItem('kush_network_device_names') || '{}');
  } catch (e) {
    networkDeviceNames = {};
  }

  // Device Aliases / Takma İsimler (Adres Defteri - Local Fallback)
  let deviceAliases = {};
  try {
    deviceAliases = JSON.parse(localStorage.getItem('kush_device_aliases') || '{}');
  } catch (e) {
    deviceAliases = {};
  }

  let myDeviceType = detectDeviceType();
  let myName = networkDeviceNames[myDeviceId] || localStorage.getItem('kush_device_name') || detectDefaultName();
  let isMuted = localStorage.getItem('kush_muted') === 'true';
  let activePeers = [];
  let isTypingTimeout = null;
  let lastMessageDateStr = null;
  const sentMsgIds = new Set();

  // Local Offline Outbox (kept only when offline/unreachable)
  let offlineQueue = [];
  try {
    offlineQueue = JSON.parse(localStorage.getItem('kush_offline_queue') || '[]');
  } catch (e) {
    offlineQueue = [];
  }

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
  
  // Profile & Identity Elements
  const selfCardBtn = document.getElementById('selfCardBtn');
  const selfAvatar = document.getElementById('selfAvatar');
  const selfDisplayName = document.getElementById('selfDisplayName');
  const selfIdChip = document.getElementById('selfIdChip');
  const selfIp = document.getElementById('selfIp');
  const openProfileBtn = document.getElementById('openProfileBtn');
  const headerProfileBtn = document.getElementById('headerProfileBtn');
  const headerIdLabel = document.getElementById('headerIdLabel');

  const profileModal = document.getElementById('profileModal');
  const closeProfileModalBtn = document.getElementById('closeProfileModalBtn');
  const cancelProfileBtn = document.getElementById('cancelProfileBtn');
  const saveProfileBtn = document.getElementById('saveProfileBtn');
  const profileNameInput = document.getElementById('profileNameInput');
  const profileIdInput = document.getElementById('profileIdInput');
  const copyIdBtn = document.getElementById('copyIdBtn');
  const generateIdBtn = document.getElementById('generateIdBtn');
  const deviceAliasList = document.getElementById('deviceAliasList');

  const idModalAvatar = document.getElementById('idModalAvatar');
  const idModalCardName = document.getElementById('idModalCardName');
  const idModalCardId = document.getElementById('idModalCardId');
  const idModalCardDevice = document.getElementById('idModalCardDevice');
  const idModalCardTag = document.getElementById('idModalCardTag');
  const idSystemPill = document.getElementById('idSystemPill');
  const idIpPill = document.getElementById('idIpPill');

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

  // --- Ephemeral Web Audio Chime (Zero Background CPU) ---
  function playChime(type) {
    if (isMuted) return;
    try {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtxClass) return;
      const ctx = new AudioCtxClass();
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
      setTimeout(() => {
        try { ctx.close(); } catch (_) {}
      }, 400);
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

  // --- Authoritative Network Device Name Resolution ---
  function getDisplayNameForDevice(deviceId, defaultName) {
    if (deviceId && networkDeviceNames[deviceId]) {
      return networkDeviceNames[deviceId];
    }
    if (deviceId && deviceAliases[deviceId]) {
      return deviceAliases[deviceId];
    }
    return defaultName || 'Cihaz';
  }

  // --- Network Device Name Tag Dispatcher ---
  function setNetworkDeviceName(targetDeviceId, customName) {
    const devId = (targetDeviceId || '').trim();
    const cleanName = (customName || '').trim().slice(0, 48);
    if (!devId) return;

    if (cleanName) {
      networkDeviceNames[devId] = cleanName;
      deviceAliases[devId] = cleanName;
    } else {
      delete networkDeviceNames[devId];
      delete deviceAliases[devId];
    }
    localStorage.setItem('kush_network_device_names', JSON.stringify(networkDeviceNames));
    localStorage.setItem('kush_device_aliases', JSON.stringify(deviceAliases));

    if (devId === myDeviceId) {
      myName = cleanName || detectDefaultName();
      localStorage.setItem('kush_device_name', myName);
      updateIdentityUI();
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'set_device_name',
        targetDeviceId: devId,
        customName: cleanName
      }));
    }
    renderPeerList();
    renderDeviceAliasesUI();
  }

  function renderDeviceAliasesUI() {
    if (!deviceAliasList) return;
    const knownDevices = new Map();
    activePeers.forEach(p => {
      const devId = p.deviceId || p.clientTag || p.clientId;
      if (devId && devId !== myDeviceId) {
        knownDevices.set(devId, p.name || 'Ağdaki Cihaz');
      }
    });
    // Add any devices registered in networkDeviceNames or local aliases
    Object.keys(networkDeviceNames).forEach(devId => {
      if (devId !== myDeviceId && !knownDevices.has(devId)) {
        knownDevices.set(devId, 'Kayıtlı Cihaz (Çevrimdışı)');
      }
    });
    Object.keys(deviceAliases).forEach(devId => {
      if (devId !== myDeviceId && !knownDevices.has(devId)) {
        knownDevices.set(devId, 'Kayıtlı Cihaz (Çevrimdışı)');
      }
    });

    if (knownDevices.size === 0) {
      deviceAliasList.innerHTML = '<p class="text-caption text-dim">Ağda henüz başka cihaz algılanmadı.</p>';
      return;
    }

    deviceAliasList.innerHTML = '';
    knownDevices.forEach((origName, devId) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'device-alias-item';
      const curNameTag = networkDeviceNames[devId] || deviceAliases[devId] || '';
      itemEl.innerHTML = `
        <div class="alias-meta">
          <span class="alias-dev-name">${escapeHtml(origName)}</span>
          <span class="alias-dev-id font-mono">${escapeHtml(devId)}</span>
        </div>
        <input type="text" class="input-text alias-input" placeholder="Tüm ağda görünecek isim ver (Örn: Gocayörük)" value="${escapeHtml(curNameTag)}" data-devid="${escapeHtml(devId)}">
      `;
      const input = itemEl.querySelector('.alias-input');
      input.addEventListener('change', () => {
        setNetworkDeviceName(devId, input.value);
      });
      deviceAliasList.appendChild(itemEl);
    });
  }

  // --- Identity UI Synchronization ---
  function updateIdentityUI() {
    if (selfDisplayName) selfDisplayName.textContent = myName;
    if (selfIdChip) selfIdChip.textContent = `ID: ${myDeviceId}`;
    if (headerIdLabel) headerIdLabel.textContent = `ID: ${myDeviceId.slice(-4)}`;
    if (selfAvatar) selfAvatar.textContent = getDeviceIcon(myDeviceType);

    if (idModalAvatar) idModalAvatar.textContent = getDeviceIcon(myDeviceType);
    if (idModalCardName) idModalCardName.textContent = myName;
    if (idModalCardId) idModalCardId.textContent = `ID: ${myDeviceId}`;
    if (idModalCardDevice) idModalCardDevice.textContent = `${myDeviceType.toUpperCase()} • ${myIp || 'Yerel Ağ'}`;
    if (idModalCardTag) idModalCardTag.textContent = `İmza: ${myDeviceId}`;

    if (idSystemPill) idSystemPill.textContent = `Sistem: ${myDeviceType.toUpperCase()}`;
    if (idIpPill) idIpPill.textContent = `IP: ${myIp || 'Bağlanıyor...'}`;

    renderDeviceAliasesUI();
  }
  updateIdentityUI();

  // --- Profile & Digital Identity Modal Handlers ---
  function openProfileModal() {
    if (!profileModal) return;
    profileNameInput.value = myName;
    profileIdInput.value = myDeviceId;
    updateIdentityUI();
    profileModal.classList.remove('hidden');
    profileNameInput.focus();
  }

  function closeProfileModal() {
    if (!profileModal) return;
    profileModal.classList.add('hidden');
  }

  if (selfCardBtn) selfCardBtn.addEventListener('click', openProfileModal);
  if (openProfileBtn) openProfileBtn.addEventListener('click', e => { e.stopPropagation(); openProfileModal(); });
  if (headerProfileBtn) headerProfileBtn.addEventListener('click', openProfileModal);
  if (closeProfileModalBtn) closeProfileModalBtn.addEventListener('click', closeProfileModal);
  if (cancelProfileBtn) cancelProfileBtn.addEventListener('click', closeProfileModal);

  if (profileModal) {
    profileModal.addEventListener('click', e => {
      if (e.target === profileModal) closeProfileModal();
    });
  }

  if (profileNameInput) {
    profileNameInput.addEventListener('input', () => {
      if (idModalCardName) idModalCardName.textContent = profileNameInput.value.trim() || myName;
    });
  }

  if (profileIdInput) {
    profileIdInput.addEventListener('input', () => {
      profileIdInput.value = profileIdInput.value.toUpperCase();
      if (idModalCardId) idModalCardId.textContent = `ID: ${profileIdInput.value || myDeviceId}`;
    });
  }

  if (generateIdBtn) {
    generateIdBtn.addEventListener('click', () => {
      const newId = generateDeviceId();
      if (profileIdInput) profileIdInput.value = newId;
      if (idModalCardId) idModalCardId.textContent = `ID: ${newId}`;
    });
  }

  if (copyIdBtn) {
    copyIdBtn.addEventListener('click', async () => {
      const idVal = profileIdInput ? profileIdInput.value.trim() : myDeviceId;
      try {
        await navigator.clipboard.writeText(idVal);
        copyIdBtn.textContent = 'Kopyalandı!';
        setTimeout(() => { copyIdBtn.textContent = 'Kopyala'; }, 1500);
      } catch (_) {}
    });
  }

  if (saveProfileBtn) {
    saveProfileBtn.addEventListener('click', () => {
      const newName = (profileNameInput.value.trim() || myName).slice(0, 32);
      let newId = (profileIdInput.value.trim() || myDeviceId).toUpperCase();

      if (!/^KUSH-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(newId)) {
        alert('Cihaz ID formatı "KUSH-XXXX-YYYY" şeklinde olmalıdır (Örn: KUSH-A1B2-C3D4).');
        profileIdInput.focus();
        return;
      }

      myName = newName;
      myDeviceId = newId;
      localStorage.setItem('kush_device_name', myName);
      localStorage.setItem('kush_device_id', myDeviceId);
      networkDeviceNames[myDeviceId] = myName;
      localStorage.setItem('kush_network_device_names', JSON.stringify(networkDeviceNames));
      updateIdentityUI();
      closeProfileModal();

      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'set_device_name',
          targetDeviceId: myDeviceId,
          customName: myName
        }));
        ws.send(JSON.stringify({
          type: 'identify',
          deviceId: myDeviceId,
          senderDeviceId: myDeviceId,
          clientTag: myClientTag,
          clientId: myClientTag,
          name: myName,
          deviceType: myDeviceType
        }));
      }
    });
  }

  // --- WebSocket Connection & Offline Queue Flush ---
  function connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}/ws`;

    updateStatus('connecting', 'Bağlanıyor...');
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      updateStatus('connected', 'Bağlandı');
      ws.send(JSON.stringify({
        type: 'identify',
        deviceId: myDeviceId,
        senderDeviceId: myDeviceId,
        clientTag: myClientTag,
        clientId: myClientTag,
        name: myName,
        deviceType: myDeviceType
      }));

      // Flush local outbox queue when connected
      flushOfflineQueue();
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

  function flushOfflineQueue() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (offlineQueue.length === 0) return;

    const itemsToSend = [...offlineQueue];
    offlineQueue = [];
    localStorage.removeItem('kush_offline_queue');

    itemsToSend.forEach(item => {
      ws.send(JSON.stringify({
        type: 'chat_message',
        id: item.id,
        deviceId: myDeviceId,
        senderDeviceId: myDeviceId,
        clientTag: myClientTag,
        clientId: myClientTag,
        text: item.text,
        timestamp: item.timestamp
      }));
    });
  }

  function handleServerMessage(data) {
    switch (data.type) {
      case 'init':
        myId = data.yourId;
        myIp = data.yourIp;
        if (data.deviceNames && typeof data.deviceNames === 'object') {
          networkDeviceNames = Object.assign({}, networkDeviceNames, data.deviceNames);
          localStorage.setItem('kush_network_device_names', JSON.stringify(networkDeviceNames));
          if (networkDeviceNames[myDeviceId]) {
            myName = networkDeviceNames[myDeviceId];
            localStorage.setItem('kush_device_name', myName);
          }
        }
        updateIdentityUI();
        selfIp.textContent = myIp;
        messagesContainer.innerHTML = '';
        lastMessageDateStr = null;
        if (data.history && data.history.length > 0) {
          clearWelcome();
          data.history.forEach(item => {
            try {
              const isFile = item.type === 'file' || !!item.url || !!item.originalName || !!item.storageName;
              if (isFile) {
                appendFileCard(item);
              } else if (item.text && item.text.trim()) {
                appendMessage(item);
              }
            } catch (err) {
              console.error('Error rendering history item:', err, item);
            }
          });
          scrollToBottom();
        } else {
          messagesContainer.innerHTML = `
            <div class="chat-welcome">
              <div class="welcome-glyph">✨</div>
              <h2>kush</h2>
              <p>Yerel ağ veya Tailscale üzerindeki tüm cihazlarınızla doğrudan ve anında dosya, pano ve mesajlaşın.</p>
            </div>
          `;
        }
        if (data.clipboard) updateClipboardView(data.clipboard);
        break;

      case 'peer_list':
        activePeers = data.peers || [];
        renderPeerList();
        break;

      case 'device_name_updated':
        if (data.deviceNames && typeof data.deviceNames === 'object') {
          networkDeviceNames = data.deviceNames;
        } else if (data.targetDeviceId) {
          if (data.customName) {
            networkDeviceNames[data.targetDeviceId] = data.customName;
          } else {
            delete networkDeviceNames[data.targetDeviceId];
          }
        }
        localStorage.setItem('kush_network_device_names', JSON.stringify(networkDeviceNames));

        // If this device was renamed remotely:
        if (data.targetDeviceId === myDeviceId) {
          myName = data.customName || detectDefaultName();
          localStorage.setItem('kush_device_name', myName);
          updateIdentityUI();
        }
        renderPeerList();
        renderDeviceAliasesUI();
        break;

      case 'new_message':
        const clientMsgId = data.clientMsgId || data.message.id;
        const existingBubble = document.querySelector(`[data-msg-id="${clientMsgId}"]`);

        if (existingBubble) {
          // Delivered confirmation (single tick -> double tick)
          const tickEl = existingBubble.querySelector('.msg-check');
          if (tickEl) {
            tickEl.className = 'msg-check delivered';
            tickEl.textContent = '✓✓';
            tickEl.title = 'İletildi';
          }
        } else {
          clearWelcome();
          appendMessage(data.message);
          scrollToBottom();
          if (!checkIsSelf(data.message)) {
            playChime('receive');
            notifyIfBackground(data.message.senderName, data.message.text);
          }
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

      case 'chat_cleared':
        messagesContainer.innerHTML = `
          <div class="chat-welcome">
            <div class="welcome-glyph">✨</div>
            <h2>kush</h2>
            <p>Sohbet ve log kayıtları sıfırlandı.</p>
          </div>
        `;
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

  // --- Identity & Alignment (Definitive, Device ID Matching) ---
  function checkIsSelf(item) {
    if (!item) return false;

    // 1. Primary rule: Explicit Device ID match
    const itemDevId = item.deviceId || item.senderDeviceId;
    if (itemDevId && myDeviceId && itemDevId === myDeviceId) {
      return true;
    }

    // 2. Client-side optimistic locally sent message IDs
    if (item.id && sentMsgIds.has(item.id)) {
      return true;
    }

    // 3. Persistent clientTag match (fallback for active sessions)
    const tag = item.clientTag || item.senderClientId || item.clientId;
    if (tag && myClientTag && tag === myClientTag) {
      return true;
    }

    // 4. Active WebSocket session ID match
    if (item.senderId && myId && item.senderId === myId) {
      return true;
    }

    // CRITICAL FIX: NEVER compare generic deviceType ('linux' === 'linux')!
    // Any other device, even if running Linux, is a PEER (rendered on the LEFT)!
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
      const isMe = checkIsSelf(peer) || (peer.deviceId && peer.deviceId === myDeviceId) || peer.id === myId;
      const peerDevId = peer.deviceId || peer.clientTag || '';
      const displayName = isMe ? `${myName} (Bu Cihaz)` : getDisplayNameForDevice(peerDevId, peer.name);
      const li = document.createElement('li');
      li.className = 'peer-item';
      li.innerHTML = `
        <span class="peer-avatar">${getDeviceIcon(peer.deviceType)}</span>
        <div class="peer-info">
          <div class="peer-meta-row">
            <span class="peer-name">${escapeHtml(displayName)}</span>
            ${peerDevId ? `<span class="peer-id-badge font-mono" title="Cihaz ID: ${escapeHtml(peerDevId)}">${escapeHtml(peerDevId)}</span>` : ''}
          </div>
          <span class="peer-sub">${escapeHtml(peer.ip || '')}</span>
        </div>
        ${!isMe && peerDevId ? `<button class="peer-rename-btn" title="Cihazın Ağ Adını Değiştir" data-devid="${escapeHtml(peerDevId)}" data-curname="${escapeHtml(networkDeviceNames[peerDevId] || peer.name || '')}">✏️</button>` : ''}
        <span class="status-dot"></span>
      `;

      const renameBtn = li.querySelector('.peer-rename-btn');
      if (renameBtn) {
        renameBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const targetId = renameBtn.getAttribute('data-devid');
          const curVal = renameBtn.getAttribute('data-curname');
          const promptRes = prompt(`"${curVal || targetId}" cihazına verilecek yeni ağ adını girin:\n(Bu isim tüm cihazlarda geçerli olacaktır)`, curVal);
          if (promptRes !== null) {
            setNetworkDeviceName(targetId, promptRes);
          }
        });
      }

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

  // Append Standard Text Message
  function appendMessage(msg) {
    if (!msg) return;

    // Failsafe: If a file object was accidentally passed here, route to appendFileCard
    const isFile = msg.type === 'file' || !!msg.url || !!msg.originalName || !!msg.storageName;
    if (isFile) {
      appendFileCard(msg);
      return;
    }

    // Never render an empty bubble
    if (!msg.text || !msg.text.trim()) {
      return;
    }

    appendDateDividerIfNeeded(msg.timestamp);

    const isSelf = checkIsSelf(msg);
    const row = document.createElement('div');
    row.className = `msg-row ${isSelf ? 'self' : 'peer'}`;
    if (msg.id) row.setAttribute('data-msg-id', msg.id);

    const timeFormatted = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    let checkmarkHtml = '';
    if (isSelf) {
      if (msg.isPending) {
        checkmarkHtml = `<span class="msg-check pending" title="Gönderiliyor / Çevrimdışı">✓</span>`;
      } else {
        checkmarkHtml = `<span class="msg-check delivered" title="İletildi">✓✓</span>`;
      }
    }

    row.innerHTML = `
      ${!isSelf ? `
        <div class="msg-sender-header">
          <span class="msg-sender-name">${escapeHtml(getDisplayNameForDevice(msg.deviceId || msg.senderDeviceId, msg.senderName || 'Cihaz'))}</span>
          ${(msg.deviceId || msg.senderDeviceId) ? `<span class="msg-sender-id font-mono" title="Cihaz ID">${escapeHtml(msg.deviceId || msg.senderDeviceId)}</span>` : ''}
          <span class="msg-sender-badge">${getDeviceIcon(msg.deviceType)}</span>
        </div>
      ` : ''}
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

  // Helper for file extension badge and color category
  function getFileExtInfo(fileName, mimeType) {
    const ext = (fileName.split('.').pop() || '').toLowerCase();
    const isImage = (mimeType && mimeType.startsWith('image/')) || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext);
    
    let badge = ext.toUpperCase().slice(0, 4) || 'FILE';
    let typeClass = 'default';

    if (isImage) {
      typeClass = 'image';
      badge = 'IMG';
    } else if (['pdf'].includes(ext)) {
      typeClass = 'pdf';
      badge = 'PDF';
    } else if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
      typeClass = 'zip';
      badge = 'ZIP';
    } else if (['doc', 'docx', 'odt', 'txt', 'rtf', 'md'].includes(ext)) {
      typeClass = 'doc';
      badge = 'DOC';
    } else if (['xls', 'xlsx', 'csv'].includes(ext)) {
      typeClass = 'sheet';
      badge = 'XLS';
    } else if (['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext)) {
      typeClass = 'audio';
      badge = 'AUDIO';
    } else if (['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext)) {
      typeClass = 'video';
      badge = 'VIDEO';
    } else if (['js', 'ts', 'py', 'sh', 'json', 'html', 'css', 'c', 'cpp', 'java'].includes(ext)) {
      typeClass = 'code';
      badge = 'CODE';
    }

    return { ext, isImage, badge, typeClass };
  }

  // Append File Card
  function appendFileCard(file) {
    if (!file) return;
    try {
      appendDateDividerIfNeeded(file.uploadedAt || file.timestamp);

      const isSelf = checkIsSelf(file);
      const row = document.createElement('div');
      row.className = `msg-row ${isSelf ? 'self' : 'peer'}`;
      if (file.id) row.setAttribute('data-msg-id', file.id);

      const rawFileName = file.originalName || file.name || file.storageName || 
        (file.url ? file.url.split('/').pop().replace(/^[a-f0-9-]+_/, '') : 'paylasilan_dosya');
      const fileName = escapeHtml(rawFileName);
      const sizeFormatted = formatFileSize(file.size || 0);
      const timeFormatted = new Date(file.uploadedAt || file.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const checkmarkHtml = isSelf ? `<span class="msg-check delivered" title="İletildi">✓✓</span>` : '';
      
      const fileUrl = file.url || '';
      const absoluteUrl = fileUrl.startsWith('http') ? fileUrl : (window.location.origin + fileUrl);
      const downloadUrl = absoluteUrl + (absoluteUrl.includes('?') ? '&' : '?') + 'download=1';
      
      const fileInfo = getFileExtInfo(rawFileName, file.mimeType);

      let previewHtml = '';
      if (fileInfo.isImage && fileUrl) {
        previewHtml = `<img src="${absoluteUrl}" class="img-preview" alt="${fileName}" loading="lazy" data-filename="${fileName}">`;
      }

      row.innerHTML = `
        ${!isSelf ? `
          <div class="msg-sender-header">
            <span class="msg-sender-name">${escapeHtml(getDisplayNameForDevice(file.deviceId || file.senderDeviceId, file.senderName || 'Ağdaki Cihaz'))}</span>
            ${(file.deviceId || file.senderDeviceId) ? `<span class="msg-sender-id font-mono" title="Cihaz ID">${escapeHtml(file.deviceId || file.senderDeviceId)}</span>` : ''}
            <span class="msg-sender-badge">${getDeviceIcon(file.deviceType)}</span>
          </div>
        ` : ''}
        <div class="msg-bubble">
          <div class="file-card file-${fileInfo.typeClass}">
            <div class="file-icon file-badge-${fileInfo.typeClass}">
              <span class="file-ext-badge">${escapeHtml(fileInfo.badge)}</span>
            </div>
            <div class="file-info">
              <span class="file-name" title="${fileName}">${fileName}</span>
              <span class="file-size">${sizeFormatted}</span>
            </div>
            <a href="${downloadUrl}" download="${fileName}" class="file-download-btn" title="İndir: ${fileName}">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            </a>
          </div>
          ${previewHtml}
          <div class="msg-meta-row">
            <span class="msg-time">${timeFormatted}</span>
            ${checkmarkHtml}
          </div>
        </div>
      `;

      if (fileInfo.isImage) {
        const img = row.querySelector('.img-preview');
        if (img) {
          img.addEventListener('click', () => {
            openLightbox(absoluteUrl, rawFileName);
          });
        }
      }

      messagesContainer.appendChild(row);
    } catch (err) {
      console.error('appendFileCard error:', err, file);
    }
  }

  // --- Image Lightbox Modal ---
  function openLightbox(url, title) {
    if (!imageLightbox) return;
    lightboxImg.src = url;
    lightboxTitle.textContent = title || 'Görsel Önizleme';
    lightboxDownloadBtn.href = url + (url.includes('?') ? '&' : '?') + 'download=1';
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

  // --- Offline-First Message Sending ---
  function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;

    const msgId = 'm_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const isConnected = ws && ws.readyState === WebSocket.OPEN;

    const localMsg = {
      id: msgId,
      deviceId: myDeviceId,
      senderDeviceId: myDeviceId,
      clientTag: myClientTag,
      senderClientId: myClientTag,
      senderName: myName,
      deviceType: myDeviceType,
      text: text,
      timestamp: Date.now(),
      isPending: !isConnected
    };
    sentMsgIds.add(msgId);

    // Immediately render in chat
    clearWelcome();
    appendMessage(localMsg);
    scrollToBottom();

    messageInput.value = '';
    messageInput.style.height = 'auto';

    if (isConnected) {
      ws.send(JSON.stringify({
        type: 'chat_message',
        id: msgId,
        deviceId: myDeviceId,
        senderDeviceId: myDeviceId,
        clientTag: myClientTag,
        clientId: myClientTag,
        text: text,
        timestamp: localMsg.timestamp
      }));
      playChime('send');
    } else {
      // Store in local outbox queue until connected
      offlineQueue.push(localMsg);
      localStorage.setItem('kush_offline_queue', JSON.stringify(offlineQueue));
    }

    if (isTypingTimeout) {
      clearTimeout(isTypingTimeout);
      if (isConnected) ws.send(JSON.stringify({ type: 'typing', isTyping: false }));
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
      xhr.setRequestHeader('X-Device-Id', myDeviceId);
      xhr.setRequestHeader('X-Client-Id', myClientTag);
      xhr.setRequestHeader('X-Client-Tag', myClientTag);
      xhr.setRequestHeader('X-Device-Type', myDeviceType);
      sentMsgIds.add(file.name);

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
    if (dragOverlay.classList.contains('hidden')) {
      dragOverlay.classList.remove('hidden');
    }
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
      if (profileModal && !profileModal.classList.contains('hidden')) {
        closeProfileModal();
      } else if (imageLightbox && !imageLightbox.classList.contains('hidden')) {
        closeLightbox();
      } else if (sidebar && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
      }
    }
  });

  // --- Background Visibility & Zero-CPU Optimization ---
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // In background: ensure all pending audio contexts are closed, skip non-essential animations
      if (isTypingTimeout) clearTimeout(isTypingTimeout);
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
