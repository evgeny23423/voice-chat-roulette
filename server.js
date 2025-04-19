const express = require('express');
const { PeerServer } = require('peer');
const cors = require('cors');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 9000;

// Упрощенный CORS для Railway
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Хранилища данных
const activePeers = new Map();
const chatMessages = [];

// Создаем HTTP сервер
const server = http.createServer(app);

// Инициализация WebSocket сервера
const wss = new WebSocket.Server({ server });

// Упрощенная функция broadcast
function broadcast(data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// Упрощенный WebSocket обработчик
wss.on('connection', (ws) => {
  // Отправляем историю сообщений
  ws.send(JSON.stringify({
    type: 'history',
    messages: chatMessages.slice(-50)
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'chat_message') {
        chatMessages.push(data);
        broadcast(data);
      }
    } catch (err) {
      console.error('Message error:', err);
    }
  });
});

// PeerServer на том же порту через Express
app.use('/peerjs', PeerServer({
  proxied: true,
  allow_discovery: true,
  key: 'peerjs'
}));

// Упрощенный healthcheck
app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

// Остальные API endpoints
app.get('/online-count', (req, res) => {
  res.json({ count: wss.clients.size });
});

// Запуск сервера
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

// Обработка ошибок
process.on('uncaughtException', (err) => {
  console.error('Uncaught error:', err);
});