// Элементы DOM
const startBtn = document.getElementById('startBtn');
const nextBtn = document.getElementById('nextBtn');
const muteBtn = document.getElementById('muteBtn');
const statusElement = document.querySelector('.status');
const usernameElement = document.querySelector('.username');
const remoteAudio = document.getElementById('remoteAudio');
const avatarPlaceholder = document.querySelector('.avatar-placeholder');

// Глобальные переменные
let peer;
let currentCall;
let myStream;
let isMuted = false;
const usedPeerIds = new Set(); // Чтобы избежать повторов

// Инициализация PeerJS
function initPeer() {
  peer = new Peer({
    host: '0.peerjs.com', // Бесплатный сервер (или ваш собственный)
    port: 443,
    secure: true,
    debug: 3
  });

  peer.on('open', (id) => {
    statusElement.textContent = "В сети (ID: " + id + ")";
    statusElement.style.color = "#2ecc71";
    startBtn.disabled = true;
    nextBtn.disabled = false;
    muteBtn.disabled = false;
  });

  peer.on('error', (err) => {
    console.error('PeerJS error:', err);
    statusElement.textContent = "Ошибка подключения";
    statusElement.style.color = "#e74c3c";
  });

  // Ожидаем входящих звонков
  peer.on('call', (call) => {
    call.answer(myStream); // Отвечаем своим аудио
    setupCall(call);
  });
}

// Начать чат (запускается по кнопке "Начать")
async function startChat() {
  try {
    myStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    initPeer();
  } catch (err) {
    console.error('Ошибка доступа к микрофону:', err);
    statusElement.textContent = "Нет доступа к микрофону";
  }
}

// Поиск случайного собеседника (кнопка "Следующий")
function nextUser() {
  if (!peer || peer.disconnected) return;

  // В реальном приложении здесь должен быть сервер для матчинга
  // Для демо - случайный ID из 4 цифр
  let randomId;
  do {
    randomId = Math.floor(1000 + Math.random() * 9000).toString();
  } while (usedPeerIds.has(randomId));

  usedPeerIds.add(randomId);
  usernameElement.textContent = "Подключение к " + randomId + "...";

  const call = peer.call(randomId, myStream);
  setupCall(call);
}

// Обработка звонка
function setupCall(call) {
  if (currentCall) currentCall.close();

  call.on('stream', (remoteStream) => {
    remoteAudio.srcObject = remoteStream;
    usernameElement.textContent = "Собеседник #" + call.peer.slice(0, 4);
    avatarPlaceholder.textContent = call.peer.slice(0, 2); // Показываем часть ID
  });

  call.on('close', () => {
    usernameElement.textContent = "Соединение разорвано";
    avatarPlaceholder.textContent = "?";
  });

  currentCall = call;
}

// Отключение микрофона
function toggleMute() {
  if (!myStream) return;
  
  isMuted = !isMuted;
  myStream.getAudioTracks()[0].enabled = !isMuted;
  
  muteBtn.style.backgroundColor = isMuted ? "#95a5a6" : "#e74c3c";
  muteBtn.innerHTML = isMuted ? '<span class="icon-mic-off"></span>' : '<span class="icon-mic"></span>';
}

// Обработчики кнопок
startBtn.addEventListener('click', startChat);
nextBtn.addEventListener('click', nextUser);
muteBtn.addEventListener('click', toggleMute);

// Добавим иконку отключенного микрофона в CSS
const style = document.createElement('style');
style.textContent = `
  .icon-mic::before { content: "🎤"; }
  .icon-mic-off::before { content: "🔇"; }
`;
document.head.appendChild(style);