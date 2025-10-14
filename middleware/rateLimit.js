const rateLimit = require('express-rate-limit');
// const { RedisStore } = require('rate-limit-redis');
const { redisClient } = require('../config/database');

// Rate limiter using Redis store
const createRateLimiter = (windowMs = 15 * 60 * 1000, max = 100, message = 'Too many requests from this IP, please try again later.') => {
  return rateLimit({
    // store: new RedisStore({
    //   client: redisClient,
    //   prefix: 'rate-limit:',
    // }),
    windowMs, // Time window in milliseconds
    max, // Limit each IP to 'max' requests per windowMs
    message: {
      error: 'Rate limit exceeded',
      message,
      retryAfter: Math.ceil(windowMs / 1000)
    },
    standardHeaders: true, // Return rate limit info in the RateLimit-* headers
    legacyHeaders: false, // Disable the X-RateLimit-* headers
    // Skip rate limiting for health checks
    skip: (req) => req.path === '/health',
  });
};

// General API rate limiter (100 requests per 15 minutes)
const apiLimiter = createRateLimiter(15 * 60 * 1000, 100);

// Stricter rate limiter for authentication endpoints (5 requests per 15 minutes)
const authLimiter = createRateLimiter(15 * 60 * 1000, 5, 'Too many authentication attempts, please try again later.');

// Rate limiter for sensitive operations (10 requests per 15 minutes)
const sensitiveLimiter = createRateLimiter(15 * 60 * 1000, 10, 'Too many sensitive operations, please try again later.');

module.exports = {
  apiLimiter,
  authLimiter,
  sensitiveLimiter,
  createRateLimiter
};
