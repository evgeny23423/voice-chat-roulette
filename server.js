require('dotenv').config();
const express = require('express');
const { PeerServer } = require('peer');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 9000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// PeerJS Server
const peerServer = PeerServer({
  port: process.env.PEER_PORT || 9001,
  path: '/peerjs',
  proxied: true
});

// Хранилище подключенных пользователей
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

    const randomIndex = Math.floor(Math.random() * availablePeers.length);
    const partnerId = availablePeers[randomIndex];
    
    res.json({
      partnerId,
      availablePeers: availablePeers.length
    });
  } catch (err) {
    console.error('Find partner error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    connectedPeers: connectedPeers.size,
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
  Server is running:
  - Web interface: http://localhost:${PORT}
  - PeerJS server: ws://localhost:${process.env.PEER_PORT || 9001}/peerjs
  - API endpoints:
    * Find partner: /find-partner?myId=YOUR_ID
    * Health check: /health
  `);
});