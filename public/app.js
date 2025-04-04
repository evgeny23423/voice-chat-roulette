const config = {
  peerConfig: {
    host: window.location.hostname,
    port: 9001,
    path: '/peerjs',
    debug: 3
  },
  audioConstraints: {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  }
};

const appState = {
  peer: null,
  currentCall: null,
  localStream: null,
  isConnected: false,
  isMuted: false,
  partnerId: null
};

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
  initPeerConnection();
  setupEventListeners();
  restoreSession();
});

function initPeerConnection() {
  appState.peer = new Peer(config.peerConfig);

  appState.peer.on('open', id => {
    document.getElementById('myId').textContent = id;
    updateStatus('Готов к звонку', 'connected');
  });

  appState.peer.on('call', handleIncomingCall);
  appState.peer.on('error', handlePeerError);
}

async function setupAudio() {
  try {
    appState.localStream = await navigator.mediaDevices.getUserMedia(config.audioConstraints);
  } catch (error) {
    showAlert('Не удалось получить доступ к микрофону');
  }
}

function setupEventListeners() {
  document.getElementById('callBtn').addEventListener('click', makeCall);
  document.getElementById('hangupBtn').addEventListener('click', endCall);
  document.getElementById('muteBtn').addEventListener('click', toggleMute);
  document.getElementById('findRandomBtn').addEventListener('click', findPartner);
  document.getElementById('copyIdBtn').addEventListener('click', copyPeerId);
}

async function handleIncomingCall(call) {
  if (appState.isConnected) {
    call.close();
    return;
  }

  if (!appState.localStream) {
    try {
      await setupAudio();
    } catch (error) {
      showAlert('Требуется доступ к микрофону');
      return;
    }
  }

  appState.currentCall = call;
  appState.partnerId = call.peer;
  appState.isConnected = true;
  
  call.answer(appState.localStream);
  updateUI();

  call.on('stream', remoteStream => {
    document.getElementById('remoteAudio').srcObject = remoteStream;
  });

  call.on('close', endCall);
}

async function makeCall() {
  const partnerId = document.getElementById('partnerId').value.trim();
  
  if (!partnerId) {
    showAlert('Введите ID собеседника');
    return;
  }

  if (!appState.localStream) {
    try {
      await setupAudio();
    } catch (error) {
      return;
    }
  }

  try {
    appState.currentCall = appState.peer.call(partnerId, appState.localStream);
    appState.partnerId = partnerId;
    appState.isConnected = true;
    updateUI();

    appState.currentCall.on('stream', remoteStream => {
      document.getElementById('remoteAudio').srcObject = remoteStream;
    });

    appState.currentCall.on('close', endCall);
  } catch (error) {
    showAlert('Не удалось установить соединение');
  }
}

function endCall() {
  if (appState.currentCall) {
    appState.currentCall.close();
  }
  resetCallState();
}

function toggleMute() {
  if (!appState.localStream) return;
  
  appState.isMuted = !appState.isMuted;
  appState.localStream.getAudioTracks().forEach(track => {
    track.enabled = !appState.isMuted;
  });
  updateUI();
}

async function findPartner() {
  if (appState.isConnected) {
    showAlert('Сначала завершите текущий разговор');
    return;
  }

  document.getElementById('searchSpinner').classList.remove('hidden');

  try {
    const response = await fetch(`/find-partner?myId=${appState.peer.id}`);
    const data = await response.json();
    
    if (data.partnerId) {
      document.getElementById('partnerId').value = data.partnerId;
      makeCall();
    } else {
      showAlert(`${data.error || 'Нет доступных собеседников'}`);
    }
  } catch (error) {
    showAlert('Ошибка соединения с сервером');
  } finally {
    document.getElementById('searchSpinner').classList.add('hidden');
  }
}

function copyPeerId() {
  const id = appState.peer.id;
  navigator.clipboard.writeText(id);
  alert('ID скопирован в буфер обмена');
}

function updateUI() {
  const statusElement = document.getElementById('status');
  const callPanel = document.getElementById('activeCallPanel');

  if (appState.isConnected) {
    statusElement.classList.remove('disconnected');
    statusElement.classList.add('connected');
    statusElement.querySelector('.status-text').textContent = 'В разговоре';
    callPanel.classList.remove('hidden');
    document.getElementById('partnerIdDisplay').textContent = appState.partnerId;
  } else {
    statusElement.classList.remove('connected');
    statusElement.classList.add('disconnected');
    statusElement.querySelector('.status-text').textContent = 'Отключен';
    callPanel.classList.add('hidden');
  }

  document.getElementById('muteBtn').innerHTML = 
    appState.isMuted ? '🔈 <span>Включить звук</span>' : '🔇 <span>Выключить звук</span>';
}

function resetCallState() {
  document.getElementById('remoteAudio').srcObject = null;
  appState.currentCall = null;
  appState.isConnected = false;
  appState.partnerId = null;
  updateUI();
}

function showAlert(message) {
  alert(message);
}

function restoreSession() {
  // Можно добавить восстановление сессии при необходимости
}

// Вспомогательные функции
function updateStatus(text, status) {
  const statusElement = document.getElementById('status');
  statusElement.querySelector('.status-text').textContent = text;
  statusElement.className = `status-badge ${status}`;
}

function handlePeerError(error) {
  console.error('PeerJS Error:', error);
  showAlert(`Ошибка соединения: ${error.type}`);
}