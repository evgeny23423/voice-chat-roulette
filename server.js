const express = require('express');
const { PeerServer } = require('peer');
const cors = require('cors');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 9000;

// Middleware
app.use(cors({
  origin: '*', // Для разработки, в продакшене укажите конкретные домены
  methods: ['GET', 'POST', 'OPTIONS']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Хранилища данных
const activePeers = new Map();
const chatMessages = [];

// Создаем HTTP сервер
const server = http.createServer(app);

// Инициализация PeerServer
const peerServer = PeerServer({
  port: PORT,
  path: '/peerjs',
  proxied: true
});

// Инициализация WebSocket сервера
const wss = new WebSocket.Server({ server });

// Функция для рассылки сообщений
function broadcast(data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// Обработчики WebSocket соединений
wss.on('connection', (ws) => {
  console.log('New WebSocket connection');
  
  // Отправляем историю сообщений новому клиенту
  ws.send(JSON.stringify({
    type: 'history',
    messages: chatMessages.slice(-50)
  }));

  // Отправляем обновленное количество онлайн пользователей
  broadcastOnlineCount();

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'chat_message' && data.text && data.text.trim() !== '') {
        const chatMessage = {
          text: data.text.trim(),
          timestamp: Date.now(),
          type: 'chat_message',
          userId: data.userId || 'anonymous'
        };
        
        // Сохраняем сообщение (максимум 1000 сообщений)
        chatMessages.push(chatMessage);
        if (chatMessages.length > 1000) chatMessages.shift();
        
        // Рассылаем всем клиентам
        broadcast(chatMessage);
      }
    } catch (err) {
      console.error('Error processing message:', err);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
    broadcastOnlineCount();
  });
});

// Функция для рассылки количества онлайн пользователей
function broadcastOnlineCount() {
  broadcast({
    type: 'online_count',
    count: wss.clients.size
  });
}

// API Endpoints
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: Date.now(),
    activePeers: activePeers.size,
    activeChatUsers: wss.clients.size
  });
});

app.get('/ping', (req, res) => {
  const peerId = req.query.peerId;
  if (peerId && activePeers.has(peerId)) {
    activePeers.get(peerId).lastActive = Date.now();
  }
  res.sendStatus(200);
});

app.get('/online-count', (req, res) => {
  res.json({
    count: wss.clients.size,
    timestamp: Date.now()
  });
});

app.get('/find-partner', (req, res) => {
  try {
    const myId = req.query.myId;
    
    if (!myId) {
      return res.status(400).json({ 
        error: 'Требуется параметр myId',
        code: 'MISSING_ID'
      });
    }

    // Обновляем активность текущего пира
    if (activePeers.has(myId)) {
      activePeers.get(myId).lastActive = Date.now();
    }

    // Ищем доступных партнеров (активны в последние 30 секунд)
    const availablePeers = [];
    const now = Date.now();
    const maxInactiveTime = 30000;

    activePeers.forEach((peer, peerId) => {
      if (peerId !== myId && (now - peer.lastActive) < maxInactiveTime) {
        availablePeers.push(peerId);
      }
    });

    if (availablePeers.length === 0) {
      return res.status(404).json({
        error: 'Нет доступных собеседников',
        code: 'NO_PARTNERS',
        retryAfter: 5
      });
    }

    // Выбираем случайного партнера
    const partnerId = availablePeers[Math.floor(Math.random() * availablePeers.length)];
    
    res.json({ 
      partnerId,
      timestamp: Date.now()
    });

  } catch (err) {
    console.error('Ошибка поиска партнера:', err);
    res.status(500).json({ 
      error: 'Внутренняя ошибка сервера',
      code: 'SERVER_ERROR'
    });
  }
});

// Очистка неактивных пиров каждую минуту
setInterval(() => {
  const now = Date.now();
  activePeers.forEach((peer, peerId) => {
    if (now - peer.lastActive > 300000) { // 5 минут
      activePeers.delete(peerId);
      console.log(`Removed inactive peer: ${peerId}`);
    }
  });
}, 60000);

// Обработка ошибок
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  
  // Закрываем WebSocket соединения
  wss.clients.forEach(client => client.close());
  wss.close();
  
  // Закрываем сервер
  server.close(() => {
    process.exit(0);
  });
});

// Запуск сервера
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server started on port ${PORT}`);
});