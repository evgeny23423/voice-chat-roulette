const express = require('express');
const { PeerServer } = require('peer');
const cors = require('cors');
const path = require('path');
const WebSocket = require('ws');

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

// Хранилище активных пиров с таймстемпами
const activePeers = new Map();

// Обработчики событий PeerServer
peerServer.on('connection', (client) => {
  const clientId = client.id;
  activePeers.set(clientId, Date.now());
  console.log('Peer connected:', clientId);

  client.on('close', () => {
    activePeers.delete(clientId);
    console.log('Peer disconnected:', clientId);
  });
   client.on('close', () => {
    activePeers.delete(clientId);
    broadcastOnlineCount();
  });

  client.on('error', (err) => {
    console.error('Peer error:', err);
    activePeers.delete(clientId);
  });
});

// Очистка неактивных пиров каждые 5 минут
setInterval(() => {
  const now = Date.now();
  const timeout = 5 * 60 * 1000; // 5 минут
  
  activePeers.forEach((lastActive, peerId) => {
    if (now - lastActive > timeout) {
      activePeers.delete(peerId);
      console.log(`Removed inactive peer: ${peerId}`);
    }
  });
}, 5 * 60 * 1000);

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

    // Обновляем активность текущего пира
    activePeers.set(myId, Date.now());

    // Ищем доступных партнеров (исключая себя и неактивных)
    const availablePeers = [];
    const now = Date.now();
    const maxInactiveTime = 30000; // 30 секунд

    activePeers.forEach((lastActive, peerId) => {
      if (peerId !== myId && (now - lastActive) < maxInactiveTime) {
        availablePeers.push(peerId);
      }
    });

    if (availablePeers.length === 0) {
      return res.status(200).json({
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

// Frontend
app.get('/online-count', (req, res) => {
  try {
    res.json({
      success: true,
      count: activePeers.size,
      timestamp: Date.now()
    });
  } catch (err) {
    console.error('Online count error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
  Server is running:
  - Web: http://localhost:${PORT}
  - PeerJS: wss://web-production-175e.up.railway.app/peerjs
  - Health: https://web-production-175e.up.railway.app/health
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});