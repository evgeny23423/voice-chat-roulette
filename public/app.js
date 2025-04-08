const config = {
<<<<<<< HEAD
  peerConfig: {
    host: window.location.hostname, // Автоподстановка
    port: window.location.protocol === 'https:' ? 443 : 9001,
    path: '/peerjs',
    secure: window.location.protocol === 'https:',
    debug: 3
  },
  audioConstraints: {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
=======
  peer: {
    host: 'web-production-175e.up.railway.app', // Ваш реальный домен Railway
    port: 443,
    path: '/peerjs',
    secure: true,
    debug: 3,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' }
      ]
>>>>>>> ee5044a24df45e10ca3cd4547755ba5fdb3c99f3
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

// Проверка доступности сервера
async function checkServerAvailability() {
  try {
    const response = await fetch('https://web-production-175e.up.railway.app/health');
    if (!response.ok) throw new Error('Server not healthy');
    return true;
  } catch (error) {
    console.error('Server check failed:', error);
    return false;
  }
}

// Инициализация PeerJS с улучшенной обработкой ошибок
async function initPeerConnection() {
  return new Promise((resolve) => {
    state.peer = new Peer({
      host: 'web-production-175e.up.railway.app',
      port: 443,
      path: '/peerjs',
      secure: true,
      config: {
        iceServers: [
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' }
        ]
      }
    });

    state.peer.on('open', (id) => {
      console.log('PeerID:', id);
      document.getElementById('myId').textContent = id;
      resolve();
    });

    state.peer.on('error', (error) => {
      console.error('PeerJS Error:', error);
      
      // Автоматический реконнект при определенных ошибках
      if (['network', 'server-error'].includes(error.type)) {
        setTimeout(initPeerConnection, 2000);
      }
    });
  });
}

// Запрос доступа к микрофону
async function requestMicrophone() {
  try {
    state.localStream = await navigator.mediaDevices.getUserMedia({ 
      audio: true,
      video: false
    });
    return true;
  } catch (error) {
    console.error('Microphone error:', error);
    return false;
  }
}

// Основная инициализация
document.addEventListener('DOMContentLoaded', async () => {
  if (!await checkServerAvailability()) {
    alert('Сервер временно недоступен. Попробуйте позже.');
    return;
  }

  try {
    await initPeerConnection();
    await requestMicrophone();
    setupEventListeners();
  } catch (error) {
    console.error('App initialization failed:', error);
  }
});