const express = require('express');
const { pool } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Buses Resource
router.get('/', authenticate, authorize(['operator', 'admin']), async (req, res) => {
  const { operatorId } = req.query;
  let page = parseInt(req.query.page, 10);
  let limit = parseInt(req.query.limit, 10);
  if (isNaN(page) || page < 1) page = 1;
  if (isNaN(limit) || limit < 1 || limit > 100) limit = 20;
  let query = 'SELECT * FROM buses';
  const values = [];
  let paramIdx = 1;
  let whereClause = '';
  let whereValues = [];
  if (req.user.role === 'operator') {
    whereClause = ` WHERE operator_id = $${paramIdx}`;
    values.push(req.user.operatorId);
    whereValues.push(req.user.operatorId);
    paramIdx++;
  } else if (operatorId) {
    whereClause = ` WHERE operator_id = $${paramIdx}`;
    values.push(operatorId);
    whereValues.push(operatorId);
    paramIdx++;
  }
  query += whereClause;
  query += ` LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
  values.push(limit, (page - 1) * limit);
  
  // Build count query
  const countQuery = `SELECT COUNT(*) FROM buses${whereClause}`;
  
  try {
    // Run both queries in parallel
    const [result, countResult] = await Promise.all([
      pool.query(query, values),
      pool.query(countQuery, whereValues)
    ]);
    const total = parseInt(countResult.rows[0].count, 10);
    const totalPages = Math.ceil(total / limit);
    
    res.json({ 
      buses: result.rows, 
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:busId', authenticate, authorize(['commuter', 'operator', 'admin']), async (req, res) => {
  const { busId } = req.params;

  if (!busId || typeof busId !== 'string' || !busId.trim()) {
    return res.status(400).json({ error: 'Invalid bus ID' });
  }

  try {
    const result = await pool.query('SELECT * FROM buses WHERE id = $1', [busId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Bus not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authenticate, authorize(['operator', 'admin']), async (req, res) => {
  const { plate_no, operator_id, capacity, type } = req.body;

  // Input validation
  if (
    typeof plate_no !== 'string' || !plate_no.trim() ||
    typeof capacity !== 'number' || isNaN(capacity) || capacity <= 0 ||
    typeof type !== 'string' || !type.trim()
  ) {
    return res.status(400).json({
      error: 'Missing or invalid required fields: plate_no must be non-empty string, capacity must be positive number, type must be non-empty string'
    });
  }

  const opId = req.user.role === 'operator' ? req.user.operatorId : operator_id;

  if (req.user.role === 'admin' && (!opId || typeof opId !== 'string' || !opId.trim())) {
    return res.status(400).json({ error: 'operator_id is required for admin users' });
  }

  try {
    // Use a transaction to prevent race conditions in bus ID generation
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Lock the buses table to prevent concurrent inserts
      const idResult = await client.query('SELECT id FROM buses ORDER BY id DESC LIMIT 1 FOR UPDATE');
      let nextId = 'BUS001';
      if (idResult.rows.length > 0) {
        const lastId = idResult.rows[0].id;
        const num = parseInt(lastId.substring(3)) + 1;
        nextId = `BUS${num.toString().padStart(3, '0')}`;
      }

      const result = await client.query(
        'INSERT INTO buses (id, plate_no, operator_id, capacity, type) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [nextId, plate_no.trim(), opId, capacity, type.trim()]
      );
      
      await client.query('COMMIT');
      res.status(201).json(result.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Bus creation error:', err);
    if (err.code === '23505') { // Unique constraint violation
      res.status(409).json({ error: 'Bus with this plate number already exists' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

router.put('/:busId', authenticate, authorize(['operator', 'admin']), async (req, res) => {
  const { busId } = req.params;

  if (!busId || typeof busId !== 'string' || !busId.trim()) {
    return res.status(400).json({ error: 'Invalid bus ID' });
  }

  const { capacity, type } = req.body;

  // Validate input: at least one field, and values are appropriate
  const fields = [];
  const values = [];
  let idx = 1;
  if (typeof capacity !== 'undefined') {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      return res.status(400).json({ error: 'Capacity must be a positive integer' });
    }
    fields.push(`capacity = $${idx++}`);
    values.push(capacity);
  }
  if (typeof type !== 'undefined') {
    if (typeof type !== 'string' || type.trim() === '') {
      return res.status(400).json({ error: 'Type must be a non-empty string' });
    }
    fields.push(`type = $${idx++}`);
    values.push(type.trim());
  }
  if (fields.length === 0) {
    return res.status(400).json({ error: 'At least one field (capacity or type) must be provided for update' });
  }

  // Fetch the bus to check operator ownership
  try {
    const busResult = await pool.query('SELECT operator_id FROM buses WHERE id = $1', [busId]);
    if (busResult.rows.length === 0) {
      return res.status(404).json({ error: 'Bus not found' });
    }
    const busOperatorId = busResult.rows[0].operator_id;
    // Authorization check in application logic
    if (req.user.role === 'operator' && req.user.operatorId !== busOperatorId) {
      return res.status(403).json({ error: 'Unauthorized: You do not own this bus' });
    }
    // If admin or authorized operator, proceed to update
    values.push(busId);
    const setClause = fields.join(', ');
    const query = `UPDATE buses SET ${setClause} WHERE id = $${idx} RETURNING *`;
    const result = await pool.query(query, values);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Bus not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Bus update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:busId', authenticate, authorize(['operator', 'admin']), async (req, res) => {
  const { busId } = req.params;

  if (!busId || typeof busId !== 'string' || !busId.trim()) {
    return res.status(400).json({ error: 'Invalid bus ID' });
  }

  try {
    // First check ownership for operators
    if (req.user.role === 'operator') {
      const busResult = await pool.query('SELECT operator_id FROM buses WHERE id = $1', [busId]);
      if (busResult.rows.length === 0) {
        return res.status(404).json({ error: 'Bus not found' });
      }
      if (busResult.rows[0].operator_id !== req.user.operatorId) {
        return res.status(403).json({ error: 'Unauthorized: You do not own this bus' });
      }
    }

    const result = await pool.query('DELETE FROM buses WHERE id = $1 RETURNING *', [busId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Bus not found' });
    res.json({ message: 'Bus deleted successfully' });
  } catch (err) {
    console.error('Bus deletion error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;