const { Server } = require('socket.io');
const { verifyAccessToken } = require('./utils/jwt');
const { logger } = require('./utils/logger');

let io;

function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:4200',
      credentials: true
    }
  });

  // JWT auth middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Unauthorized'));
    try {
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.sub;
      socket.data.username = payload.username;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    logger.info('socket_connected', { userId: socket.data.userId });

    // Join repo room
    socket.on('join:repo', (repoId) => {
      socket.join(repoId);
      socket.data.repoId = repoId;

      // Notify others in room
      socket.to(repoId).emit('user:joined', {
        userId: socket.data.userId,
        username: socket.data.username
      });

      logger.info('user_joined_repo', {
        userId: socket.data.userId,
        repoId
      });
    });

    // Broadcast new query to room
    socket.on('query:new', (data) => {
      const repoId = socket.data.repoId;
      if (!repoId) return;
      socket.to(repoId).emit('query:shared', {
        username: socket.data.username,
        question: data.question,
        answer: data.answer,
        citations: data.citations,
        timestamp: new Date().toISOString()
      });
    });

    // Broadcast file viewing presence
    socket.on('cursor:file', (data) => {
      const repoId = socket.data.repoId;
      if (!repoId) return;
      socket.to(repoId).emit('cursor:file', {
        userId: socket.data.userId,
        username: socket.data.username,
        filePath: data.filePath,
        line: data.line
      });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      const repoId = socket.data.repoId;
      if (repoId) {
        socket.to(repoId).emit('user:left', {
          userId: socket.data.userId,
          username: socket.data.username
        });
      }
      logger.info('socket_disconnected', { userId: socket.data.userId });
    });
  });

  return io;
}

function getIO() { return io; }

module.exports = { initSocket, getIO };