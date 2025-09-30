require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const redis = require('redis');

const app = express();
app.use(bodyParser.json());

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

// Middleware for authentication
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, role: 'commuter' | 'operator' | 'admin', operatorId }
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Role-based access control
const authorize = (roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
  next();
};

// Sample users for auth (in production, store in DB)
const users = [
  { id: 1, email: 'admin@ntc.gov.lk', password: bcrypt.hashSync('adminpass', 10), role: 'admin' },
  { id: 2, email: 'operator1@example.com', password: bcrypt.hashSync('oppass', 10), role: 'operator', operatorId: 'op1' },
  { id: 3, email: 'commuter1@example.com', password: bcrypt.hashSync('commuterpass', 10), role: 'commuter' },
  // Add more as needed
];

// Auth endpoint
app.post('/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => u.email === email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign(
    { id: user.id, role: user.role, operatorId: user.operatorId },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  res.json({ token, role: user.role });
});





const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API running on port ${PORT}`));