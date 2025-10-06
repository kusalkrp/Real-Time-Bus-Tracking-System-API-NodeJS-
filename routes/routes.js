const express = require('express');
const { pool } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Routes Resource - List routes with advanced NTC filtering
router.get('/', authenticate, authorize(['commuter', 'operator', 'admin']), async (req, res) => {
  const { 
    route_number, from, to, page = 1, limit = 20, sort, fields,
    // New advanced filters
    distance_km_gt, distance_km_lt, distance_km_eq,
    estimated_time_hrs_gt, estimated_time_hrs_lt,
    segment, segment_like, has_trips, route_number_in
  } = req.query;

  // Build WHERE conditions dynamically
  const conditions = ['r.is_active = true'];
  const values = [];

  // Existing filters
  if (route_number) {
    conditions.push(`r.route_number = $${values.length + 1}`);
    values.push(route_number);
  }
  if (from) {
    conditions.push(`r.from_city ILIKE $${values.length + 1}`);
    values.push(`%${from}%`);
  }
  if (to) {
    conditions.push(`r.to_city ILIKE $${values.length + 1}`);
    values.push(`%${to}%`);
  }

  // New advanced filters
  if (distance_km_gt) {
    const distance = parseFloat(distance_km_gt);
    if (!isNaN(distance)) {
      conditions.push(`r.distance_km > $${values.length + 1}`);
      values.push(distance);
    }
  }
  if (distance_km_lt) {
    const distance = parseFloat(distance_km_lt);
    if (!isNaN(distance)) {
      conditions.push(`r.distance_km < $${values.length + 1}`);
      values.push(distance);
    }
  }
  if (distance_km_eq) {
    const distance = parseFloat(distance_km_eq);
    if (!isNaN(distance)) {
      conditions.push(`r.distance_km = $${values.length + 1}`);
      values.push(distance);
    }
  }
  if (estimated_time_hrs_gt) {
    const time = parseFloat(estimated_time_hrs_gt);
    if (!isNaN(time)) {
      conditions.push(`r.estimated_time_hrs > $${values.length + 1}`);
      values.push(time);
    }
  }
  if (estimated_time_hrs_lt) {
    const time = parseFloat(estimated_time_hrs_lt);
    if (!isNaN(time)) {
      conditions.push(`r.estimated_time_hrs < $${values.length + 1}`);
      values.push(time);
    }
  }
  if (segment) {
    const param1 = values.length + 1;
    const param2 = values.length + 2;
    conditions.push(`EXISTS (SELECT 1 FROM route_segments rs2 WHERE rs2.route_id = r.id AND (rs2.from_location ILIKE $${param1} OR rs2.to_location ILIKE $${param2}))`);
    values.push(`%${segment}%`);
    values.push(`%${segment}%`);
  }
  if (segment_like) {
    const param1 = values.length + 1;
    const param2 = values.length + 2;
    conditions.push(`EXISTS (SELECT 1 FROM route_segments rs2 WHERE rs2.route_id = r.id AND (rs2.from_location ILIKE $${param1} OR rs2.to_location ILIKE $${param2}))`);
    values.push(`%${segment_like}%`);
    values.push(`%${segment_like}%`);
  }
  if (has_trips === 'true') {
    conditions.push(`EXISTS (SELECT 1 FROM trips t WHERE t.route_id = r.id AND t.status IN ('Scheduled', 'In Progress'))`);
  } else if (has_trips === 'false') {
    conditions.push(`NOT EXISTS (SELECT 1 FROM trips t WHERE t.route_id = r.id AND t.status IN ('Scheduled', 'In Progress'))`);
  }
  if (route_number_in) {
    const routeNumbers = route_number_in.split(',').map(rn => rn.trim()).filter(rn => rn);
    if (routeNumbers.length > 0) {
      const placeholders = routeNumbers.map((_, i) => `$${values.length + i + 1}`).join(',');
      conditions.push(`r.route_number IN (${placeholders})`);
      values.push(...routeNumbers);
    }
  }

  // Handle field selection
  let selectFields = 'r.*';
  if (fields) {
    const allowedFields = ['id', 'route_number', 'from_city', 'to_city', 'distance_km', 'estimated_time_hrs', 'is_active', 'created_at', 'updated_at'];
    const requestedFields = fields.split(',').map(f => f.trim()).filter(f => allowedFields.includes(f));
    if (requestedFields.length > 0) {
      selectFields = requestedFields.map(f => `r.${f}`).join(', ');
    }
  }

  // Handle sorting
  let orderBy = 'ORDER BY r.route_number';
  if (sort) {
    const sortParts = sort.split(' ');
    const sortField = sortParts[0];
    const sortDirection = sortParts[1] && sortParts[1].toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    const allowedSortFields = ['route_number', 'from_city', 'to_city', 'distance_km', 'estimated_time_hrs', 'created_at'];
    if (allowedSortFields.includes(sortField)) {
      orderBy = `ORDER BY r.${sortField} ${sortDirection}`;
    }
  }

  // Build base queries with segments
  const baseQuery = `
    FROM routes r
    LEFT JOIN route_segments rs ON r.id = rs.route_id
    WHERE ${conditions.join(' AND ')}
  `;

  const selectQuery = `
    SELECT 
      ${selectFields},
      COALESCE(
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'id', rs.id,
            'order', rs.segment_order,
            'from_location', rs.from_location,
            'to_location', rs.to_location,
            'distance_km', rs.distance_km,
            'estimated_time_hrs', rs.estimated_time_hrs
          ) 
          ORDER BY rs.segment_order
        ) FILTER (WHERE rs.id IS NOT NULL), 
        '[]'
      ) as segments
    ${baseQuery}
    GROUP BY r.id
    ${orderBy}
  `;

  const countQuery = `SELECT COUNT(DISTINCT r.id) ${baseQuery}`;

  // Add pagination
  const limitNum = parseInt(limit, 10) || 20;
  const pageNum = parseInt(page, 10) || 1;
  const offset = (pageNum - 1) * limitNum;

  const paginatedSelectQuery = `${selectQuery} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
  const selectValues = [...values, limitNum, offset];

  try {
    const [result, countResult] = await Promise.all([
      pool.query(paginatedSelectQuery, selectValues),
      pool.query(countQuery, values)
    ]);

    const total = parseInt(countResult.rows[0].count, 10);
    res.json({ routes: result.rows, total, page: pageNum, limit: limitNum });
  } catch (err) {
    console.error('Routes query error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get route by NTC route number (e.g., /routes/01)
router.get('/:routeNumber', authenticate, authorize(['commuter', 'operator', 'admin']), async (req, res) => {
  const { routeNumber } = req.params;

  if (!routeNumber || typeof routeNumber !== 'string' || !routeNumber.trim()) {
    return res.status(400).json({ error: 'Invalid route number' });
  }

  try {
    const query = `
      SELECT 
        r.*,
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', rs.id,
              'order', rs.segment_order,
              'from_location', rs.from_location,
              'to_location', rs.to_location,
              'distance_km', rs.distance_km,
              'estimated_time_hrs', rs.estimated_time_hrs
            ) 
            ORDER BY rs.segment_order
          ) FILTER (WHERE rs.id IS NOT NULL), 
          '[]'
        ) as segments
      FROM routes r
      LEFT JOIN route_segments rs ON r.id = rs.route_id
      WHERE r.route_number = $1 AND r.is_active = true
      GROUP BY r.id
    `;

    const result = await pool.query(query, [routeNumber]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Route not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Route fetch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create route with NTC route number and segments
router.post('/', authenticate, authorize(['admin']), async (req, res) => {
  const { route_number, from_city, to_city, distance_km, estimated_time_hrs, segments } = req.body;

  // Input validation
  if (
    typeof route_number !== 'string' || !route_number.trim() ||
    typeof from_city !== 'string' || !from_city.trim() ||
    typeof to_city !== 'string' || !to_city.trim() ||
    typeof distance_km !== 'number' || isNaN(distance_km) || distance_km <= 0 ||
    typeof estimated_time_hrs !== 'number' || isNaN(estimated_time_hrs) || estimated_time_hrs <= 0
  ) {
    return res.status(400).json({
      error: 'Missing or invalid required fields: route_number, from_city, to_city must be non-empty strings; distance_km, estimated_time_hrs must be positive numbers'
    });
  }

  // Validate segments if provided
  if (segments && (!Array.isArray(segments) || segments.length === 0)) {
    return res.status(400).json({ error: 'Segments must be a non-empty array if provided' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert route
    const routeResult = await client.query(
      'INSERT INTO routes (route_number, from_city, to_city, distance_km, estimated_time_hrs) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [route_number.trim(), from_city.trim(), to_city.trim(), distance_km, estimated_time_hrs]
    );

    const route = routeResult.rows[0];

    // Insert segments if provided
    if (segments && segments.length > 0) {
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        if (!segment.from_location || !segment.to_location || !segment.distance_km || !segment.estimated_time_hrs) {
          throw new Error(`Invalid segment at index ${i}: missing required fields`);
        }

        await client.query(
          'INSERT INTO route_segments (route_id, segment_order, from_location, to_location, distance_km, estimated_time_hrs) VALUES ($1, $2, $3, $4, $5, $6)',
          [route.id, i + 1, segment.from_location, segment.to_location, segment.distance_km, segment.estimated_time_hrs]
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json(route);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Route creation error:', err);
    if (err.code === '23505') { // Unique constraint violation
      res.status(409).json({ error: 'Route number already exists' });
    } else {
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  } finally {
    client.release();
  }
});

// List trips for a route with advanced filtering - /routes/{routeNumber}/trips
router.get('/:routeNumber/trips', authenticate, authorize(['commuter', 'operator', 'admin']), async (req, res) => {
  const { routeNumber } = req.params;

  if (!routeNumber || typeof routeNumber !== 'string' || !routeNumber.trim()) {
    return res.status(400).json({ error: 'Invalid route number' });
  }

  const { 
    direction, service_type, date, startDate, endDate, page = 1, limit = 20, sort, fields,
    // New advanced filters
    departure_time_gt, departure_time_lt, next_hours, status_in, 
    interval_min_lt, interval_min_gt, stop, stop_like, 
    min_fare, max_fare, from_stop, to_stop, aggregate
  } = req.query;
  
  // Sanitize pagination parameters
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

  try {
    // Get route ID from route number
    const routeResult = await pool.query('SELECT id FROM routes WHERE route_number = $1 AND is_active = true', [routeNumber]);
    if (routeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Route not found' });
    }
    const routeId = routeResult.rows[0].id;
  
    let baseQuery = 'FROM trips t INNER JOIN buses b ON t.bus_id = b.id WHERE t.route_id = $1';
    const values = [routeId];
    let paramIdx = 2;

    // Add operator filtering for operators
    if (req.user.role === 'operator') {
      baseQuery += ` AND b.operator_id = $${paramIdx}`;
      values.push(req.user.operatorId);
      paramIdx++;
    }

    // Direction filter
    if (direction && ['outbound', 'inbound'].includes(direction)) {
      baseQuery += ` AND t.direction = $${paramIdx}`;
      values.push(direction);
      paramIdx++;
    }

    // Service type filter
    if (service_type && ['N', 'LU', 'SE'].includes(service_type)) {
      baseQuery += ` AND t.service_type = $${paramIdx}`;
      values.push(service_type);
      paramIdx++;
    }

    // Date filters
    if (date) {
      baseQuery += ` AND DATE(t.departure_time) = $${paramIdx}`;
      values.push(date);
      paramIdx++;
    } else {
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
    }

    // New advanced filters
    if (departure_time_gt) {
      baseQuery += ` AND t.departure_time > $${paramIdx}`;
      values.push(departure_time_gt);
      paramIdx++;
    }
    if (departure_time_lt) {
      baseQuery += ` AND t.departure_time < $${paramIdx}`;
      values.push(departure_time_lt);
      paramIdx++;
    }
    if (next_hours) {
      const hours = parseFloat(next_hours);
      if (!isNaN(hours) && hours > 0) {
        const futureTime = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
        baseQuery += ` AND t.departure_time BETWEEN NOW() AND $${paramIdx}`;
        values.push(futureTime);
        paramIdx++;
      }
    }
    if (status_in) {
      const statuses = status_in.split(',').map(s => s.trim()).filter(s => ['Scheduled', 'In Progress', 'Completed', 'Delayed', 'Cancelled'].includes(s));
      if (statuses.length > 0) {
        const placeholders = statuses.map((_, i) => `$${paramIdx + i}`).join(',');
        baseQuery += ` AND t.status IN (${placeholders})`;
        values.push(...statuses);
        paramIdx += statuses.length;
      }
    }
    if (interval_min_lt) {
      const interval = parseInt(interval_min_lt, 10);
      if (!isNaN(interval)) {
        baseQuery += ` AND t.interval_min < $${paramIdx}`;
        values.push(interval);
        paramIdx++;
      }
    }
    if (interval_min_gt) {
      const interval = parseInt(interval_min_gt, 10);
      if (!isNaN(interval)) {
        baseQuery += ` AND t.interval_min > $${paramIdx}`;
        values.push(interval);
        paramIdx++;
      }
    }
    if (stop || stop_like) {
      const stopName = stop || stop_like;
      baseQuery += ` AND EXISTS (
        SELECT 1 FROM route_segments rs 
        WHERE rs.route_id = t.route_id 
        AND (rs.from_location ILIKE $${paramIdx} OR rs.to_location ILIKE $${paramIdx + 1})
      )`;
      values.push(`%${stopName}%`, `%${stopName}%`);
      paramIdx += 2;
    }
    if (min_fare || max_fare || (from_stop && to_stop)) {
      // Join with fares table for fare-based filtering
      baseQuery = baseQuery.replace('FROM trips t', 'FROM trips t LEFT JOIN fares f ON f.route_id = t.route_id AND f.service_type = t.service_type');
      
      if (min_fare) {
        const minFareNum = parseFloat(min_fare);
        if (!isNaN(minFareNum)) {
          baseQuery += ` AND f.fare_amount >= $${paramIdx}`;
          values.push(minFareNum);
          paramIdx++;
        }
      }
      if (max_fare) {
        const maxFareNum = parseFloat(max_fare);
        if (!isNaN(maxFareNum)) {
          baseQuery += ` AND f.fare_amount <= $${paramIdx}`;
          values.push(maxFareNum);
          paramIdx++;
        }
      }
      if (from_stop && to_stop) {
        baseQuery += ` AND EXISTS (
          SELECT 1 FROM route_segments rs1, route_segments rs2 
          WHERE rs1.route_id = t.route_id AND rs2.route_id = t.route_id
          AND (rs1.from_location ILIKE $${paramIdx} OR rs1.to_location ILIKE $${paramIdx + 1})
          AND (rs2.from_location ILIKE $${paramIdx + 2} OR rs2.to_location ILIKE $${paramIdx + 3})
          AND f.from_segment_id = rs1.id AND f.to_segment_id = rs2.id
        )`;
        values.push(`%${from_stop}%`, `%${from_stop}%`, `%${to_stop}%`, `%${to_stop}%`);
        paramIdx += 4;
      }
    }

    // Handle aggregates
    if (aggregate) {
      let aggregateQuery;
      switch (aggregate) {
        case 'count':
          aggregateQuery = `SELECT COUNT(*) as count ${baseQuery}`;
          break;
        case 'avg_delay':
          aggregateQuery = `SELECT AVG(EXTRACT(EPOCH FROM (t.arrival_time - t.departure_time))/3600 - (SELECT r.estimated_time_hrs FROM routes r WHERE r.id = t.route_id)) as avg_delay_hours ${baseQuery}`;
          break;
        default:
          return res.status(400).json({ error: 'Invalid aggregate type. Supported: count, avg_delay' });
      }
      
      const aggregateResult = await pool.query(aggregateQuery, values);
      return res.json({
        route_number: routeNumber,
        aggregate_type: aggregate,
        result: aggregateResult.rows[0]
      });
    }

    // Handle field selection
    let selectFields = 't.*';
    if (fields) {
      const allowedFields = ['id', 'bus_id', 'route_id', 'direction', 'service_type', 'departure_time', 'arrival_time', 'interval_min', 'status', 'created_at', 'updated_at'];
      const requestedFields = fields.split(',').map(f => f.trim()).filter(f => allowedFields.includes(f));
      if (requestedFields.length > 0) {
        selectFields = requestedFields.map(f => `t.${f}`).join(', ');
      }
    }

    // Handle sorting
    let orderBy = 'ORDER BY t.departure_time';
    if (sort) {
      const sortParts = sort.split(' ');
      const sortField = sortParts[0];
      const sortDirection = sortParts[1] && sortParts[1].toLowerCase() === 'desc' ? 'DESC' : 'ASC';
      const allowedSortFields = ['departure_time', 'arrival_time', 'status', 'direction', 'service_type', 'created_at'];
      if (allowedSortFields.includes(sortField)) {
        orderBy = `ORDER BY t.${sortField} ${sortDirection}`;
      }
    }

    // Count query (no LIMIT/OFFSET)
    const countQuery = `SELECT COUNT(DISTINCT t.id) ${baseQuery}`;
    // Data query (with LIMIT/OFFSET)
    const dataQuery = `SELECT DISTINCT ${selectFields} ${baseQuery} ${orderBy} LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
    const dataValues = [...values, limitNum, (pageNum - 1) * limitNum];
  
    // Run both queries in parallel for better performance
    const [countResult, dataResult] = await Promise.all([
      pool.query(countQuery, values),
      pool.query(dataQuery, dataValues)
    ]);
    
    const total = parseInt(countResult.rows[0].count, 10);
    const totalPages = Math.ceil(total / limitNum);
    
    res.json({ 
      route_number: routeNumber,
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

// Get fares for a route with advanced filtering - /routes/{routeNumber}/fares
router.get('/:routeNumber/fares', authenticate, authorize(['commuter', 'operator', 'admin']), async (req, res) => {
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

// Advanced Route Discovery - Find routes connecting two locations
router.get('/connect/:from/:to', authenticate, authorize(['commuter', 'operator', 'admin']), async (req, res) => {
  const { from, to } = req.params;
  const { include_indirect = 'true', max_stops = 50, page = 1, limit = 20 } = req.query;
  
  if (!from || !to || from.trim() === '' || to.trim() === '') {
    return res.status(400).json({ error: 'Both from and to locations are required' });
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const maxStops = Math.max(1, Math.min(100, parseInt(max_stops, 10) || 50));

  try {
    const query = `
      WITH route_connections AS (
        SELECT 
          r.id,
          r.route_number,
          r.route_name,
          r.start_location,
          r.end_location,
          r.from_city,
          r.to_city,
          r.distance_km,
          r.estimated_time_hrs,
          rs_from.location_name as from_stop,
          rs_to.location_name as to_stop,
          rs_from.sequence_order as from_order,
          rs_to.sequence_order as to_order,
          rs_from.distance_from_start_km as from_distance,
          rs_to.distance_from_start_km as to_distance,
          CASE 
            WHEN r.start_location ILIKE $1 AND r.end_location ILIKE $2 THEN 'direct_route'
            WHEN rs_from.location_name ILIKE $1 AND rs_to.location_name ILIKE $2 THEN 'segment_match'
            WHEN rs_from.location_name ILIKE $1 OR rs_to.location_name ILIKE $2 THEN 'partial_match'
            ELSE 'indirect_route'
          END as connection_type,
          (rs_to.distance_from_start_km - rs_from.distance_from_start_km) as segment_distance,
          (rs_to.sequence_order - rs_from.sequence_order) as stops_between
        FROM routes r
        LEFT JOIN route_segments rs_from ON rs_from.route_id = r.id
        LEFT JOIN route_segments rs_to ON rs_to.route_id = r.id
        WHERE r.is_active = true
        AND (
          -- Direct city-to-city routes
          (r.from_city ILIKE $1 AND r.to_city ILIKE $2)
          OR
          -- Routes with segments matching from/to
          (rs_from.location_name ILIKE $1 AND rs_to.location_name ILIKE $2 AND rs_from.sequence_order <= rs_to.sequence_order)
          ${include_indirect === 'true' ? `
          OR
          -- Indirect routes (passes through one of the locations)
          (rs_from.location_name ILIKE $1 OR rs_to.location_name ILIKE $2)
          ` : ''}
        )
        AND (rs_to.sequence_order - rs_from.sequence_order) <= $5
      ),
      ranked_routes AS (
        SELECT *,
          ROW_NUMBER() OVER (
            PARTITION BY id 
            ORDER BY 
              CASE connection_type 
                WHEN 'direct_route' THEN 1 
                WHEN 'segment_match' THEN 2 
                WHEN 'partial_match' THEN 3
                ELSE 4 
              END,
              segment_distance ASC NULLS LAST,
              stops_between ASC NULLS LAST
          ) as rn
        FROM route_connections
      ),
      route_stats AS (
        SELECT 
          id,
          route_number,
          route_name,
          start_location,
          end_location,
          from_city,
          to_city,
          distance_km,
          estimated_time_hrs,
          from_stop,
          to_stop,
          from_order,
          to_order,
          from_distance,
          to_distance,
          connection_type,
          segment_distance,
          stops_between,
          -- Count active buses on this route
          (SELECT COUNT(*) FROM trips t JOIN buses b ON t.bus_id = b.id 
           WHERE t.route_id = r.id AND t.status IN ('Scheduled', 'In Progress') AND b.is_active = true) as active_buses,
          -- Get next departure time
          (SELECT MIN(t.departure_time) FROM trips t 
           WHERE t.route_id = r.id AND t.status = 'Scheduled' AND t.departure_time > NOW()) as next_departure
        FROM ranked_routes r
        WHERE rn = 1
      )
      SELECT 
        *,
        CASE connection_type
          WHEN 'direct_route' THEN 'Direct route from ' || from_city || ' to ' || to_city
          WHEN 'segment_match' THEN 'Route connects ' || from_stop || ' to ' || to_stop || ' (' || stops_between::text || ' stops)'
          WHEN 'partial_match' THEN 'Route passes through one of your locations'
          ELSE 'Indirect connection available'
        END as connection_explanation,
        CASE 
          WHEN segment_distance IS NOT NULL AND segment_distance > 0 THEN 
            ROUND(segment_distance::numeric, 2)::text || ' km segment'
          ELSE 'Full route: ' || COALESCE(distance_km::text, '0') || ' km'
        END as distance_info
      FROM route_stats
      ORDER BY 
        CASE connection_type 
          WHEN 'direct_route' THEN 1 
          WHEN 'segment_match' THEN 2 
          WHEN 'partial_match' THEN 3
          ELSE 4 
        END,
        COALESCE(segment_distance, distance_km) ASC,
        active_buses DESC
      LIMIT $3 OFFSET $4
    `;

    const countQuery = `
      SELECT COUNT(DISTINCT r.id) as total
      FROM routes r
      LEFT JOIN route_segments rs_from ON rs_from.route_id = r.id
      LEFT JOIN route_segments rs_to ON rs_to.route_id = r.id
      WHERE r.is_active = true
      AND (
        (r.from_city ILIKE $1 AND r.to_city ILIKE $2)
        OR
        (rs_from.location_name ILIKE $1 AND rs_to.location_name ILIKE $2 AND rs_from.sequence_order <= rs_to.sequence_order)
        ${include_indirect === 'true' ? `
        OR
        (rs_from.location_name ILIKE $1 OR rs_to.location_name ILIKE $2)
        ` : ''}
      )
    `;

    const searchFrom = `%${from}%`;
    const searchTo = `%${to}%`;
    const offset = (pageNum - 1) * limitNum;

    const [result, countResult] = await Promise.all([
      pool.query(query, [searchFrom, searchTo, limitNum, offset, maxStops]),
      pool.query(countQuery, [searchFrom, searchTo])
    ]);

    const total = parseInt(countResult.rows[0].total, 10);
    const totalPages = Math.ceil(total / limitNum);

    res.json({
      routes: result.rows,
      search: {
        from: from,
        to: to,
        include_indirect: include_indirect === 'true',
        max_stops: maxStops
      },
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1,
      explanation: `Found ${total} routes connecting ${from} to ${to}${include_indirect === 'true' ? ' (including indirect connections)' : ' (direct connections only)'}`
    });

  } catch (err) {
    console.error('Route connection search error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all possible transfer points between two locations
router.get('/transfers/:from/:to', authenticate, authorize(['commuter', 'operator', 'admin']), async (req, res) => {
  const { from, to } = req.params;
  const { max_transfer_distance = 5 } = req.query;
  
  if (!from || !to || from.trim() === '' || to.trim() === '') {
    return res.status(400).json({ error: 'Both from and to locations are required' });
  }

  const maxDistance = Math.max(1, Math.min(50, parseFloat(max_transfer_distance) || 5));

  try {
    const query = `
      WITH route_from AS (
        SELECT DISTINCT 
          r.id as route_id,
          r.route_number,
          rs.location_name as transfer_point,
          rs.distance_from_start_km,
          rs.sequence_order
        FROM routes r
        JOIN route_segments rs ON rs.route_id = r.id
        WHERE r.is_active = true
        AND EXISTS (
          SELECT 1 FROM route_segments rs2 
          WHERE rs2.route_id = r.id 
          AND rs2.location_name ILIKE $1
          AND rs2.sequence_order < rs.sequence_order
        )
      ),
      route_to AS (
        SELECT DISTINCT 
          r.id as route_id,
          r.route_number,
          rs.location_name as transfer_point,
          rs.distance_from_start_km,
          rs.sequence_order
        FROM routes r
        JOIN route_segments rs ON rs.route_id = r.id
        WHERE r.is_active = true
        AND EXISTS (
          SELECT 1 FROM route_segments rs2 
          WHERE rs2.route_id = r.id 
          AND rs2.location_name ILIKE $2
          AND rs2.sequence_order > rs.sequence_order
        )
      )
      SELECT 
        rf.transfer_point,
        rf.route_number as from_route,
        rt.route_number as to_route,
        COUNT(*) as connection_count,
        STRING_AGG(DISTINCT rf.route_number, ', ') as from_routes,
        STRING_AGG(DISTINCT rt.route_number, ', ') as to_routes,
        AVG(ABS(rf.distance_from_start_km - rt.distance_from_start_km)) as avg_transfer_distance
      FROM route_from rf
      JOIN route_to rt ON rf.transfer_point = rt.transfer_point
      WHERE ABS(rf.distance_from_start_km - rt.distance_from_start_km) <= $3
      GROUP BY rf.transfer_point, rf.route_number, rt.route_number
      ORDER BY connection_count DESC, avg_transfer_distance ASC
      LIMIT 20
    `;

    const result = await pool.query(query, [`%${from}%`, `%${to}%`, maxDistance]);

    res.json({
      transfer_points: result.rows,
      search: {
        from: from,
        to: to,
        max_transfer_distance: maxDistance
      },
      total: result.rows.length,
      explanation: `Found ${result.rows.length} potential transfer points between ${from} and ${to}`
    });

  } catch (err) {
    console.error('Transfer points search error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;