const express = require('express');
const { PeerServer } = require('peer');
const cors = require('cors');
const path = require('path');

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

const peerServer = PeerServer({
  port: process.env.PEER_PORT || 9001,
  path: '/peerjs',
  proxied: true,  // Критически важно для Railway
  ssl: {},        // Активирует HTTPS
  allow_discovery: true,
  key: 'peerjs',  // Фиксированный ключ безопасности
  concurrent_limit: 1000,
  alive_timeout: 60000  // Таймаут соединения
});

const connectedPeers = new Set();

peerServer.on('connection', (client) => {
  try {
    const clientId = client.id;
    connectedPeers.add(clientId);
    console.log('Peer connected:', clientId);

    client.on('close', () => {
      connectedPeers.delete(clientId);
      console.log('Peer disconnected:', clientId);
    });

    client.on('error', (err) => {
      console.error('Client error:', err);
      connectedPeers.delete(clientId);
    });
  } catch (err) {
    console.error('Connection handler error:', err);
  }
});

// API endpoints
app.get('/find-partner', (req, res) => {
  try {
    const requestId = req.query.myId;
    
    if (!requestId) {
      return res.status(400).json({ 
        error: 'Требуется параметр myId',
        code: 'MISSING_ID'
      });
    }

    // Фильтруем активных пользователей
    const availablePeers = Array.from(connectedPeers)
      .filter(id => id !== requestId && id !== undefined);

    if (availablePeers.length === 0) {
      return res.status(200).json({  // 200 вместо 404 для корректной обработки на клиенте
        error: 'Нет доступных собеседников',
        code: 'NO_PARTNERS',
        retryAfter: 5
      });
    }

  const partnerId = availablePeers[Math.floor(Math.random() * availablePeers.length)];
    
    // Удаляем из списка доступных
    connectedPeers.delete(partnerId);
    
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

app.get('/peerjs/health', (req, res) => {
  res.json({
    status: 'OK',
    peers: connectedPeers.size,
    uptime: process.uptime()
  });
});


// Frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start servers
const webServer = app.listen(PORT, '0.0.0.0', () => {
  console.log(`
  Server is running:
  - Web: http://localhost:${PORT}
  - PeerJS: wss://web-production-175e.up.railway.app/peerjs
  - Health: https://web-production-175e.up.railway.app/health
  `);
});
// В app.js
function setupSocketReconnect() {
  const socket = state.peer.socket;
  
  socket.on('close', () => {
    if (!state.peer.disconnected) {
      console.log('WebSocket closed, reconnecting...');
      setTimeout(initPeerConnection, 1000);
    }
  });
};

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  webServer.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});