const config = {
  peerServer: {
    host: window.location.hostname,
    path: '/peerjs',
    secure: window.location.protocol === 'https:',
    debug: 3
  },
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ],
  chatServer: {
    url: window.location.protocol === 'https:' 
      ? `wss://${window.location.hostname}/chat` 
      : `ws://${window.location.hostname}/chat`,
    reconnectDelay: 5000
  }
};

const state = {
  peer: null,
  currentCall: null,
  localStream: null,
  isMuted: false,
  isConnected: false,
  callStartTime: null,
  callTimer: null,
  myId: null,
  retryCount: 0,
  onlineCount: 0,
  onlineCheckInterval: null,
  keepAliveInterval: null,
  chatSocket: null,
  chatMessages: [],
  isChatConnected: false
};

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
  copyIdBtn: document.getElementById('copyIdBtn'),
  onlineCounter: document.getElementById('onlineCounter'),
  chatContainer: document.getElementById('chatContainer'),
  messagesContainer: document.getElementById('messagesContainer'),
  messageInput: document.getElementById('messageInput'),
  sendMessageBtn: document.getElementById('sendMessageBtn'),
  toggleChatBtn: document.getElementById('toggleChatBtn'),
};

function initChat() {
  if (state.chatSocket) {
    state.chatSocket.close();
  }

  try {
    state.chatSocket = new WebSocket(config.chatServer.url);

    state.chatSocket.onopen = () => {
      state.isChatConnected = true;
      console.log('Chat connected');
      state.chatSocket.send(JSON.stringify({ type: 'get_history' }));
    };

    state.chatSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'history') {
          state.chatMessages = data.messages || [];
          renderMessages();
        } 
        else if (data.type === 'chat_message') {
          state.chatMessages.push(data);
          renderMessages();
        }
        else if (data.type === 'online_count') {
          updateOnlineCount(data.count);
        }
      } catch (err) {
        console.error('Error parsing message:', err);
      }
    };

    state.chatSocket.onclose = () => {
      state.isChatConnected = false;
      console.log('Chat disconnected. Reconnecting...');
      setTimeout(initChat, config.chatServer.reconnectDelay);
    };

    state.chatSocket.onerror = (err) => {
      console.error('Chat error:', err);
    };
  } catch (err) {
    console.error('WebSocket creation error:', err);
    setTimeout(initChat, config.chatServer.reconnectDelay);
  }
}

function renderMessages() {
  if (!elements.messagesContainer) return;
  
  elements.messagesContainer.innerHTML = '';
  const messagesToShow = state.chatMessages.slice(-50);
  
  messagesToShow.forEach(msg => {
    const messageEl = document.createElement('div');
    messageEl.className = 'message';
    
    const timeEl = document.createElement('span');
    timeEl.className = 'message-time';
    timeEl.textContent = new Date(msg.timestamp).toLocaleTimeString();
    
    const textEl = document.createElement('div');
    textEl.className = 'message-text';
    textEl.textContent = msg.text;
    
    messageEl.appendChild(timeEl);
    messageEl.appendChild(textEl);
    elements.messagesContainer.appendChild(messageEl);
  });
  
  elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
}

function sendMessage() {
  const text = elements.messageInput?.value.trim();
  if (!text || !state.isChatConnected) return;

  const message = {
    type: 'chat_message',
    text: text,
    timestamp: Date.now()
  };

  try {
    state.chatSocket.send(JSON.stringify(message));
    elements.messageInput.value = '';
    elements.messageInput.focus();
  } catch (err) {
    console.error('Error sending message:', err);
  }
}

function updateOnlineCount(count) {
  if (count !== undefined && elements.onlineCounter) {
    state.onlineCount = count;
    elements.onlineCounter.textContent = `Онлайн: ${state.onlineCount}`;
  }
}

function initPeerConnection() {
  const port = window.location.port || (config.peerServer.secure ? 443 : 80);
  
  state.peer = new Peer({
    host: config.peerServer.host,
    port: port,
    path: config.peerServer.path,
    secure: config.peerServer.secure,
    config: { 
      iceServers: config.iceServers,
      debug: config.peerServer.debug
    }
  });

  state.peer.on('open', (id) => {
    state.myId = id;
    if (elements.myId) elements.myId.textContent = id;
    updateStatus('connected');
    console.log('My peer ID is: ' + id);

    initChat();
    updateOnlineCount();
    
    state.onlineCheckInterval = setInterval(() => {
      fetch('/online-count')
        .then(response => response.json())
        .then(data => updateOnlineCount(data.count))
        .catch(console.error);
    }, 30000);

    state.keepAliveInterval = setInterval(() => {
      if (state.myId) {
        fetch(`/ping?peerId=${state.myId}`).catch(console.error);
      }
    }, 20000);
  });

  state.peer.on('error', (err) => {
    console.error('Peer error:', err);
    updateStatus('error');
    
    const delay = Math.min(2000 * Math.pow(2, state.retryCount), 30000);
    state.retryCount = state.retryCount < 10 ? state.retryCount + 1 : 10;
    
    setTimeout(() => {
      if (!state.peer || state.peer.disconnected) {
        initPeerConnection();
      }
    }, delay);
  });

  state.peer.on('call', async (call) => {
    try {
      if (!state.localStream) {
        await requestMicrophone();
      }
      
      call.answer(state.localStream);
      setupCall(call);
      
      if (elements.activeCallPanel) {
        elements.activeCallPanel.classList.remove('hidden');
        elements.partnerIdDisplay.textContent = call.peer;
      }
    } catch (err) {
      console.error('Error answering call:', err);
    }
  });
}

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

  if (elements.searchSpinner) {
    elements.searchSpinner.classList.remove('hidden');
    elements.findRandomBtn.disabled = true;
    elements.findRandomBtn.textContent = 'Поиск...';
  }

  try {
    const response = await fetch(`/find-partner?myId=${state.myId}`, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const errorMessage = errorData?.error || `Ошибка сервера: ${response.status}`;
      throw new Error(errorMessage);
    }

    const data = await response.json();
    
    if (data.error) {
      if (retryCount < 3) {
        await new Promise(resolve => setTimeout(resolve, 2000 * (retryCount + 1)));
        return findRandomPartner(retryCount + 1);
      }
      throw new Error(data.error);
    }

    if (data.partnerId) {
      await callPeer(data.partnerId);
      return;
    }

    throw new Error('Собеседник не найден');

  } catch (err) {
    console.error('Ошибка поиска:', err);
    if (elements.findRandomBtn) {
      elements.findRandomBtn.textContent = 'Попробовать снова';
    }
    alert(err.message);
  } finally {
    if (elements.searchSpinner) {
      elements.searchSpinner.classList.add('hidden');
      elements.findRandomBtn.disabled = false;
    }
  }
}

async function callPeer(peerId) {
  if (!state.localStream) {
    const hasAccess = await requestMicrophone();
    if (!hasAccess) return;
  }

  try {
    const call = state.peer.call(peerId, state.localStream);
    setupCall(call);
    
    if (elements.activeCallPanel) {
      elements.activeCallPanel.classList.remove('hidden');
      elements.partnerIdDisplay.textContent = peerId;
    }
  } catch (err) {
    console.error('Call error:', err);
    alert('Ошибка при установке соединения');
  }
}

function setupCall(call) {
  state.currentCall = call;
  state.callStartTime = new Date();
  startCallTimer();

  call.on('stream', (remoteStream) => {
    if (elements.remoteAudio) {
      elements.remoteAudio.srcObject = remoteStream;
    }
    state.isConnected = true;
    updateStatus('in-call');
  });

  call.on('close', endCall);
  call.on('error', endCall);
}

function endCall() {
  if (state.currentCall) {
    state.currentCall.close();
  }
  
  clearInterval(state.callTimer);
  clearInterval(state.onlineCheckInterval);
  clearInterval(state.keepAliveInterval);
  
  if (elements.remoteAudio) {
    elements.remoteAudio.srcObject = null;
  }
  
  if (elements.activeCallPanel) {
    elements.activeCallPanel.classList.add('hidden');
  }
  
  state.currentCall = null;
  state.isConnected = false;
  updateStatus('connected');
}

function startCallTimer() {
  let seconds = 0;
  state.callTimer = setInterval(() => {
    seconds++;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (elements.callDuration) {
      elements.callDuration.textContent = 
        `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
  }, 1000);
}

function updateStatus(status) {
  if (!elements.statusDot || !elements.statusText) return;
  
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

async function checkServer() {
  try {
    const response = await fetch('/health');
    if (!response.ok) throw new Error('Server not healthy');
    return true;
  } catch (err) {
    console.error('Server check failed:', err);
    return false;
  }
}

function setupEventListeners() {
  if (elements.sendMessageBtn) {
    elements.sendMessageBtn.addEventListener('click', sendMessage);
  }
  
  if (elements.messageInput) {
    elements.messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage();
    });
  }
  
  if (elements.toggleChatBtn) {
    elements.toggleChatBtn.addEventListener('click', () => {
      if (elements.chatContainer) {
        elements.chatContainer.classList.toggle('hidden');
      }
    });
  }
  
  if (elements.callBtn) {
    elements.callBtn.addEventListener('click', () => {
      const partnerId = elements.partnerId?.value.trim();
      if (partnerId) {
        callPeer(partnerId);
      } else {
        alert('Введите ID собеседника');
      }
    });
  }
  
  if (elements.findRandomBtn) {
    elements.findRandomBtn.addEventListener('click', findRandomPartner);
  }
  
  if (elements.muteBtn) {
    elements.muteBtn.addEventListener('click', () => {
      if (state.localStream) {
        state.isMuted = !state.isMuted;
        state.localStream.getAudioTracks()[0].enabled = !state.isMuted;
        elements.muteBtn.classList.toggle('muted', state.isMuted);
      }
    });
  }
  
  if (elements.hangupBtn) {
    elements.hangupBtn.addEventListener('click', endCall);
  }
  
  if (elements.copyIdBtn) {
    elements.copyIdBtn.addEventListener('click', async () => {
      if (state.myId) {
        try {
          await navigator.clipboard.writeText(state.myId);
          const originalText = elements.copyIdBtn.textContent;
          elements.copyIdBtn.textContent = 'Скопировано!';
          setTimeout(() => {
            elements.copyIdBtn.textContent = originalText;
          }, 2000);
        } catch (err) {
          console.error('Copy failed:', err);
          alert('Не удалось скопировать ID');
        }
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  
  if (!await checkServer()) {
    alert('Сервер временно недоступен. Попробуйте позже.');
    return;
  }

  await initPeerConnection();
  
  window.addEventListener('resize', () => {
    if (elements.messagesContainer) {
      elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
    }
  });
});