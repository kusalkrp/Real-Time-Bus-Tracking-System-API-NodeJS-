const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { users } = require('../middleware/auth');

const router = express.Router();

// Auth endpoint with permit validation support
router.post('/login', (req, res) => {
  const { email, password, permit_validation } = req.body;
  const user = users.find(u => u.email === email);
  
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Enhanced token with operator type for permit validation
  const tokenPayload = { 
    id: user.id, 
    role: user.role, 
    operatorId: user.operatorId,
    operatorType: user.operatorType
  };

  const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '1h' });
  
  const response = { 
    token, 
    role: user.role,
    operatorId: user.operatorId,
    operatorType: user.operatorType
  };

  // Add permit validation status for operators
  if (user.role === 'operator' && permit_validation) {
    response.permit_validation_enabled = true;
  }

  res.json(response);
});

module.exports = router;