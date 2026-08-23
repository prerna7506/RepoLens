require('dotenv').config({ path: '../../.env' });
const http = require('http');
const app = require('./app');
const { logger } = require('./utils/logger');
const { initSocket } = require('./socket');

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);
initSocket(server);

server.listen(PORT, () => {
  logger.info('server_started', { port: PORT });
});