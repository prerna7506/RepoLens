const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()]
});

function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    logger.info('request', {
      user_id: req.user?.id || null,
      route: req.originalUrl,
      method: req.method,
      status: res.statusCode,
      duration_ms: Date.now() - start
    });
  });
  next();
}

module.exports = { logger, requestLogger };