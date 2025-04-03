const peer = new Peer({
  host: window.location.hostname, // Автоподстановка хоста
  port: 9001,
  path: '/peerjs',
  debug: 3 // Включение логов для отладки
});

let currentCall = null;
let localStream = null;

// Показываем ID пользователя
peer.on('open', id => {
  console.log('Мой ID:', id);
  document.getElementById('myId').textContent = id;
  
  // Сохраняем ID в localStorage для повторного использования
  localStorage.setItem('peerId', id);
});

// Обработка ошибок PeerJS
peer.on('error', err => {
  console.error('PeerJS ошибка:', err);
  alert(`Ошибка соединения: ${err.type}`);
});

// Получаем доступ к микрофону при загрузке страницы
async function setupAudio() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true
      }
    });
    console.log('Микрофон доступен');
  } catch (err) {
    console.error('Ошибка микрофона:', err);
    alert('Не удалось получить доступ к микрофону');
  }
}

// Инициализация аудио
setupAudio();

// Обработка входящих звонков
peer.on('call', call => {
  if (currentCall) {
    call.close();
    return;
  }

  if (!localStream) {
    alert('Микрофон не настроен');
    return;
  }

  currentCall = call;
  call.answer(localStream);
  
  call.on('stream', remoteStream => {
    document.getElementById('remoteAudio').srcObject = remoteStream;
  });
  
  call.on('close', () => {
    document.getElementById('remoteAudio').srcObject = null;
    currentCall = null;
  });
});

// Кнопка звонка
document.getElementById('callBtn').addEventListener('click', async () => {
  const partnerId = document.getElementById('partnerId').value.trim();
  if (!partnerId) return alert('Введите ID собеседника');
  if (partnerId === peer.id) return alert('Нельзя звонить самому себе');

  if (!localStream) {
    try {
      await setupAudio();
    } catch (err) {
      return;
    }
  }

  if (currentCall) {
    currentCall.close();
  }

  try {
    currentCall = peer.call(partnerId, localStream);
    
    currentCall.on('stream', remoteStream => {
      document.getElementById('remoteAudio').srcObject = remoteStream;
    });
    
    currentCall.on('close', () => {
      document.getElementById('remoteAudio').srcObject = null;
      currentCall = null;
    });
  } catch (err) {
    console.error('Ошибка вызова:', err);
    alert('Не удалось установить соединение');
  }
});

// Кнопка завершения
document.getElementById('hangupBtn').addEventListener('click', () => {
  if (currentCall) {
    currentCall.close();
  }
});

// Автопоиск собеседника
async function findPartner() {
  try {
    const response = await fetch(`/find-partner?myId=${peer.id}`);
    const data = await response.json();
    
    if (data.partnerId) {
      document.getElementById('partnerId').value = data.partnerId;
      document.getElementById('callBtn').click();
    } else {
      alert(`${data.error || 'Нет доступных собеседников'} (Онлайн: ${data.availablePeers || 0})`);
    }
  } catch (err) {
    console.error('Ошибка поиска:', err);
    alert('Ошибка соединения с сервером');
  }
}

// Восстановление ID при перезагрузке
window.addEventListener('DOMContentLoaded', () => {
  const savedId = localStorage.getItem('peerId');
  if (savedId) {
    document.getElementById('myId').textContent = savedId;
  }
  
  // Назначаем обработчик для кнопки поиска
  document.getElementById('findRandomBtn')?.addEventListener('click', findPartner);
});