const express = require('express');
const { PeerServer } = require('peer');
const path = require('path');

const app = express();
const PORT = 9000;

// Middleware для статических файлов
app.use(express.static(path.join(__dirname, 'public')));

// PeerJS Server
const peerServer = PeerServer({
  port: 9001,
  path: '/peerjs',
  proxied: true
});

// Хранилище подключенных пиров
const connectedPeers = new Set();

// Правильная обработка подключений (для PeerJS v1.4.7)
peerServer.on('connection', (client) => {
  // Используем getId() вместо прямого доступа к id
  const clientId = client.getId();
  connectedPeers.add(clientId);
  console.log('Подключен:', clientId);

  // Обработка отключения
  const handleDisconnect = () => {
    connectedPeers.delete(clientId);
    console.log('Отключен:', clientId);
  };

  // Для разных версий PeerJS
  if (client.on) {
    client.on('close', handleDisconnect);
    client.on('disconnect', handleDisconnect);
  } else if (client.socket) {
    client.socket.on('close', handleDisconnect);
  }
});

// API для поиска собеседника
app.get('/find-partner', (req, res) => {
  const peers = Array.from(connectedPeers);
  const requestId = req.query.myId;
  
  const availablePeers = peers.filter(id => id !== requestId);
  
  if (availablePeers.length > 0) {
    const randomIndex = Math.floor(Math.random() * availablePeers.length);
    return res.json({
      partnerId: availablePeers[randomIndex],
      availablePeers: availablePeers.length
    });
  }
  
  res.json({
    error: 'Нет доступных собеседников',
    availablePeers: peers.length
  });
});

// Корневой маршрут
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`
  Сервер запущен:
  - Веб-интерфейс: http://localhost:${PORT}
  - PeerJS сервер: http://localhost:9001/peerjs
  - API поиска: http://localhost:${PORT}/find-partner?myId=YOUR_ID
  `);
});