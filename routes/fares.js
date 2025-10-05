const express = require('express');
const { pool } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Get fares for a route with advanced filtering
router.get('/routes/:routeNumber/fares', authenticate, authorize(['commuter', 'operator', 'admin']), async (req, res) => {
  const { routeNumber } = req.params;
  const { 
    service_type, page = 1, limit = 20, sort, fields,
    // New advanced filters
    from_stop, to_stop, fare_amount_lt, fare_amount_gt, 
    effective_date_gt, effective_date_lt
  } = req.query;

  if (!routeNumber || typeof routeNumber !== 'string' || !routeNumber.trim()) {
    return res.status(400).json({ error: 'Invalid route number' });
  }

  // Sanitize pagination parameters
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

  try {
    // Build WHERE conditions
    const conditions = ['r.route_number = $1', 'r.is_active = true', 'f.effective_date <= CURRENT_DATE'];
    const values = [routeNumber];
    let paramIndex = 2;

    if (service_type) {
      conditions.push(`f.service_type = $${paramIndex}`);
      values.push(service_type);
      paramIndex++;
    }

    // Add condition to exclude expired fares
    conditions.push('(f.expiry_date IS NULL OR f.expiry_date > CURRENT_DATE)');

    // New advanced filters
    if (from_stop) {
      conditions.push(`fs.from_location ILIKE $${paramIndex} OR fs.to_location ILIKE $${paramIndex + 1}`);
      values.push(`%${from_stop}%`, `%${from_stop}%`);
      paramIndex += 2;
    }
    
    if (to_stop) {
      conditions.push(`ts.from_location ILIKE $${paramIndex} OR ts.to_location ILIKE $${paramIndex + 1}`);
      values.push(`%${to_stop}%`, `%${to_stop}%`);
      paramIndex += 2;
    }
    
    if (from_stop && to_stop) {
      // For exact stop-to-stop fares, we need more precise matching
      conditions.push(`(
        (fs.from_location ILIKE $${paramIndex} OR fs.to_location ILIKE $${paramIndex + 1}) AND
        (ts.from_location ILIKE $${paramIndex + 2} OR ts.to_location ILIKE $${paramIndex + 3})
      )`);
      values.push(`%${from_stop}%`, `%${from_stop}%`, `%${to_stop}%`, `%${to_stop}%`);
      paramIndex += 4;
    }
    
    if (fare_amount_lt) {
      const maxFare = parseFloat(fare_amount_lt);
      if (!isNaN(maxFare)) {
        conditions.push(`f.fare_amount < $${paramIndex}`);
        values.push(maxFare);
        paramIndex++;
      }
    }
    
    if (fare_amount_gt) {
      const minFare = parseFloat(fare_amount_gt);
      if (!isNaN(minFare)) {
        conditions.push(`f.fare_amount > $${paramIndex}`);
        values.push(minFare);
        paramIndex++;
      }
    }
    
    if (effective_date_gt) {
      conditions.push(`f.effective_date > $${paramIndex}`);
      values.push(effective_date_gt);
      paramIndex++;
    }
    
    if (effective_date_lt) {
      conditions.push(`f.effective_date < $${paramIndex}`);
      values.push(effective_date_lt);
      paramIndex++;
    }

    // Handle field selection
    let selectFields = `
      f.*,
      fs.from_location,
      fs.to_location as from_to_location,
      ts.from_location as to_from_location,
      ts.to_location,
      fs.segment_order as from_segment_order,
      ts.segment_order as to_segment_order
    `;
    
    if (fields) {
      const allowedFields = ['id', 'service_type', 'fare_amount', 'currency', 'effective_date', 'expiry_date', 'from_location', 'to_location'];
      const requestedFields = fields.split(',').map(f => f.trim()).filter(f => allowedFields.includes(f));
      if (requestedFields.length > 0) {
        // Map requested fields to actual query fields
        const fieldMapping = {
          'id': 'f.id',
          'service_type': 'f.service_type',
          'fare_amount': 'f.fare_amount',
          'currency': 'f.currency',
          'effective_date': 'f.effective_date',
          'expiry_date': 'f.expiry_date',
          'from_location': 'fs.from_location',
          'to_location': 'ts.to_location'
        };
        selectFields = requestedFields.map(f => fieldMapping[f] || f).join(', ');
      }
    }

    // Handle sorting
    let orderBy = 'ORDER BY f.service_type, fs.segment_order, ts.segment_order';
    if (sort) {
      const sortParts = sort.split(' ');
      const sortField = sortParts[0];
      const sortDirection = sortParts[1] && sortParts[1].toLowerCase() === 'desc' ? 'DESC' : 'ASC';
      const allowedSortFields = ['service_type', 'fare_amount', 'effective_date', 'from_location', 'to_location'];
      if (allowedSortFields.includes(sortField)) {
        const fieldMapping = {
          'service_type': 'f.service_type',
          'fare_amount': 'f.fare_amount',
          'effective_date': 'f.effective_date',
          'from_location': 'fs.from_location',
          'to_location': 'ts.to_location'
        };
        orderBy = `ORDER BY ${fieldMapping[sortField] || sortField} ${sortDirection}`;
      }
    }

    // Build base query for counting
    const baseQuery = `
      FROM fares f
      JOIN routes r ON f.route_id = r.id
      JOIN route_segments fs ON f.from_segment_id = fs.id
      JOIN route_segments ts ON f.to_segment_id = ts.id
      WHERE ${conditions.join(' AND ')}
    `;

    // Count query for pagination
    const countQuery = `SELECT COUNT(*) ${baseQuery}`;
    
    // Data query with pagination
    const dataQuery = `
      SELECT ${selectFields}
      ${baseQuery}
      ${orderBy}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    const dataValues = [...values, limitNum, (pageNum - 1) * limitNum];

    // Run both queries in parallel
    const [countResult, dataResult] = await Promise.all([
      pool.query(countQuery, values),
      pool.query(dataQuery, dataValues)
    ]);
    
    const total = parseInt(countResult.rows[0].count, 10);
    const totalPages = Math.ceil(total / limitNum);
    
    if (dataResult.rows.length === 0) {
      return res.status(404).json({ error: 'No fares found for this route with the specified filters' });
    }

    // Group fares by service type if not using custom field selection
    let responseData;
    if (!fields) {
      const faresByService = dataResult.rows.reduce((acc, fare) => {
        if (!acc[fare.service_type]) {
          acc[fare.service_type] = [];
        }
        acc[fare.service_type].push({
          id: fare.id,
          from_location: fare.from_location,
          to_location: fare.to_location,
          fare_amount: parseFloat(fare.fare_amount),
          currency: fare.currency,
          effective_date: fare.effective_date,
          expiry_date: fare.expiry_date,
          from_segment_order: fare.from_segment_order,
          to_segment_order: fare.to_segment_order
        });
        return acc;
      }, {});
      
      responseData = {
        route_number: routeNumber,
        fares: faresByService,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1
      };
    } else {
      // Return raw data for custom field selection
      responseData = {
        route_number: routeNumber,
        fares: dataResult.rows,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1
      };
    }

    res.json(responseData);
  } catch (err) {
    console.error('Fares query error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create fare (Admin only)
router.post('/routes/:routeNumber/fares', authenticate, authorize(['admin']), async (req, res) => {
  const { routeNumber } = req.params;
  const { service_type, from_segment_order, to_segment_order, fare_amount, effective_date, expiry_date } = req.body;

  // Input validation
  if (
    !routeNumber || typeof routeNumber !== 'string' || !routeNumber.trim() ||
    typeof service_type !== 'string' || !['N', 'LU', 'SE'].includes(service_type) ||
    typeof from_segment_order !== 'number' || from_segment_order < 1 ||
    typeof to_segment_order !== 'number' || to_segment_order < 1 ||
    typeof fare_amount !== 'number' || fare_amount < 0 ||
    typeof effective_date !== 'string' || !effective_date.trim()
  ) {
    return res.status(400).json({
      error: 'Invalid input: route_number must be string, service_type must be N/LU/SE, segment orders must be positive numbers, fare_amount must be non-negative, effective_date is required'
    });
  }

  if (from_segment_order >= to_segment_order) {
    return res.status(400).json({ error: 'from_segment_order must be less than to_segment_order' });
  }

  try {
    // Get route ID and validate segments
    const routeResult = await pool.query('SELECT id FROM routes WHERE route_number = $1', [routeNumber]);
    if (routeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Route not found' });
    }

    const routeId = routeResult.rows[0].id;

    // Get segment IDs
    const segmentResult = await pool.query(
      'SELECT id, segment_order FROM route_segments WHERE route_id = $1 AND segment_order IN ($2, $3)',
      [routeId, from_segment_order, to_segment_order]
    );

    if (segmentResult.rows.length !== 2) {
      return res.status(400).json({ error: 'Invalid segment orders for this route' });
    }

    const fromSegmentId = segmentResult.rows.find(s => s.segment_order === from_segment_order)?.id;
    const toSegmentId = segmentResult.rows.find(s => s.segment_order === to_segment_order)?.id;

    // Insert fare
    const fareResult = await pool.query(
      'INSERT INTO fares (route_id, service_type, from_segment_id, to_segment_id, fare_amount, effective_date, expiry_date) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [routeId, service_type, fromSegmentId, toSegmentId, fare_amount, effective_date, expiry_date || null]
    );

    res.status(201).json(fareResult.rows[0]);
  } catch (err) {
    console.error('Fare creation error:', err);
    if (err.code === '23505') { // Unique constraint violation
      res.status(409).json({ error: 'Fare already exists for this route, service type, and segment combination' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

module.exports = router;