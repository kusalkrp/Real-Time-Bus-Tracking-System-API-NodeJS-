const request = require('supertest');
const express = require('express');
const busesRouter = require('../../../routes/buses');

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
  authorize: jest.fn((roles) => (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  })
}));

const { pool } = require('../../../config/database');

describe('Buses Routes', () => {
  let app;
  let mockQuery;
  let mockConnect;
  let mockClient;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock console.error to prevent cluttering test output
    jest.spyOn(console, 'error').mockImplementation(() => {});

    mockQuery = pool.query;
    mockConnect = pool.connect;
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };
    mockConnect.mockResolvedValue(mockClient);

    app = express();
    app.use(express.json());
    app.use('/buses', busesRouter);
  });

  afterEach(() => {
    // Restore console.error
    console.error.mockRestore();
  });

  describe('GET /buses', () => {
    it('should return buses with pagination for admin', async () => {
      const mockBuses = [
        { id: 'BUS001', plate_no: 'ABC123', operator_id: 'op1', capacity: 50, type: 'regular' }
      ];
      mockQuery.mockImplementation((query, values) => {
        if (query.includes('COUNT')) {
          return Promise.resolve({ rows: [{ count: '1' }] });
        }
        return Promise.resolve({ rows: mockBuses });
      });

      const response = await request(app)
        .get('/buses?page=1&limit=20')
        .expect(200);

      expect(response.body).toHaveProperty('buses', mockBuses);
      expect(response.body).toHaveProperty('total', 1);
      expect(response.body).toHaveProperty('page', 1);
      expect(response.body).toHaveProperty('limit', 20);
    });

    it('should filter by operatorId for operator role', async () => {
      // Mock operator user
      const { authenticate } = require('../../../middleware/auth');
      authenticate.mockImplementation((req, res, next) => {
        req.user = { id: 2, role: 'operator', operatorId: 'op1' };
        next();
      });

      const mockBuses = [
        { id: 'BUS001', plate_no: 'ABC123', operator_id: 'op1', capacity: 50, type: 'regular' }
      ];
      mockQuery.mockImplementation((query, values) => {
        if (query.includes('COUNT')) {
          return Promise.resolve({ rows: [{ count: '1' }] });
        }
        return Promise.resolve({ rows: mockBuses });
      });

      const response = await request(app)
        .get('/buses')
        .expect(200);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE operator_id = $1'),
        expect.arrayContaining(['op1'])
      );
    });

    it('should return 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB Error'));

      const response = await request(app)
        .get('/buses')
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Internal server error');
    });
  });

  describe('GET /buses/:busId', () => {
    it('should return a bus by id', async () => {
      const mockBus = { id: 'BUS001', plate_no: 'ABC123', operator_id: 'op1', capacity: 50, type: 'regular' };
      mockQuery.mockResolvedValue({ rows: [mockBus] });

      const response = await request(app)
        .get('/buses/BUS001')
        .expect(200);

      expect(response.body).toEqual(mockBus);
    });

    it('should return 404 for non-existent bus', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .get('/buses/BUS999')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Bus not found');
    });
  });

  describe('POST /buses', () => {
    it('should create a new bus for admin', async () => {
      const newBus = { id: 'BUS001', plate_no: 'ABC123', operator_id: 'op1', capacity: 50, type: 'regular' };

      // Mock the transaction queries
      mockClient.query.mockImplementation((query) => {
        if (query === 'BEGIN') return Promise.resolve();
        if (query === 'COMMIT') return Promise.resolve();
        if (query === 'ROLLBACK') return Promise.resolve();
        if (query.includes('ORDER BY id DESC')) {
          return Promise.resolve({ rows: [] }); // No existing buses
        }
        if (query.includes('INSERT INTO buses')) {
          return Promise.resolve({ rows: [newBus] });
        }
        return Promise.resolve();
      });

      const response = await request(app)
        .post('/buses')
        .send({ plate_no: 'ABC123', operator_id: 'op1', capacity: 50, type: 'regular' })
        .expect(201);

      expect(response.body).toEqual(newBus);
    });

    it('should create bus for operator with their operatorId', async () => {
      const { authenticate } = require('../../../middleware/auth');
      authenticate.mockImplementation((req, res, next) => {
        req.user = { id: 2, role: 'operator', operatorId: 'op1' };
        next();
      });

      const newBus = { id: 'BUS001', plate_no: 'XYZ789', operator_id: 'op1', capacity: 40, type: 'mini' };

      mockClient.query.mockImplementation((query) => {
        if (query === 'BEGIN') return Promise.resolve();
        if (query === 'COMMIT') return Promise.resolve();
        if (query.includes('ORDER BY id DESC')) {
          return Promise.resolve({ rows: [] });
        }
        if (query.includes('INSERT INTO buses')) {
          return Promise.resolve({ rows: [newBus] });
        }
        return Promise.resolve();
      });

      const response = await request(app)
        .post('/buses')
        .send({ plate_no: 'XYZ789', capacity: 40, type: 'mini' })
        .expect(201);

      expect(response.body.operator_id).toBe('op1');
    });

    it('should return 400 for invalid input', async () => {
      const response = await request(app)
        .post('/buses')
        .send({ plate_no: '', capacity: -1, type: '' })
        .expect(400);

      expect(response.body.error).toContain('Missing or invalid required fields');
    });

    it('should return 409 for duplicate plate number', async () => {
      mockClient.query.mockImplementation((query) => {
        if (query === 'BEGIN') return Promise.resolve();
        if (query === 'COMMIT') return Promise.resolve();
        if (query === 'ROLLBACK') return Promise.resolve();
        if (query.includes('ORDER BY id DESC')) {
          return Promise.resolve({ rows: [] });
        }
        if (query.includes('INSERT INTO buses')) {
          const error = new Error('Duplicate');
          error.code = '23505';
          return Promise.reject(error);
        }
        return Promise.resolve();
      });

      const response = await request(app)
        .post('/buses')
        .send({ plate_no: 'DUPLICATE', operator_id: 'op1', capacity: 50, type: 'regular' })
        .expect(409);

      expect(response.body).toHaveProperty('error', 'Bus with this plate number already exists');
    });
  });

  describe('PUT /buses/:busId', () => {
    it('should update bus capacity and type', async () => {
      const updatedBus = { id: 'BUS001', plate_no: 'ABC123', operator_id: 'op1', capacity: 60, type: 'luxury' };

      mockQuery.mockImplementation((query, values) => {
        if (query.includes('SELECT operator_id FROM buses')) {
          return Promise.resolve({ rows: [{ operator_id: 'op1' }] });
        }
        if (query.includes('UPDATE buses')) {
          return Promise.resolve({ rows: [updatedBus] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .put('/buses/BUS001')
        .send({ capacity: 60, type: 'luxury' })
        .expect(200);

      expect(response.body).toEqual(updatedBus);
    });

    it('should return 403 for operator trying to update other operator\'s bus', async () => {
      const { authenticate } = require('../../../middleware/auth');
      authenticate.mockImplementation((req, res, next) => {
        req.user = { id: 2, role: 'operator', operatorId: 'op1' };
        next();
      });

      mockQuery.mockResolvedValue({ rows: [{ operator_id: 'op2' }] });

      const response = await request(app)
        .put('/buses/BUS001')
        .send({ capacity: 50 })
        .expect(403);

      expect(response.body).toHaveProperty('error', 'Unauthorized: You do not own this bus');
    });
  });

  describe('DELETE /buses/:busId', () => {
    it('should delete bus for admin', async () => {
      mockQuery.mockImplementation((query, values) => {
        if (query.includes('SELECT operator_id FROM buses')) {
          return Promise.resolve({ rows: [{ operator_id: 'op1' }] });
        }
        if (query.includes('DELETE FROM buses')) {
          return Promise.resolve({ rows: [{ id: 'BUS001' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .delete('/buses/BUS001')
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Bus deleted successfully');
    });

    it('should return 404 for non-existent bus', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .delete('/buses/BUS999')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Bus not found');
    });
  });
});