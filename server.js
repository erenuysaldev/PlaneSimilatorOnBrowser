const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const players = {};

function getRandomColor() {
  return Math.random() * 0xffffff;
}

// Static dosyaları serve et
app.use(express.static(__dirname));

// Ana route için index.html'i gönder
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
  const id = socket.id;
  // Yeni oyuncu verilerini ön tanımlı oluştur
  players[id] = {
    position: { x: 0, y: 1, z: -90 },
    rotationY: 0,
    color: getRandomColor(),
    name: null,
  };

  // Oyuncu adıyla katılımı bekle
  socket.on('join', (data) => {
    players[id].name = data.name;
    // Yeni katılan oyuncuya mevcutları gönder
    socket.emit('current-players', players);
    // Diğerlerine yeni oyuncuyu bildir
    socket.broadcast.emit('new-player', { id, ...players[id] });
  });

  // Oyuncu konum güncellemelerini al ve diğerlerine yayınla
  socket.on('player-update', (data) => {
    players[id] = { ...players[id], ...data };
    socket.broadcast.emit('player-moved', { id, ...data });
  });

  // Bağlantı kesildiğinde oyuncuyu sil ve diğerlerine bildir
  socket.on('disconnect', () => {
    delete players[id];
    socket.broadcast.emit('player-disconnected', id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda dinleniyor`);
}); 