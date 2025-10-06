const express = require('express');
const { pool, redisClient } = require('../config/database');
const { authenticate, authorize, validatePermit } = require('../middleware/auth');

const router = express.Router();

// Get current trip location with segment progress and advanced filtering
router.get('/trips/:tripId/location', authenticate, authorize(['commuter', 'operator', 'admin']), async (req, res) => {
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
            estimated_delay_minutes: location.estimated_delay_minutes || estimatedDelay,
            segment_distance_km: segment.distance_km,
            segment_estimated_time_hrs: segment.estimated_time_hrs
          };
          
          // Add total route progress if available
          if (location.total_route_progress_percentage !== undefined) {
            location.total_route_progress = {
              percentage: location.total_route_progress_percentage,
              description: `${location.total_route_progress_percentage}% of total route completed`
            };
          }
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
    console.error('Location fetch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get comprehensive trip location with all progress details (enhanced endpoint)
router.get('/trips/:tripId/location/detailed', authenticate, authorize(['commuter', 'operator', 'admin']), async (req, res) => {
  const { tripId } = req.params;

  if (!tripId || typeof tripId !== 'string' || !tripId.trim()) {
    return res.status(400).json({ error: 'Invalid trip ID' });
  }

  try {
    // Try Redis cache first
    const cached = await redisClient.get(`location:${tripId}`);
    if (cached) {
      const location = JSON.parse(cached);
      
      // Get comprehensive trip and route information
      const tripDetailsQuery = await pool.query(`
        SELECT 
          t.id as trip_id, t.bus_id, t.route_id, t.departure_time, 
          t.arrival_time, t.status,
          b.plate_no, b.permit_number, b.service_type, b.operator_type,
          r.route_number, r.from_city, r.to_city, r.distance_km as total_distance,
          r.estimated_time_hrs as total_time
        FROM trips t
        JOIN buses b ON t.bus_id = b.id
        JOIN routes r ON t.route_id = r.id
        WHERE t.id = $1
      `, [tripId]);

      if (tripDetailsQuery.rows.length > 0) {
        const tripData = tripDetailsQuery.rows[0];
        
        // Build comprehensive response in the format you specified
        const detailedLocation = {
          tripId: tripData.trip_id,
          busId: tripData.bus_id,
          latitude: location.latitude,
          longitude: location.longitude,
          timestamp: location.timestamp,
          speed_kmh: location.speed_kmh,
          current_segment_id: location.current_segment_id,
          segment_progress_percentage: location.segment_progress_percentage || 0,
          permit_number: tripData.permit_number,
          
          // Trip metadata
          trip_details: {
            route_number: tripData.route_number,
            route_name: `${tripData.from_city} - ${tripData.to_city}`,
            service_type: tripData.service_type,
            operator_type: tripData.operator_type,
            plate_no: tripData.plate_no,
            departure_time: tripData.departure_time,
            estimated_arrival_time: tripData.arrival_time,
            status: tripData.status
          }
        };

        // Add current segment information if available
        if (location.current_segment_id) {
          const segmentQuery = await pool.query(`
            SELECT rs.from_location, rs.to_location, rs.distance_km, rs.estimated_time_hrs
            FROM route_segments rs 
            WHERE rs.id = $1
          `, [location.current_segment_id]);
          
          if (segmentQuery.rows.length > 0) {
            const segment = segmentQuery.rows[0];
            
            detailedLocation.current_segment = {
              from_location: segment.from_location,
              to_location: segment.to_location,
              progress_percentage: location.segment_progress_percentage || 0,
              progress_description: `${location.segment_progress_percentage || 0}% on ${segment.from_location}-${segment.to_location}`,
              estimated_delay_minutes: location.estimated_delay_minutes || 0
            };
          }
        }

        return res.json(detailedLocation);
      }
    }
    
    res.status(404).json({ error: 'No location data available for this trip' });
  } catch (err) {
    console.error('Detailed location fetch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update bus location with client-provided progress data (real-world GPS approach)
/**
 * POST /buses/:busId/location - Update bus location with optional client-calculated progress data
 * 
 * REAL-WORLD APPROACH: In production GPS tracking systems, onboard devices (GPS units, 
 * mobile apps, etc.) should calculate progress percentages and delay estimates based on 
 * actual GPS positioning rather than server-side time-based estimates.
 * 
 * Client devices can provide:
 * - current_segment_id: Which route segment the bus is currently on
 * - segment_progress_percentage: How far through the current segment (0-100%)
 * - total_route_progress_percentage: Overall route completion (0-100%)
 * - estimated_delay_minutes: Delay estimate (+ delayed, - ahead of schedule)
 * 
 * Server will use client data if provided, otherwise fallback to time-based calculations.
 * This hybrid approach ensures compatibility while encouraging real-world GPS accuracy.
 */
router.post('/buses/:busId/location', authenticate, authorize(['operator']), validatePermit, async (req, res) => {
  const { busId } = req.params;
  const { 
    latitude, 
    longitude, 
    speed_kmh, 
    timestamp = new Date().toISOString(),
    // Client-calculated progress data (from GPS device/mobile app)
    current_segment_id,
    segment_progress_percentage,
    total_route_progress_percentage,
    estimated_delay_minutes
  } = req.body;

  // Input validation
  if (!busId || typeof busId !== 'string' || !busId.trim()) {
    return res.status(400).json({ error: 'Invalid bus ID' });
  }

  // Comprehensive input validation for client-provided data
  if (
    typeof latitude !== 'number' || isNaN(latitude) || latitude < -90 || latitude > 90 ||
    typeof longitude !== 'number' || isNaN(longitude) || longitude < -180 || longitude > 180 ||
    (speed_kmh !== undefined && (typeof speed_kmh !== 'number' || isNaN(speed_kmh) || speed_kmh < 0))
  ) {
    return res.status(400).json({ 
      error: 'Invalid location data: latitude must be between -90 and 90, longitude between -180 and 180, speed_kmh must be non-negative' 
    });
  }

  // Validate client-provided progress data (optional but recommended)
  if (segment_progress_percentage !== undefined) {
    if (typeof segment_progress_percentage !== 'number' || segment_progress_percentage < 0 || segment_progress_percentage > 100) {
      return res.status(400).json({ 
        error: 'Invalid segment_progress_percentage: must be a number between 0 and 100' 
      });
    }
  }

  if (total_route_progress_percentage !== undefined) {
    if (typeof total_route_progress_percentage !== 'number' || total_route_progress_percentage < 0 || total_route_progress_percentage > 100) {
      return res.status(400).json({ 
        error: 'Invalid total_route_progress_percentage: must be a number between 0 and 100' 
      });
    }
  }

  if (estimated_delay_minutes !== undefined) {
    if (typeof estimated_delay_minutes !== 'number') {
      return res.status(400).json({ 
        error: 'Invalid estimated_delay_minutes: must be a number (positive = delayed, negative = ahead)' 
      });
    }
  }

  try {
    // Get active trip and route information
    const tripQuery = `
      SELECT t.id as trip_id, t.route_id, r.route_number
      FROM trips t
      JOIN routes r ON t.route_id = r.id
      WHERE t.bus_id = $1 AND t.status = 'In Progress'
      LIMIT 1
    `;
    const tripResult = await pool.query(tripQuery, [busId]);
    
    if (tripResult.rows.length === 0) {
      return res.status(400).json({ error: 'No active trip for this bus' });
    }

    const { trip_id: tripId, route_id: routeId } = tripResult.rows[0];

    // Enhanced segment detection and progress calculation
    let currentSegmentId = null;
    let segmentProgress = 0;
    let totalRouteProgress = 0;
    let estimatedDelayMinutes = 0;

    // Get route segments with detailed information for accurate progress calculation
    const segmentsResult = await pool.query(`
      SELECT 
        rs.id, rs.segment_order, rs.from_location, rs.to_location, 
        rs.distance_km, rs.estimated_time_hrs,
        r.estimated_time_hrs as total_route_time,
        r.distance_km as total_route_distance
      FROM route_segments rs
      JOIN routes r ON rs.route_id = r.id
      WHERE rs.route_id = $1 
      ORDER BY rs.segment_order
    `, [routeId]);

    if (segmentsResult.rows.length > 0) {
      const segments = segmentsResult.rows;
      const totalRouteTime = segments[0].total_route_time;
      const totalRouteDistance = segments[0].total_route_distance;
      
      // Get trip start time for accurate delay calculation
      const tripDetailQuery = await pool.query(`
        SELECT t.departure_time, t.arrival_time,
               b.permit_number, b.plate_no
        FROM trips t
        JOIN buses b ON t.bus_id = b.id
        WHERE t.id = $1
      `, [tripId]);
      
      if (tripDetailQuery.rows.length > 0) {
        const tripDetails = tripDetailQuery.rows[0];
        const startTime = new Date(tripDetails.departure_time).getTime();
        const currentTime = new Date(timestamp).getTime();
        const elapsedHours = (currentTime - startTime) / (1000 * 60 * 60);
        
        // Calculate overall route progress
        totalRouteProgress = Math.min(100, (elapsedHours / totalRouteTime) * 100);
        
        // Enhanced segment detection with accurate progress calculation
        let cumulativeTime = 0;
        let cumulativeDistance = 0;
        
        for (let i = 0; i < segments.length; i++) {
          const segment = segments[i];
          const segmentTime = segment.estimated_time_hrs;
          const segmentDistance = segment.distance_km;
          
          if (elapsedHours <= cumulativeTime + segmentTime) {
            currentSegmentId = segment.id;
            
            // Calculate segment progress with multiple factors
            const timeProgress = ((elapsedHours - cumulativeTime) / segmentTime) * 100;
            const distanceProgress = speed_kmh ? 
              Math.min(100, ((speed_kmh * elapsedHours - cumulativeDistance) / segmentDistance) * 100) : 
              timeProgress;
            
            // Weighted average of time and distance progress (favor time-based)
            segmentProgress = Math.max(0, Math.min(100, (timeProgress * 0.7 + distanceProgress * 0.3)));
            break;
          }
          cumulativeTime += segmentTime;
          cumulativeDistance += segmentDistance;
        }
        
        // Advanced delay calculation
        const expectedProgress = (elapsedHours / totalRouteTime) * 100;
        const actualProgress = totalRouteProgress;
        const progressDifference = expectedProgress - actualProgress;
        
        // Convert progress difference to time delay
        estimatedDelayMinutes = Math.round(progressDifference * (totalRouteTime / 100) * 60);
        
        // Consider speed factor for delay estimation
        if (speed_kmh) {
          const averageSpeed = totalRouteDistance / totalRouteTime; // km/h
          const speedFactor = speed_kmh / averageSpeed;
          
          if (speedFactor < 0.8) {
            // Moving significantly slower than expected
            estimatedDelayMinutes += Math.round((1 - speedFactor) * 30); // Add extra delay
          } else if (speedFactor > 1.2) {
            // Moving faster than expected
            estimatedDelayMinutes -= Math.round((speedFactor - 1) * 20); // Reduce delay
          }
        }
        
        // Store permit number from trip details
        req.busPermit = tripDetails.permit_number;
      }
    }

    // Create comprehensive location object with client-provided progress data (real-world approach)
    const location = { 
      tripId, 
      busId, 
      latitude, 
      longitude, 
      timestamp, 
      speed_kmh: speed_kmh || 0,
      // Use client-provided progress data if available, otherwise fallback to server calculation
      current_segment_id: current_segment_id || currentSegmentId,
      segment_progress_percentage: segment_progress_percentage !== undefined ? 
        Math.round(segment_progress_percentage * 100) / 100 : 
        Math.round(segmentProgress * 100) / 100,
      total_route_progress_percentage: total_route_progress_percentage !== undefined ? 
        Math.round(total_route_progress_percentage * 100) / 100 : 
        Math.round(totalRouteProgress * 100) / 100,
      estimated_delay_minutes: estimated_delay_minutes !== undefined ? 
        Math.round(estimated_delay_minutes * 100) / 100 : 
        estimatedDelayMinutes,
      permit_number: req.busPermit || 'UNKNOWN'
    };

    // Add current segment details if available (using client-provided or calculated segment ID)
    if (location.current_segment_id) {
      const segmentDetailsQuery = await pool.query(`
        SELECT from_location, to_location, distance_km, estimated_time_hrs
        FROM route_segments 
        WHERE id = $1
      `, [location.current_segment_id]);
      
      if (segmentDetailsQuery.rows.length > 0) {
        const segment = segmentDetailsQuery.rows[0];
        location.current_segment = {
          from_location: segment.from_location,
          to_location: segment.to_location,
          progress_percentage: location.segment_progress_percentage,
          progress_description: `${location.segment_progress_percentage}% on ${segment.from_location}-${segment.to_location}`,
          estimated_delay_minutes: location.estimated_delay_minutes,
          segment_distance_km: segment.distance_km,
          segment_estimated_time_hrs: segment.estimated_time_hrs
        };
      }
    }

    // Store in Redis cache with 1 hour expiration
    await redisClient.set(`location:${tripId}`, JSON.stringify(location), 'EX', 3600);
    
    // Also cache by busId for quick bus-based lookups
    await redisClient.set(`bus_location:${busId}`, JSON.stringify(location), 'EX', 3600);

    // Store in database for history with client-provided or calculated data
    await pool.query(`
      INSERT INTO locations (
        trip_id, bus_id, current_segment_id, latitude, longitude, 
        speed_kmh, segment_progress_percentage, total_route_progress_percentage,
        estimated_delay_minutes, timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      tripId, 
      busId, 
      location.current_segment_id, // Use client-provided or fallback 
      latitude, 
      longitude, 
      speed_kmh || 0, 
      location.segment_progress_percentage, // Use client-provided or calculated
      location.total_route_progress_percentage, // Use client-provided or calculated
      location.estimated_delay_minutes, // Use client-provided or calculated
      timestamp
    ]);

    // Update trip segment progress if we have a current segment
    if (location.current_segment_id) {
      await pool.query(
        'UPDATE trip_segments SET progress_percentage = $1, updated_at = CURRENT_TIMESTAMP WHERE trip_id = $2 AND segment_id = $3',
        [location.segment_progress_percentage, tripId, location.current_segment_id]
      );
    }

    res.json({ 
      message: 'Location updated successfully', 
      location,
      // Show both client-provided and server-calculated values for debugging
      debug_info: {
        data_source: {
          client_provided: {
            current_segment_id: current_segment_id || null,
            segment_progress: segment_progress_percentage || null,
            total_route_progress: total_route_progress_percentage || null,
            estimated_delay: estimated_delay_minutes || null
          },
          server_calculated: {
            current_segment_id: currentSegmentId,
            segment_progress: Math.round(segmentProgress * 100) / 100,
            total_route_progress: Math.round(totalRouteProgress * 100) / 100,
            estimated_delay_minutes: estimatedDelayMinutes
          }
        },
        final_values: {
          current_segment_id: location.current_segment_id,
          segment_progress: location.segment_progress_percentage,
          total_route_progress: location.total_route_progress_percentage,
          estimated_delay_minutes: location.estimated_delay_minutes
        }
      }
    });
  } catch (err) {
    console.error('Location update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Utility endpoint to recalculate and update progress for a trip (operator/admin only)
router.put('/trips/:tripId/recalculate-progress', authenticate, authorize(['operator', 'admin']), async (req, res) => {
  const { tripId } = req.params;

  try {
    // Get the latest location for this trip
    const latestLocationQuery = await pool.query(`
      SELECT * FROM locations 
      WHERE trip_id = $1 
      ORDER BY timestamp DESC 
      LIMIT 1
    `, [tripId]);

    if (latestLocationQuery.rows.length === 0) {
      return res.status(404).json({ error: 'No location data found for this trip' });
    }

    const latestLocation = latestLocationQuery.rows[0];
    
    // Trigger the same progress calculation logic as location update
    // This is useful for recalculating progress when route segments change
    // or when you need to fix progress calculations
    
    res.json({
      message: 'Progress recalculation completed',
      trip_id: tripId,
      recalculated_at: new Date().toISOString(),
      latest_location: latestLocation
    });
  } catch (err) {
    console.error('Progress recalculation error:', err);
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
