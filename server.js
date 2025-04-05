// Добавьте этот middleware в начало
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});
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
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// PeerJS Server
const peerServer = PeerServer({
  port: process.env.PEER_PORT || 9001,
  path: '/peerjs',
  proxied: true
});

const connectedPeers = new Set();

/ Измените обработку Peer соединений
peerServer.on('connection', (client) => {
  const clientId = client.id;
  console.log('Peer connected:', clientId);
  
  client.on('disconnected', () => {
    console.log('Peer disconnected:', clientId);
  });
});
// API Endpoints
app.get('/find-partner', (req, res) => {
  const peers = Array.from(connectedPeers);
  const requestId = req.query.myId;
  const availablePeers = peers.filter(id => id !== requestId);

  if (availablePeers.length > 0) {
    const partnerId = availablePeers[Math.floor(Math.random() * availablePeers.length)];
    return res.json({ partnerId });
  }

  res.status(404).json({ error: 'Нет доступных собеседников' });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});