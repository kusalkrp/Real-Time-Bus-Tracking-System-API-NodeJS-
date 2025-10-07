const request = require('supertest');
const express = require('express');
const authRouter = require('../../../routes/auth');

// Mock the auth middleware
jest.mock('../../../middleware/auth', () => ({
  users: [
    { id: 1, email: 'admin@ntc.gov.lk', password: '$2b$10$examplehashedpassword', role: 'admin' },
    { id: 2, email: 'sltb01@sltb.lk', password: '$2b$10$examplehashedpassword2', role: 'operator', operatorId: 'SLTB01', operatorType: 'SLTB' },
    { id: 3, email: 'pvt01@private.lk', password: '$2b$10$examplehashedpassword3', role: 'operator', operatorId: 'PVT01', operatorType: 'Private' },
    { id: 4, email: 'commuter1@example.com', password: '$2b$10$examplehashedpassword4', role: 'commuter' },
  ]
}));

// Mock bcryptjs
jest.mock('bcryptjs', () => ({
  compareSync: jest.fn((plain, hashed) => {
    // Mock comparison: return true if password matches expected
    if (plain === 'adminpass' && hashed === '$2b$10$examplehashedpassword') return true;
    if (plain === 'sltb01pass' && hashed === '$2b$10$examplehashedpassword2') return true;
    if (plain === 'pvt01pass' && hashed === '$2b$10$examplehashedpassword3') return true;
    if (plain === 'commuterpass' && hashed === '$2b$10$examplehashedpassword4') return true;
    return false;
  })
}));

// Mock jwt
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(() => 'mocked-jwt-token')
}));

describe('Auth Routes', () => {
  let app;

  beforeAll(() => {
    // Set up environment variable for JWT_SECRET
    process.env.JWT_SECRET = 'test-secret';

    app = express();
    app.use(express.json());
    app.use('/auth', authRouter);
  });

  afterAll(() => {
    delete process.env.JWT_SECRET;
  });

  describe('POST /auth/login', () => {
    it('should return token and role for admin credentials', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({ email: 'admin@ntc.gov.lk', password: 'adminpass' })
        .expect(200);

      expect(response.body).toHaveProperty('token', 'mocked-jwt-token');
      expect(response.body).toHaveProperty('role', 'admin');
      expect(response.body).not.toHaveProperty('operatorId');
      expect(response.body).not.toHaveProperty('operatorType');
    });

    it('should return token and operator details for SLTB operator', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({ email: 'sltb01@sltb.lk', password: 'sltb01pass' })
        .expect(200);

      expect(response.body).toHaveProperty('token', 'mocked-jwt-token');
      expect(response.body).toHaveProperty('role', 'operator');
      expect(response.body).toHaveProperty('operatorId', 'SLTB01');
      expect(response.body).toHaveProperty('operatorType', 'SLTB');
    });

    it('should return token and operator details for Private operator', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({ email: 'pvt01@private.lk', password: 'pvt01pass' })
        .expect(200);

      expect(response.body).toHaveProperty('token', 'mocked-jwt-token');
      expect(response.body).toHaveProperty('role', 'operator');
      expect(response.body).toHaveProperty('operatorId', 'PVT01');
      expect(response.body).toHaveProperty('operatorType', 'Private');
    });

    it('should return token for commuter role', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({ email: 'commuter1@example.com', password: 'commuterpass' })
        .expect(200);

      expect(response.body).toHaveProperty('token', 'mocked-jwt-token');
      expect(response.body).toHaveProperty('role', 'commuter');
      expect(response.body).not.toHaveProperty('operatorId');
      expect(response.body).not.toHaveProperty('operatorType');
    });

    it('should enable permit validation for operators when requested', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({ 
          email: 'sltb01@sltb.lk', 
          password: 'sltb01pass',
          permit_validation: true 
        })
        .expect(200);

      expect(response.body).toHaveProperty('permit_validation_enabled', true);
    });

    it('should return 401 for invalid password', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({ email: 'admin@ntc.gov.lk', password: 'wrongpass' })
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Invalid credentials');
    });

    it('should return 401 for non-existent email', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({ email: 'nonexistent@example.com', password: 'somepass' })
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Invalid credentials');
    });
  });
});