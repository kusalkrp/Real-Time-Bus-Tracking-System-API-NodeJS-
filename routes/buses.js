const express = require('express');
const { pool } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Buses Resource - List buses with advanced filtering
router.get('/', authenticate, authorize(['operator', 'admin']), async (req, res) => {
  const { 
    service_type, operator_type, page = 1, limit = 20, sort, fields,
    // New advanced filters
    permit_number_in, capacity_gt, capacity_lt, available, plate_no_like,
    // Route overlap filters
    passes_through_route, from_location, to_location, includes_stops
  } = req.query;
  
  // Sanitize pagination
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  
  // Build WHERE conditions
  const conditions = ['b.is_active = true'];
  const values = [];
  let paramIdx = 1;

  // Operator filtering - operators can only see their own buses
  if (req.user.role === 'operator') {
    conditions.push(`b.operator_id = $${paramIdx}`);
    values.push(req.user.operatorId);
    paramIdx++;
  }

  // Existing filters
  if (service_type && ['N', 'LU', 'SE'].includes(service_type)) {
    conditions.push(`b.service_type = $${paramIdx}`);
    values.push(service_type);
    paramIdx++;
  }

  if (operator_type && ['SLTB', 'Private'].includes(operator_type)) {
    conditions.push(`b.operator_type = $${paramIdx}`);
    values.push(operator_type);
    paramIdx++;
  }

  // New advanced filters
  if (permit_number_in) {
    const permits = permit_number_in.split(',').map(p => p.trim()).filter(p => p);
    if (permits.length > 0) {
      const placeholders = permits.map((_, i) => `$${paramIdx + i}`).join(',');
      conditions.push(`b.permit_number IN (${placeholders})`);
      values.push(...permits);
      paramIdx += permits.length;
    }
  }

  if (capacity_gt) {
    const cap = parseInt(capacity_gt, 10);
    if (!isNaN(cap)) {
      conditions.push(`b.capacity > $${paramIdx}`);
      values.push(cap);
      paramIdx++;
    }
  }

  if (capacity_lt) {
    const cap = parseInt(capacity_lt, 10);
    if (!isNaN(cap)) {
      conditions.push(`b.capacity < $${paramIdx}`);
      values.push(cap);
      paramIdx++;
    }
  }

  if (available === 'true') {
    conditions.push(`NOT EXISTS (SELECT 1 FROM trips t WHERE t.bus_id = b.id AND t.status IN ('Scheduled', 'In Progress'))`);
  } else if (available === 'false') {
    conditions.push(`EXISTS (SELECT 1 FROM trips t WHERE t.bus_id = b.id AND t.status IN ('Scheduled', 'In Progress'))`);
  }

  if (plate_no_like) {
    conditions.push(`b.plate_no ILIKE $${paramIdx}`);
    values.push(`%${plate_no_like}%`);
    paramIdx++;
  }

  // Route overlap filters - Find buses that pass through specific routes/locations
  if (passes_through_route) {
    // Find buses that operate on routes containing the specified route number
    conditions.push(`EXISTS (
      SELECT 1 FROM trips t 
      JOIN routes r ON t.route_id = r.id 
      WHERE t.bus_id = b.id 
      AND r.route_number = $${paramIdx}
    )`);
    values.push(passes_through_route);
    paramIdx++;
  }

  if (from_location && to_location) {
    // Advanced: Find buses that travel from point A to point B or pass through this segment
    conditions.push(`EXISTS (
      SELECT 1 FROM trips t 
      JOIN routes r ON t.route_id = r.id 
      JOIN route_segments rs1 ON rs1.route_id = r.id 
      JOIN route_segments rs2 ON rs2.route_id = r.id 
      WHERE t.bus_id = b.id 
      AND (
        -- Exact segment match
        (rs1.from_location ILIKE $${paramIdx} AND rs1.to_location ILIKE $${paramIdx + 1})
        OR
        -- Route connectivity: bus travels through both locations
        EXISTS (
          SELECT 1 FROM route_segments rs_from, route_segments rs_to 
          WHERE rs_from.route_id = r.id AND rs_to.route_id = r.id
          AND (rs_from.from_location ILIKE $${paramIdx + 2} OR rs_from.to_location ILIKE $${paramIdx + 2}) 
          AND (rs_to.from_location ILIKE $${paramIdx + 3} OR rs_to.to_location ILIKE $${paramIdx + 3})
          AND rs_from.segment_order <= rs_to.segment_order
        )
      )
    )`);
    values.push(`%${from_location}%`, `%${to_location}%`, `%${from_location}%`, `%${to_location}%`);
    paramIdx += 4;
  }

  if (includes_stops) {
    // Find buses that stop at any of the specified locations
    const stops = includes_stops.split(',').map(s => s.trim()).filter(s => s);
    if (stops.length > 0) {
      const stopConditions = stops.map((_, i) => `(rs.from_location ILIKE $${paramIdx + i} OR rs.to_location ILIKE $${paramIdx + i})`).join(' OR ');
      conditions.push(`EXISTS (
        SELECT 1 FROM trips t 
        JOIN routes r ON t.route_id = r.id 
        JOIN route_segments rs ON rs.route_id = r.id 
        WHERE t.bus_id = b.id 
        AND (${stopConditions})
      )`);
      values.push(...stops.map(stop => `%${stop}%`));
      paramIdx += stops.length;
    }
  }

  // Handle field selection
  let selectFields = 'b.*';
  if (fields) {
    const allowedFields = ['id', 'plate_no', 'permit_number', 'operator_id', 'operator_type', 'capacity', 'service_type', 'type', 'is_active', 'created_at', 'updated_at'];
    const requestedFields = fields.split(',').map(f => f.trim()).filter(f => allowedFields.includes(f));
    if (requestedFields.length > 0) {
      selectFields = requestedFields.map(f => `b.${f}`).join(', ');
    }
  }

  // Handle sorting
  let orderBy = 'ORDER BY b.id';
  if (sort) {
    const sortParts = sort.split(' ');
    const sortField = sortParts[0];
    const sortDirection = sortParts[1] && sortParts[1].toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    const allowedSortFields = ['id', 'plate_no', 'permit_number', 'operator_id', 'capacity', 'service_type', 'created_at'];
    if (allowedSortFields.includes(sortField)) {
      orderBy = `ORDER BY b.${sortField} ${sortDirection}`;
    }
  }

  const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
  const query = `SELECT ${selectFields} FROM buses b${whereClause} ${orderBy} LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
  const countQuery = `SELECT COUNT(*) FROM buses b${whereClause}`;
  
  values.push(limitNum, (pageNum - 1) * limitNum);
  const countValues = values.slice(0, -2); // Remove limit and offset for count query
  
  try {
    const [result, countResult] = await Promise.all([
      pool.query(query, values),
      pool.query(countQuery, countValues)
    ]);
    const total = parseInt(countResult.rows[0].count, 10);
    const totalPages = Math.ceil(total / limitNum);
    
    res.json({ 
      buses: result.rows, 
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1
    });
  } catch (err) {
    console.error('Buses query error:', err);
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

// Register bus with NTC-compliant fields
router.post('/', authenticate, authorize(['operator', 'admin']), async (req, res) => {
  const { plate_no, permit_number, service_type, operator_type, capacity, type } = req.body;

  // Input validation
  if (
    typeof plate_no !== 'string' || !plate_no.trim() ||
    typeof permit_number !== 'string' || !permit_number.trim() ||
    typeof service_type !== 'string' || !['N', 'LU', 'SE'].includes(service_type) ||
    typeof operator_type !== 'string' || !['SLTB', 'Private'].includes(operator_type) ||
    typeof capacity !== 'number' || isNaN(capacity) || capacity <= 0 ||
    typeof type !== 'string' || !type.trim()
  ) {
    return res.status(400).json({
      error: 'Missing or invalid required fields: plate_no, permit_number must be non-empty strings; service_type must be N/LU/SE; operator_type must be SLTB/Private; capacity must be positive number; type must be non-empty string'
    });
  }

  // Determine operator ID
  const opId = req.user.role === 'operator' ? req.user.operatorId : req.body.operator_id;
  const opType = req.user.role === 'operator' ? req.user.operatorType : operator_type;

  if (req.user.role === 'admin' && (!opId || typeof opId !== 'string' || !opId.trim())) {
    return res.status(400).json({ error: 'operator_id is required for admin users' });
  }

  // Validate operator type consistency
  if (req.user.role === 'operator' && req.user.operatorType !== operator_type) {
    return res.status(400).json({ error: 'operator_type must match your operator type' });
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
        'INSERT INTO buses (id, plate_no, permit_number, operator_id, operator_type, capacity, service_type, type) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
        [nextId, plate_no.trim(), permit_number.trim(), opId, opType, capacity, service_type, type.trim()]
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
      if (err.constraint === 'buses_plate_no_key') {
        res.status(409).json({ error: 'Bus with this plate number already exists' });
      } else if (err.constraint === 'buses_permit_number_key') {
        res.status(409).json({ error: 'Bus with this permit number already exists' });
      } else {
        res.status(409).json({ error: 'Bus already exists with this information' });
      }
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

// Advanced Route Overlap Search - Find buses that can take you from A to B
router.get('/route-search/:from/:to', authenticate, authorize(['commuter', 'operator', 'admin']), async (req, res) => {
  const { from, to } = req.params;
  const { include_overlapping = 'true', max_transfers = 1, page = 1, limit = 20 } = req.query;
  
  if (!from || !to || from.trim() === '' || to.trim() === '') {
    return res.status(400).json({ error: 'Both from and to locations are required' });
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const maxTransfers = Math.max(0, Math.min(3, parseInt(max_transfers, 10) || 1));

  try {
    // Query for direct routes and overlapping routes
    const query = `
      WITH route_analysis AS (
        SELECT DISTINCT
          b.id as bus_id,
          b.plate_no,
          b.permit_number,
          b.operator_type,
          b.capacity,
          b.service_type,
          r.id as route_id,
          r.route_number,
          r.route_name,
          r.start_location,
          r.end_location,
          rs_from.sequence_order as from_order,
          rs_to.sequence_order as to_order,
          rs_from.location_name as from_stop,
          rs_to.location_name as to_stop,
          CASE 
            WHEN r.start_location ILIKE $1 AND r.end_location ILIKE $2 THEN 'direct_route'
            WHEN rs_from.location_name ILIKE $1 AND rs_to.location_name ILIKE $2 THEN 'exact_segment'
            ELSE 'overlapping_route'
          END as match_type,
          ABS(rs_to.sequence_order - rs_from.sequence_order) as segment_distance
        FROM buses b
        JOIN trips t ON t.bus_id = b.id
        JOIN routes r ON t.route_id = r.id
        JOIN route_segments rs_from ON rs_from.route_id = r.id
        JOIN route_segments rs_to ON rs_to.route_id = r.id
        WHERE b.is_active = true
        AND t.status IN ('Scheduled', 'In Progress')
        AND rs_from.location_name ILIKE $1
        AND rs_to.location_name ILIKE $2
        AND rs_from.sequence_order < rs_to.sequence_order
        ${include_overlapping === 'false' ? "AND (r.start_location ILIKE $1 AND r.end_location ILIKE $2)" : ''}
      ),
      ranked_results AS (
        SELECT *,
          ROW_NUMBER() OVER (
            PARTITION BY bus_id 
            ORDER BY 
              CASE match_type 
                WHEN 'direct_route' THEN 1 
                WHEN 'exact_segment' THEN 2 
                ELSE 3 
              END,
              segment_distance ASC
          ) as rn
        FROM route_analysis
      )
      SELECT 
        bus_id,
        plate_no,
        permit_number,
        operator_type,
        capacity,
        service_type,
        route_id,
        route_number,
        route_name,
        start_location,
        end_location,
        from_stop,
        to_stop,
        match_type,
        segment_distance,
        CASE match_type
          WHEN 'direct_route' THEN 'This bus runs directly from ' || from_stop || ' to ' || to_stop
          WHEN 'exact_segment' THEN 'This bus stops at both ' || from_stop || ' and ' || to_stop
          ELSE 'This bus passes through your route (stops: ' || segment_distance::text || ')'
        END as route_explanation
      FROM ranked_results 
      WHERE rn = 1
      ORDER BY 
        CASE match_type 
          WHEN 'direct_route' THEN 1 
          WHEN 'exact_segment' THEN 2 
          ELSE 3 
        END,
        segment_distance ASC
      LIMIT $3 OFFSET $4
    `;

    const countQuery = `
      SELECT COUNT(DISTINCT b.id) as total
      FROM buses b
      JOIN trips t ON t.bus_id = b.id
      JOIN routes r ON t.route_id = r.id
      JOIN route_segments rs_from ON rs_from.route_id = r.id
      JOIN route_segments rs_to ON rs_to.route_id = r.id
      WHERE b.is_active = true
      AND t.status IN ('Scheduled', 'In Progress')
      AND rs_from.location_name ILIKE $1
      AND rs_to.location_name ILIKE $2
      AND rs_from.sequence_order < rs_to.sequence_order
      ${include_overlapping === 'false' ? "AND (r.start_location ILIKE $1 AND r.end_location ILIKE $2)" : ''}
    `;

    const searchFrom = `%${from}%`;
    const searchTo = `%${to}%`;
    const offset = (pageNum - 1) * limitNum;

    const [result, countResult] = await Promise.all([
      pool.query(query, [searchFrom, searchTo, limitNum, offset]),
      pool.query(countQuery, [searchFrom, searchTo])
    ]);

    const total = parseInt(countResult.rows[0].total, 10);
    const totalPages = Math.ceil(total / limitNum);

    res.json({
      buses: result.rows,
      search: {
        from: from,
        to: to,
        include_overlapping: include_overlapping === 'true',
        max_transfers: maxTransfers
      },
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1,
      explanation: `Found ${total} buses that can take you from ${from} to ${to}${include_overlapping === 'true' ? ' (including buses that pass through this route)' : ' (direct routes only)'}`
    });

  } catch (err) {
    console.error('Route search error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all stops/locations that a specific bus passes through
router.get('/:busId/stops', authenticate, authorize(['commuter', 'operator', 'admin']), async (req, res) => {
  const { busId } = req.params;

  if (!busId || typeof busId !== 'string' || !busId.trim()) {
    return res.status(400).json({ error: 'Invalid bus ID' });
  }

  try {
    const query = `
      SELECT DISTINCT
        rs.location_name as stop_name,
        rs.sequence_order,
        rs.distance_from_start_km,
        r.route_number,
        r.route_name,
        r.start_location,
        r.end_location
      FROM buses b
      JOIN trips t ON t.bus_id = b.id
      JOIN routes r ON t.route_id = r.id
      JOIN route_segments rs ON rs.route_id = r.id
      WHERE b.id = $1
      AND t.status IN ('Scheduled', 'In Progress')
      ORDER BY r.route_number, rs.sequence_order
    `;

    const result = await pool.query(query, [busId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bus not found or not currently in service' });
    }

    // Group stops by route
    const routeStops = {};
    result.rows.forEach(row => {
      const routeKey = row.route_number;
      if (!routeStops[routeKey]) {
        routeStops[routeKey] = {
          route_number: row.route_number,
          route_name: row.route_name,
          start_location: row.start_location,
          end_location: row.end_location,
          stops: []
        };
      }
      routeStops[routeKey].stops.push({
        stop_name: row.stop_name,
        sequence_order: row.sequence_order,
        distance_from_start_km: row.distance_from_start_km
      });
    });

    res.json({
      bus_id: busId,
      routes: Object.values(routeStops),
      total_routes: Object.keys(routeStops).length
    });

  } catch (err) {
    console.error('Bus stops query error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /buses/segment-search - Find buses that pass through specific segment
router.get('/segment-search', authenticate, async (req, res) => {
  try {
    const { from_location, to_location, service_type, operator_type } = req.query;
    
    if (!from_location || !to_location) {
      return res.status(400).json({
        error: 'Both from_location and to_location are required',
        example: '/buses/segment-search?from_location=Peradeniya&to_location=Kadugannawa'
      });
    }

    // Build the query to find all routes that have segments passing through the requested segment
    let segmentQuery = `
      SELECT DISTINCT 
        r.id as route_id,
        r.route_number,
        r.from_city,
        r.to_city,
        rs.id as segment_id,
        rs.from_location,
        rs.to_location,
        rs.segment_order,
        rs.distance_km as segment_distance_km,
        rs.estimated_time_hrs as segment_time_hrs
      FROM routes r
      INNER JOIN route_segments rs ON r.id = rs.route_id
      WHERE 1=1
    `;

    const segmentParams = [];
    let paramIndex = 1;

    // Find routes with exact segment match OR routes that connect the two locations
    segmentQuery += ` 
      AND (
        -- Exact segment match
        (rs.from_location ILIKE $${paramIndex} AND rs.to_location ILIKE $${paramIndex + 1})
        OR
        -- Route connectivity: find routes that go from from_location to to_location through multiple segments
        r.id IN (
          SELECT DISTINCT route_connectivity.route_id
          FROM (
            SELECT 
              r2.id as route_id,
              MIN(CASE WHEN rs1.from_location ILIKE $${paramIndex + 2} OR rs1.to_location ILIKE $${paramIndex + 2} THEN rs1.segment_order END) as from_order,
              MAX(CASE WHEN rs2.from_location ILIKE $${paramIndex + 3} OR rs2.to_location ILIKE $${paramIndex + 3} THEN rs2.segment_order END) as to_order
            FROM routes r2
            INNER JOIN route_segments rs1 ON r2.id = rs1.route_id
            INNER JOIN route_segments rs2 ON r2.id = rs2.route_id
            WHERE (rs1.from_location ILIKE $${paramIndex + 4} OR rs1.to_location ILIKE $${paramIndex + 4})
            AND (rs2.from_location ILIKE $${paramIndex + 5} OR rs2.to_location ILIKE $${paramIndex + 5})
            GROUP BY r2.id
            HAVING MIN(CASE WHEN rs1.from_location ILIKE $${paramIndex + 6} OR rs1.to_location ILIKE $${paramIndex + 6} THEN rs1.segment_order END) IS NOT NULL
            AND MAX(CASE WHEN rs2.from_location ILIKE $${paramIndex + 7} OR rs2.to_location ILIKE $${paramIndex + 7} THEN rs2.segment_order END) IS NOT NULL
            AND MIN(CASE WHEN rs1.from_location ILIKE $${paramIndex + 8} OR rs1.to_location ILIKE $${paramIndex + 8} THEN rs1.segment_order END) 
                <= MAX(CASE WHEN rs2.from_location ILIKE $${paramIndex + 9} OR rs2.to_location ILIKE $${paramIndex + 9} THEN rs2.segment_order END)
          ) route_connectivity
        )
      )
    `;
    
    // Add all parameters (repeated for complex query)
    segmentParams.push(
      `%${from_location}%`, `%${to_location}%`, // Direct segment match
      `%${from_location}%`, `%${to_location}%`, // Route connectivity 1
      `%${from_location}%`, `%${to_location}%`, // Route connectivity 2
      `%${from_location}%`, `%${to_location}%`, // Route connectivity 3
      `%${from_location}%`, `%${to_location}%`  // Route connectivity 4
    );

    segmentQuery += ` ORDER BY r.route_number, rs.segment_order`;

    const segmentResult = await pool.query(segmentQuery, segmentParams);
    
    if (segmentResult.rows.length === 0) {
      return res.status(404).json({
        message: `No routes found passing through ${from_location} to ${to_location}`,
        found_routes: [],
        buses: []
      });
    }

    // Get route IDs that match the segment criteria
    const matchingRouteIds = [...new Set(segmentResult.rows.map(row => row.route_id))];
    
    // Now find all buses operating on these routes
    let busQuery = `
      SELECT DISTINCT
        b.id,
        b.plate_no,
        b.permit_number,
        b.operator_id,
        b.operator_type,
        b.capacity,
        b.service_type,
        b.type,
        b.is_active,
        r.route_number,
        r.from_city as route_from,
        r.to_city as route_to,
        r.distance_km as route_distance_km,
        -- Add trip information if available
        COUNT(t.id) as active_trips_count,
        MAX(t.departure_time) as next_departure
      FROM buses b
      LEFT JOIN trips t ON b.id = t.bus_id AND t.status IN ('Scheduled', 'In Progress')
      INNER JOIN routes r ON EXISTS (
        SELECT 1 FROM trips t2 WHERE t2.bus_id = b.id AND t2.route_id = r.id
      )
      WHERE r.id = ANY($1::int[])
      AND b.is_active = true
    `;

    const busParams = [matchingRouteIds];
    let busParamIndex = 2;

    // Add role-based filtering
    if (req.user.role === 'operator') {
      busQuery += ` AND b.operator_id = $${busParamIndex}`;
      busParams.push(req.user.operatorId);
      busParamIndex++;
    }

    // Add service type filter
    if (service_type) {
      busQuery += ` AND b.service_type = $${busParamIndex}`;
      busParams.push(service_type.toUpperCase());
      busParamIndex++;
    }

    // Add operator type filter
    if (operator_type) {
      busQuery += ` AND b.operator_type = $${busParamIndex}`;
      busParams.push(operator_type);
      busParamIndex++;
    }

    busQuery += `
      GROUP BY b.id, b.plate_no, b.permit_number, b.operator_id, b.operator_type, 
               b.capacity, b.service_type, b.type, b.is_active, 
               r.route_number, r.from_city, r.to_city, r.distance_km
      ORDER BY r.route_number, b.service_type, b.id
    `;

    const busResult = await pool.query(busQuery, busParams);

    // Group results by route for better presentation
    const routeGroups = {};
    segmentResult.rows.forEach(row => {
      if (!routeGroups[row.route_number]) {
        routeGroups[row.route_number] = {
          route_number: row.route_number,
          route_from: row.from_city,
          route_to: row.to_city,
          matching_segments: [],
          buses: []
        };
      }
      
      // Check if this segment is already added
      const existingSegment = routeGroups[row.route_number].matching_segments.find(
        seg => seg.segment_id === row.segment_id
      );
      
      if (!existingSegment) {
        routeGroups[row.route_number].matching_segments.push({
          segment_id: row.segment_id,
          from_location: row.from_location,
          to_location: row.to_location,
          segment_order: row.segment_order,
          distance_km: row.segment_distance_km,
          time_hrs: row.segment_time_hrs
        });
      }
    });

    // Add buses to their respective routes
    busResult.rows.forEach(bus => {
      if (routeGroups[bus.route_number]) {
        routeGroups[bus.route_number].buses.push({
          id: bus.id,
          plate_no: bus.plate_no,
          permit_number: bus.permit_number,
          operator_id: bus.operator_id,
          operator_type: bus.operator_type,
          capacity: bus.capacity,
          service_type: bus.service_type,
          type: bus.type,
          active_trips_count: parseInt(bus.active_trips_count) || 0,
          next_departure: bus.next_departure
        });
      }
    });

    const routeArray = Object.values(routeGroups);
    const totalBuses = busResult.rows.length;

    res.json({
      search_criteria: {
        from_location,
        to_location,
        service_type: service_type || 'all',
        operator_type: operator_type || 'all'
      },
      summary: {
        routes_found: routeArray.length,
        total_buses: totalBuses,
        segment_description: `Buses traveling from ${from_location} to ${to_location} (including routes that pass through these locations)`
      },
      routes: routeArray
    });

  } catch (error) {
    console.error('Error in segment-search:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
});

module.exports = router;