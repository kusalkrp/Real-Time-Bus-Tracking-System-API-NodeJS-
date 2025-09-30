const express = require('express');
const { pool } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Routes Resource
router.get('/', authenticate, authorize(['commuter', 'operator', 'admin']), async (req, res) => {
  const { from, to, page = 1, limit = 20 } = req.query;

  // Build WHERE conditions dynamically
  const conditions = [];
  const values = [];

  if (from) {
    conditions.push(`from_city ILIKE $${values.length + 1}`);
    values.push(`%${from}%`);
  }
  if (to) {
    conditions.push(`to_city ILIKE $${values.length + 1}`);
    values.push(`%${to}%`);
  }

  // Build base queries
  let selectQuery = 'SELECT * FROM routes';
  let countQuery = 'SELECT COUNT(*) FROM routes';

  // Add WHERE clause if conditions exist
  if (conditions.length > 0) {
    const whereClause = ' WHERE ' + conditions.join(' AND ');
    selectQuery += whereClause;
    countQuery += whereClause;
  }

  // Add pagination using parameterized queries
  const limitNum = parseInt(limit, 10) || 20;
  const pageNum = parseInt(page, 10) || 1;
  const offset = (pageNum - 1) * limitNum;

  selectQuery += ` ORDER BY id LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
  values.push(limitNum, offset);

  try {
    // Execute queries - count query uses same params as select but without limit/offset
    const countValues = conditions.length > 0 ? values.slice(0, -2) : [];
    const [result, countResult] = await Promise.all([
      pool.query(selectQuery, values),
      pool.query(countQuery, countValues)
    ]);

    const total = parseInt(countResult.rows[0].count, 10);
    res.json({ routes: result.rows, total, page: pageNum, limit: limitNum });
  } catch (err) {
    console.error('Routes query error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:routeId', authenticate, authorize(['commuter', 'operator', 'admin']), async (req, res) => {
  const { routeId } = req.params;
  const id = parseInt(routeId, 10);

  if (isNaN(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid route ID' });
  }

  try {
    const result = await pool.query('SELECT * FROM routes WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Route not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Route fetch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authenticate, authorize(['admin']), async (req, res) => {
  const { from_city, to_city, distance_km, estimated_time_hrs } = req.body;

  // Input validation
  if (
    typeof from_city !== 'string' || !from_city.trim() ||
    typeof to_city !== 'string' || !to_city.trim() ||
    typeof distance_km !== 'number' || isNaN(distance_km) || distance_km <= 0 ||
    typeof estimated_time_hrs !== 'number' || isNaN(estimated_time_hrs) || estimated_time_hrs <= 0
  ) {
    return res.status(400).json({
      error: 'Missing or invalid required fields: from_city, to_city must be non-empty strings; distance_km, estimated_time_hrs must be positive numbers'
    });
  }

  try {
    const result = await pool.query(
      'INSERT INTO routes (from_city, to_city, distance_km, estimated_time_hrs) VALUES ($1, $2, $3, $4) RETURNING *',
      [from_city.trim(), to_city.trim(), distance_km, estimated_time_hrs]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Route creation error:', err);
    if (err.code === '23505') { // Unique constraint violation
      res.status(409).json({ error: 'Route already exists' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

router.put('/:routeId', authenticate, authorize(['admin']), async (req, res) => {
  const { routeId } = req.params;
  const id = parseInt(routeId, 10);

  if (isNaN(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid route ID' });
  }
  const { from_city, to_city, distance_km, estimated_time_hrs } = req.body;

  // Input validation - at least one field must be provided
  if (
    (from_city !== undefined && (typeof from_city !== 'string' || !from_city.trim())) ||
    (to_city !== undefined && (typeof to_city !== 'string' || !to_city.trim())) ||
    (distance_km !== undefined && (typeof distance_km !== 'number' || isNaN(distance_km) || distance_km <= 0)) ||
    (estimated_time_hrs !== undefined && (typeof estimated_time_hrs !== 'number' || isNaN(estimated_time_hrs) || estimated_time_hrs <= 0))
  ) {
    return res.status(400).json({
      error: 'Invalid field values: from_city, to_city must be non-empty strings; distance_km, estimated_time_hrs must be positive numbers'
    });
  }

  // Check if at least one field is provided
  if (from_city === undefined && to_city === undefined && distance_km === undefined && estimated_time_hrs === undefined) {
    return res.status(400).json({ error: 'At least one field must be provided for update' });
  }

  // Build dynamic update query
  const updates = [];
  const values = [];
  let paramIndex = 1;

  if (from_city !== undefined) {
    updates.push(`from_city = $${paramIndex++}`);
    values.push(from_city.trim());
  }
  if (to_city !== undefined) {
    updates.push(`to_city = $${paramIndex++}`);
    values.push(to_city.trim());
  }
  if (distance_km !== undefined) {
    updates.push(`distance_km = $${paramIndex++}`);
    values.push(distance_km);
  }
  if (estimated_time_hrs !== undefined) {
    updates.push(`estimated_time_hrs = $${paramIndex++}`);
    values.push(estimated_time_hrs);
  }

  values.push(id); // Add validated routeId at the end

  const query = `UPDATE routes SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;

  try {
    const result = await pool.query(query, values);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Route not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Route update error:', err);
    if (err.code === '23505') { // Unique constraint violation
      res.status(409).json({ error: 'Route with these cities already exists' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

router.delete('/:routeId', authenticate, authorize(['admin']), async (req, res) => {
  const { routeId } = req.params;
  const id = parseInt(routeId, 10);

  if (isNaN(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid route ID' });
  }

  try {
    const result = await pool.query('DELETE FROM routes WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Route not found' });
    res.json({ message: 'Route deleted successfully' });
  } catch (err) {
    console.error('Route deletion error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;