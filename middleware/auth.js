const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');


// Sample users for auth (in production, store in DB)
const users = [
  { id: 1, email: 'admin@ntc.gov.lk', password: bcrypt.hashSync('adminpass', 10), role: 'admin' },
  
  // SLTB Operators (for each route)
  { id: 2, email: 'sltb01@sltb.lk', password: bcrypt.hashSync('sltb01pass', 10), role: 'operator', operatorId: 'SLTB01', operatorType: 'SLTB' },
  { id: 3, email: 'sltb02@sltb.lk', password: bcrypt.hashSync('sltb02pass', 10), role: 'operator', operatorId: 'SLTB02', operatorType: 'SLTB' },
  { id: 4, email: 'sltb03@sltb.lk', password: bcrypt.hashSync('sltb03pass', 10), role: 'operator', operatorId: 'SLTB03', operatorType: 'SLTB' },
  { id: 5, email: 'sltb04@sltb.lk', password: bcrypt.hashSync('sltb04pass', 10), role: 'operator', operatorId: 'SLTB04', operatorType: 'SLTB' },
  { id: 6, email: 'sltb05@sltb.lk', password: bcrypt.hashSync('sltb05pass', 10), role: 'operator', operatorId: 'SLTB05', operatorType: 'SLTB' },
  
  // Private Operators (for each route)
  { id: 7, email: 'pvt01@private.lk', password: bcrypt.hashSync('pvt01pass', 10), role: 'operator', operatorId: 'PVT01', operatorType: 'Private' },
  { id: 8, email: 'pvt02@private.lk', password: bcrypt.hashSync('pvt02pass', 10), role: 'operator', operatorId: 'PVT02', operatorType: 'Private' },
  { id: 9, email: 'pvt03@private.lk', password: bcrypt.hashSync('pvt03pass', 10), role: 'operator', operatorId: 'PVT03', operatorType: 'Private' },
  { id: 10, email: 'pvt04@private.lk', password: bcrypt.hashSync('pvt04pass', 10), role: 'operator', operatorId: 'PVT04', operatorType: 'Private' },
  { id: 11, email: 'pvt05@private.lk', password: bcrypt.hashSync('pvt05pass', 10), role: 'operator', operatorId: 'PVT05', operatorType: 'Private' },
  
  // Commuters
  { id: 12, email: 'commuter1@example.com', password: bcrypt.hashSync('commuterpass', 10), role: 'commuter' },
  { id: 13, email: 'commuter2@example.com', password: bcrypt.hashSync('commuter2pass', 10), role: 'commuter' }
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

// Permit validation middleware for operators
const validatePermit = async (req, res, next) => {
  if (req.user.role !== 'operator') {
    return next(); // Skip permit validation for non-operators
  }

  const { busId } = req.params;
  if (!busId) {
    return res.status(400).json({ error: 'Bus ID is required for permit validation' });
  }

  try {
    // Check if the operator owns the bus through permit validation
    const result = await pool.query(
      'SELECT permit_number FROM buses WHERE id = $1 AND operator_id = $2',
      [busId, req.user.operatorId]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ 
        error: 'Unauthorized: Invalid permit or you do not own this bus',
        code: 'INVALID_PERMIT'
      });
    }

    req.busPermit = result.rows[0].permit_number;
    next();
  } catch (error) {
    console.error('Permit validation error:', error);
    res.status(500).json({ error: 'Internal server error during permit validation' });
  }
};

module.exports = {
  authenticate,
  authorize,
  validatePermit,
  users
};