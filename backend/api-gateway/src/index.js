require('dotenv').config({ path: '../../.env' });
const http = require('http');
const app = require('./app');
const { logger } = require('./utils/logger');
const { initSocket } = require('./socket');

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

// 5 minute timeout for LLM calls
server.timeout = 300000;
server.keepAliveTimeout = 300000;
server.headersTimeout = 310000;

initSocket(server);

server.listen(PORT, () => {
  logger.info('server_started', { port: PORT });
});