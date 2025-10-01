const express = require('express');
const { pool } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Constants
const MILLISECONDS_PER_HOUR = 3600000;

// Trips Resource
router.get('/routes/:routeId/trips', authenticate, authorize(['commuter', 'operator', 'admin']), async (req, res) => {
  const { routeId } = req.params;
  const routeIdNum = parseInt(routeId, 10);

  if (isNaN(routeIdNum) || routeIdNum <= 0) {
    return res.status(400).json({ error: 'Invalid route ID' });
  }

  const { startDate, endDate, page = 1, limit = 20 } = req.query;
  
  // Sanitize pagination parameters
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  
  let baseQuery = 'FROM trips t INNER JOIN buses b ON t.bus_id = b.id WHERE t.route_id = $1';
  const values = [routeIdNum];
  let paramIdx = 2;

  // Add operator filtering for operators
  if (req.user.role === 'operator') {
    baseQuery += ` AND b.operator_id = $${paramIdx}`;
    values.push(req.user.operatorId);
    paramIdx++;
  }

  if (startDate) {
    baseQuery += ` AND t.departure_time >= $${paramIdx}`;
    values.push(startDate);
    paramIdx++;
  }
  if (endDate) {
    baseQuery += ` AND t.departure_time <= $${paramIdx}`;
    values.push(endDate);
    paramIdx++;
  }
  
  // Count query (no LIMIT/OFFSET)
  const countQuery = `SELECT COUNT(*) ${baseQuery}`;
  // Data query (with LIMIT/OFFSET)
  const dataQuery = `SELECT t.* ${baseQuery} ORDER BY t.departure_time LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
  const dataValues = [...values, limitNum, (pageNum - 1) * limitNum];
  
  try {
    // Run both queries in parallel for better performance
    const [countResult, dataResult] = await Promise.all([
      pool.query(countQuery, values),
      pool.query(dataQuery, dataValues)
    ]);
    
    const total = parseInt(countResult.rows[0].count, 10);
    const totalPages = Math.ceil(total / limitNum);
    
    res.json({ 
      trips: dataResult.rows, 
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1
    });
  } catch (err) {
    console.error('Trips query error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:tripId', authenticate, authorize(['commuter', 'operator', 'admin']), async (req, res) => {
  const { tripId } = req.params;

  if (!tripId || typeof tripId !== 'string' || !tripId.trim()) {
    return res.status(400).json({ error: 'Invalid trip ID' });
  }

  let query = 'SELECT t.* FROM trips t';
  const values = [tripId];
  let paramIdx = 2;

  // Add operator filtering for operators
  if (req.user.role === 'operator') {
    query += ' INNER JOIN buses b ON t.bus_id = b.id WHERE t.id = $1 AND b.operator_id = $2';
    values.push(req.user.operatorId);
  } else {
    query += ' WHERE t.id = $1';
  }

  try {
    const result = await pool.query(query, values);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Trip not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Trip fetch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authenticate, authorize(['operator', 'admin']), async (req, res) => {
  const { bus_id, route_id, departure_time } = req.body;

  // Input validation
  if (
    typeof bus_id !== 'string' || !bus_id.trim() ||
    typeof route_id !== 'number' || isNaN(route_id) || route_id <= 0 ||
    !departure_time || isNaN(new Date(departure_time).getTime())
  ) {
    return res.status(400).json({
      error: 'Missing or invalid required fields: bus_id must be non-empty string, route_id must be positive number, departure_time must be valid date'
    });
  }

  try {
    // Check if bus exists and operator owns it (for operators)
    const busQuery = 'SELECT operator_id FROM buses WHERE id = $1';
    const busResult = await pool.query(busQuery, [bus_id.trim()]);
    if (busResult.rows.length === 0) {
      return res.status(404).json({ error: 'Bus not found' });
    }

    if (req.user.role === 'operator' && busResult.rows[0].operator_id !== req.user.operatorId) {
      return res.status(403).json({ error: 'Unauthorized: You do not own this bus' });
    }

    // Check if route exists
    const route = await pool.query('SELECT estimated_time_hrs FROM routes WHERE id = $1', [route_id]);
    if (route.rows.length === 0) return res.status(404).json({ error: 'Route not found' });
    const arrival_time = new Date(new Date(departure_time).getTime() + route.rows[0].estimated_time_hrs * MILLISECONDS_PER_HOUR).toISOString();
    
    // Use a transaction to prevent race conditions in trip ID generation
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Lock the trips table to prevent concurrent inserts
      const idResult = await client.query('SELECT id FROM trips ORDER BY id DESC LIMIT 1 FOR UPDATE');
      let nextId = 'TRIP001';
      if (idResult.rows.length > 0) {
        const lastId = idResult.rows[0].id;
        const num = parseInt(lastId.substring(4)) + 1;
        nextId = `TRIP${num.toString().padStart(3, '0')}`;
      }

      const result = await client.query(
        'INSERT INTO trips (id, bus_id, route_id, departure_time, arrival_time, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [nextId, bus_id.trim(), route_id, departure_time, arrival_time, 'Scheduled']
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
    console.error('Trip creation error:', err);
    if (err.code === '23505') { // Unique constraint violation
      res.status(409).json({ error: 'Trip with this bus and departure time already exists' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

router.put('/:tripId', authenticate, authorize(['operator', 'admin']), async (req, res) => {
  const { tripId } = req.params;

  if (!tripId || typeof tripId !== 'string' || !tripId.trim()) {
    return res.status(400).json({ error: 'Invalid trip ID' });
  }

  const { status } = req.body;

  // Input validation
  const validStatuses = ['Scheduled', 'In Progress', 'Completed', 'Delayed', 'Cancelled'];
  if (!status || typeof status !== 'string' || !validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Status must be one of: Scheduled, In Progress, Completed, Delayed, Cancelled' });
  }

  try {
    // Check ownership for operators
    if (req.user.role === 'operator') {
      const tripResult = await pool.query(
        'SELECT b.operator_id FROM trips t INNER JOIN buses b ON t.bus_id = b.id WHERE t.id = $1',
        [tripId]
      );
      if (tripResult.rows.length === 0) {
        return res.status(404).json({ error: 'Trip not found' });
      }
      if (tripResult.rows[0].operator_id !== req.user.operatorId) {
        return res.status(403).json({ error: 'Unauthorized: You do not own this trip' });
      }
    }

    const result = await pool.query(
      'UPDATE trips SET status = $1 WHERE id = $2 RETURNING *',
      [status, tripId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Trip not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Trip update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:tripId', authenticate, authorize(['operator', 'admin']), async (req, res) => {
  const { tripId } = req.params;

  if (!tripId || typeof tripId !== 'string' || !tripId.trim()) {
    return res.status(400).json({ error: 'Invalid trip ID' });
  }

  try {
    // Check ownership for operators
    if (req.user.role === 'operator') {
      const tripResult = await pool.query(
        'SELECT b.operator_id FROM trips t INNER JOIN buses b ON t.bus_id = b.id WHERE t.id = $1',
        [tripId]
      );
      if (tripResult.rows.length === 0) {
        return res.status(404).json({ error: 'Trip not found' });
      }
      if (tripResult.rows[0].operator_id !== req.user.operatorId) {
        return res.status(403).json({ error: 'Unauthorized: You do not own this trip' });
      }
    }

    const result = await pool.query('DELETE FROM trips WHERE id = $1 RETURNING *', [tripId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Trip not found' });
    res.json({ message: 'Trip deleted successfully' });
  } catch (err) {
    console.error('Trip deletion error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;