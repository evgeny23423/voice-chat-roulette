const { PeerServer } = require('peer');

const peerServer = PeerServer({
  port: process.env.PORT || 9000, // Heroku сам назначает порт
  path: '/myapp',
  proxied: true, // Важно для работы за прокси Heroku
});

console.log('PeerServer запущен на порту:', process.env.PORT || 9000);