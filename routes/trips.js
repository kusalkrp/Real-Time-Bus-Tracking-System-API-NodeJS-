const express = require('express');
const { pool } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Constants
const MILLISECONDS_PER_HOUR = 3600000;

// List trips for a route with advanced filtering
router.get('/routes/:routeNumber/trips', authenticate, authorize(['commuter', 'operator', 'admin']), async (req, res) => {
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

// Schedule trip with direction and interval
router.post('/', authenticate, authorize(['operator', 'admin']), async (req, res) => {
  const { bus_id, route_number, direction, service_type, departure_time, interval_min } = req.body;

  // Input validation
  if (
    typeof bus_id !== 'string' || !bus_id.trim() ||
    typeof route_number !== 'string' || !route_number.trim() ||
    typeof direction !== 'string' || !['outbound', 'inbound'].includes(direction) ||
    typeof service_type !== 'string' || !['N', 'LU', 'SE'].includes(service_type) ||
    !departure_time || isNaN(new Date(departure_time).getTime()) ||
    (interval_min !== undefined && (typeof interval_min !== 'number' || interval_min <= 0))
  ) {
    return res.status(400).json({
      error: 'Missing or invalid required fields: bus_id, route_number must be non-empty strings; direction must be outbound/inbound; service_type must be N/LU/SE; departure_time must be valid date; interval_min must be positive number if provided'
    });
  }

  try {
    // Check if bus exists and operator owns it (for operators)
    const busQuery = 'SELECT operator_id, service_type FROM buses WHERE id = $1';
    const busResult = await pool.query(busQuery, [bus_id.trim()]);
    if (busResult.rows.length === 0) {
      return res.status(404).json({ error: 'Bus not found' });
    }

    if (req.user.role === 'operator' && busResult.rows[0].operator_id !== req.user.operatorId) {
      return res.status(403).json({ error: 'Unauthorized: You do not own this bus' });
    }

    // Validate service type matches bus
    if (busResult.rows[0].service_type !== service_type) {
      return res.status(400).json({ error: 'Service type must match bus service type' });
    }

    // Check if route exists and get route details
    const routeQuery = 'SELECT id, estimated_time_hrs FROM routes WHERE route_number = $1 AND is_active = true';
    const routeResult = await pool.query(routeQuery, [route_number]);
    if (routeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Route not found' });
    }
    
    const route = routeResult.rows[0];
    const arrival_time = new Date(new Date(departure_time).getTime() + route.estimated_time_hrs * MILLISECONDS_PER_HOUR).toISOString();
    
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
        'INSERT INTO trips (id, bus_id, route_id, direction, service_type, departure_time, arrival_time, interval_min, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
        [nextId, bus_id.trim(), route.id, direction, service_type, departure_time, arrival_time, interval_min || null, 'Scheduled']
      );

      // Create trip segments for progress tracking
      const segmentsResult = await client.query(
        'SELECT id, segment_order, estimated_time_hrs FROM route_segments WHERE route_id = $1 ORDER BY segment_order',
        [route.id]
      );

      if (segmentsResult.rows.length > 0) {
        let cumulativeTime = new Date(departure_time).getTime();
        
        for (const segment of segmentsResult.rows) {
          cumulativeTime += segment.estimated_time_hrs * MILLISECONDS_PER_HOUR;
          const scheduledArrival = new Date(cumulativeTime).toISOString();
          
          await client.query(
            'INSERT INTO trip_segments (trip_id, segment_id, scheduled_arrival_time) VALUES ($1, $2, $3)',
            [nextId, segment.id, scheduledArrival]
          );
        }
      }
      
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

// Get trip location with advanced filtering - /trips/{tripId}/location
router.get('/:tripId/location', authenticate, authorize(['commuter', 'operator', 'admin']), async (req, res) => {
  const { tripId } = req.params;
  const { 
    // Advanced filters for location data
    progress_gt, progress_lt, current_segment, estimated_delay_gt
  } = req.query;

  // Input validation
  if (!tripId || typeof tripId !== 'string' || !tripId.trim()) {
    return res.status(400).json({ error: 'Invalid trip ID' });
  }

  try {
    // Try Redis cache first
    const { redisClient } = require('../config/database');
    const cached = await redisClient.get(`location:${tripId}`);
    if (cached) {
      const location = JSON.parse(cached);
      
      // Enhance with segment information if available
      if (location.current_segment_id) {
        const segmentQuery = `
          SELECT rs.from_location, rs.to_location, rs.distance_km, rs.estimated_time_hrs
          FROM route_segments rs 
          WHERE rs.id = $1
        `;
        const segmentResult = await pool.query(segmentQuery, [location.current_segment_id]);
        
        if (segmentResult.rows.length > 0) {
          const segment = segmentResult.rows[0];
          
          // Calculate estimated delay
          const tripQuery = `
            SELECT t.departure_time, t.arrival_time, r.estimated_time_hrs as total_estimated_time
            FROM trips t 
            JOIN routes r ON t.route_id = r.id 
            WHERE t.id = $1
          `;
          const tripResult = await pool.query(tripQuery, [tripId]);
          
          let estimatedDelay = 0;
          if (tripResult.rows.length > 0) {
            const trip = tripResult.rows[0];
            const scheduledTime = new Date(trip.departure_time).getTime();
            const currentTime = new Date(location.timestamp).getTime();
            const elapsedHours = (currentTime - scheduledTime) / (1000 * 60 * 60);
            const expectedProgress = (elapsedHours / trip.total_estimated_time) * 100;
            
            // Simple delay calculation based on expected vs actual progress
            const actualProgress = location.segment_progress_percentage || 0;
            estimatedDelay = Math.round((expectedProgress - actualProgress) * (trip.total_estimated_time / 100) * 60); // in minutes
          }
          
          location.current_segment = {
            from_location: segment.from_location,
            to_location: segment.to_location,
            progress_percentage: location.segment_progress_percentage || 0,
            progress_description: `${location.segment_progress_percentage || 0}% on ${segment.from_location}-${segment.to_location}`,
            estimated_delay_minutes: estimatedDelay
          };
        }
      }

      // Apply advanced filters
      let shouldInclude = true;
      
      if (progress_gt && location.segment_progress_percentage !== undefined) {
        const progressThreshold = parseFloat(progress_gt);
        if (!isNaN(progressThreshold) && location.segment_progress_percentage <= progressThreshold) {
          shouldInclude = false;
        }
      }
      
      if (progress_lt && location.segment_progress_percentage !== undefined) {
        const progressThreshold = parseFloat(progress_lt);
        if (!isNaN(progressThreshold) && location.segment_progress_percentage >= progressThreshold) {
          shouldInclude = false;
        }
      }
      
      if (current_segment && location.current_segment) {
        const segmentName = current_segment.toLowerCase();
        const segmentDesc = location.current_segment.progress_description.toLowerCase();
        if (!segmentDesc.includes(segmentName)) {
          shouldInclude = false;
        }
      }
      
      if (estimated_delay_gt && location.current_segment && location.current_segment.estimated_delay_minutes !== undefined) {
        const delayThreshold = parseFloat(estimated_delay_gt);
        if (!isNaN(delayThreshold) && location.current_segment.estimated_delay_minutes <= delayThreshold) {
          shouldInclude = false;
        }
      }
      
      if (!shouldInclude) {
        return res.status(404).json({ error: 'Location data does not match filter criteria' });
      }
      
      return res.json(location);
    }
    res.status(404).json({ error: 'No location data available' });
  } catch (err) {
    console.error('Trip location fetch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;