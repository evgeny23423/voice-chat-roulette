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

const connectedPeers = new Set();

peerServer.on('connection', (client) => {
  const clientId = client.id;
  connectedPeers.add(clientId);
  console.log('Peer connected:', clientId);

  client.on('close', () => {
    connectedPeers.delete(clientId);
    console.log('Peer disconnected:', clientId);
  });
});

app.get('/find-partner', (req, res) => {
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
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// Critical CORS configuration
app.use(cors({
  origin: ['https://ваш-проект.up.railway.app'], // Ваш домен
  methods: ['GET', 'POST'],
  credentials: true
}));

// PeerJS Server Configuration
const peerServer = PeerServer({
  port: process.env.PEER_PORT || 9001,
  path: '/peerjs',
  proxied: true,
  ssl: {}, // Required for Railway
  allow_discovery: true
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    peers: Array.from(peerServer._clients.keys()).length
  });
});