const config = {
  peer: {
    host: window.location.hostname,
    port: window.location.protocol === 'https:' ? 443 : 9001,
    path: '/peerjs',
    secure: window.location.protocol === 'https:',
    debug: 3
  },
  media: {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  }
};

const state = {
  peer: null,
  currentCall: null,
  localStream: null,
  isConnected: false,
  isMuted: false
};

// Функция обработки ошибок PeerJS
function handlePeerError(error) {
  console.error('PeerJS Error:', error);
  
  // Показываем пользователю понятное сообщение
  let errorMessage = 'Ошибка соединения';
  
  switch(error.type) {
    case 'peer-unavailable':
      errorMessage = 'Собеседник недоступен';
      break;
    case 'network':
      errorMessage = 'Проблемы с интернет-соединением';
      break;
    case 'ssl-unavailable':
      errorMessage = 'Требуется HTTPS соединение';
      break;
  }
  
  alert(errorMessage);
  
  // Переподключаемся при некоторых ошибках
  if (error.type !== 'peer-unavailable' && state.peer) {
    state.peer.reconnect();
  }
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initPeerConnection();
    setupEventListeners();
    await requestMicrophoneAccess(); // Явный запрос микрофона
  } catch (error) {
    handlePeerError(error);
  }
});

async function initPeerConnection() {
  return new Promise((resolve) => {
    state.peer = new Peer(config.peer);
    
    state.peer.on('open', (id) => {
      document.getElementById('myId').textContent = id;
      resolve();
    });
    
    state.peer.on('error', handlePeerError);
    state.peer.on('call', handleIncomingCall);
  });
}

// Остальные функции (requestMicrophoneAccess, setupEventListeners, 
// handleIncomingCall, makeCall и т.д.) остаются без изменений