const config = {
  peerServer: {
    host: 'web-production-175e.up.railway.app',
    path: '/peerjs',
    secure: true,
    debug: 3
  },
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ]
};
// Состояние приложения
const state = {
  peer: null,
  currentCall: null,
  localStream: null,
  isMuted: false,
  isConnected: false,
  callStartTime: null,
  callTimer: null,
  myId: null,
  retryCount: 0
};

// DOM элементы
const elements = {
  myId: document.getElementById('myId'),
  partnerId: document.getElementById('partnerId'),
  callBtn: document.getElementById('callBtn'),
  findRandomBtn: document.getElementById('findRandomBtn'),
  status: document.getElementById('status'),
  statusDot: document.querySelector('.status-dot'),
  statusText: document.querySelector('.status-text'),
  activeCallPanel: document.getElementById('activeCallPanel'),
  partnerIdDisplay: document.getElementById('partnerIdDisplay'),
  callDuration: document.getElementById('callDuration'),
  muteBtn: document.getElementById('muteBtn'),
  hangupBtn: document.getElementById('hangupBtn'),
  remoteAudio: document.getElementById('remoteAudio'),
  searchSpinner: document.getElementById('searchSpinner'),
  copyIdBtn: document.getElementById('copyIdBtn')
};
function initPeerConnection() {
  state.peer = new Peer({
    config: config.peerServer,
    iceServers: config.iceServers
  });


  state.peer.on('open', (id) => {
    state.myId = id;
    elements.myId.textContent = id;
    updateStatus('connected');
    console.log('My peer ID is: ' + id);
  });

  state.peer.on('error', (err) => {
    console.error('Peer error:', err);
    updateStatus('error');
    
    // Автоматический реконнект
    if (state.retryCount < 3) {
      state.retryCount++;
      setTimeout(initPeerConnection, 2000 * state.retryCount);
    }
  });

  state.peer.on('call', async (call) => {
    try {
      if (!state.localStream) {
        await requestMicrophone();
      }
      
      call.answer(state.localStream);
      setupCall(call);
      
      // Показываем панель звонка
      elements.activeCallPanel.classList.remove('hidden');
      elements.partnerIdDisplay.textContent = call.peer;
    } catch (err) {
      console.error('Error answering call:', err);
    }
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
  } catch (err) {
    console.error('Microphone access denied:', err);
    alert('Для работы приложения необходим доступ к микрофону');
    return false;
  }
}

async function findRandomPartner(retryCount = 0) {
  if (!state.peer?.id) {
    alert('Сначала установите подключение к серверу');
    return;
  }

  elements.searchSpinner.classList.remove('hidden');
  elements.findRandomBtn.disabled = true;
  elements.findRandomBtn.textContent = 'Поиск...';

  try {
    // Явно указываем полный URL вашего сервера
    const response = await fetch(`https://web-production-175e.up.railway.app/find-partner?myId=${state.myId}`, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Обработка HTTP ошибок
    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const errorMessage = errorData?.error || `Ошибка сервера: ${response.status}`;
      throw new Error(errorMessage);
    }

    const data = await response.json();
    
    // Если сервер вернул ошибку
    if (data.error) {
      // Автоматический повтор (максимум 3 попытки)
      if (retryCount < 3) {
        await new Promise(resolve => setTimeout(resolve, 2000 * (retryCount + 1)));
        return findRandomPartner(retryCount + 1);
      }
      throw new Error(data.error);
    }

    // Если найден партнер
    if (data.partnerId) {
      await callPeer(data.partnerId);
      return;
    }

    throw new Error('Собеседник не найден');

  } catch (err) {
    console.error('Ошибка поиска:', err);
    elements.findRandomBtn.textContent = 'Попробовать снова';
    alert(err.message);
  } finally {
    elements.searchSpinner.classList.add('hidden');
    elements.findRandomBtn.disabled = false;
  }
}


  try {
    const response = await fetch(`https://web-production-175e.up.railway.app/find-partner?myId=${state.myId}`);
    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error);
    }

    if (data.partnerId) {
      await callPeer(data.partnerId);
    }
  } catch (err) {
    console.error('Find partner error:', err);
    alert('Не удалось найти собеседника. Попробуйте позже.');
  } finally {
    elements.searchSpinner.classList.add('hidden');
    elements.findRandomBtn.disabled = false;
  }
}

// Звонок указанному собеседнику
async function callPeer(peerId) {
  if (!state.localStream) {
    const hasAccess = await requestMicrophone();
    if (!hasAccess) return;
  }

  try {
    const call = state.peer.call(peerId, state.localStream);
    setupCall(call);
    
    // Показываем панель звонка
    elements.activeCallPanel.classList.remove('hidden');
    elements.partnerIdDisplay.textContent = peerId;
  } catch (err) {
    console.error('Call error:', err);
    alert('Ошибка при установке соединения');
  }
}

// Настройка обработчиков звонка
function setupCall(call) {
  state.currentCall = call;
  state.callStartTime = new Date();
  startCallTimer();

  call.on('stream', (remoteStream) => {
    elements.remoteAudio.srcObject = remoteStream;
    state.isConnected = true;
    updateStatus('in-call');
  });

  call.on('close', () => {
    endCall();
  });

  call.on('error', (err) => {
    console.error('Call error:', err);
    endCall();
  });
}

// Завершение звонка
function endCall() {
  if (state.currentCall) {
    state.currentCall.close();
  }
  
  if (state.callTimer) {
    clearInterval(state.callTimer);
  }
  
  if (elements.remoteAudio.srcObject) {
    elements.remoteAudio.srcObject = null;
  }
  
  state.currentCall = null;
  state.isConnected = false;
  elements.activeCallPanel.classList.add('hidden');
  updateStatus('connected');
}

// Таймер звонка
function startCallTimer() {
  let seconds = 0;
  state.callTimer = setInterval(() => {
    seconds++;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    elements.callDuration.textContent = 
      `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }, 1000);
}

// Обновление статуса подключения
function updateStatus(status) {
  elements.statusDot.className = 'status-dot';
  elements.statusText.textContent = '';
  
  switch (status) {
    case 'connected':
      elements.statusDot.classList.add('connected');
      elements.statusText.textContent = 'Подключен';
      break;
    case 'in-call':
      elements.statusDot.classList.add('in-call');
      elements.statusText.textContent = 'В разговоре';
      break;
    case 'error':
      elements.statusDot.classList.add('error');
      elements.statusText.textContent = 'Ошибка';
      break;
    default:
      elements.statusDot.classList.add('disconnected');
      elements.statusText.textContent = 'Отключен';
  }
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', async () => {
  // Инициализация PeerJS
  await initPeerConnection();
  
  // Обработчики событий
  elements.callBtn.addEventListener('click', () => {
    const partnerId = elements.partnerId.value.trim();
    if (partnerId) {
      callPeer(partnerId);
    } else {
      alert('Введите ID собеседника');
    }
  });
  
  elements.findRandomBtn.addEventListener('click', findRandomPartner);
  
  elements.muteBtn.addEventListener('click', () => {
    if (state.localStream) {
      state.isMuted = !state.isMuted;
      state.localStream.getAudioTracks()[0].enabled = !state.isMuted;
      elements.muteBtn.classList.toggle('muted', state.isMuted);
    }
  });
  
  elements.hangupBtn.addEventListener('click', endCall);
  
  elements.copyIdBtn.addEventListener('click', () => {
    if (state.myId) {
      navigator.clipboard.writeText(state.myId);
      alert('ID скопирован в буфер обмена');
    }
  });
  
  // Проверка доступности сервера
  async function checkServer() {
    try {
      const response = await fetch(`https://${config.peerServer.host}/health`);
      if (!response.ok) throw new Error('Server not healthy');
    } catch (err) {
      console.error('Server check failed:', err);
      alert('Сервер временно недоступен. Попробуйте позже.');
    }
  }
  
  await checkServer();
});