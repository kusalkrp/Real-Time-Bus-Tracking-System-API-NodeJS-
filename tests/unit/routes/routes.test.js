const request = require('supertest');
const express = require('express');
const routesRouter = require('../../../routes/routes');

// Mock the database
jest.mock('../../../config/database', () => ({
  pool: {
    query: jest.fn()
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

describe('Routes Routes', () => {
  let app;
  let mockPoolQuery;

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

    app = express();
    app.use(express.json());
    app.use('/routes', routesRouter);
  });

  afterEach(() => {
    // Restore console.error
    console.error.mockRestore();
  });

  describe('GET /routes', () => {
    it('should return routes with pagination', async () => {
      const mockRoutes = [
        { id: 1, from_city: 'Colombo', to_city: 'Kandy', distance_km: 115, estimated_time_hrs: 3 }
      ];

      mockPoolQuery.mockImplementation((query, values) => {
        if (query.includes('COUNT(*)')) {
          return Promise.resolve({ rows: [{ count: '1' }] });
        }
        if (query.includes('SELECT *')) {
          return Promise.resolve({ rows: mockRoutes });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/routes?page=1&limit=20')
        .expect(200);

      expect(response.body).toHaveProperty('routes', mockRoutes);
      expect(response.body).toHaveProperty('total', 1);
      expect(response.body).toHaveProperty('page', 1);
      expect(response.body).toHaveProperty('limit', 20);
    });

    it('should filter routes by from and to cities', async () => {
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
        .get('/routes?from=Colombo&to=Kandy')
        .expect(200);

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('from_city ILIKE $1'),
        expect.arrayContaining(['%Colombo%'])
      );
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('to_city ILIKE $2'),
        expect.arrayContaining(['%Colombo%', '%Kandy%'])
      );
    });

    it('should return 500 on database error', async () => {
      mockPoolQuery.mockRejectedValue(new Error('DB Error'));

      const response = await request(app)
        .get('/routes')
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Internal server error');
    });
  });

  describe('GET /routes/:routeId', () => {
    it('should return a route by id', async () => {
      const mockRoute = { id: 1, from_city: 'Colombo', to_city: 'Kandy', distance_km: 115, estimated_time_hrs: 3 };
      mockPoolQuery.mockResolvedValue({ rows: [mockRoute] });

      const response = await request(app)
        .get('/routes/1')
        .expect(200);

      expect(response.body).toEqual(mockRoute);
    });

    it('should return 400 for invalid routeId', async () => {
      const response = await request(app)
        .get('/routes/abc')
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Invalid route ID');
    });

    it('should return 400 for negative routeId', async () => {
      const response = await request(app)
        .get('/routes/-1')
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Invalid route ID');
    });

    it('should return 404 for non-existent route', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .get('/routes/999')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Route not found');
    });
  });

  describe('POST /routes', () => {
    it('should create a new route', async () => {
      const newRoute = { id: 1, from_city: 'Colombo', to_city: 'Kandy', distance_km: 115, estimated_time_hrs: 3 };

      mockPoolQuery.mockResolvedValue({ rows: [newRoute] });

      const response = await request(app)
        .post('/routes')
        .send({ from_city: 'Colombo', to_city: 'Kandy', distance_km: 115, estimated_time_hrs: 3 })
        .expect(201);

      expect(response.body).toEqual(newRoute);
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO routes'),
        ['Colombo', 'Kandy', 115, 3]
      );
    });

    it('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/routes')
        .send({ from_city: '', to_city: 'Kandy', distance_km: 115, estimated_time_hrs: 3 })
        .expect(400);

      expect(response.body.error).toContain('from_city, to_city must be non-empty strings');
    });

    it('should return 400 for invalid distance_km', async () => {
      const response = await request(app)
        .post('/routes')
        .send({ from_city: 'Colombo', to_city: 'Kandy', distance_km: -1, estimated_time_hrs: 3 })
        .expect(400);

      expect(response.body.error).toContain('distance_km, estimated_time_hrs must be positive numbers');
    });

    it('should return 400 for invalid estimated_time_hrs', async () => {
      const response = await request(app)
        .post('/routes')
        .send({ from_city: 'Colombo', to_city: 'Kandy', distance_km: 115, estimated_time_hrs: 0 })
        .expect(400);

      expect(response.body.error).toContain('distance_km, estimated_time_hrs must be positive numbers');
    });

    it('should return 409 for duplicate route', async () => {
      const error = new Error('Duplicate');
      error.code = '23505';
      mockPoolQuery.mockRejectedValue(error);

      const response = await request(app)
        .post('/routes')
        .send({ from_city: 'Colombo', to_city: 'Kandy', distance_km: 115, estimated_time_hrs: 3 })
        .expect(409);

      expect(response.body).toHaveProperty('error', 'Route already exists');
    });
  });

  describe('PUT /routes/:routeId', () => {
    it('should update route fields', async () => {
      const updatedRoute = { id: 1, from_city: 'Colombo', to_city: 'Galle', distance_km: 120, estimated_time_hrs: 3.5 };

      mockPoolQuery.mockResolvedValue({ rows: [updatedRoute] });

      const response = await request(app)
        .put('/routes/1')
        .send({ to_city: 'Galle', distance_km: 120, estimated_time_hrs: 3.5 })
        .expect(200);

      expect(response.body).toEqual(updatedRoute);
    });

    it('should return 400 for invalid routeId', async () => {
      const response = await request(app)
        .put('/routes/0')
        .send({ distance_km: 120 })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Invalid route ID');
    });

    it('should return 400 when no fields provided', async () => {
      const response = await request(app)
        .put('/routes/1')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error', 'At least one field must be provided for update');
    });

    it('should return 400 for invalid field values', async () => {
      const response = await request(app)
        .put('/routes/1')
        .send({ from_city: '', distance_km: 0 })
        .expect(400);

      expect(response.body.error).toContain('Invalid field values');
    });

    it('should return 404 for non-existent route', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .put('/routes/999')
        .send({ distance_km: 120 })
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Route not found');
    });

    it('should return 409 for duplicate route on update', async () => {
      const error = new Error('Duplicate');
      error.code = '23505';
      mockPoolQuery.mockRejectedValue(error);

      const response = await request(app)
        .put('/routes/1')
        .send({ from_city: 'Colombo', to_city: 'Kandy' })
        .expect(409);

      expect(response.body).toHaveProperty('error', 'Route with these cities already exists');
    });
  });

  describe('DELETE /routes/:routeId', () => {
    it('should delete a route', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [{ id: 1 }] });

      const response = await request(app)
        .delete('/routes/1')
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Route deleted successfully');
    });

    it('should return 400 for invalid routeId', async () => {
      const response = await request(app)
        .delete('/routes/invalid')
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Invalid route ID');
    });

    it('should return 404 for non-existent route', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .delete('/routes/999')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Route not found');
    });
  });
});