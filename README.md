# 🚌 Real-Time Bus Tracking System API

A comprehensive RESTful Web API for the NTC (National Transport Commission) Real-Time Bus Tracking System built with Node.js, Express, PostgreSQL, and Redis.

## 📋 Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Technology Stack](#technology-stack)
- [Getting Started](#getting-started)
- [API Endpoints](#api-endpoints)
- [Authentication & Authorization](#authentication--authorization)
- [Database Schema](#database-schema)
- [Docker Setup](#docker-setup)
- [Testing with Postman](#testing-with-postman)
- [Environment Variables](#environment-variables)
- [Contributing](#contributing)

## ✨ Features

- **Real-time Location Tracking**: Track bus positions in real-time using Redis cache
- **Route Management**: Complete CRUD operations for bus routes
- **Fleet Management**: Manage buses, trips, and operational data
- **Role-Based Access Control (RBAC)**: Three-tier permission system
- **RESTful API Design**: Clean, consistent API endpoints
- **JWT Authentication**: Secure token-based authentication
- **Real-time Data**: Redis integration for live location updates
- **Comprehensive Testing**: Full Postman collection included
- **Docker Support**: Complete containerization setup

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client Apps   │    │   Postman API   │    │   Admin Panel   │
│  (Mobile/Web)   │    │   Collection    │    │    (Web UI)     │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────▼─────────────┐
                    │     Express.js API       │
                    │   (Node.js Backend)      │
                    │                          │
                    │  • JWT Authentication   │
                    │  • Role-based Access    │
                    │  • Request Validation   │
                    └─────────┬─────┬─────────┘
                              │     │
                    ┌─────────▼──┐ ┌▼─────────┐
                    │ PostgreSQL │ │  Redis   │
                    │ (Primary)  │ │ (Cache)  │
                    │            │ │          │
                    │ • Routes   │ │ • Live   │
                    │ • Buses    │ │   Locs   │
                    │ • Trips    │ │ • Sessions│
                    │ • History  │ │          │
                    └────────────┘ └──────────┘
```

## 🛠️ Technology Stack

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web application framework
- **PostgreSQL** - Primary database for persistent data
- **Redis** - In-memory cache for real-time data
- **JWT** - Authentication tokens
- **bcrypt** - Password hashing

### DevOps & Tools
- **Docker** - Containerization
- **Docker Compose** - Multi-container orchestration
- **Postman** - API testing and documentation

## 🚀 Getting Started

### Prerequisites
- Docker and Docker Compose installed
- Node.js 18+ (for local development)
- PostgreSQL 13+ (for local development)
- Redis 6+ (for local development)

### Quick Start with Docker

1. **Clone the repository**
   ```bash
   git clone https://github.com/kusalkrp/Real-Time-Bus-Tracking-System-API-NodeJS-.git
   cd Real-Time-Bus-Tracking-System-API-NodeJS-
   ```

2. **Start the application**
   ```bash
   docker-compose up --build
   ```

3. **Access the API**
   - API Base URL: `http://localhost:3000`
   - Health Check: `http://localhost:3000/health`

### Local Development Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your database and Redis credentials
   ```

3. **Start PostgreSQL and Redis**
   ```bash
   # Using Docker
   docker run -d -p 5432:5432 --name postgres -e POSTGRES_PASSWORD=password postgres:13
   docker run -d -p 6379:6379 --name redis redis:6-alpine
   ```

4. **Run the application**
   ```bash
   npm start
   ```

## 🔗 API Endpoints

### 🔐 Authentication

#### Login User
```http
POST /auth/login
Content-Type: application/json

{
  "email": "admin@ntc.gov.lk",
  "password": "adminpass"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "role": "admin"
}
```

---

### 📍 Routes Management

#### Get All Routes
```http
GET /routes
Authorization: Bearer <token>
```
**Permissions:** All roles (admin, operator, commuter)

**Response:**
```json
{
  "routes": [
    {
      "id": 1,
      "from_city": "Colombo",
      "to_city": "Kandy", 
      "distance_km": 116,
      "estimated_time_hrs": 3.0,
      "created_at": "2025-09-29T10:00:00Z",
      "updated_at": "2025-09-29T10:00:00Z"
    },
    {
      "id": 2,
      "from_city": "Colombo",
      "to_city": "Galle",
      "distance_km": 119,
      "estimated_time_hrs": 2.5,
      "created_at": "2025-09-29T10:00:00Z",
      "updated_at": "2025-09-29T10:00:00Z"
    }
  ]
}
```

#### Get Route by ID
```http
GET /routes/{routeId}
Authorization: Bearer <token>
```
**Permissions:** All roles

**Response:**
```json
{
  "route": {
    "id": 1,
    "from_city": "Colombo",
    "to_city": "Kandy",
    "distance_km": 116,
    "estimated_time_hrs": 3.0,
    "created_at": "2025-09-29T10:00:00Z",
    "updated_at": "2025-09-29T10:00:00Z"
  }
}
```

#### Create New Route
```http
POST /routes
Authorization: Bearer <token>
Content-Type: application/json

{
  "from_city": "Colombo",
  "to_city": "Jaffna", 
  "distance_km": 396,
  "estimated_time_hrs": 8.0
}
```
**Permissions:** Admin only

**Response:**
```json
{
  "message": "Route created successfully",
  "route": {
    "id": 5,
    "from_city": "Colombo",
    "to_city": "Jaffna",
    "distance_km": 396,
    "estimated_time_hrs": 8.0,
    "created_at": "2025-09-29T12:00:00Z",
    "updated_at": "2025-09-29T12:00:00Z"
  }
}
```

#### Update Route
```http
PUT /routes/{routeId}
Authorization: Bearer <token>
Content-Type: application/json

{
  "distance_km": 400,
  "estimated_time_hrs": 8.5
}
```
**Permissions:** Admin only

**Response:**
```json
{
  "message": "Route updated successfully",
  "route": {
    "id": 5,
    "from_city": "Colombo", 
    "to_city": "Jaffna",
    "distance_km": 400,
    "estimated_time_hrs": 8.5,
    "updated_at": "2025-09-29T13:00:00Z"
  }
}
```

#### Delete Route
```http
DELETE /routes/{routeId}
Authorization: Bearer <token>
```
**Permissions:** Admin only

**Response:**
```json
{
  "message": "Route deleted successfully"
}
```

---

### 🚌 Bus Management

#### Get All Buses
```http
GET /buses
Authorization: Bearer <token>
```
**Permissions:** Admin, Operator only

**Response:**
```json
{
  "buses": [
    {
      "id": "BUS001",
      "plate_no": "NB-1234",
      "operator_id": "op1", 
      "capacity": 50,
      "type": "AC Luxury",
      "created_at": "2025-09-29T10:00:00Z",
      "updated_at": "2025-09-29T10:00:00Z"
    },
    {
      "id": "BUS002",
      "plate_no": "NB-5678",
      "operator_id": "op1",
      "capacity": 45,
      "type": "Semi-Luxury", 
      "created_at": "2025-09-29T10:00:00Z",
      "updated_at": "2025-09-29T10:00:00Z"
    }
  ]
}
```

#### Get Bus by ID
```http
GET /buses/{busId}
Authorization: Bearer <token>
```
**Permissions:** All roles

**Response:**
```json
{
  "bus": {
    "id": "BUS001",
    "plate_no": "NB-1234",
    "operator_id": "op1",
    "capacity": 50,
    "type": "AC Luxury",
    "created_at": "2025-09-29T10:00:00Z",
    "updated_at": "2025-09-29T10:00:00Z"
  }
}
```

#### Add New Bus
```http
POST /buses
Authorization: Bearer <token>
Content-Type: application/json

{
  "id": "BUS004",
  "plate_no": "NB-9999",
  "operator_id": "op1",
  "capacity": 55,
  "type": "Super Luxury"
}
```
**Permissions:** Admin, Operator

**Response:**
```json
{
  "message": "Bus created successfully",
  "bus": {
    "id": "BUS004",
    "plate_no": "NB-9999", 
    "operator_id": "op1",
    "capacity": 55,
    "type": "Super Luxury",
    "created_at": "2025-09-29T14:00:00Z",
    "updated_at": "2025-09-29T14:00:00Z"
  }
}
```

#### Update Bus
```http
PUT /buses/{busId}
Authorization: Bearer <token>
Content-Type: application/json

{
  "capacity": 60,
  "type": "Premium Luxury"
}
```
**Permissions:** Admin, Operator

**Response:**
```json
{
  "message": "Bus updated successfully",
  "bus": {
    "id": "BUS004",
    "plate_no": "NB-9999",
    "operator_id": "op1", 
    "capacity": 60,
    "type": "Premium Luxury",
    "updated_at": "2025-09-29T15:00:00Z"
  }
}
```

---

### 🛣️ Trip Management

#### Get Trips for Route
```http
GET /routes/{routeId}/trips
Authorization: Bearer <token>
```
**Permissions:** All roles

**Response:**
```json
{
  "trips": [
    {
      "id": 1,
      "route_id": 1,
      "bus_id": "BUS001",
      "departure_time": "2025-09-30T06:00:00Z",
      "arrival_time": "2025-09-30T09:00:00Z",
      "status": "scheduled",
      "created_at": "2025-09-29T10:00:00Z"
    },
    {
      "id": 2, 
      "route_id": 1,
      "bus_id": "BUS002", 
      "departure_time": "2025-09-30T08:00:00Z",
      "arrival_time": "2025-09-30T11:00:00Z",
      "status": "active",
      "created_at": "2025-09-29T10:00:00Z"
    }
  ]
}
```

#### Get Trip by ID
```http
GET /trips/{tripId}
Authorization: Bearer <token>
```
**Permissions:** All roles

**Response:**
```json
{
  "trip": {
    "id": 1,
    "route_id": 1,
    "bus_id": "BUS001",
    "departure_time": "2025-09-30T06:00:00Z", 
    "arrival_time": "2025-09-30T09:00:00Z",
    "status": "scheduled",
    "created_at": "2025-09-29T10:00:00Z",
    "updated_at": "2025-09-29T10:00:00Z"
  }
}
```

#### Create New Trip
```http
POST /trips
Authorization: Bearer <token>
Content-Type: application/json

{
  "route_id": 1,
  "bus_id": "BUS001",
  "departure_time": "2025-09-30T14:00:00Z",
  "arrival_time": "2025-09-30T17:00:00Z"
}
```
**Permissions:** Admin, Operator

**Response:**
```json
{
  "message": "Trip created successfully",
  "trip": {
    "id": 5,
    "route_id": 1,
    "bus_id": "BUS001", 
    "departure_time": "2025-09-30T14:00:00Z",
    "arrival_time": "2025-09-30T17:00:00Z",
    "status": "scheduled",
    "created_at": "2025-09-29T16:00:00Z"
  }
}
```

#### Update Trip
```http
PUT /trips/{tripId}
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "active",
  "departure_time": "2025-09-30T14:30:00Z"
}
```
**Permissions:** Admin, Operator

**Response:**
```json
{
  "message": "Trip updated successfully",
  "trip": {
    "id": 5,
    "route_id": 1,
    "bus_id": "BUS001",
    "departure_time": "2025-09-30T14:30:00Z",
    "arrival_time": "2025-09-30T17:00:00Z", 
    "status": "active",
    "updated_at": "2025-09-29T17:00:00Z"
  }
}
```

---

### 📍 Location Tracking

#### Get Current Trip Location
```http
GET /trips/{tripId}/location
Authorization: Bearer <token>
```
**Permissions:** All roles

**Response:**
```json
{
  "location": {
    "trip_id": 2,
    "bus_id": "BUS001",
    "latitude": 6.9271,
    "longitude": 79.8612, 
    "timestamp": "2025-09-29T18:00:00Z"
  }
}
```

#### Update Bus Location
```http
POST /buses/{busId}/location
Authorization: Bearer <token>
Content-Type: application/json

{
  "trip_id": 2,
  "latitude": 6.9271,
  "longitude": 79.8612
}
```
**Permissions:** Operator only

**Response:**
```json
{
  "message": "Location updated successfully",
  "location": {
    "trip_id": 2,
    "bus_id": "BUS001",
    "latitude": 6.9271,
    "longitude": 79.8612,
    "timestamp": "2025-09-29T18:00:00Z"
  }
}
```

#### Get Location History
```http
GET /buses/{busId}/locations/history?limit=10&hours=24
Authorization: Bearer <token>
```
**Permissions:** Admin, Operator

**Query Parameters:**
- `limit` (optional): Number of records to return (default: 50, max: 100)
- `hours` (optional): Hours of history to fetch (default: 24)

**Response:**
```json
{
  "locations": [
    {
      "id": 1,
      "trip_id": 2,
      "bus_id": "BUS001",
      "latitude": 6.9271,
      "longitude": 79.8612,
      "timestamp": "2025-09-29T18:00:00Z"
    },
    {
      "id": 2,
      "trip_id": 2, 
      "bus_id": "BUS001",
      "latitude": 6.9300,
      "longitude": 79.8500,
      "timestamp": "2025-09-29T17:30:00Z"
    }
  ],
  "total": 45,
  "period": "24 hours"
}

---

## ⚠️ Error Responses & Status Codes

### HTTP Status Codes

| Status Code | Description | When It Occurs |
|-------------|-------------|----------------|
| `200` | OK | Successful GET, PUT requests |
| `201` | Created | Successful POST requests |
| `400` | Bad Request | Invalid request data/parameters |
| `401` | Unauthorized | Missing or invalid authentication token |
| `403` | Forbidden | Insufficient permissions for the operation |
| `404` | Not Found | Resource doesn't exist |
| `409` | Conflict | Duplicate resource (e.g., bus ID already exists) |
| `500` | Internal Server Error | Server-side error |

### Error Response Format

All error responses follow this consistent format:

```json
{
  "error": "Error message description",
  "details": "Additional error details (optional)"
}
```

### Common Error Examples

#### Authentication Errors

**Invalid Credentials (401)**
```json
{
  "error": "Invalid credentials"
}
```

**Missing Token (401)**
```json
{
  "error": "Access token required"
}
```

**Invalid Token (401)**
```json
{
  "error": "Invalid token"
}
```

#### Authorization Errors

**Insufficient Permissions (403)**
```json
{
  "error": "Forbidden"
}
```

#### Validation Errors

**Missing Required Fields (400)**
```json
{
  "error": "Missing required fields: from_city, to_city"
}
```

**Invalid Data Format (400)**
```json
{
  "error": "Invalid latitude/longitude format"
}
```

#### Resource Not Found (404)

**Route Not Found**
```json
{
  "error": "Route not found"
}
```

**Bus Not Found**
```json
{
  "error": "Bus not found"
}
```

#### Conflict Errors (409)

**Duplicate Bus ID**
```json
{
  "error": "Bus with this ID already exists",
  "details": "BUS001 is already registered"
}
```

**Duplicate Route**
```json
{
  "error": "Route already exists",
  "details": "Route from Colombo to Kandy already exists"
}
```

### Example Error Handling

```javascript
// JavaScript/Node.js example
try {
  const response = await fetch('http://localhost:3000/routes', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorData = await response.json();
    
    switch (response.status) {
      case 401:
        console.log('Authentication failed:', errorData.error);
        // Redirect to login
        break;
      case 403:
        console.log('Access denied:', errorData.error);
        // Show permission error
        break;
      case 404:
        console.log('Resource not found:', errorData.error);
        break;
      default:
        console.log('Error:', errorData.error);
    }
    return;
  }
  
  const data = await response.json();
  console.log('Success:', data);
} catch (error) {
  console.log('Network error:', error.message);
}
```

```bash
# cURL example with error handling
curl -X GET "http://localhost:3000/routes" \
  -H "Authorization: Bearer invalid_token" \
  -w "Status: %{http_code}\n"

# Response:
# {"error":"Invalid token"}
# Status: 401
```

## 🔐 Authentication & Authorization

### User Roles

| Role | Description | Permissions |
|------|-------------|-------------|
| **Admin** | System administrators | Full route management, operational oversight, view history |
| **Operator** | Bus operators/drivers | Manage buses, trips, update locations, view operations |
| **Commuter** | End users/passengers | Read-only access to public information |

### Authentication Flow

1. **Login**: `POST /auth/login` with email/password
2. **Token**: Receive JWT token in response
3. **Authorization**: Include token in `Authorization: Bearer <token>` header
4. **Access**: Token validates role-based permissions

### Test Users

```javascript
// Admin User
{
  email: "admin@ntc.gov.lk",
  password: "adminpass",
  role: "admin"
}

// Operator User  
{
  email: "operator1@example.com", 
  password: "oppass",
  role: "operator"
}

// Commuter User
{
  email: "commuter1@example.com",
  password: "commuterpass", 
  role: "commuter"
}
```

## 🗄️ Database Schema

### Core Tables

```sql
-- Routes: Bus route definitions
routes (
  id SERIAL PRIMARY KEY,
  from_city VARCHAR(100),
  to_city VARCHAR(100), 
  distance_km DECIMAL,
  estimated_time_hrs DECIMAL
)

-- Buses: Fleet information
buses (
  id VARCHAR(20) PRIMARY KEY,
  plate_no VARCHAR(20) UNIQUE,
  operator_id VARCHAR(50),
  capacity INTEGER,
  type VARCHAR(50)
)

-- Trips: Scheduled bus journeys
trips (
  id SERIAL PRIMARY KEY,
  route_id INTEGER REFERENCES routes(id),
  bus_id VARCHAR(20) REFERENCES buses(id),
  departure_time TIMESTAMP,
  arrival_time TIMESTAMP,
  status VARCHAR(20)
)

-- Locations: GPS tracking data
locations (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER REFERENCES trips(id),
  bus_id VARCHAR(20) REFERENCES buses(id),
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

## 🐳 Docker Setup

### Services

- **api**: Node.js application (Port 3000)
- **postgres**: PostgreSQL database (Port 5432) 
- **redis**: Redis cache (Port 6379)

### Docker Commands

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f api

# Stop services  
docker-compose down

# Rebuild and start
docker-compose up --build

# Execute commands in container
docker-compose exec api npm test
```

## 📫 Testing with Postman

### Import Collection

1. **Import the collection**: `Real-Time-Bus-Tracking-API.postman_collection.json`
2. **Import environment**: `Bus-Tracking-Local.postman_environment.json`
3. **Set environment**: Select "Bus Tracking API - Local"

### Authentication Testing

The collection includes automated token management:

1. **Run Authentication folder** - Login as different users
2. **Tokens auto-saved** - Stored in environment variables
3. **Role-based testing** - Different endpoints for each role

### Test Sequence

```
1. Authentication/
   ├── Admin Login
   ├── Operator Login  
   └── Commuter Login

2. Routes Management/
   ├── Get All Routes
   ├── Get Route Details
   ├── Create Route (Admin)
   └── Update Route (Admin)

3. Bus Management/
   ├── Get All Buses (Admin/Operator)
   ├── Get Bus Details
   └── Add New Bus (Admin/Operator)

4. Location Tracking/
   ├── Update Bus Location (Operator)
   └── Get Location History
```

## ⚙️ Environment Variables

### Setup Environment Variables

1. **Copy the example file:**
   ```bash
   cp .env.example .env
   ```

2. **Edit the `.env` file** with your actual values:
   ```bash
   # Database Configuration
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=bus_tracking
   DB_USER=postgres
   DB_PASSWORD=your-secure-password-here

   # Redis Configuration
   REDIS_URL=redis://localhost:6379

   # JWT Configuration
   JWT_SECRET=your-super-secret-jwt-key-make-it-long-and-random

   # Application Configuration
   PORT=3000
   NODE_ENV=development
   ```

### Required Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DB_HOST` | PostgreSQL host | `localhost` | ✅ |
| `DB_PORT` | PostgreSQL port | `5432` | ✅ |
| `DB_NAME` | Database name | `bus_tracking` | ✅ |
| `DB_USER` | Database username | `postgres` | ✅ |
| `DB_PASSWORD` | Database password | - | ✅ |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` | ✅ |
| `JWT_SECRET` | JWT signing secret | - | ✅ |
| `PORT` | API server port | `3000` | ✅ |
| `NODE_ENV` | Environment mode | `development` | ✅ |

### Security Best Practices

⚠️ **Important Security Notes:**

- **Never commit `.env` files** to version control
- **Use strong, unique passwords** for database
- **Generate random JWT secrets** (at least 32 characters)
- **Change default values** before production deployment
- **Use different values** for development and production

### Docker Environment

Environment variables are automatically loaded from `.env` file when using Docker Compose:

```bash
# Development
docker-compose -f docker-compose.dev.yml up

# Production
docker-compose up
```

For production deployment, set environment variables in your deployment platform (AWS, Heroku, etc.).

## 🧪 Testing

### PowerShell Test Scripts

Run the included test scripts to verify functionality:

```powershell
# Test all user roles
.\test-commuter.ps1

# Test API endpoints  
.\test-all-endpoints.ps1
```

### Manual Testing

```bash
# Health check
curl http://localhost:3000/health

# Login test
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@ntc.gov.lk","password":"adminpass"}'

# Routes test (with token)
curl http://localhost:3000/routes \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 📊 Performance & Monitoring

### Redis Cache Strategy
- **Real-time locations**: Stored with TTL for live tracking
- **Session management**: User tokens and temporary data
- **Performance optimization**: Frequently accessed data cached

### Database Indexing
- Route lookup optimization
- Bus tracking performance  
- Location history queries
- Trip scheduling efficiency

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow REST API conventions
- Maintain role-based security
- Add tests for new endpoints
- Update Postman collection
- Document environment variables

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support & Issues

- **Documentation**: Check API endpoints and Postman collection
- **Issues**: Report bugs via GitHub Issues
- **Testing**: Use provided Postman collection and test scripts

---

**Built with ❤️ for efficient public transportation management**
