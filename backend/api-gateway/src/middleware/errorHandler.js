const { logger } = require('../utils/logger');

function errorHandler(err, req, res, next) {
  logger.error('unhandled_error', {
    message: err.message,
    stack: err.stack,
    route: req.originalUrl
  });
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
}

module.exports = { errorHandler };