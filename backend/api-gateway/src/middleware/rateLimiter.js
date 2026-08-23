const redisClient = require('../db/redis');
const { logger } = require('../utils/logger');

const WINDOW_SECONDS = 60 * 60;
const MAX_REQUESTS = 20;

async function rateLimiter(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return next();

    const key = `ratelimit:${userId}:queries`;
    const now = Date.now();
    const windowStart = now - WINDOW_SECONDS * 1000;

    // Remove old entries outside window
    await redisClient.zRemRangeByScore(key, '-inf', windowStart);

    // Count requests in current window
    const count = await redisClient.zCard(key);

    if (count >= MAX_REQUESTS) {
      logger.warn('rate_limit_exceeded', { userId, count });
      return res.status(429).json({
        error: 'Rate limit exceeded — max 20 queries per hour',
        retryAfter: WINDOW_SECONDS
      });
    }

    // Add current request — score and value must be numbers/strings
    await redisClient.zAdd(key, {
      score: now,
      value: now.toString()
    });
    await redisClient.expire(key, WINDOW_SECONDS);

    res.setHeader('X-RateLimit-Limit', MAX_REQUESTS);
    res.setHeader('X-RateLimit-Remaining', MAX_REQUESTS - count - 1);

    next();
  } catch (err) {
    // Don't crash Express if rate limiter fails
    logger.error('rate_limiter_error', { error: err.message });
    next(); // allow request through if limiter errors
  }
}

module.exports = { rateLimiter };