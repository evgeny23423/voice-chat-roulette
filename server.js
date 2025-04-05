const express = require('express');
const { PeerServer } = require('peer');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 9000;

// Critical CORS configuration - должно быть в начале!
app.use(cors({
  origin: ['https://web-production-175e.up.railway.app'], // Замените на ваш домен
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// PeerJS Server Configuration (единственный экземпляр!)
const peerServer = PeerServer({
  port: process.env.PEER_PORT || 9001,
  path: '/peerjs',
  proxied: true,
  ssl: {}, // Обязательно для Railway
  allow_discovery: true
});

const connectedPeers = new Set();

// Обработка подключений PeerJS
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

// API для поиска собеседника
app.get('/find-partner', (req, res) => {
  try {
    const peers = Array.from(connectedPeers);
    const requestId = req.query.myId;
    
    if (!requestId) {
      return res.status(400).json({ error: 'Missing myId parameter' });
    }

    const availablePeers = peers.filter(id => id !== requestId);
    
    if (availablePeers.length === 0) {
      return res.status(404).json({ 
        error: 'No available partners',
        availablePeers: peers.length
      });
    }

    const partnerId = availablePeers[Math.floor(Math.random() * availablePeers.length)];
    res.json({ partnerId });
  } catch (err) {
    console.error('Find partner error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check endpoint (один!)
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    peers: connectedPeers.size,
    uptime: process.uptime()
  });
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Server start
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
  Server is running:
  - Web: http://localhost:${PORT}
  - PeerJS: ws://localhost:${process.env.PEER_PORT || 9001}/peerjs
  `);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});