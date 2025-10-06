const request = require('supertest');
const express = require('express');
const tripsRouter = require('../../../routes/trips');

// Mock the database
jest.mock('../../../config/database', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(() => ({
      query: jest.fn(),
      release: jest.fn()
    }))
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

const { pool } = require('../../../config/database');

describe('Trips Routes', () => {
  let app;
  let mockPoolQuery;
  let mockConnect;
  let mockClient;

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
    mockConnect = pool.connect;
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };
    mockConnect.mockResolvedValue(mockClient);

    app = express();
    app.use(express.json());
    app.use('/trips', tripsRouter);
  });

  afterEach(() => {
    // Restore console.error
    console.error.mockRestore();
  });

  describe('GET /trips/routes/:routeId/trips', () => {
    it('should return trips for a route with pagination', async () => {
      const mockTrips = [
        { id: 'TRIP001', bus_id: 'BUS001', route_id: 1, departure_time: '2025-10-02T10:00:00Z', status: 'Scheduled' }
      ];

      mockPoolQuery.mockImplementation((query, values) => {
        if (query.includes('COUNT(*)')) {
          return Promise.resolve({ rows: [{ count: '1' }] });
        }
        if (query.includes('SELECT t.*')) {
          return Promise.resolve({ rows: mockTrips });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/trips/routes/1/trips?page=1&limit=20')
        .expect(200);

      expect(response.body).toHaveProperty('trips', mockTrips);
      expect(response.body).toHaveProperty('total', 1);
      expect(response.body).toHaveProperty('page', 1);
      expect(response.body).toHaveProperty('limit', 20);
    });

    it('should filter trips by date range', async () => {
      mockPoolQuery.mockImplementation((query, values) => {
        if (query.includes('COUNT(*)')) {
          return Promise.resolve({ rows: [{ count: '0' }] });
        }
        if (query.includes('SELECT t.*')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/trips/routes/1/trips?startDate=2025-10-01T00:00:00Z&endDate=2025-10-03T00:00:00Z')
        .expect(200);

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('departure_time >= $2'),
        expect.arrayContaining([1, '2025-10-01T00:00:00Z'])
      );
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('departure_time <= $3'),
        expect.arrayContaining([1, '2025-10-01T00:00:00Z', '2025-10-03T00:00:00Z'])
      );
    });

    it('should filter by operator for operator role', async () => {
      // Mock operator user
      const { authenticate } = require('../../../middleware/auth');
      authenticate.mockImplementation((req, res, next) => {
        req.user = { id: 2, role: 'operator', operatorId: 'op1' };
        next();
      });

      mockPoolQuery.mockImplementation((query, values) => {
        if (query.includes('COUNT(*)')) {
          return Promise.resolve({ rows: [{ count: '0' }] });
        }
        if (query.includes('SELECT t.*')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/trips/routes/1/trips')
        .expect(200);

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('b.operator_id = $2'),
        expect.arrayContaining([1, 'op1'])
      );
    });

    it('should return 400 for invalid routeId', async () => {
      const response = await request(app)
        .get('/trips/routes/0/trips')
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Invalid route ID');
    });

    it('should sanitize pagination parameters', async () => {
      mockPoolQuery.mockImplementation((query, values) => {
        if (query.includes('COUNT(*)')) {
          return Promise.resolve({ rows: [{ count: '0' }] });
        }
        if (query.includes('SELECT t.*')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/trips/routes/1/trips?page=-1&limit=200')
        .expect(200);

      expect(response.body.page).toBe(1);
      expect(response.body.limit).toBe(100);
    });
  });

  describe('GET /trips/:tripId', () => {
    it('should return a trip by id', async () => {
      const mockTrip = { id: 'TRIP001', bus_id: 'BUS001', route_id: 1, departure_time: '2025-10-02T10:00:00Z', status: 'Scheduled' };
      mockPoolQuery.mockResolvedValue({ rows: [mockTrip] });

      const response = await request(app)
        .get('/trips/TRIP001')
        .expect(200);

      expect(response.body).toEqual(mockTrip);
    });

    it('should filter by operator ownership for operator role', async () => {
      // Mock operator user
      const { authenticate } = require('../../../middleware/auth');
      authenticate.mockImplementation((req, res, next) => {
        req.user = { id: 2, role: 'operator', operatorId: 'op1' };
        next();
      });

      const mockTrip = { id: 'TRIP001', bus_id: 'BUS001', route_id: 1, departure_time: '2025-10-02T10:00:00Z', status: 'Scheduled' };
      mockPoolQuery.mockResolvedValue({ rows: [mockTrip] });

      const response = await request(app)
        .get('/trips/TRIP001')
        .expect(200);

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('INNER JOIN buses b ON t.bus_id = b.id WHERE t.id = $1 AND b.operator_id = $2'),
        ['TRIP001', 'op1']
      );
    });

    it('should return 404 for non-existent trip', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .get('/trips/TRIP999')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Trip not found');
    });
  });

  describe('POST /trips', () => {
    it('should create a new trip for admin', async () => {
      const newTrip = {
        id: 'TRIP001',
        bus_id: 'BUS001',
        route_id: 1,
        departure_time: '2025-10-02T10:00:00Z',
        arrival_time: '2025-10-02T13:00:00Z',
        status: 'Scheduled'
      };

      // Mock bus and route existence
      mockPoolQuery.mockImplementation((query, values) => {
        if (query.includes('SELECT operator_id FROM buses')) {
          return Promise.resolve({ rows: [{ operator_id: 'admin' }] });
        }
        if (query.includes('SELECT estimated_time_hrs FROM routes')) {
          return Promise.resolve({ rows: [{ estimated_time_hrs: 3 }] });
        }
        return Promise.resolve({ rows: [] });
      });

      // Mock transaction
      mockClient.query.mockImplementation((query) => {
        if (query === 'BEGIN') return Promise.resolve();
        if (query === 'COMMIT') return Promise.resolve();
        if (query.includes('ORDER BY id DESC')) {
          return Promise.resolve({ rows: [] }); // No existing trips
        }
        if (query.includes('INSERT INTO trips')) {
          return Promise.resolve({ rows: [newTrip] });
        }
        return Promise.resolve();
      });

      const response = await request(app)
        .post('/trips')
        .send({ bus_id: 'BUS001', route_id: 1, departure_time: '2025-10-02T10:00:00Z' })
        .expect(201);

      expect(response.body).toEqual(newTrip);
    });

    it('should create trip for operator with owned bus', async () => {
      // Mock operator user
      const { authenticate } = require('../../../middleware/auth');
      authenticate.mockImplementation((req, res, next) => {
        req.user = { id: 2, role: 'operator', operatorId: 'op1' };
        next();
      });

      const newTrip = {
        id: 'TRIP001',
        bus_id: 'BUS001',
        route_id: 1,
        departure_time: '2025-10-02T10:00:00Z',
        arrival_time: '2025-10-02T13:00:00Z',
        status: 'Scheduled'
      };

      mockPoolQuery.mockImplementation((query, values) => {
        if (query.includes('SELECT operator_id FROM buses')) {
          return Promise.resolve({ rows: [{ operator_id: 'op1' }] }); // Operator owns the bus
        }
        if (query.includes('SELECT estimated_time_hrs FROM routes')) {
          return Promise.resolve({ rows: [{ estimated_time_hrs: 3 }] });
        }
        return Promise.resolve({ rows: [] });
      });

      mockClient.query.mockImplementation((query) => {
        if (query === 'BEGIN') return Promise.resolve();
        if (query === 'COMMIT') return Promise.resolve();
        if (query.includes('ORDER BY id DESC')) {
          return Promise.resolve({ rows: [] });
        }
        if (query.includes('INSERT INTO trips')) {
          return Promise.resolve({ rows: [newTrip] });
        }
        return Promise.resolve();
      });

      const response = await request(app)
        .post('/trips')
        .send({ bus_id: 'BUS001', route_id: 1, departure_time: '2025-10-02T10:00:00Z' })
        .expect(201);

      expect(response.body.bus_id).toBe('BUS001');
    });

    it('should return 400 for invalid input', async () => {
      const response = await request(app)
        .post('/trips')
        .send({ bus_id: '', route_id: -1, departure_time: 'invalid' })
        .expect(400);

      expect(response.body.error).toContain('Missing or invalid required fields');
    });

    it('should return 404 for non-existent bus', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] }); // No bus found

      const response = await request(app)
        .post('/trips')
        .send({ bus_id: 'BUS999', route_id: 1, departure_time: '2025-10-02T10:00:00Z' })
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Bus not found');
    });

    it('should return 404 for non-existent route', async () => {
      mockPoolQuery.mockImplementation((query, values) => {
        if (query.includes('SELECT operator_id FROM buses')) {
          return Promise.resolve({ rows: [{ operator_id: 'admin' }] });
        }
        if (query.includes('SELECT estimated_time_hrs FROM routes')) {
          return Promise.resolve({ rows: [] }); // No route found
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .post('/trips')
        .send({ bus_id: 'BUS001', route_id: 999, departure_time: '2025-10-02T10:00:00Z' })
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Route not found');
    });

    it('should return 403 for operator not owning the bus', async () => {
      // Mock operator user
      const { authenticate } = require('../../../middleware/auth');
      authenticate.mockImplementation((req, res, next) => {
        req.user = { id: 2, role: 'operator', operatorId: 'op1' };
        next();
      });

      mockPoolQuery.mockImplementation((query, values) => {
        if (query.includes('SELECT operator_id FROM buses')) {
          return Promise.resolve({ rows: [{ operator_id: 'op2' }] }); // Different operator
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .post('/trips')
        .send({ bus_id: 'BUS001', route_id: 1, departure_time: '2025-10-02T10:00:00Z' })
        .expect(403);

      expect(response.body).toHaveProperty('error', 'Unauthorized: You do not own this bus');
    });

    it('should return 409 for duplicate trip', async () => {
      mockPoolQuery.mockImplementation((query, values) => {
        if (query.includes('SELECT operator_id FROM buses')) {
          return Promise.resolve({ rows: [{ operator_id: 'admin' }] });
        }
        if (query.includes('SELECT estimated_time_hrs FROM routes')) {
          return Promise.resolve({ rows: [{ estimated_time_hrs: 3 }] });
        }
        return Promise.resolve({ rows: [] });
      });

      mockClient.query.mockImplementation((query) => {
        if (query === 'BEGIN') return Promise.resolve();
        if (query === 'COMMIT') return Promise.resolve();
        if (query === 'ROLLBACK') return Promise.resolve();
        if (query.includes('ORDER BY id DESC')) {
          return Promise.resolve({ rows: [] });
        }
        if (query.includes('INSERT INTO trips')) {
          const error = new Error('Duplicate');
          error.code = '23505';
          return Promise.reject(error);
        }
        return Promise.resolve();
      });

      const response = await request(app)
        .post('/trips')
        .send({ bus_id: 'BUS001', route_id: 1, departure_time: '2025-10-02T10:00:00Z' })
        .expect(409);

      expect(response.body).toHaveProperty('error', 'Trip with this bus and departure time already exists');
    });
  });

  describe('PUT /trips/:tripId', () => {
    it('should update trip status', async () => {
      const updatedTrip = { id: 'TRIP001', status: 'In Progress' };

      mockPoolQuery.mockResolvedValue({ rows: [updatedTrip] });

      const response = await request(app)
        .put('/trips/TRIP001')
        .send({ status: 'In Progress' })
        .expect(200);

      expect(response.body).toEqual(updatedTrip);
    });

    it('should return 400 for invalid status', async () => {
      const response = await request(app)
        .put('/trips/TRIP001')
        .send({ status: 'Invalid' })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Status must be one of: Scheduled, In Progress, Completed, Delayed, Cancelled');
    });

    it('should return 403 for operator not owning the trip', async () => {
      // Mock operator user
      const { authenticate } = require('../../../middleware/auth');
      authenticate.mockImplementation((req, res, next) => {
        req.user = { id: 2, role: 'operator', operatorId: 'op1' };
        next();
      });

      mockPoolQuery.mockResolvedValue({ rows: [{ operator_id: 'op2' }] }); // Different operator

      const response = await request(app)
        .put('/trips/TRIP001')
        .send({ status: 'Completed' })
        .expect(403);

      expect(response.body).toHaveProperty('error', 'Unauthorized: You do not own this trip');
    });

    it('should return 404 for non-existent trip', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .put('/trips/TRIP999')
        .send({ status: 'Completed' })
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Trip not found');
    });
  });

  describe('DELETE /trips/:tripId', () => {
    it('should delete a trip', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [{ id: 'TRIP001' }] });

      const response = await request(app)
        .delete('/trips/TRIP001')
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Trip deleted successfully');
    });

    it('should return 403 for operator not owning the trip', async () => {
      // Mock operator user
      const { authenticate } = require('../../../middleware/auth');
      authenticate.mockImplementation((req, res, next) => {
        req.user = { id: 2, role: 'operator', operatorId: 'op1' };
        next();
      });

      mockPoolQuery.mockResolvedValue({ rows: [{ operator_id: 'op2' }] }); // Different operator

      const response = await request(app)
        .delete('/trips/TRIP001')
        .expect(403);

      expect(response.body).toHaveProperty('error', 'Unauthorized: You do not own this trip');
    });

    it('should return 404 for non-existent trip', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .delete('/trips/TRIP999')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Trip not found');
    });
  });
});