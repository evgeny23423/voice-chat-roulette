const config = {
  peer: {
    host: 'https://web-production-175e.up.railway.app', // Замените на ваш домен Railway
    port: 443,
    path: '/peerjs',
    secure: true,
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

// Инициализация PeerJS с обработкой ошибок
function initPeerConnection() {
  return new Promise((resolve, reject) => {
    state.peer = new Peer(config.peer);

    state.peer.on('open', (id) => {
      console.log('Peer ID:', id);
      document.getElementById('myId').textContent = id;
      resolve();
    });

    state.peer.on('error', (error) => {
      console.error('PeerJS Error:', error);
      
      // Специфичные сообщения для разных ошибок
      let message = 'Ошибка соединения';
      if (error.type === 'network') {
        message = 'Проблемы с интернет-соединением';
      } else if (error.type === 'peer-unavailable') {
        message = 'Сервер недоступен';
      }
      
      alert(message);
      reject(error);
    });
  });
}

// Проверка соединения перед инициализацией
async function checkConnection() {
  try {
    const response = await fetch('https://ваш-проект.up.railway.app/health');
    if (!response.ok) throw new Error('Server not ready');
    return true;
  } catch (error) {
    console.error('Connection check failed:', error);
    alert('Сервер временно недоступен. Попробуйте позже.');
    return false;
  }
}

// Основная инициализация
document.addEventListener('DOMContentLoaded', async () => {
  if (!await checkConnection()) return;

  try {
    await initPeerConnection();
    setupEventListeners();
  } catch (error) {
    console.error('Initialization failed:', error);
  }
});