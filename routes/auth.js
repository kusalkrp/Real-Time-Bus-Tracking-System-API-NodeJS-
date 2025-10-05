const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { users } = require('../middleware/auth');

const router = express.Router();

// Auth endpoint
router.post('/login', (req, res) => {
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

module.exports = router;