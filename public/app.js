// Конфигурация для Railway
const config = {
  peer: {
    host: window.location.hostname,
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

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initPeerConnection();
    setupEventListeners();
    // Явно запрашиваем микрофон при загрузке
    await requestMicrophoneAccess(); 
  } catch (error) {
    console.error("Init error:", error);
    alert("Ошибка инициализации: " + error.message);
  }
});

// Функция запроса доступа к микрофону
async function requestMicrophoneAccess() {
  try {
    state.localStream = await navigator.mediaDevices.getUserMedia(config.media);
    console.log("Microphone access granted");
    return true;
  } catch (error) {
    console.error("Microphone error:", error);
    alert("Для работы приложения требуется доступ к микрофону!");
    return false;
  }
}

// Инициализация Peer соединения
async function initPeerConnection() {
  return new Promise((resolve) => {
    state.peer = new Peer(config.peer);

    state.peer.on('open', (id) => {
      console.log("My peer ID:", id);
      document.getElementById('myId').textContent = id;
      resolve();
    });

    state.peer.on('call', handleIncomingCall);
    state.peer.on('error', handlePeerError);
  });
}

// Обработка входящих вызовов
async function handleIncomingCall(call) {
  if (state.isConnected) {
    call.close();
    return;
  }

  if (!state.localStream) {
    const hasAccess = await requestMicrophoneAccess();
    if (!hasAccess) return;
  }

  state.currentCall = call;
  state.isConnected = true;
  call.answer(state.localStream);

  call.on('stream', (remoteStream) => {
    document.getElementById('remoteAudio').srcObject = remoteStream;
    updateUI();
  });

  call.on('close', endCall);
}

// Настройка обработчиков событий
function setupEventListeners() {
  document.getElementById('callBtn').addEventListener('click', makeCall);
  document.getElementById('findRandomBtn').addEventListener('click', findRandomPartner);
  document.getElementById('hangupBtn').addEventListener('click', endCall);
  document.getElementById('muteBtn').addEventListener('click', toggleMute);
}

// Поиск случайного собеседника
async function findRandomPartner() {
  if (!state.localStream) {
    const hasAccess = await requestMicrophoneAccess();
    if (!hasAccess) return;
  }

  if (state.isConnected) {
    alert("Сначала завершите текущий звонок");
    return;
  }

  try {
    const response = await fetch(`/find-partner?myId=${state.peer.id}`);
    const data = await response.json();
    
    if (data.partnerId) {
      document.getElementById('partnerId').value = data.partnerId;
      await makeCall();
    } else {
      alert(data.error || "Нет доступных собеседников");
    }
  } catch (error) {
    console.error("Search error:", error);
    alert("Ошибка поиска собеседника");
  }
}

// Остальные функции (makeCall, endCall, toggleMute, updateUI) остаются без изменений