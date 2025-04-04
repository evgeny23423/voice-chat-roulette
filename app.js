// Конфигурация и состояние
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

// Основные функции
function initPeerConnection() {
  appState.peer = new Peer(config.peerConfig);

  appState.peer.on('open', id => {
    console.log('My Peer ID:', id);
    document.getElementById('myId').textContent = id;
    localStorage.setItem('peerId', id);
  });

  appState.peer.on('call', handleIncomingCall);
  appState.peer.on('error', handlePeerError);
  appState.peer.on('disconnected', reconnectPeer);
}

async function setupAudio() {
  try {
    appState.localStream = await navigator.mediaDevices.getUserMedia(config.audioConstraints);
    console.log('Microphone access granted');
  } catch (error) {
    console.error('Microphone error:', error);
    showAlert('Не удалось получить доступ к микрофону');
  }
}

function setupEventListeners() {
  document.getElementById('callBtn').addEventListener('click', makeCall);
  document.getElementById('hangupBtn').addEventListener('click', endCall);
  document.getElementById('muteBtn').addEventListener('click', toggleMute);
  document.getElementById('findRandomBtn').addEventListener('click', findPartner);
  
  window.addEventListener('beforeunload', cleanupOnExit);
  window.addEventListener('online', handleNetworkOnline);
}

// Обработчики событий
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
  call.on('error', handleCallError);
}

async function makeCall() {
  const partnerId = document.getElementById('partnerId').value.trim();
  
  if (!partnerId) {
    showAlert('Введите ID собеседника');
    return;
  }

  if (partnerId === appState.peer.id) {
    showAlert('Нельзя звонить самому себе');
    return;
  }

  if (!appState.localStream) {
    try {
      await setupAudio();
    } catch (error) {
      return;
    }
  }

  if (appState.isConnected) {
    endCall();
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
    appState.currentCall.on('error', handleCallError);
  } catch (error) {
    console.error('Call failed:', error);
    showAlert('Не удалось установить соединение');
  }
}

function endCall() {
  if (appState.currentCall) {
    appState.currentCall.close();
  }
  
  resetCallState();
  updateUI();
}

function toggleMute() {
  if (!appState.localStream) return;
  
  appState.isMuted = !appState.isMuted;
  appState.localStream.getAudioTracks().forEach(track => {
    track.enabled = !appState.isMuted;
  });
  
  updateUI();
}

// Вспомогательные функции
async function findPartner() {
  if (appState.isConnected) {
    showAlert('Сначала завершите текущий разговор');
    return;
  }

  showLoader(true);

  try {
    const response = await fetch(`/find-partner?myId=${appState.peer.id}`);
    const data = await response.json();
    
    if (data.partnerId) {
      document.getElementById('partnerId').value = data.partnerId;
      makeCall();
    } else {
      showAlert(`${data.error || 'Нет доступных собеседников'} (Онлайн: ${data.availablePeers || 0})`);
    }
  } catch (error) {
    console.error('Partner search failed:', error);
    showAlert('Ошибка соединения с сервером');
  } finally {
    showLoader(false);
  }
}

function updateUI() {
  const statusElement = document.getElementById('status');
  const hangupBtn = document.getElementById('hangupBtn');
  const muteBtn = document.getElementById('muteBtn');
  const partnerInfo = document.getElementById('partnerInfo');

  if (appState.isConnected) {
    statusElement.textContent = `🟢 В разговоре с ${appState.partnerId}`;
    statusElement.className = 'status connected';
    hangupBtn.disabled = false;
    partnerInfo.style.display = 'block';
    document.getElementById('partnerIdDisplay').textContent = appState.partnerId;
  } else {
    statusElement.textContent = '🔴 Не подключено';
    statusElement.className = 'status disconnected';
    hangupBtn.disabled = true;
    partnerInfo.style.display = 'none';
  }

  muteBtn.textContent = appState.isMuted ? '🔈 Включить звук' : '🔇 Выключить звук';
}

function resetCallState() {
  document.getElementById('remoteAudio').srcObject = null;
  appState.currentCall = null;
  appState.isConnected = false;
  appState.partnerId = null;
}

// Обработчики ошибок
function handlePeerError(error) {
  console.error('PeerJS Error:', error);
  showAlert(`Ошибка соединения: ${error.type}`);
}

function handleCallError(error) {
  console.error('Call Error:', error);
  showAlert('Ошибка в соединении');
  endCall();
}

function reconnectPeer() {
  console.log('Attempting to reconnect...');
  initPeerConnection();
}

// Утилиты
function showAlert(message) {
  alert(message);
}

function showLoader(show) {
  document.getElementById('searchSpinner').style.display = show ? 'block' : 'none';
}

function restoreSession() {
  const savedId = localStorage.getItem('peerId');
  if (savedId) {
    document.getElementById('myId').textContent = savedId;
  }
}

function cleanupOnExit() {
  if (appState.currentCall) {
    appState.currentCall.close();
  }
  if (appState.peer && !appState.peer.destroyed) {
    appState.peer.destroy();
  }
}

function handleNetworkOnline() {
  console.log('Connection restored');
  if (appState.peer.destroyed) {
    initPeerConnection();
  }
}