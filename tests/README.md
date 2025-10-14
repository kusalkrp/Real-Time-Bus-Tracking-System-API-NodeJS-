# Testing Guide

This guide explains how to run the comprehensive testing suite for the Real-Time Bus Tracking System API.

## Test Types

### 1. Unit Tests
- **Purpose**: Test individual functions and modules in isolation
- **Coverage**: 87.58% overall coverage
- **Framework**: Jest with Supertest for HTTP endpoints

### 2. Integration Tests
- **Purpose**: Test complete workflows with real database and Redis connections through HTTP API calls
- **Framework**: Jest with Supertest for HTTP requests to running Docker API
- **Requirements**: Docker services must be running (`docker-compose up`)

**Note**: Integration tests now make HTTP requests to the API running in Docker containers, testing the full application stack including database and Redis connections.

### 3. Performance Tests
- **Purpose**: Test API performance under load and stress conditions
- **Tools**: Artillery (comprehensive load testing) and autocannon (quick performance checks)

## Prerequisites

1. **Node.js** (v14 or higher)
2. **Docker** (for integration tests - API must be running in containers)
3. **Docker Compose** (for running the full application stack)
4. **npm** or **yarn**

Install dependencies:
```bash
npm install
```

Start Docker services for integration testing:
```bash
docker-compose up -d
```

## Running Tests

### Unit Tests

Run all unit tests:
```bash
npm test
```

Run unit tests with coverage:
```bash
npm run test:coverage
```

Run specific unit test file:
```bash
npx jest tests/unit/routes/auth.test.js
```

### Integration Tests

Integration tests require Docker services to be running.

Start Docker services:
```bash
docker-compose up -d
```

Run integration tests:
```bash
npm run test:integration
```

**Note**: The integration test script automatically checks if Docker services are running before executing tests. If services are not running, it will provide instructions to start them.

### Performance Tests

#### Quick Performance Test (autocannon)
Run quick performance test:
```bash
npm run test:performance:quick
```

This will test:
- Authentication endpoint
- Routes endpoint
- Location tracking endpoint
- Mixed workload simulation

#### Comprehensive Load Test (Artillery)
Run comprehensive load test:
```bash
npm run test:performance
```

**Important**: Make sure the API server is running on `http://localhost:3000` before running performance tests.

Start the server:
```bash
npm start
```

### All Tests

Run all test types in sequence:
```bash
npm run test:all
```

## Test Structure

```
tests/
├── unit/
│   ├── middleware/
│   │   └── auth.test.js
│   └── routes/
│       ├── auth.test.js
│       ├── buses.test.js
│       ├── locations.test.js
│       ├── routes.test.js
│       └── trips.test.js
├── integration/
│   ├── setup.js
│   └── api.integration.test.js
└── performance/
    ├── load-test.yml
    └── quick-performance-test.js
```

## Test Configuration

### Jest Configuration
- **Unit tests**: `jest.config.js`
- **Integration tests**: `jest.integration.config.js`

### Performance Test Configuration
- **Load test**: `tests/performance/load-test.yml`
- **Quick test**: `tests/performance/quick-performance-test.js`

## Test Data

### Integration Tests
Test data is automatically seeded in `tests/integration/setup.js`:
- Admin user: `admin@ntc.gov.lk` / `adminpass`
- Operator user: `operator1@example.com` / `oppass`
- Commuter user: `commuter1@example.com` / `commuterpass`
- Sample routes, buses, and trips

### Performance Tests
Performance tests use the same test data and simulate real user scenarios.

## Performance Benchmarks

### Target Performance Metrics
- **Authentication**: < 200ms average latency
- **Routes API**: < 300ms average latency
- **Location Tracking**: < 150ms average latency
- **Mixed Workload**: < 400ms average latency
- **Error Rate**: < 1%

### Load Test Scenarios
1. **Warm-up** (60s): 5 requests/second
2. **Load Test** (300s): 20 requests/second
3. **Stress Test** (120s): 50 requests/second

## Troubleshooting

### Integration Tests
- **Docker not running**: Start Docker Desktop and run `docker-compose up -d`
- **API container not healthy**: Check container logs with `docker-compose logs api`
- **Connection refused**: Ensure API is accessible at `http://localhost:3000`
- **Database connection errors**: Check PostgreSQL and Redis containers are running
- **Timeout errors**: Increase timeout in `jest.integration.config.js` or check API performance

### Performance Tests
- **Server not running**: Start the API server with `npm start`
- **Connection refused**: Check if server is running on port 3000
- **High latency**: Check database and Redis connections

### Common Issues
- **Test failures**: Check database connections and test data
- **Coverage issues**: Run `npm run test:coverage` to identify uncovered code
- **Memory issues**: Ensure sufficient RAM for Docker containers

## CI/CD Integration

Tests can be integrated into CI/CD pipelines:

```yaml
# GitHub Actions example
- name: Run Unit Tests
  run: npm test

- name: Run Integration Tests
  run: npm run test:integration

- name: Run Performance Tests
  run: |
    npm start &
    sleep 10
    npm run test:performance:quick
```

## Contributing

When adding new features:
1. Write unit tests for new functions
2. Add integration tests for new endpoints
3. Update performance tests if needed
4. Ensure all tests pass before submitting PR

## Coverage Goals

- **Unit Tests**: > 80% coverage
- **Integration Tests**: Cover all critical workflows
- **Performance Tests**: Meet latency and error rate targets