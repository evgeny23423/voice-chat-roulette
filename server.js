const express = require('express');
const { PeerServer } = require('peer');
const cors = require('cors');
const path = require('path');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 9000;
const PEER_PORT = process.env.PEER_PORT || 9001;

// Конфигурация CORS
const corsOptions = {
  origin: [
    'https://web-production-175e.up.railway.app',
    'http://localhost:9000',
    'https://your-frontend-domain.com' // Добавьте ваш домен
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Хранилища данных
const activePeers = new Map();
const chatMessages = [];
const activeChatUsers = new Set();

// Инициализация серверов
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`
  Server is running:
  - Web: http://localhost:${PORT}
  - PeerJS: wss://web-production-175e.up.railway.app/peerjs
  - Health: https://web-production-175e.up.railway.app/health
  `);
});

// WebSocket Server с улучшенной обработкой ошибок
const wss = new WebSocket.Server({ 
  server,
  clientTracking: true,
  maxPayload: 1048576 // 1MB
});

// Peer Server с оптимизациями для мобильных
const peerServer = PeerServer({
  port: PEER_PORT,
  path: '/peerjs',
  proxied: true,
  ssl: {},
  allow_discovery: true,
  key: 'peerjs',
  concurrent_limit: 1000,
  alive_timeout: 60000,
  // Оптимизации для мобильных:
  ping_interval: 3000,
  destroy_unused_timeout: 45000,
  expire_timeout: 45000,
  ip_limit: 100
});

// Обработчики WebSocket
wss.on('connection', handleWebSocketConnection);

function handleWebSocketConnection(ws) {
  activeChatUsers.add(ws);
  broadcastOnlineCount();

  // Отправляем историю сообщений
  sendInitialChatHistory(ws);

  ws.on('message', handleWebSocketMessage);
  ws.on('close', handleWebSocketClose);
  ws.on('error', handleWebSocketError);
}

function sendInitialChatHistory(ws) {
  try {
    ws.send(JSON.stringify({
      type: 'history',
      messages: chatMessages.slice(-50)
    }));
  } catch (err) {
    console.error('Error sending chat history:', err);
  }
}

function handleWebSocketMessage(message) {
  try {
    const data = JSON.parse(message);
    
    if (data.type === 'chat_message' && data.text && data.text.trim()) {
      const chatMessage = {
        text: data.text.trim(),
        timestamp: Date.now(),
        type: 'chat_message'
      };
      
      chatMessages.push(chatMessage);
      broadcastMessage(chatMessage);
    }
  } catch (err) {
    console.error('Error processing message:', err);
  }
}

function handleWebSocketClose() {
  activeChatUsers.delete(this);
  broadcastOnlineCount();
}

function handleWebSocketError(err) {
  console.error('WebSocket error:', err);
  activeChatUsers.delete(this);
  broadcastOnlineCount();
}

// Функции рассылки сообщений
function broadcastMessage(message) {
  const data = JSON.stringify(message);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(data);
      } catch (err) {
        console.error('Error broadcasting message:', err);
      }
    }
  });
}

function broadcastOnlineCount() {
  const count = activeChatUsers.size;
  broadcastMessage({
    type: 'online_count',
    count,
    timestamp: Date.now()
  });
}

// Обработчики PeerServer
peerServer.on('connection', handlePeerConnection);

function handlePeerConnection(client) {
  const clientId = client.id;
  activePeers.set(clientId, Date.now());
  console.log('Peer connected:', clientId);

  client.on('close', () => handlePeerDisconnect(clientId));
  client.on('error', (err) => handlePeerError(clientId, err));
}

function handlePeerDisconnect(peerId) {
  activePeers.delete(peerId);
  console.log('Peer disconnected:', peerId);
}

function handlePeerError(peerId, err) {
  console.error('Peer error:', peerId, err);
  activePeers.delete(peerId);
}

// Очистка неактивных пиров
setInterval(cleanupInactivePeers, 5 * 60 * 1000);

function cleanupInactivePeers() {
  const now = Date.now();
  const timeout = 5 * 60 * 1000;
  
  activePeers.forEach((lastActive, peerId) => {
    if (now - lastActive > timeout) {
      activePeers.delete(peerId);
      console.log(`Removed inactive peer: ${peerId}`);
    }
  });
}

// API Endpoints
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    activePeers: activePeers.size,
    activeChatUsers: activeChatUsers.size,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage()
  });
});

app.get('/ping', handlePingRequest);
app.get('/online-count', handleOnlineCountRequest);
app.get('/find-partner', handleFindPartnerRequest);

function handlePingRequest(req, res) {
  const peerId = req.query.peerId;
  if (peerId && activePeers.has(peerId)) {
    activePeers.set(peerId, Date.now());
  }
  res.sendStatus(200);
}

function handleOnlineCountRequest(req, res) {
  res.json({
    success: true,
    count: activePeers.size,
    timestamp: Date.now()
  });
}

function handleFindPartnerRequest(req, res) {
  try {
    const myId = req.query.myId;
    
    if (!myId) {
      return res.status(400).json({ 
        error: 'Требуется параметр myId',
        code: 'MISSING_ID'
      });
    }

    activePeers.set(myId, Date.now());
    const partnerId = findAvailablePartner(myId);

    if (!partnerId) {
      return res.status(200).json({
        error: 'Нет доступных собеседников',
        code: 'NO_PARTNERS',
        retryAfter: 5
      });
    }
    
    res.json({ partnerId, timestamp: Date.now() });

  } catch (err) {
    console.error('Ошибка поиска партнера:', err);
    res.status(500).json({ 
      error: 'Внутренняя ошибка сервера',
      code: 'SERVER_ERROR'
    });
  }
}

function findAvailablePartner(myId) {
  const now = Date.now();
  const maxInactiveTime = 30000;
  const availablePeers = [];

  activePeers.forEach((lastActive, peerId) => {
    if (peerId !== myId && (now - lastActive) < maxInactiveTime) {
      availablePeers.push(peerId);
    }
  });

  return availablePeers.length > 0 
    ? availablePeers[Math.floor(Math.random() * availablePeers.length)]
    : null;
}

// Обработка ошибок и завершение работы
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

process.on('SIGTERM', gracefulShutdown);

function gracefulShutdown() {
  console.log('SIGTERM received. Shutting down gracefully...');
  
  // Закрываем WebSocket соединения
  wss.clients.forEach(client => client.close());
  wss.close();
  
  // Закрываем HTTP сервер
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
}