# NTC Real-Time Bus Tracking System - Role Navigation Guide

## 🚌 System Overview

The NTC Real-Time Bus Tracking System is a comprehensive API that manages bus routes, fleets, and trips across Sri Lanka with role-based access control. The system supports multiple user types with different permissions and capabilities.

---

## 👥 User Roles & Permissions

### 🔑 **Admin Role**
**Full System Access** - Complete control over all system operations

#### What Admins Can Do:
- ✅ **Route Management**: Create, read, update, delete all routes
- ✅ **Bus Fleet Management**: Manage all buses across all operators  
- ✅ **Trip Management**: Monitor and manage all trips system-wide
- ✅ **User Management**: Create and manage operator accounts
- ✅ **Permit Management**: Issue and validate NTC permits
- ✅ **System Monitoring**: Access all analytics and reports
- ✅ **Location Management**: Manage all bus stop locations
- ✅ **Advanced Filtering**: Access all filtering and search capabilities

#### Admin API Endpoints:
```
POST   /auth/login                    # Admin login
GET    /routes                        # View all routes
POST   /routes                        # Create new routes
PUT    /routes/:id                    # Update any route
DELETE /routes/:id                    # Delete any route
GET    /buses                         # View all buses
POST   /buses                         # Add new buses
PUT    /buses/:id                     # Update any bus
DELETE /buses/:id                     # Delete any bus
GET    /trips                         # View all trips
POST   /trips                         # Create trips
GET    /locations                     # View all locations
POST   /locations                     # Add new locations
```

---

### 🚍 **Operator Role** (SLTB & Private)
**Fleet Management** - Manage their own buses and routes

#### What Operators Can Do:
- ✅ **Own Fleet Management**: Manage buses they operate
- ✅ **Route Operations**: Manage routes they're licensed for
- ✅ **Trip Management**: Create and manage their own trips
- ✅ **Schedule Management**: Set departure times and frequencies
- ✅ **Bus Status Updates**: Update location and status of their buses
- ✅ **Permit Validation**: Validate their own permits
- ❌ **Cannot**: Access other operators' data or system-wide admin functions

#### Operator Types:
1. **SLTB Operators**: State transport operators
2. **Private Operators**: Licensed private bus operators

#### Operator API Endpoints:
```
POST   /auth/login                    # Operator login
GET    /routes                        # View routes (filtered by permits)
GET    /buses                         # View own buses only
POST   /buses                         # Add buses to own fleet
PUT    /buses/:id                     # Update own buses only
GET    /trips                         # View own trips only
POST   /trips                         # Create trips for own buses
PUT    /trips/:id                     # Update own trips only
GET    /locations                     # View all locations (read-only)
```

---

### 🚶 **Commuter Role**
**Read-Only Access** - Search and view public transportation information

#### What Commuters Can Do:
- ✅ **Route Search**: Find routes between locations
- ✅ **Bus Search**: Find buses serving specific routes
- ✅ **Segment Search**: Find buses passing through specific areas
- ✅ **Trip Information**: View schedules and real-time updates
- ✅ **Location Information**: View bus stops and route maps
- ✅ **Advanced Filtering**: Search with multiple criteria
- ❌ **Cannot**: Modify any data or access operational information

#### Commuter API Endpoints:
```
POST   /auth/login                    # Commuter login (optional)
GET    /routes                        # Search routes
GET    /buses                         # Search buses
GET    /buses/segment-search          # Find buses by route segments
GET    /trips                         # View trip schedules
GET    /locations                     # View bus stops and locations
```

---

## 🗺️ Complete Roadmaps

### 1. 🛣️ **Complete Route Adding Roadmap** (Admin Only)

#### Step 1: Preparation
```bash
# Login as Admin
POST /auth/login
{
  "email": "admin@ntc.gov.lk",
  "password": "adminpass",
  "permit_validation": true
}
```

#### Step 2: Create Route Locations
```bash
# Add starting location
POST /locations
{
  "name": "Colombo Fort",
  "type": "bus_stop",
  "coordinates": {
    "latitude": 6.9344,
    "longitude": 79.8428
  }
}

# Add ending location
POST /locations
{
  "name": "Kandy Central",
  "type": "bus_stop", 
  "coordinates": {
    "latitude": 7.2906,
    "longitude": 80.6337
  }
}
```

#### Step 3: Create Main Route
```bash
POST /routes
{
  "route_number": "01",
  "from_city": "Colombo",
  "to_city": "Kandy",
  "distance_km": 115.5,
  "estimated_time_hrs": 3.5,
  "is_active": true
}
```

#### Step 4: Add Route Segments
```bash
# Add each segment of the route
POST /routes/01/segments
[
  {
    "segment_order": 1,
    "from_location": "Colombo Fort",
    "to_location": "Kelaniya",
    "distance_km": 12.0,
    "estimated_time_hrs": 0.3
  },
  {
    "segment_order": 2,
    "from_location": "Kelaniya",
    "to_location": "Kadawatha",
    "distance_km": 8.5,
    "estimated_time_hrs": 0.2
  }
  // ... continue for all segments
]
```

#### Step 5: Validation
```bash
# Verify route creation
GET /routes/01
```

---

### 2. 🚌 **Complete Bus Adding Roadmap** (Admin/Operator)

#### Step 1: Authentication
```bash
# Login as Admin or Operator
POST /auth/login
{
  "email": "sltb01@sltb.lk",  # or admin email
  "password": "sltb01pass",
  "permit_validation": true
}
```

#### Step 2: Verify Route Exists
```bash
# Check if route exists
GET /routes/01
```

#### Step 3: Add Bus to Fleet
```bash
POST /buses
{
  "plate_no": "WP CAB-1234",
  "route_id": 1,
  "capacity": 45,
  "service_type": "LU",        # N=Normal, LU=Luxury, SE=Semi-Express
  "operator_type": "SLTB",     # or "Private"
  "operator_id": "SLTB01",
  "permit_number": "NTC2023001",
  "chassis_number": "CH123456789",
  "engine_number": "EN987654321",
  "manufacture_year": 2022,
  "model": "TATA LP 1613",
  "fuel_type": "Diesel",
  "is_active": true
}
```

#### Step 4: Add Bus Features (Optional)
```bash
PUT /buses/1
{
  "features": {
    "ac": true,
    "wifi": false,
    "gps": true,
    "wheelchair_accessible": true
  }
}
```

#### Step 5: Create Initial Trip
```bash
POST /trips
{
  "bus_id": 1,
  "route_id": 1,
  "departure_time": "2025-10-06T06:00:00Z",
  "estimated_arrival_time": "2025-10-06T09:30:00Z",
  "status": "Scheduled",
  "fare": 180.00
}
```

#### Step 6: Validation
```bash
# Verify bus is added and operational
GET /buses/1
GET /routes/01?include_buses=true
```

---

### 3. 🔍 **Complete Bus Search Roadmap** (Commuter)

#### Step 1: Simple Route Search
```bash
# Find all buses on a specific route
GET /routes/01
```

#### Step 2: Advanced Bus Search by Criteria
```bash
# Search by service type and operator
GET /buses?service_type=LU&operator_type=SLTB&is_active=true
```

#### Step 3: Segment-Based Search (Key Feature)
```bash
# Find buses passing through specific locations
GET /buses/segment-search?from_location=Peradeniya&to_location=Kadugannawa&service_type=LU
```

#### Step 4: Time-Based Search
```bash
# Find routes with specific duration
GET /routes?estimated_time_hrs_lt=4&estimated_time_hrs_gt=2
```

#### Step 5: Geographic Search
```bash
# Find routes between cities
GET /routes?from=Colombo&to=Kandy&sort=estimated_time_hrs
```

#### Step 6: Comprehensive Search
```bash
# Combined search with multiple filters
GET /routes?segment=Peradeniya&estimated_time_hrs_lt=6&route_number_in=01,08,16&sort=estimated_time_hrs&page=1&limit=20
```

#### Step 7: Trip Schedule Search
```bash
# Find upcoming trips
GET /trips?route_id=1&status=Scheduled&departure_after=2025-10-06T00:00:00Z
```

---

## 🔐 Authentication Flow

### Admin Authentication
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@ntc.gov.lk",
    "password": "adminpass",
    "permit_validation": true
  }'
```

### Operator Authentication
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "sltb01@sltb.lk",
    "password": "sltb01pass",
    "permit_validation": true
  }'
```

### Commuter Authentication (Optional)
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "commuter1@example.com",
    "password": "commuterpass"
  }'
```

---

## 🚀 Advanced Features

### 1. **Segment-Based Route Discovery**
The system can find buses that travel through specific segments, even if they're on different routes:
- Route 01: Colombo → Kandy (passes through Peradeniya)
- Route 08: Kandy → Mahiyangana (also passes through Peradeniya)
- Search for "Peradeniya" returns buses from both routes

### 2. **Multi-Criteria Filtering**
Users can combine multiple filters:
```bash
GET /routes?estimated_time_hrs_lt=6&segment=Peradeniya&route_number_in=01,08,16&service_type=LU&operator_type=SLTB
```

### 3. **Real-Time Trip Management**
- Operators can update trip status in real-time
- Commuters can see live updates
- System tracks delays and schedule changes

---

## 📊 System Hierarchy

```
NTC Admin (Root Level)
├── System Management
├── All Routes Management
├── All Buses Management
└── All Operators Management
    ├── SLTB Operators
    │   ├── Own Route Management
    │   ├── Own Fleet Management
    │   └── Own Trip Management
    └── Private Operators
        ├── Own Route Management
        ├── Own Fleet Management
        └── Own Trip Management

Commuters (Public Level)
├── Route Search (Read-Only)
├── Bus Search (Read-Only)
├── Trip Information (Read-Only)
└── Location Information (Read-Only)
```

---

## 🔧 Environment Setup

### Docker Setup
```bash
# Start the system
docker-compose up -d

# Check if services are running
docker-compose ps

# View logs
docker-compose logs -f
```

### API Base URL
```
Local Development: http://localhost:3000
```

---

## 📝 Testing with Postman

1. **Import Collection**: Use `NTC-Local-Bus-Tracking-API.json`
2. **Set Environment Variables**:
   - `base_url`: `http://localhost:3000`
   - `route_number`: `01`
3. **Authentication Flow**:
   - Run "Admin Login" → Captures token automatically
   - Run any protected endpoint → Uses captured token
4. **Test Scenarios**:
   - Admin: Full CRUD operations
   - Operator: Limited to own resources
   - Commuter: Read-only searches

---

## � Real-World Location Tracking

### **Client-Side vs Server-Side Progress Calculation**

The system supports two approaches for location tracking and progress calculation:

#### **🌟 Modern GPS Approach (Recommended)**
**Client devices calculate progress data based on actual GPS positioning**

```bash
POST /buses/BUS001/location
{
  "latitude": 6.9271,
  "longitude": 79.8612,
  "speed_kmh": 45,
  "current_segment_id": 123,
  "segment_progress_percentage": 67.5,
  "total_route_progress_percentage": 34.2,
  "estimated_delay_minutes": -3
}
```

**Benefits:**
- ✅ **GPS Accuracy**: Based on actual positioning, not time estimates
- ✅ **Real-Time Precision**: Accounts for traffic, stops, and route deviations
- ✅ **Reduced Server Load**: Calculations happen on client devices
- ✅ **Better Delay Estimates**: Based on actual vs expected position

#### **🔄 Legacy Time-Based Approach (Fallback)**
**Server calculates progress based on elapsed time and route estimates**

```bash
POST /buses/BUS001/location
{
  "latitude": 6.9271,
  "longitude": 79.8612,
  "speed_kmh": 45
}
```

**When Used:**
- Legacy GPS systems without calculation capability
- Backup when client-side calculation fails
- Simple tracking systems without advanced GPS

### **🔧 Implementation Guidelines**

#### **For GPS Device Manufacturers**
1. Calculate `current_segment_id` by matching GPS coordinates to route segments
2. Calculate `segment_progress_percentage` based on position within current segment
3. Calculate `total_route_progress_percentage` based on overall route completion
4. Estimate delay by comparing actual vs scheduled position

#### **For Mobile App Developers**
1. Use device GPS to determine current position
2. Match position to route segments using geofencing or proximity algorithms
3. Calculate progress percentages using distance-based calculations
4. Send calculated data to server for validation and storage

#### **For System Integrators**
1. Implement hybrid approach accepting both client and server calculations
2. Validate client-provided data for reasonableness
3. Use server fallback when client data is unavailable
4. Log both approaches for comparison and debugging

---

## �🚨 Common Error Solutions

### 401 Unauthorized
- **Solution**: Login first to get a valid token
- **Check**: Token is properly stored in environment variables

### 403 Forbidden  
- **Solution**: Verify user role has permission for the endpoint
- **Check**: Operator trying to access admin-only features

### PostgreSQL Parameter Errors
- **Solution**: Already fixed in the current version
- **Check**: Parameter placeholders match values array

---

This guide provides a complete understanding of the role-based system and step-by-step workflows for all major operations in the NTC Bus Tracking System. Each role has clear boundaries and capabilities, ensuring secure and efficient transportation management.