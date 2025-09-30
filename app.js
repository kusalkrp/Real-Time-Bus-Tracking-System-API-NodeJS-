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


// Routes Resource
app.get('/routes', authenticate, authorize(['commuter', 'operator', 'admin']), async (req, res) => {
  const { from, to, page = 1, limit = 20 } = req.query;
  let query = 'SELECT * FROM routes';
  const values = [];
  if (from || to) {
    query += ' WHERE from_city ILIKE $1 OR to_city ILIKE $2';
    values.push(`%${from}%`, `%${to}%`);
  }
  query += ` LIMIT ${limit} OFFSET ${(page - 1) * limit}`;
  try {
    const result = await pool.query(query, values);
    res.json({ routes: result.rows, total: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/routes/:routeId', authenticate, authorize(['commuter', 'operator', 'admin']), async (req, res) => {
  const { routeId } = req.params;
  try {
    const result = await pool.query('SELECT * FROM routes WHERE id = $1', [routeId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Route not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/routes', authenticate, authorize(['admin']), async (req, res) => {
  const { from_city, to_city, distance_km, estimated_time_hrs } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO routes (from_city, to_city, distance_km, estimated_time_hrs) VALUES ($1, $2, $3, $4) RETURNING *',
      [from_city, to_city, distance_km, estimated_time_hrs]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/routes/:routeId', authenticate, authorize(['admin']), async (req, res) => {
  const { routeId } = req.params;
  const { distance_km, estimated_time_hrs } = req.body;
  try {
    const result = await pool.query(
      'UPDATE routes SET distance_km = $1, estimated_time_hrs = $2 WHERE id = $3 RETURNING *',
      [distance_km, estimated_time_hrs, routeId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Route not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/routes/:routeId', authenticate, authorize(['admin']), async (req, res) => {
  const { routeId } = req.params;
  try {
    const result = await pool.query('DELETE FROM routes WHERE id = $1 RETURNING *', [routeId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Route not found' });
    res.json({ message: 'Route deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});



const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API running on port ${PORT}`));