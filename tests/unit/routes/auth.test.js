const request = require('supertest');
const express = require('express');
const authRouter = require('../../../routes/auth');

// Mock the auth middleware
jest.mock('../../../middleware/auth', () => ({
  users: [
    { id: 1, email: 'admin@ntc.gov.lk', password: '$2b$10$examplehashedpassword', role: 'admin' },
    { id: 2, email: 'operator1@example.com', password: '$2b$10$examplehashedpassword2', role: 'operator', operatorId: 'op1' },
  ]
}));

// Mock bcryptjs
jest.mock('bcryptjs', () => ({
  compareSync: jest.fn((plain, hashed) => {
    // Mock comparison: return true if password matches expected
    if (plain === 'correctpass' && hashed === '$2b$10$examplehashedpassword') return true;
    if (plain === 'oppass' && hashed === '$2b$10$examplehashedpassword2') return true;
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
    it('should return token and role for valid credentials', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({ email: 'admin@ntc.gov.lk', password: 'correctpass' })
        .expect(200);

      expect(response.body).toHaveProperty('token', 'mocked-jwt-token');
      expect(response.body).toHaveProperty('role', 'admin');
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

    it('should return token for operator role', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({ email: 'operator1@example.com', password: 'oppass' })
        .expect(200);

      expect(response.body).toHaveProperty('token', 'mocked-jwt-token');
      expect(response.body).toHaveProperty('role', 'operator');
    });
  });
});