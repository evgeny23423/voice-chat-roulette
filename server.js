const express = require('express');
const { PeerServer } = require('peer');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 9000;

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// PeerJS Server
const peerServer = PeerServer({
  port: process.env.PEER_PORT || 9001,
  path: '/peerjs',
  proxied: true
});

// API endpoint
app.get('/find-partner', (req, res) => {
  // Ваша логика поиска собеседника
  res.json({ partnerId: 'some-peer-id' });
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});