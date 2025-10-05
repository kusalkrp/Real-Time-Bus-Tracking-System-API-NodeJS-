const { PostgreSqlContainer } = require('testcontainers');
const { GenericContainer } = require('testcontainers');
const { Client } = require('pg');
const redis = require('redis-mock');
const fs = require('fs');
const path = require('path');

let postgresContainer;
let redisContainer;
let pgClient;
let redisClient;

beforeAll(async () => {
  // Start PostgreSQL container
  postgresContainer = await new PostgreSqlContainer()
    .withDatabase('testdb')
    .withUsername('testuser')
    .withPassword('testpass')
    .start();

  // Start Redis container
  redisContainer = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .start();

  // Set up environment variables for tests
  process.env.DATABASE_URL = postgresContainer.getConnectionUri();
  process.env.REDIS_URL = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;
  process.env.JWT_SECRET = 'test-integration-secret';

  // Create database client
  pgClient = new Client({
    host: postgresContainer.getHost(),
    port: postgresContainer.getPort(),
    database: postgresContainer.getDatabase(),
    user: postgresContainer.getUsername(),
    password: postgresContainer.getPassword(),
  });

  await pgClient.connect();

  // Initialize database schema
  const initSql = fs.readFileSync(path.join(__dirname, '../../init.sql'), 'utf8');
  await pgClient.query(initSql);

  // Insert test data
  await setupTestData();
}, 60000); // 60 second timeout for container startup

afterAll(async () => {
  if (pgClient) {
    await pgClient.end();
  }
  if (postgresContainer) {
    await postgresContainer.stop();
  }
  if (redisContainer) {
    await redisContainer.stop();
  }

  // Clean up environment variables
  delete process.env.DATABASE_URL;
  delete process.env.REDIS_URL;
  delete process.env.JWT_SECRET;
}, 30000);

async function setupTestData() {
  // Insert test users
  await pgClient.query(`
    INSERT INTO users (email, password, role, operator_id) VALUES
    ('admin@ntc.gov.lk', '$2b$10$examplehashedpassword', 'admin', NULL),
    ('operator1@example.com', '$2b$10$examplehashedpassword2', 'operator', 'op1'),
    ('commuter1@example.com', '$2b$10$examplehashedpassword3', 'commuter', NULL)
  `);

  // Insert test routes
  await pgClient.query(`
    INSERT INTO routes (id, from_city, to_city, distance_km, estimated_time_hrs) VALUES
    (1, 'Colombo', 'Kandy', 115, 3),
    (2, 'Colombo', 'Galle', 120, 3.5)
  `);

  // Insert test buses
  await pgClient.query(`
    INSERT INTO buses (id, plate_no, operator_id, capacity, type) VALUES
    ('BUS001', 'ABC123', 'op1', 50, 'regular'),
    ('BUS002', 'XYZ789', 'op1', 40, 'mini')
  `);

  // Insert test trips
  await pgClient.query(`
    INSERT INTO trips (id, bus_id, route_id, departure_time, arrival_time, status) VALUES
    ('TRIP001', 'BUS001', 1, '2025-10-05T10:00:00Z', '2025-10-05T13:00:00Z', 'Scheduled'),
    ('TRIP002', 'BUS002', 2, '2025-10-05T14:00:00Z', '2025-10-05T17:30:00Z', 'In Progress')
  `);
}

// Global test utilities
global.testUtils = {
  getAuthToken: async (email = 'admin@ntc.gov.lk', password = 'adminpass') => {
    const request = require('supertest');
    const express = require('express');
    const authRouter = require('../../routes/auth');

    const app = express();
    app.use(express.json());
    app.use('/auth', authRouter);

    const response = await request(app)
      .post('/auth/login')
      .send({ email, password });

    return response.body.token;
  },

  clearDatabase: async () => {
    await pgClient.query('DELETE FROM locations');
    await pgClient.query('DELETE FROM trips');
    await pgClient.query('DELETE FROM buses');
    await pgClient.query('DELETE FROM routes');
    await pgClient.query('DELETE FROM users');
  },

  createTestUser: async (userData) => {
    const result = await pgClient.query(`
      INSERT INTO users (email, password, role, operator_id)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [userData.email, userData.password, userData.role, userData.operatorId]);
    return result.rows[0];
  }
};