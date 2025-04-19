const express = require('express');
const { PeerServer } = require('peer');
const cors = require('cors');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 9000;
const PEER_PORT = process.env.PEER_PORT || 9001;

// Middleware
app.use(cors({
  origin: [
    'https://web-production-175e.up.railway.app',
    'http://localhost:9000'
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Хранилища данных
const activePeers = new Map();
const chatMessages = [];
const activeChatUsers = new Set();

// Создаем HTTP сервер
const server = http.createServer(app);

// Инициализация WebSocket сервера
const wss = new WebSocket.Server({ 
  server,
  clientTracking: true,
  perMessageDeflate: {
    zlibDeflateOptions: {
      chunkSize: 1024,
      memLevel: 7,
      level: 3
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024
    },
    threshold: 1024,
    concurrencyLimit: 10
  }
});

// Функция для рассылки сообщений
function broadcastMessage(message) {
  const data = JSON.stringify(message);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

// Функция для рассылки количества онлайн пользователей
function broadcastOnlineCount() {
  broadcastMessage({
    type: 'online_count',
    count: wss.clients.size
  });
}

// Обработчики WebSocket соединений
wss.on('connection', (ws) => {
  console.log('New WebSocket connection');
  activeChatUsers.add(ws);
  broadcastOnlineCount();

  // Отправляем историю сообщений новому клиенту
  ws.send(JSON.stringify({
    type: 'history',
    messages: chatMessages.slice(-50)
  }));

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
        broadcastMessage(chatMessage);
      }
    } catch (err) {
      console.error('Error processing message:', err);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
    activeChatUsers.delete(ws);
    broadcastOnlineCount();
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
    activeChatUsers.delete(ws);
    broadcastOnlineCount();
  });
});

// Peer Server
const peerServer = PeerServer({
  port: PEER_PORT,
  path: '/peerjs',
  proxied: true,
  ssl: {},
  allow_discovery: true,
  key: 'peerjs',
  concurrent_limit: 1000,
  alive_timeout: 60000
});

// Обработчики событий PeerServer
peerServer.on('connection', (client) => {
  const clientId = client.id;
  activePeers.set(clientId, {
    id: clientId,
    lastActive: Date.now()
  });
  console.log('Peer connected:', clientId);

  client.on('close', () => {
    activePeers.delete(clientId);
    console.log('Peer disconnected:', clientId);
    broadcastOnlineCount();
  });

  client.on('error', (err) => {
    console.error('Peer error:', err);
    activePeers.delete(clientId);
  });
});

// Очистка неактивных пиров
setInterval(() => {
  const now = Date.now();
  activePeers.forEach((peer, peerId) => {
    if (now - peer.lastActive > 300000) { // 5 минут
      activePeers.delete(peerId);
      console.log(`Removed inactive peer: ${peerId}`);
    }
  });
}, 60000);

// API Endpoints
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    activePeers: activePeers.size,
    activeChatUsers: wss.clients.size,
    uptime: process.uptime()
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

    // Ищем доступных партнеров
    const availablePeers = [];
    const now = Date.now();
    const maxInactiveTime = 30000; // 30 секунд

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