const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Sample users for auth (in production, store in DB)
const users = [
  { id: 1, email: 'admin@ntc.gov.lk', password: bcrypt.hashSync('adminpass', 10), role: 'admin' },
  { id: 2, email: 'operator1@example.com', password: bcrypt.hashSync('oppass', 10), role: 'operator', operatorId: 'op1' },
  { id: 3, email: 'commuter1@example.com', password: bcrypt.hashSync('commuterpass', 10), role: 'commuter' },
  // Add more as needed
];

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

module.exports = {
  authenticate,
  authorize,
  users
};