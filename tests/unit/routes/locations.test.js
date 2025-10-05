const request = require('supertest');
const express = require('express');
const locationsRouter = require('../../../routes/locations');

// Mock the database and Redis
jest.mock('../../../config/database', () => ({
  pool: {
    query: jest.fn()
  },
  redisClient: {
    get: jest.fn(),
    set: jest.fn()
  }
}));

// Mock the auth middleware
jest.mock('../../../middleware/auth', () => ({
  authenticate: jest.fn((req, res, next) => {
    req.user = { id: 1, role: 'admin' }; // Default to admin
    next();
  }),
  authorize: (roles) => (req, res, next) => next() // Always allow for route testing
}));

const { pool, redisClient } = require('../../../config/database');

describe('Locations Routes', () => {
  let app;
  let mockPoolQuery;
  let mockRedisGet;
  let mockRedisSet;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock console.error to prevent cluttering test output
    jest.spyOn(console, 'error').mockImplementation(() => {});

    // Reset authenticate mock after clearAllMocks
    const { authenticate } = require('../../../middleware/auth');
    authenticate.mockImplementation((req, res, next) => {
      req.user = { id: 1, role: 'admin' };
      next();
    });

    mockPoolQuery = pool.query;
    mockRedisGet = redisClient.get;
    mockRedisSet = redisClient.set;

    app = express();
    app.use(express.json());
    app.use('/locations', locationsRouter);
  });  afterEach(() => {
    // Restore console.error
    console.error.mockRestore();
  });

  describe('GET /locations/trips/:tripId/location', () => {
    it('should return cached location data', async () => {
      const mockLocation = {
        tripId: 'TRIP001',
        busId: 'BUS001',
        latitude: 6.9271,
        longitude: 79.8612,
        timestamp: '2025-10-02T10:00:00Z',
        speed_kmh: 45
      };

      mockRedisGet.mockResolvedValue(JSON.stringify(mockLocation));

      const response = await request(app)
        .get('/locations/trips/TRIP001/location')
        .expect(200);

      expect(response.body).toEqual(mockLocation);
      expect(mockRedisGet).toHaveBeenCalledWith('location:TRIP001');
    });

    it('should return 404 when no cached location', async () => {
      mockRedisGet.mockResolvedValue(null);

      const response = await request(app)
        .get('/locations/trips/TRIP001/location')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'No location data available');
    });

    it('should return 500 on Redis error', async () => {
      mockRedisGet.mockRejectedValue(new Error('Redis error'));

      const response = await request(app)
        .get('/locations/trips/TRIP001/location')
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Internal server error');
    });
  });

  describe('POST /locations/buses/:busId/location', () => {
    beforeEach(() => {
      // Mock operator user
      const { authenticate } = require('../../../middleware/auth');
      authenticate.mockImplementation((req, res, next) => {
        req.user = { id: 2, role: 'operator', operatorId: 'op1' };
        next();
      });
    });

    it('should update bus location successfully', async () => {
      const locationData = {
        latitude: 6.9271,
        longitude: 79.8612,
        speed_kmh: 45
      };

      mockPoolQuery.mockImplementation((query, values) => {
        if (query.includes('SELECT * FROM buses')) {
          return Promise.resolve({ rows: [{ id: 'BUS001', operator_id: 'op1' }] });
        }
        if (query.includes('SELECT id FROM trips')) {
          return Promise.resolve({ rows: [{ id: 'TRIP001' }] });
        }
        if (query.includes('INSERT INTO locations')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      mockRedisSet.mockResolvedValue('OK');

      const response = await request(app)
        .post('/locations/buses/BUS001/location')
        .send(locationData)
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Location updated successfully');
      expect(response.body.location).toMatchObject({
        tripId: 'TRIP001',
        busId: 'BUS001',
        latitude: 6.9271,
        longitude: 79.8612,
        speed_kmh: 45
      });
    });

    it('should return 400 for invalid location data', async () => {
      const response = await request(app)
        .post('/locations/buses/BUS001/location')
        .send({ latitude: 91, longitude: 79.8612 }) // Invalid latitude
        .expect(400);

      expect(response.body.error).toContain('latitude must be between -90 and 90');
    });

    it('should return 403 for operator not owning the bus', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] }); // No bus found for operator

      const response = await request(app)
        .post('/locations/buses/BUS001/location')
        .send({ latitude: 6.9271, longitude: 79.8612 })
        .expect(403);

      expect(response.body).toHaveProperty('error', 'Unauthorized: You do not own this bus');
    });

    it('should return 400 when no active trip', async () => {
      mockPoolQuery.mockImplementation((query, values) => {
        if (query.includes('SELECT * FROM buses')) {
          return Promise.resolve({ rows: [{ id: 'BUS001', operator_id: 'op1' }] });
        }
        if (query.includes('SELECT id FROM trips')) {
          return Promise.resolve({ rows: [] }); // No active trip
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .post('/locations/buses/BUS001/location')
        .send({ latitude: 6.9271, longitude: 79.8612 })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'No active trip for this bus');
    });

    it('should handle speed_kmh as 0 when not provided', async () => {
      mockPoolQuery.mockImplementation((query, values) => {
        if (query.includes('SELECT * FROM buses')) {
          return Promise.resolve({ rows: [{ id: 'BUS001', operator_id: 'op1' }] });
        }
        if (query.includes('SELECT id FROM trips')) {
          return Promise.resolve({ rows: [{ id: 'TRIP001' }] });
        }
        if (query.includes('INSERT INTO locations')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      mockRedisSet.mockResolvedValue('OK');

      const response = await request(app)
        .post('/locations/buses/BUS001/location')
        .send({ latitude: 6.9271, longitude: 79.8612 }) // No speed_kmh
        .expect(200);

      expect(response.body.location.speed_kmh).toBe(0);
    });
  });

  describe('GET /locations/buses/:busId/locations/history', () => {
    it('should return location history for admin', async () => {
      const mockLocations = [
        {
          trip_id: 'TRIP001',
          bus_id: 'BUS001',
          latitude: 6.9271,
          longitude: 79.8612,
          speed_kmh: 45,
          timestamp: '2025-10-02T10:00:00Z'
        }
      ];

      mockPoolQuery.mockImplementation((query, values) => {
        if (query.includes('COUNT(*)')) {
          return Promise.resolve({ rows: [{ count: '1' }] });
        }
        if (query.includes('SELECT *')) {
          return Promise.resolve({ rows: mockLocations });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/locations/buses/BUS001/locations/history?page=1&limit=20')
        .expect(200);

      expect(response.body).toHaveProperty('locations', mockLocations);
      expect(response.body).toHaveProperty('total', 1);
      expect(response.body).toHaveProperty('page', 1);
      expect(response.body).toHaveProperty('limit', 20);
    });

    it('should filter by date for admin', async () => {
      mockPoolQuery.mockImplementation((query, values) => {
        if (query.includes('COUNT(*)')) {
          return Promise.resolve({ rows: [{ count: '0' }] });
        }
        if (query.includes('SELECT *')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/locations/buses/BUS001/locations/history?from=2025-10-01T00:00:00Z')
        .expect(200);

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('timestamp >= $2'),
        expect.arrayContaining(['BUS001', '2025-10-01T00:00:00Z'])
      );
    });

    it('should return 403 for operator not owning the bus', async () => {
      // Mock operator user
      const { authenticate } = require('../../../middleware/auth');
      authenticate.mockImplementation((req, res, next) => {
        req.user = { id: 2, role: 'operator', operatorId: 'op1' };
        next();
      });

      mockPoolQuery.mockResolvedValue({ rows: [] }); // No bus found for operator

      const response = await request(app)
        .get('/locations/buses/BUS001/locations/history')
        .expect(403);

      expect(response.body).toHaveProperty('error', 'Unauthorized: You do not own this bus');
    });

    it('should sanitize pagination parameters', async () => {
      mockPoolQuery.mockImplementation((query, values) => {
        if (query.includes('COUNT(*)')) {
          return Promise.resolve({ rows: [{ count: '0' }] });
        }
        if (query.includes('SELECT *')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/locations/buses/BUS001/locations/history?page=-1&limit=200')
        .expect(200);

      expect(response.body.page).toBe(1); // Should be sanitized to 1
      expect(response.body.limit).toBe(100); // Should be sanitized to 100 (max)
    });
  });
});