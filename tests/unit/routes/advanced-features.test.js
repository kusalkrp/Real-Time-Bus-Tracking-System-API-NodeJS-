const request = require('supertest');
const express = require('express');
const busesRouter = require('../../../routes/buses');
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
  authorize: jest.fn((roles) => (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  }),
  validatePermit: jest.fn((req, res, next) => {
    if (req.user.role !== 'operator') {
      return next();
    }
    
    // Mock permit validation logic
    const { busId } = req.params;
    if (busId === 'BUS999') {
      return res.status(403).json({ 
        error: 'Unauthorized: Invalid permit or you do not own this bus',
        code: 'INVALID_PERMIT'
      });
    }
    
    req.busPermit = 'NTC-001-2024';
    next();
  })
}));

const { pool } = require('../../../config/database');

describe('Advanced Features Tests', () => {
  let app;
  let mockQuery;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});

    mockQuery = pool.query;

    app = express();
    app.use(express.json());
    app.use('/buses', busesRouter);
    app.use('/trips', tripsRouter);
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  describe('NTC Permit Validation', () => {
    it('should allow admin to access any bus without permit validation', async () => {
      const mockBus = {
        id: 'BUS001',
        plate_no: 'WP-ABC-1234',
        permit_number: 'NTC-001-2024',
        operator_id: 'SLTB01'
      };
      mockQuery.mockResolvedValue({ rows: [mockBus] });

      const response = await request(app)
        .get('/buses/BUS001')
        .expect(200);

      expect(response.body).toEqual(mockBus);
    });

    it('should validate operator permit for bus operations', async () => {
      const { authenticate } = require('../../../middleware/auth');
      authenticate.mockImplementation((req, res, next) => {
        req.user = { id: 2, role: 'operator', operatorId: 'SLTB01' };
        next();
      });

      const mockBus = {
        id: 'BUS001',
        permit_number: 'NTC-001-2024',
        operator_id: 'SLTB01'
      };
      mockQuery.mockResolvedValue({ rows: [mockBus] });

      const response = await request(app)
        .put('/buses/BUS001')
        .send({ capacity: 55 })
        .expect(200);

      expect(response.body).toBeDefined();
    });

    it('should reject operator access to bus with invalid permit', async () => {
      const { authenticate } = require('../../../middleware/auth');
      authenticate.mockImplementation((req, res, next) => {
        req.user = { id: 2, role: 'operator', operatorId: 'SLTB01' };
        next();
      });

      // Mock database query to return a bus with different operator
      mockQuery.mockImplementation((query, values) => {
        if (query.includes('SELECT operator_id FROM buses')) {
          return Promise.resolve({ rows: [{ operator_id: 'OTHER_OPERATOR' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .put('/buses/BUS999')
        .send({ capacity: 55 })
        .expect(403);

      expect(response.body).toHaveProperty('error', 'Unauthorized: You do not own this bus');
    });
  });

  describe('Advanced Bus Filtering', () => {
    beforeEach(() => {
      // Reset to admin user for filtering tests
      const { authenticate } = require('../../../middleware/auth');
      authenticate.mockImplementation((req, res, next) => {
        req.user = { id: 1, role: 'admin' };
        next();
      });
    });

    it('should filter buses by multiple permit numbers', async () => {
      const mockBuses = [
        { id: 'BUS001', permit_number: 'NTC-001-2024' },
        { id: 'BUS002', permit_number: 'NTC-002-2024' }
      ];
      
      mockQuery.mockImplementation((query, values) => {
        if (query.includes('COUNT')) {
          return Promise.resolve({ rows: [{ count: '2' }] });
        }
        return Promise.resolve({ rows: mockBuses });
      });

      const response = await request(app)
        .get('/buses?permit_number_in=NTC-001-2024,NTC-002-2024')
        .expect(200);

      expect(response.body.buses).toEqual(mockBuses);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('permit_number IN'),
        expect.arrayContaining(['NTC-001-2024', 'NTC-002-2024'])
      );
    });

    it('should filter buses by capacity range', async () => {
      const mockBuses = [
        { id: 'BUS001', capacity: 45 },
        { id: 'BUS002', capacity: 48 }
      ];
      
      mockQuery.mockImplementation((query, values) => {
        if (query.includes('COUNT')) {
          return Promise.resolve({ rows: [{ count: '2' }] });
        }
        return Promise.resolve({ rows: mockBuses });
      });

      const response = await request(app)
        .get('/buses?capacity_gt=40&capacity_lt=50')
        .expect(200);

      expect(response.body.buses).toEqual(mockBuses);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('capacity > $'),
        expect.arrayContaining([40, 50])
      );
    });

    it('should filter buses with availability status', async () => {
      const mockBuses = [
        { id: 'BUS001', is_active: true, status: 'Available' }
      ];
      
      mockQuery.mockImplementation((query, values) => {
        if (query.includes('COUNT')) {
          return Promise.resolve({ rows: [{ count: '1' }] });
        }
        return Promise.resolve({ rows: mockBuses });
      });

      const response = await request(app)
        .get('/buses?available=true')
        .expect(200);

      expect(response.body.buses).toEqual(mockBuses);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('is_active = true'),
        expect.any(Array)
      );
    });

    it('should filter buses by plate number pattern', async () => {
      const mockBuses = [
        { id: 'BUS001', plate_no: 'WP-ABC-1234' },
        { id: 'BUS002', plate_no: 'WP-ABC-5678' }
      ];
      
      mockQuery.mockImplementation((query, values) => {
        if (query.includes('COUNT')) {
          return Promise.resolve({ rows: [{ count: '2' }] });
        }
        return Promise.resolve({ rows: mockBuses });
      });

      const response = await request(app)
        .get('/buses?plate_no_like=WP-ABC')
        .expect(200);

      expect(response.body.buses).toEqual(mockBuses);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('plate_no ILIKE'),
        expect.arrayContaining(['%WP-ABC%'])
      );
    });

    it('should combine multiple advanced filters', async () => {
      const mockBuses = [
        { 
          id: 'BUS001', 
          service_type: 'LU',
          operator_type: 'SLTB',
          capacity: 50,
          plate_no: 'WP-LUX-1234'
        }
      ];
      
      mockQuery.mockImplementation((query, values) => {
        if (query.includes('COUNT')) {
          return Promise.resolve({ rows: [{ count: '1' }] });
        }
        return Promise.resolve({ rows: mockBuses });
      });

      const response = await request(app)
        .get('/buses?service_type=LU&operator_type=SLTB&capacity_gt=45&plate_no_like=LUX')
        .expect(200);

      expect(response.body.buses).toEqual(mockBuses);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringMatching(/service_type = \$\d+.*operator_type = \$\d+.*capacity > \$\d+.*plate_no ILIKE \$\d+/s),
        expect.arrayContaining(['LU', 'SLTB', 45, '%LUX%'])
      );
    });
  });

  describe('Route Overlap Detection', () => {
    it('should find buses serving common route segments', async () => {
      const mockBuses = [
        { 
          id: 'BUS001', 
          route_id: 1,
          route_segments: ['Colombo', 'Kandy', 'Matale']
        },
        { 
          id: 'BUS002', 
          route_id: 8,
          route_segments: ['Colombo', 'Kandy', 'Dambulla']
        }
      ];
      
      mockQuery.mockImplementation((query, values) => {
        if (query.includes('COUNT(*)')) {
          return Promise.resolve({ rows: [{ count: '2' }] });
        }
        return Promise.resolve({ rows: mockBuses });
      });

      const response = await request(app)
        .get('/buses?passes_through_route=Kandy')
        .expect(200);

      expect(Array.isArray(response.body.buses)).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('r.route_number = $'),
        expect.arrayContaining(['Kandy'])
      );
    });

    it('should find buses between specific locations', async () => {
      const mockBuses = [
        { 
          id: 'BUS001', 
          from_location: 'Colombo',
          to_location: 'Kandy'
        }
      ];
      
      mockQuery.mockImplementation((query, values) => {
        if (query.includes('COUNT(*)')) {
          return Promise.resolve({ rows: [{ count: '1' }] });
        }
        return Promise.resolve({ rows: mockBuses });
      });

      const response = await request(app)
        .get('/buses?from_location=Colombo&to_location=Kandy')
        .expect(200);

      expect(Array.isArray(response.body.buses)).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('rs1.from_location ILIKE'),
        expect.arrayContaining(['%Colombo%', '%Kandy%', '%Colombo%', '%Kandy%'])
      );
    });
  });

  describe('Service Classification', () => {
    it('should validate NTC service types', async () => {
      const validServiceTypes = ['N', 'LU', 'SE'];
      
      for (const serviceType of validServiceTypes) {
        const mockBuses = [{ id: 'BUS001', service_type: serviceType }];
        mockQuery.mockImplementation((query, values) => {
          if (query.includes('COUNT')) {
            return Promise.resolve({ rows: [{ count: '1' }] });
          }
          return Promise.resolve({ rows: mockBuses });
        });

        const response = await request(app)
          .get(`/buses?service_type=${serviceType}`)
          .expect(200);

        expect(response.body.buses[0].service_type).toBe(serviceType);
      }
    });

    it('should validate operator types', async () => {
      const validOperatorTypes = ['SLTB', 'Private'];
      
      for (const operatorType of validOperatorTypes) {
        const mockBuses = [{ id: 'BUS001', operator_type: operatorType }];
        mockQuery.mockImplementation((query, values) => {
          if (query.includes('COUNT')) {
            return Promise.resolve({ rows: [{ count: '1' }] });
          }
          return Promise.resolve({ rows: mockBuses });
        });

        const response = await request(app)
          .get(`/buses?operator_type=${operatorType}`)
          .expect(200);

        expect(response.body.buses[0].operator_type).toBe(operatorType);
      }
    });
  });
});