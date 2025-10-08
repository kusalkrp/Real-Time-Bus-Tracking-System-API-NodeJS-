const request = require('supertest');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

describe('API Integration Tests', () => {
  let adminToken;
  let operatorToken;
  let commuterToken;

  beforeAll(async () => {
    // Get authentication tokens from the running API in Docker
    adminToken = await getAuthToken('admin@ntc.gov.lk', 'adminpass');
    operatorToken = await getAuthToken('sltb01@sltb.lk', 'sltb01pass');
    commuterToken = await getAuthToken('commuter1@example.com', 'commuterpass');
  });

  // Helper function to get auth token from running API
  async function getAuthToken(email, password) {
    const response = await request(API_BASE_URL)
      .post('/auth/login')
      .send({ email, password })
      .expect(200);

    return response.body.token;
  }

  describe('Authentication Flow', () => {
    test('should login admin user', async () => {
      const response = await request(API_BASE_URL)
        .post('/auth/login')
        .send({ email: 'admin@ntc.gov.lk', password: 'adminpass' })
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('role', 'admin');
    });

    test('should login SLTB operator user', async () => {
      const response = await request(API_BASE_URL)
        .post('/auth/login')
        .send({ email: 'sltb01@sltb.lk', password: 'sltb01pass' })
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('role', 'operator');
      expect(response.body).toHaveProperty('operatorId', 'SLTB01');
      expect(response.body).toHaveProperty('operatorType', 'SLTB');
    });

    test('should login Private operator user', async () => {
      const response = await request(API_BASE_URL)
        .post('/auth/login')
        .send({ email: 'pvt01@private.lk', password: 'pvt01pass' })
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('role', 'operator');
      expect(response.body).toHaveProperty('operatorId', 'PVT01');
      expect(response.body).toHaveProperty('operatorType', 'Private');
    });

    test('should enable permit validation for operators', async () => {
      const response = await request(API_BASE_URL)
        .post('/auth/login')
        .send({ 
          email: 'sltb01@sltb.lk', 
          password: 'sltb01pass',
          permit_validation: true 
        })
        .expect(200);

      expect(response.body).toHaveProperty('permit_validation_enabled', true);
    });

    test('should reject invalid credentials', async () => {
      await request(API_BASE_URL)
        .post('/auth/login')
        .send({ email: 'admin@ntc.gov.lk', password: 'wrongpass' })
        .expect(401);
    });
  });

  describe('Routes Management', () => {
    test('should get all routes as commuter', async () => {
      const response = await request(API_BASE_URL)
        .get('/routes')
        .set('Authorization', `Bearer ${commuterToken}`)
        .expect(200);

      expect(Array.isArray(response.body.routes)).toBe(true);
      expect(response.body.routes.length).toBeGreaterThan(0);
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('page');
      expect(response.body).toHaveProperty('limit');
    });

    test('should create new route as admin', async () => {
      const newRoute = {
        route_number: '99',
        from_city: 'Jaffna',
        to_city: 'Colombo',
        distance_km: 400,
        estimated_time_hrs: 8
      };

      const response = await request(API_BASE_URL)
        .post('/routes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(newRoute)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.from_city).toBe(newRoute.from_city);
      expect(response.body.to_city).toBe(newRoute.to_city);
      expect(response.body.distance_km).toBe(newRoute.distance_km);
    });

    test('should reject route creation without auth', async () => {
      const response = await request(API_BASE_URL)
        .post('/routes')
        .send({ from_city: 'Test', to_city: 'City', distance_km: 100, estimated_time_hrs: 2 })
        .expect(401);
    });
  });

  describe('Bus Management', () => {
    test('should get buses as operator (filtered by ownership)', async () => {
      const response = await request(API_BASE_URL)
        .get('/buses')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(Array.isArray(response.body.buses)).toBe(true);
      // Should only return buses owned by this operator
      response.body.buses.forEach(bus => {
        expect(bus.operator_id).toBe('SLTB01');
      });
    });

    test('should create bus as admin', async () => {
      const newBus = {
        plate_no: 'WP-NEW-9999',
        permit_number: 'NTC-TEST-2024',
        operator_id: 'SLTB01',
        operator_type: 'SLTB',
        capacity: 45,
        service_type: 'LU',
        type: 'AC Luxury'
      };

      const response = await request(API_BASE_URL)
        .post('/buses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(newBus)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.plate_no).toBe(newBus.plate_no);
      expect(response.body.permit_number).toBe(newBus.permit_number);
      expect(response.body.capacity).toBe(newBus.capacity);
      expect(response.body.service_type).toBe(newBus.service_type);
      expect(response.body.operator_type).toBe(newBus.operator_type);
    });

    test('should create bus for operator with automatic operator assignment', async () => {
      const newBus = {
        plate_no: 'WP-OP-TEST-1',
        permit_number: 'NTC-OP-TEST-2024',
        capacity: 50,
        service_type: 'N',
        type: 'Normal'
      };

      const response = await request(API_BASE_URL)
        .post('/buses')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(newBus)
        .expect(201);

      expect(response.body.operator_id).toBe('SLTB01');
      expect(response.body.operator_type).toBe('SLTB');
      expect(response.body.plate_no).toBe(newBus.plate_no);
    });

    test('should filter buses by service type', async () => {
      const response = await request(API_BASE_URL)
        .get('/buses?service_type=LU')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(response.body.buses)).toBe(true);
      response.body.buses.forEach(bus => {
        expect(bus.service_type).toBe('LU');
      });
    });

    test('should filter buses by operator type', async () => {
      const response = await request(API_BASE_URL)
        .get('/buses?operator_type=SLTB')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(response.body.buses)).toBe(true);
      response.body.buses.forEach(bus => {
        expect(bus.operator_type).toBe('SLTB');
      });
    });
  });

  describe('Trip Management', () => {
    test('should get trips for route as commuter', async () => {
      const response = await request(API_BASE_URL)
        .get('/trips/routes/1/trips')
        .set('Authorization', `Bearer ${commuterToken}`)
        .expect(200);

      expect(Array.isArray(response.body.trips)).toBe(true);
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('page');
    });

    test('should create trip as operator', async () => {
      const newTrip = {
        bus_id: 'BUS001',
        route_id: 1,
        direction: 'outbound',
        departure_time: '2025-10-06T09:00:00Z'
      };

      const response = await request(API_BASE_URL)
        .post('/trips')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(newTrip)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.bus_id).toBe(newTrip.bus_id);
      expect(response.body.direction).toBe(newTrip.direction);
      expect(response.body.status).toBe('Scheduled');
      expect(response.body).toHaveProperty('arrival_time');
    });

    test('should update trip status as operator', async () => {
      const response = await request(API_BASE_URL)
        .put('/trips/TRIP001')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ status: 'In Progress' })
        .expect(200);

      expect(response.body.status).toBe('In Progress');
    });
  });

  describe('Location Tracking', () => {
    test('should get current trip location', async () => {
      // First, update a location
      await request(API_BASE_URL)
        .post('/locations/buses/BUS001/location')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          latitude: 6.9271,
          longitude: 79.8612,
          speed_kmh: 45
        })
        .expect(200);

      // Then get the location
      const response = await request(API_BASE_URL)
        .get('/locations/trips/TRIP001/location')
        .set('Authorization', `Bearer ${commuterToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('tripId', 'TRIP001');
      expect(response.body).toHaveProperty('busId', 'BUS001');
      expect(response.body).toHaveProperty('latitude', 6.9271);
      expect(response.body).toHaveProperty('longitude', 79.8612);
    });

    test('should get location history', async () => {
      const response = await request(API_BASE_URL)
        .get('/locations/buses/BUS001/locations/history')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(Array.isArray(response.body.locations)).toBe(true);
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('page');
    });
  });

  describe('End-to-End Workflow', () => {
    test('complete bus tracking workflow', async () => {
      // 1. Create a route (admin)
      const routeResponse = await request(API_BASE_URL)
        .post('/routes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          route_number: '98',
          from_city: 'Matara',
          to_city: 'Colombo',
          distance_km: 160,
          estimated_time_hrs: 4
        })
        .expect(201);

      const routeId = routeResponse.body.id;

      // 2. Create a bus (admin)
      const busResponse = await request(API_BASE_URL)
        .post('/buses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          plate_no: 'WORKFLOW001',
          operator_id: 'op1',
          capacity: 55,
          type: 'express'
        })
        .expect(201);

      const busId = busResponse.body.id;

      // 3. Create a trip (operator)
      const tripResponse = await request(API_BASE_URL)
        .post('/trips')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          bus_id: busId,
          route_id: routeId,
          departure_time: '2025-10-07T08:00:00Z'
        })
        .expect(201);

      const tripId = tripResponse.body.id;

      // 4. Update trip status to In Progress (operator)
      await request(API_BASE_URL)
        .put(`/trips/${tripId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ status: 'In Progress' })
        .expect(200);

      // 5. Update bus location (operator)
      await request(API_BASE_URL)
        .post(`/locations/buses/${busId}/location`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          latitude: 6.0535,
          longitude: 80.2210,
          speed_kmh: 60
        })
        .expect(200);

      // 6. Get current location (commuter)
      const locationResponse = await request(API_BASE_URL)
        .get(`/locations/trips/${tripId}/location`)
        .set('Authorization', `Bearer ${commuterToken}`)
        .expect(200);

      expect(locationResponse.body.tripId).toBe(tripId);
      expect(locationResponse.body.busId).toBe(busId);
      expect(locationResponse.body.latitude).toBe(6.0535);
      expect(locationResponse.body.longitude).toBe(80.2210);

      // 7. Get location history (operator)
      const historyResponse = await request(API_BASE_URL)
        .get(`/locations/buses/${busId}/locations/history`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(historyResponse.body.locations.length).toBeGreaterThan(0);

      // 8. Complete the trip (operator)
      await request(API_BASE_URL)
        .put(`/trips/${tripId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ status: 'Completed' })
        .expect(200);
    });
  });

  describe('Error Handling', () => {
    test('should handle database connection errors gracefully', async () => {
      // Temporarily break database connection
      const originalQuery = require('../../config/database').pool.query;
      require('../../config/database').pool.query = jest.fn().mockRejectedValue(new Error('Connection lost'));

      const response = await request(API_BASE_URL)
        .get('/routes')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Internal server error');

      // Restore connection
      require('../../config/database').pool.query = originalQuery;
    });

    test('should handle Redis connection errors gracefully', async () => {
      // Temporarily break Redis connection
      const originalGet = require('../../config/database').redisClient.get;
      require('../../config/database').redisClient.get = jest.fn().mockRejectedValue(new Error('Redis connection failed'));

      const response = await request(API_BASE_URL)
        .get('/locations/trips/TRIP001/location')
        .set('Authorization', `Bearer ${commuterToken}`)
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Internal server error');

      // Restore connection
      require('../../config/database').redisClient.get = originalGet;
    });
  });
});
