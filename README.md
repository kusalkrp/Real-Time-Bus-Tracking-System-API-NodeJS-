# 🚌 Real-Time Bus Tracking System API

A comprehensive RESTful Web API built with Node.js for the NTC (National Transport Commission) Real-Time Bus Tracking System. This API provides complete bus fleet management, route planning, trip scheduling, and real-time location tracking capabilities.

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-4.18+-blue.svg)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-blue.svg)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7+-red.svg)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

## 📋 Table of Contents

- [Features](#-features)
- [Architecture](#-architecture)
- [Tech Stack](#-tech-stack)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [API Documentation](#-api-documentation)
- [Authentication](#-authentication)
- [Database Schema](#-database-schema)
- [Docker Deployment](#-docker-deployment)
- [Production Deployment](#-production-deployment)
- [Testing](#-testing)
- [Contributing](#-contributing)
- [License](#-license)

## ✨ Features

### 🔐 **Authentication & Authorization**
- JWT-based authentication system
- Role-based access control (Admin, Operator, Commuter)
- Secure password handling with bcrypt
- Token-based API security

### 🛣️ **Route Management**
- Create, read, update, delete bus routes
- Route filtering by cities and distance
- Estimated travel time calculations
- Pagination support for large datasets

### 🚌 **Bus Fleet Management**
- Complete bus inventory management
- Operator ownership validation
- Bus capacity and type categorization
- Real-time status tracking

### 🚏 **Trip Scheduling**
- Dynamic trip creation and management
- Real-time status updates (Scheduled, In Progress, Completed, Delayed, Cancelled)
- Automatic arrival time calculations
- Trip filtering by date ranges and operators

### 📍 **Real-Time Location Tracking**
- Live GPS coordinate updates
- Redis-powered location caching
- Historical location data storage
- Speed and timestamp tracking

### 🔧 **System Features**
- Comprehensive input validation
- Error handling and logging
- Database transaction support
- Race condition prevention
- Pagination with accurate totals
- Health check endpoints

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   API Server    │    │   Database      │
│   (Mobile/Web)  │◄──►│   (Node.js)     │◄──►│   (PostgreSQL)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │   Redis Cache   │
                       │  (Real-time     │
                       │   Locations)    │
                       └─────────────────┘
```

## 🛠️ Tech Stack

### **Backend**
- **Runtime**: Node.js 18+
- **Framework**: Express.js 4.18+
- **Authentication**: JWT (jsonwebtoken)
- **Password Hashing**: bcrypt
- **Validation**: Custom middleware

### **Database**
- **Primary**: PostgreSQL 15+
- **Cache**: Redis 7+
- **Connection**: node-postgres (pg)

### **DevOps**
- **Containerization**: Docker & Docker Compose
- **CI/CD**: GitHub Actions
- **Environment**: dotenv configuration

## 📋 Prerequisites

- Node.js 18 or higher
- PostgreSQL 15 or higher
- Redis 7 or higher
- Docker & Docker Compose (for containerized deployment)
- Git

## 🚀 Installation

### **Option 1: Docker Deployment (Recommended)**

1. **Clone the repository**
   ```bash
   git clone https://github.com/kusalkrp/Real-Time-Bus-Tracking-System-API-NodeJS-.git
   cd Real-Time-Bus-Tracking-System-API-NodeJS-
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start with Docker Compose**
   ```bash
   docker-compose up -d
   ```

### **Option 2: Local Development**

1. **Clone and install dependencies**
   ```bash
   git clone https://github.com/kusalkrp/Real-Time-Bus-Tracking-System-API-NodeJS-.git
   cd Real-Time-Bus-Tracking-System-API-NodeJS-
   npm install
   ```

2. **Set up databases**
   ```bash
   # Start PostgreSQL and Redis locally
   # Import database schema
   psql -U postgres -d bus_tracking -f init.sql
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your local database credentials
   ```

4. **Start the server**
   ```bash
   npm start
   # or for development with auto-reload
   npm run dev
   ```

## ⚙️ Configuration

### **Environment Variables**

Create a `.env` file with the following variables:

```properties
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=bus_tracking
DB_USER=postgres
DB_PASSWORD=your_secure_password

# Redis Configuration
REDIS_URL=redis://localhost:6379

# JWT Configuration
JWT_SECRET=your_secure_jwt_secret_key_64_chars_minimum

# Application Configuration
PORT=3000
NODE_ENV=development
```

### **Production Configuration**

For production deployment, ensure:
- Use strong, unique JWT_SECRET (64+ characters)
- Set NODE_ENV=production
- Use secure database credentials
- Configure SSL/TLS for database connections
- Set up proper firewall rules

## 📚 API Documentation

### **Base URL**
```
http://localhost:3000
```

### **Authentication Header**
```http
Authorization: Bearer <jwt_token>
```

### **Core Endpoints**

#### **🔐 Authentication**
```http
POST /auth/login              # User login
```

#### **🛣️ Routes Management**
```http
GET    /routes                # List all routes
GET    /routes/:id            # Get route by ID
POST   /routes                # Create new route (Admin only)
PUT    /routes/:id            # Update route (Admin only)
DELETE /routes/:id            # Delete route (Admin only)
```

#### **🚌 Bus Management**
```http
GET    /buses                 # List buses (filtered by operator)
GET    /buses/:id             # Get bus by ID
POST   /buses                 # Create new bus (Operator/Admin)
PUT    /buses/:id             # Update bus (Owner/Admin)
DELETE /buses/:id             # Delete bus (Owner/Admin)
```

#### **🚏 Trip Management**
```http
GET    /trips/routes/:routeId/trips  # Get trips by route
GET    /trips/:id                    # Get trip by ID
POST   /trips                        # Create new trip (Operator/Admin)
PUT    /trips/:id                    # Update trip status (Owner/Admin)
DELETE /trips/:id                    # Delete trip (Owner/Admin)
```

#### **📍 Location Tracking**
```http
GET    /trips/:tripId/location           # Get current trip location
POST   /buses/:busId/location            # Update bus location (Operator)
GET    /buses/:busId/locations/history   # Get location history (Owner/Admin)
```

#### **💚 Health Check**
```http
GET    /health                # API health status
```

### **Response Formats**

#### **Success Response**
```json
{
  "trips": [...],
  "total": 150,
  "page": 1,
  "limit": 20,
  "totalPages": 8,
  "hasNext": true,
  "hasPrev": false
}
```

#### **Error Response**
```json
{
  "error": "Unauthorized: You do not own this bus"
}
```

## 🔐 Authentication

### **User Roles**

| Role | Permissions |
|------|-------------|
| **Admin** | Full access to all resources |
| **Operator** | Manage own buses and trips |
| **Commuter** | Read-only access to public data |

### **Sample Users**

| Email | Password | Role |
|-------|----------|------|
| admin@ntc.gov.lk | adminpass | admin |
| operator1@example.com | oppass | operator |
| commuter1@example.com | commuterpass | commuter |

### **JWT Token Usage**

1. **Login** to get JWT token
2. **Include token** in Authorization header
3. **Token expires** after 1 hour
4. **Refresh** by logging in again

## 🗄️ Database Schema

### **Key Tables**

#### **Routes**
```sql
CREATE TABLE routes (
  id SERIAL PRIMARY KEY,
  from_city VARCHAR(100) NOT NULL,
  to_city VARCHAR(100) NOT NULL,
  distance_km DECIMAL(6,2) NOT NULL,
  estimated_time_hrs DECIMAL(4,2) NOT NULL
);
```

#### **Buses**
```sql
CREATE TABLE buses (
  id VARCHAR(10) PRIMARY KEY,
  plate_no VARCHAR(20) UNIQUE NOT NULL,
  operator_id VARCHAR(10) NOT NULL,
  capacity INTEGER NOT NULL,
  type VARCHAR(20) NOT NULL
);
```

#### **Trips**
```sql
CREATE TABLE trips (
  id VARCHAR(10) PRIMARY KEY,
  bus_id VARCHAR(10) REFERENCES buses(id),
  route_id INTEGER REFERENCES routes(id),
  departure_time TIMESTAMP NOT NULL,
  arrival_time TIMESTAMP NOT NULL,
  status VARCHAR(20) DEFAULT 'Scheduled'
);
```

#### **Locations**
```sql
CREATE TABLE locations (
  id SERIAL PRIMARY KEY,
  trip_id VARCHAR(10) REFERENCES trips(id),
  bus_id VARCHAR(10) REFERENCES buses(id),
  latitude DECIMAL(10,8) NOT NULL,
  longitude DECIMAL(11,8) NOT NULL,
  speed_kmh DECIMAL(5,2),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 🐳 Docker Deployment

### **Development Environment**
```bash
docker-compose -f docker-compose.dev.yml up -d
```

### **Production Environment**
```bash
docker-compose up -d
```

### **Services**
- **API Server**: Port 3000
- **PostgreSQL**: Port 5432
- **Redis**: Port 6379

## 🌐 Production Deployment

### **AWS EC2 Deployment**

1. **Prerequisites**
   - EC2 instance with Docker installed
   - Security groups configured
   - Domain name (optional)

2. **Automated Deployment**
   - Push to `release-V1.0` branch
   - GitHub Actions automatically deploys
   - Health checks verify deployment

3. **Manual Deployment**
   ```bash
   # On EC2 instance
   git clone <repository-url>
   cd Real-Time-Bus-Tracking-System-API-NodeJS-
   cp .env.example .env
   # Configure .env for production
   docker-compose up -d
   ```

For detailed deployment instructions, see [DEPLOYMENT.md](.github/DEPLOYMENT.md).

## 🧪 Testing

### **Manual Testing**

#### **Health Check**
```bash
curl http://localhost:3000/health
```

#### **Authentication**
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@ntc.gov.lk","password":"adminpass"}'
```

#### **Protected Route**
```bash
curl -X GET http://localhost:3000/routes \
  -H "Authorization: Bearer <your_jwt_token>"
```

### **Postman Collection**

Import the provided Postman collection for comprehensive API testing:
- `Real-Time-Bus-Tracking-API.postman_collection.json`
- `Bus-Tracking-Local.postman_environment.json`

## 🔧 Development

### **Project Structure**
```
├── config/
│   └── database.js          # Database configuration
├── middleware/
│   └── auth.js              # Authentication middleware
├── routes/
│   ├── auth.js              # Authentication routes
│   ├── routes.js            # Route management
│   ├── buses.js             # Bus management
│   ├── trips.js             # Trip management
│   └── locations.js         # Location tracking
├── .github/
│   ├── workflows/           # GitHub Actions
│   └── DEPLOYMENT.md        # Deployment guide
├── docker-compose.yml       # Production Docker config
├── docker-compose.dev.yml   # Development Docker config
├── Dockerfile               # Docker image configuration
├── init.sql                 # Database schema
└── app.js                   # Main application
```

### **Code Quality**
- Comprehensive input validation
- Error handling and logging
- SQL injection prevention
- Race condition protection
- Transaction-safe operations

## 🤝 Contributing

1. **Fork the repository**
2. **Create feature branch** (`git checkout -b feature/amazing-feature`)
3. **Commit changes** (`git commit -m 'Add amazing feature'`)
4. **Push to branch** (`git push origin feature/amazing-feature`)
5. **Open Pull Request**

### **Development Guidelines**
- Follow existing code style
- Add comprehensive error handling
- Include input validation
- Write descriptive commit messages
- Test all endpoints thoroughly

## 🔒 Security

- JWT-based authentication
- Password hashing with bcrypt
- SQL injection prevention
- Input validation and sanitization
- Role-based access control
- Secure environment configuration

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- National Transport Commission (NTC) for project requirements
- Node.js and Express.js communities
- PostgreSQL and Redis teams
- Docker for containerization

## 📞 Support

For support and questions:
- **GitHub Issues**: [Create an issue](https://github.com/kusalkrp/Real-Time-Bus-Tracking-System-API-NodeJS-/issues)
- **Email**: [Your contact email]
- **Documentation**: Check the [DEPLOYMENT.md](.github/DEPLOYMENT.md) guide

---

**Made with ❤️ for efficient public transportation management** 
