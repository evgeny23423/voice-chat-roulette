const express = require('express');
const { PeerServer } = require('peer');

const app = express();
const PORT = 9000;

// PeerJS Server должен быть создан ДО использования
const peerServer = PeerServer({
  port: 9001,
  path: '/peerjs',
  proxied: true
});

// Хранилище подключенных пиров
const connectedPeers = new Set();

// Обработка подключений PeerJS
peerServer.on('connection', (client) => {
  connectedPeers.add(client.id);
  console.log('Подключен:', client.id);
  
  client.on('close', () => {
    connectedPeers.delete(client.id);
    console.log('Отключен:', client.id);
  });
});

// Middleware для статических файлов
app.use(express.static('public'));

// Обработка корневого маршрута
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Поиск случайного собеседника
app.get('/find-partner', (req, res) => {
  const peers = Array.from(connectedPeers);
  
  // Улучшенный алгоритм матчинга
  if (peers.length >= 2) {
    // Исключаем свой собственный ID из поиска
    const requestId = req.query.myId;
    const availablePeers = peers.filter(id => id !== requestId);
    
    if (availablePeers.length > 0) {
      const randomIndex = Math.floor(Math.random() * availablePeers.length);
      return res.json({ 
        partnerId: availablePeers[randomIndex],
        availablePeers: availablePeers.length
      });
    }
  }
  
  res.json({ 
    error: 'Нет доступных собеседников',
    availablePeers: peers.length
  });
});

// Запуск основного сервера
app.listen(PORT, () => {
  console.log(`\nСервер запущен:`);
  console.log(`- Веб-интерфейс: http://localhost:${PORT}`);
  console.log(`- PeerJS сервер: http://localhost:9001/peerjs`);
  console.log(`- API поиска: http://localhost:${PORT}/find-partner?myId=YOUR_ID\n`);
});