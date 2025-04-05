// Конфигурация для Railway
const config = {
  peer: {
    host: window.location.hostname,
    port: 443,
    path: '/peerjs',
    secure: true,
    debug: 3
  },
  api: {
    baseUrl: window.location.origin
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

// Инициализация
document.addEventListener('DOMContentLoaded', async () => {
  await initPeerConnection();
  setupEventListeners();
});

async function initPeerConnection() {
  state.peer = new Peer(config.peer);

  state.peer.on('open', (id) => {
    console.log('My ID:', id);
    document.getElementById('myId').textContent = id;
  });

  state.peer.on('call', async (call) => {
    if (!state.localStream) {
      try {
        state.localStream = await navigator.mediaDevices.getUserMedia(config.media);
      } catch (err) {
        console.error('Microphone error:', err);
        return;
      }
    }
    
    state.currentCall = call;
    state.isConnected = true;
    call.answer(state.localStream);
    
    call.on('stream', (remoteStream) => {
      document.getElementById('remoteAudio').srcObject = remoteStream;
      updateUI();
    });
    
    call.on('close', endCall);
  });
}

function setupEventListeners() {
  document.getElementById('callBtn').addEventListener('click', makeCall);
  document.getElementById('findRandomBtn').addEventListener('click', findRandomPartner);
  document.getElementById('hangupBtn').addEventListener('click', endCall);
  document.getElementById('muteBtn').addEventListener('click', toggleMute);
  document.getElementById('copyIdBtn').addEventListener('click', copyPeerId);
}

async function makeCall() {
  const partnerId = document.getElementById('partnerId').value.trim();
  if (!partnerId) return;

  if (!state.localStream) {
    try {
      state.localStream = await navigator.mediaDevices.getUserMedia(config.media);
    } catch (err) {
      console.error('Microphone error:', err);
      return;
    }
  }

  state.currentCall = state.peer.call(partnerId, state.localStream);
  state.isConnected = true;
  
  state.currentCall.on('stream', (remoteStream) => {
    document.getElementById('remoteAudio').srcObject = remoteStream;
    updateUI();
  });
  
  state.currentCall.on('close', endCall);
}

async function findRandomPartner() {
  try {
    const response = await fetch(`${config.api.baseUrl}/find-partner?myId=${state.peer.id}`);
    const data = await response.json();
    
    if (data.partnerId) {
      document.getElementById('partnerId').value = data.partnerId;
      await makeCall();
    }
  } catch (err) {
    console.error('Find partner error:', err);
  }
}

function endCall() {
  if (state.currentCall) state.currentCall.close();
  state.isConnected = false;
  updateUI();
}

function toggleMute() {
  if (!state.localStream) return;
  state.isMuted = !state.isMuted;
  state.localStream.getAudioTracks()[0].enabled = !state.isMuted;
  updateUI();
}

function updateUI() {
  const statusEl = document.getElementById('status');
  const callPanel = document.getElementById('activeCallPanel');
  
  if (state.isConnected) {
    statusEl.className = 'status-badge connected';
    statusEl.querySelector('.status-text').textContent = 'В разговоре';
    callPanel.classList.remove('hidden');
  } else {
    statusEl.className = 'status-badge disconnected';
    statusEl.querySelector('.status-text').textContent = 'Отключен';
    callPanel.classList.add('hidden');
  }
  
  document.getElementById('muteBtn').querySelector('.text').textContent = 
    state.isMuted ? 'Включить звук' : 'Выключить звук';
}

function copyPeerId() {
  navigator.clipboard.writeText(state.peer.id)
    .then(() => alert('ID скопирован!'))
    .catch(err => console.error('Copy failed:', err));
}