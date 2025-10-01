require('dotenv').config();
const { Pool } = require('pg');
const redis = require('redis');

// Database connection (PostgreSQL)
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
});

// Redis for caching locations
const redisClient = redis.createClient({
  url: process.env.REDIS_URL,
});
redisClient.connect().catch(console.error);

module.exports = {
  pool,
  redisClient
};