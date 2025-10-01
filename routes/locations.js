const express = require('express');
const { pool, redisClient } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Get current trip location from Redis cache
router.get('/trips/:tripId/location', authenticate, authorize(['commuter', 'operator', 'admin']), async (req, res) => {
  const { tripId } = req.params;

  // Input validation
  if (!tripId || typeof tripId !== 'string' || !tripId.trim()) {
    return res.status(400).json({ error: 'Invalid trip ID' });
  }

  try {
    const cached = await redisClient.get(`location:${tripId}`);
    if (cached) {
      return res.json(JSON.parse(cached));
    }
    res.status(404).json({ error: 'No location data available' });
  } catch (err) {
    console.error('Location fetch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update bus location (operators only)
router.post('/buses/:busId/location', authenticate, authorize(['operator']), async (req, res) => {
  const { busId } = req.params;
  const { latitude, longitude, speed_kmh, timestamp = new Date().toISOString() } = req.body;

  // Input validation
  if (!busId || typeof busId !== 'string' || !busId.trim()) {
    return res.status(400).json({ error: 'Invalid bus ID' });
  }

  if (
    typeof latitude !== 'number' || isNaN(latitude) || latitude < -90 || latitude > 90 ||
    typeof longitude !== 'number' || isNaN(longitude) || longitude < -180 || longitude > 180 ||
    (speed_kmh !== undefined && (typeof speed_kmh !== 'number' || isNaN(speed_kmh) || speed_kmh < 0))
  ) {
    return res.status(400).json({ 
      error: 'Invalid location data: latitude must be between -90 and 90, longitude between -180 and 180, speed_kmh must be non-negative' 
    });
  }

  try {
    // Check if operator owns the bus
    const bus = await pool.query('SELECT * FROM buses WHERE id = $1 AND operator_id = $2', [busId, req.user.operatorId]);
    if (bus.rows.length === 0) {
      return res.status(403).json({ error: 'Unauthorized: You do not own this bus' });
    }

    // Check if there's an active trip for this bus
    const trip = await pool.query('SELECT id FROM trips WHERE bus_id = $1 AND status = \'In Progress\'', [busId]);
    const tripId = trip.rows[0]?.id;
    if (!tripId) {
      return res.status(400).json({ error: 'No active trip for this bus' });
    }

    // Create location object
    const location = { 
      tripId, 
      busId, 
      latitude, 
      longitude, 
      timestamp, 
      speed_kmh: speed_kmh || 0 
    };

    // Store in Redis cache with 1 hour expiration
    await redisClient.set(`location:${tripId}`, JSON.stringify(location), 'EX', 3600);

    // Store in database for history
    await pool.query(
      'INSERT INTO locations (trip_id, bus_id, latitude, longitude, speed_kmh, timestamp) VALUES ($1, $2, $3, $4, $5, $6)',
      [tripId, busId, latitude, longitude, speed_kmh || 0, timestamp]
    );

    res.json({ message: 'Location updated successfully', location });
  } catch (err) {
    console.error('Location update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get bus location history (operators and admins only)
router.get('/buses/:busId/locations/history', authenticate, authorize(['operator', 'admin']), async (req, res) => {
  const { busId } = req.params;
  const { from, page = 1, limit = 20 } = req.query;

  // Input validation
  if (!busId || typeof busId !== 'string' || !busId.trim()) {
    return res.status(400).json({ error: 'Invalid bus ID' });
  }

  // Sanitize pagination parameters
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

  try {
    // Check ownership for operators
    if (req.user.role === 'operator') {
      const bus = await pool.query('SELECT * FROM buses WHERE id = $1 AND operator_id = $2', [busId, req.user.operatorId]);
      if (bus.rows.length === 0) {
        return res.status(403).json({ error: 'Unauthorized: You do not own this bus' });
      }
    }

    // Build query with proper parameterization
    let baseQuery = 'FROM locations WHERE bus_id = $1';
    const values = [busId];
    let paramIdx = 2;

    if (from) {
      // Validate date format
      const fromDate = new Date(from);
      if (isNaN(fromDate.getTime())) {
        return res.status(400).json({ error: 'Invalid date format for "from" parameter' });
      }
      baseQuery += ` AND timestamp >= $${paramIdx}`;
      values.push(from);
      paramIdx++;
    }

    // Count query for pagination
    const countQuery = `SELECT COUNT(*) ${baseQuery}`;
    // Data query with pagination
    const dataQuery = `SELECT * ${baseQuery} ORDER BY timestamp DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
    const dataValues = [...values, limitNum, (pageNum - 1) * limitNum];

    // Run both queries in parallel
    const [countResult, dataResult] = await Promise.all([
      pool.query(countQuery, values),
      pool.query(dataQuery, dataValues)
    ]);

    const total = parseInt(countResult.rows[0].count, 10);
    const totalPages = Math.ceil(total / limitNum);

    res.json({ 
      locations: dataResult.rows, 
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1
    });
  } catch (err) {
    console.error('Location history fetch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
