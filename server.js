const express = require('express');
const { PeerServer } = require('peer');
const cors = require('cors');
const path = require('path');
const http = require('http'); // Добавлен отсутствующий импорт

const app = express();
const PORT = process.env.PORT || 9000;

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

// Создаем HTTP сервер
const server = http.createServer(app);

// Инициализация PeerServer
const peerServer = PeerServer({
  server: server, // Используем существующий HTTP сервер
  path: '/peerjs',
  proxied: true,
  allow_discovery: true,
  key: 'peerjs'
});

// Хранилище активных пиров
const activePeers = new Map();

// Обработчики PeerServer
peerServer.on('connection', (client) => {
  const clientId = client.id;
  activePeers.set(clientId, Date.now());
  console.log('Peer connected:', clientId);

  client.on('close', () => {
    activePeers.delete(clientId);
    console.log('Peer disconnected:', clientId);
  });

  client.on('error', (err) => {
    console.error('Peer error:', err);
    activePeers.delete(clientId);
  });
});

// Очистка неактивных пиров
setInterval(() => {
  const now = Date.now();
  activePeers.forEach((lastActive, peerId) => {
    if (now - lastActive > 300000) { // 5 минут
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
    uptime: process.uptime()
  });
});

app.get('/ping', (req, res) => {
  const peerId = req.query.peerId;
  if (peerId && activePeers.has(peerId)) {
    activePeers.set(peerId, Date.now());
  }
  res.sendStatus(200);
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

    activePeers.set(myId, Date.now());
    const availablePeers = [];
    const now = Date.now();

    activePeers.forEach((lastActive, peerId) => {
      if (peerId !== myId && (now - lastActive) < 30000) {
        availablePeers.push(peerId);
      }
    });

    if (availablePeers.length === 0) {
      return res.status(404).json({
        error: 'Нет доступных собеседников',
        code: 'NO_PARTNERS'
      });
    }

    const partnerId = availablePeers[Math.floor(Math.random() * availablePeers.length)];
    res.json({ partnerId });
    
  } catch (err) {
    console.error('Ошибка поиска партнера:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Запуск сервера
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  Сервер запущен:
  - Основной порт: ${PORT}
  - PeerServer: /peerjs
  - Healthcheck: /health
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Завершение работы...');
  server.close(() => process.exit(0));
});