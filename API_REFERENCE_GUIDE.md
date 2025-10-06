# 🚌 NTC Bus Tracking System - Complete API Reference Guide

## 📋 Table of Contents
- [User Roles & Permissions](#user-roles--permissions)
- [Authentication Endpoints](#authentication-endpoints)
- [Route Management APIs](#route-management-apis)
- [Bus Management APIs](#bus-management-apis)
- [Trip Management APIs](#trip-management-apis)
- [Location Tracking APIs](#location-tracking-apis)
- [System Health APIs](#system-health-apis)
- [Complete Filter Reference](#complete-filter-reference)
- [Advanced Features](#advanced-features)
- [Security & Permit Validation](#security--permit-validation)

---

## 👥 User Roles & Permissions

| **Role** | **Description** | **Permissions** | **Access Level** |
|----------|-----------------|-----------------|------------------|
| **👑 Admin** | NTC System Administrator | Full CRUD on all resources | System-wide access |
| **🚍 SLTB Operator** | State Transport Operator | CRUD on own fleet/routes | Fleet-specific access |
| **🚌 Private Operator** | Licensed Private Operator | CRUD on own fleet/routes | Fleet-specific access |
| **👤 Commuter** | Public User | Read-only access | Search and view only |

### **Role-Based Resource Access Matrix**

| **Resource** | **Admin** | **SLTB Operator** | **Private Operator** | **Commuter** |
|--------------|-----------|-------------------|---------------------|--------------|
| **Routes** | Full CRUD | View Licensed Routes | View Licensed Routes | View All |
| **Buses** | All Buses CRUD | Own Fleet CRUD | Own Fleet CRUD | Search All |
| **Trips** | All Trips CRUD | Own Trips CRUD | Own Trips CRUD | View Schedules |
| **Locations** | All Location Data | Own Bus Locations | Own Bus Locations | View Public Data |
| **Permits** | Issue & Validate | Validate Own | Validate Own | - |
| **Users** | Manage All Users | - | - | - |

---

## 🔐 Authentication Endpoints

### **POST /auth/login**
**Purpose**: Authenticate users and obtain JWT tokens

| **Field** | **Type** | **Required** | **Description** |
|-----------|----------|--------------|-----------------|
| `email` | String | ✅ | User email address |
| `password` | String | ✅ | User password |
| `permit_validation` | Boolean | ❌ | Enable NTC permit validation |

#### **Pre-configured User Accounts**

| **Role** | **Email** | **Password** | **Operator ID** | **Permits** |
|----------|-----------|--------------|-----------------|-------------|
| **Admin** | `admin@ntc.gov.lk` | `adminpass` | - | SYSTEM_ADMIN |
| **SLTB Operator** | `sltb01@sltb.lk` | `sltb01pass` | SLTB01 | Route 01 |
| **SLTB Operator** | `sltb02@sltb.lk` | `sltb02pass` | SLTB02 | Route 02 |
| **SLTB Operator** | `sltb03@sltb.lk` | `sltb03pass` | SLTB03 | Route 04 |
| **SLTB Operator** | `sltb04@sltb.lk` | `sltb04pass` | SLTB04 | Route 08 |
| **SLTB Operator** | `sltb05@sltb.lk` | `sltb05pass` | SLTB05 | Route 15 |
| **Private Operator** | `pvt01@private.lk` | `pvt01pass` | PVT01 | Route 01 |
| **Private Operator** | `pvt02@private.lk` | `pvt02pass` | PVT02 | Route 02 |
| **Private Operator** | `pvt03@private.lk` | `pvt03pass` | PVT03 | Route 04 |
| **Private Operator** | `pvt04@private.lk` | `pvt04pass` | PVT04 | Route 08 |
| **Private Operator** | `pvt05@private.lk` | `pvt05pass` | PVT05 | Route 15 |
| **Commuter** | `commuter1@example.com` | `commuterpass` | - | - |
| **Commuter** | `commuter2@example.com` | `commuter2pass` | - | - |

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "user123",
    "email": "sltb01@sltb.lk",
    "role": "operator",
    "operatorId": "SLTB01"
  }
}
```

---

## 🛣️ Route Management APIs

### **GET /routes**
**Purpose**: List all routes with advanced filtering  
**Access**: All roles (commuter, operator, admin)  
**Filters**: [See Route Filters](#route-filters)

**Advanced filtering capabilities:**
- Distance-based filtering (`distance_km_gt`, `distance_km_lt`, `distance_km_eq`)
- Time-based filtering (`estimated_time_hrs_gt`, `estimated_time_hrs_lt`)
- Segment-based filtering (`segment`, `segment_like`)
- Route number filtering (`route_number`, `route_number_in`)
- Trip availability filtering (`has_trips`)

### **GET /routes/:routeNumber**
**Purpose**: Get specific route by NTC route number with segments  
**Access**: All roles  
**Example**: `/routes/01`, `/routes/08`

**Response includes:**
- Route details (distance, time, cities)
- Complete segment breakdown
- Segment-level distance and time data

### **Route Management (Admin Only)**
Routes are primarily managed through database initialization. The system focuses on read operations for route discovery and filtering rather than dynamic route creation.

---

## 🚌 Bus Management APIs

### **GET /buses**
**Purpose**: List buses with advanced filtering  
**Access**: Operator+ (operators see own fleet, admins see all)  
**Filters**: [See Bus Filters](#bus-filters)

**Advanced filtering capabilities:**
- Service type filtering (`service_type`)
- Operator type filtering (`operator_type`)
- Capacity filtering (`capacity_gt`, `capacity_lt`)
- Permit filtering (`permit_number_in`)
- Availability filtering (`available`)
- Plate number pattern matching (`plate_no_like`)
- Route overlap filtering (`passes_through_route`)

**Operator Security**: Operators can only view/manage buses in their own fleet based on `operator_id` matching.

### **GET /buses/:busId**
**Purpose**: Get specific bus details  
**Access**: All roles

### **GET /buses/segment-search**
**Purpose**: Find buses traveling between specific locations (key feature)  
**Access**: All roles

| **Parameter** | **Type** | **Required** | **Description** |
|---------------|----------|--------------|-----------------|
| `from_location` | String | ✅ | Starting location/segment |
| `to_location` | String | ✅ | Ending location/segment |
| `service_type` | String | ❌ | N, LU, SE |
| `operator_type` | String | ❌ | SLTB, Private |

**Key Feature**: This endpoint finds buses that operate on routes containing segments matching the specified locations, enabling discovery of overlapping route services.

### **Bus Fleet Management**
Bus data is primarily managed through database initialization with NTC-compliant permit numbers and specifications. The system focuses on filtering and discovery operations.

---

## 🚏 Trip Management APIs

### **GET /routes/:routeNumber/trips**
**Purpose**: List trips for a specific route with advanced filtering  
**Access**: All roles (commuter, operator, admin)  
**Filters**: [See Trip Filters](#trip-filters)

**Advanced filtering capabilities:**
- Direction filtering (`direction`: outbound/inbound)
- Service type filtering (`service_type`: N/LU/SE)  
- Date range filtering (`date`, `startDate`, `endDate`)
- Time-based filtering (`departure_time_gt`, `departure_time_lt`)
- Next hours filtering (`next_hours`: upcoming trips)
- Status filtering (`status_in`: multiple statuses)
- Interval filtering (`interval_min_lt`, `interval_min_gt`)
- Stop-based filtering (`stop`, `stop_like`)
- Fare-based filtering (`min_fare`, `max_fare`)
- Route segment filtering (`from_stop`, `to_stop`)

**Operator Security**: Operators can only view trips for buses in their own fleet.

### **GET /trips/:tripId**
**Purpose**: Get specific trip details  
**Access**: All roles

### **Trip Schedule Management**
Trip schedules are managed through database initialization with predefined departure/arrival times, intervals, and status tracking. The system supports bidirectional trips (outbound/inbound) and comprehensive status management:

**Trip Statuses:**
- `Scheduled` - Trip is planned
- `In Progress` - Trip is currently active
- `Completed` - Trip finished successfully
- `Delayed` - Trip is running behind schedule
- `Cancelled` - Trip cancelled

---

## 📍 Location Tracking APIs

### **GET /trips/:tripId/location**
**Purpose**: Get current trip location with segment progress and advanced filtering  
**Access**: All roles (commuter, operator, admin)  
**Filters**: `progress_gt`, `progress_lt`, `current_segment`, `estimated_delay_gt`

**Enhanced Response includes:**
- Current GPS coordinates (latitude, longitude)
- Current speed in km/h
- Current segment details with progress description
- Segment progress percentage (0-100%)
- Total route progress percentage (0-100%)
- Estimated delay in minutes (+ delayed, - ahead of schedule)
- Segment distance and estimated time data
- Redis caching for real-time performance

**Advanced filtering:**
- Filter by progress thresholds
- Filter by current segment name
- Filter by delay estimates

### **POST /buses/:busId/location**
**Purpose**: Update bus location with client-calculated progress (Operator only)  
**Access**: Operator only (own buses with permit validation)  
**Security**: Requires permit validation - operators can only update locations for buses they own

#### **Modern GPS Approach (Recommended)**
| **Field** | **Type** | **Required** | **Description** |
|-----------|----------|--------------|-----------------|
| `latitude` | Number | ✅ | GPS latitude (-90 to 90) |
| `longitude` | Number | ✅ | GPS longitude (-180 to 180) |
| `speed_kmh` | Number | ❌ | Speed in km/h |
| `timestamp` | String | ❌ | ISO datetime (defaults to now) |
| `current_segment_id` | Number | ❌ | **Client-calculated** current segment |
| `segment_progress_percentage` | Number | ❌ | **Client-calculated** segment progress (0-100) |
| `total_route_progress_percentage` | Number | ❌ | **Client-calculated** total progress (0-100) |
| `estimated_delay_minutes` | Number | ❌ | **Client-calculated** delay estimate (+ delayed, - ahead) |

#### **Hybrid Fallback System**
- **Client-provided data**: Used when available for maximum accuracy
- **Server calculation**: Fallback based on time estimates and route segments
- **Redis caching**: Real-time location data cached for performance
- **Debug information**: Shows both client and server calculated values

### **GET /buses/:busId/locations/history**
**Purpose**: Get location history for bus with filtering  
**Access**: Operator+ (operators own buses only)  
**Filters**: `from` (datetime), `to` (datetime), `page`, `limit`, `speed_min`, `speed_max`

**Permit Validation**: All location operations include NTC permit validation to ensure operators can only access their authorized buses.

---

## 🩺 System Health APIs

### **GET /health**
**Purpose**: Check API server health  
**Access**: Public (no authentication required)

**Response:**
```json
{
  "status": "OK",
  "message": "Bus Tracking API is running",
  "timestamp": "2025-10-05T11:30:00Z"
}
```

---

## 🔍 Complete Filter Reference

### **Route Filters** (`GET /routes`)

| **Filter** | **Type** | **Description** | **Example** |
|------------|----------|-----------------|-------------|
| `route_number` | String | Exact route number | `?route_number=01` |
| `from` | String | From city filter (ILIKE pattern) | `?from=Colombo` |
| `to` | String | To city filter (ILIKE pattern) | `?to=Kandy` |
| `distance_km_gt` | Number | Distance greater than | `?distance_km_gt=100` |
| `distance_km_lt` | Number | Distance less than | `?distance_km_lt=200` |
| `distance_km_eq` | Number | Exact distance | `?distance_km_eq=116` |
| `estimated_time_hrs_gt` | Number | Time greater than | `?estimated_time_hrs_gt=2` |
| `estimated_time_hrs_lt` | Number | Time less than | `?estimated_time_hrs_lt=6` |
| `segment` | String | Route passes through location | `?segment=Peradeniya` |
| `segment_like` | String | Segment pattern match | `?segment_like=Peradeniya` |
| `has_trips` | Boolean | Routes with active trips | `?has_trips=true` |
| `route_number_in` | String | Multiple route numbers (comma-separated) | `?route_number_in=01,08,15` |
| `sort` | String | Sort field | `?sort=estimated_time_hrs` |
| `order` | String | Sort order (asc/desc) | `?order=desc` |
| `fields` | String | Select specific fields | `?fields=route_number,from_city,to_city` |
| `page` | Number | Page number (default: 1) | `?page=1` |
| `limit` | Number | Results per page (max: 100) | `?limit=20` |

### **Bus Filters** (`GET /buses`)

| **Filter** | **Type** | **Description** | **Example** |
|------------|----------|-----------------|-------------|
| `service_type` | String | N, LU, SE | `?service_type=LU` |
| `operator_type` | String | SLTB or Private | `?operator_type=SLTB` |
| `permit_number_in` | String | Multiple permits (comma-separated) | `?permit_number_in=NTC2023001,NTC2023002` |
| `capacity_gt` | Number | Capacity greater than | `?capacity_gt=45` |
| `capacity_lt` | Number | Capacity less than | `?capacity_lt=60` |
| `available` | Boolean | Available for trips | `?available=true` |
| `plate_no_like` | String | Plate pattern (ILIKE) | `?plate_no_like=NB` |
| `passes_through_route` | String | Buses on specific route | `?passes_through_route=01` |
| `from_location` | String | Route segment from location | `?from_location=Colombo` |
| `to_location` | String | Route segment to location | `?to_location=Kandy` |
| `includes_stops` | String | Route includes specific stops | `?includes_stops=Peradeniya` |
| `sort` | String | Sort field | `?sort=capacity` |
| `order` | String | Sort order (asc/desc) | `?order=desc` |
| `fields` | String | Select fields | `?fields=id,plate_no,capacity` |
| `page` | Number | Page number (default: 1) | `?page=1` |
| `limit` | Number | Results per page (max: 100) | `?limit=20` |

**Security Note**: Operators can only view buses in their own fleet (filtered by `operator_id` automatically).

### **Trip Filters** (`GET /routes/:routeNumber/trips`)

| **Filter** | **Type** | **Description** | **Example** |
|------------|----------|-----------------|-------------|
| `direction` | String | outbound/inbound | `?direction=outbound` |
| `service_type` | String | N, LU, SE | `?service_type=LU` |
| `date` | String | Specific date (YYYY-MM-DD) | `?date=2025-10-06` |
| `startDate` | String | From date (ISO datetime) | `?startDate=2025-10-06T00:00:00Z` |
| `endDate` | String | To date (ISO datetime) | `?endDate=2025-10-06T23:59:59Z` |
| `departure_time_gt` | String | Depart after time | `?departure_time_gt=2025-10-06T08:00:00Z` |
| `departure_time_lt` | String | Depart before time | `?departure_time_lt=2025-10-06T18:00:00Z` |
| `next_hours` | Number | Trips departing within X hours | `?next_hours=2` |
| `status_in` | String | Multiple statuses (comma-separated) | `?status_in=Scheduled,In Progress` |
| `interval_min_lt` | Number | Service interval less than | `?interval_min_lt=90` |
| `interval_min_gt` | Number | Service interval greater than | `?interval_min_gt=60` |
| `stop` | String | Trip passes through stop | `?stop=Peradeniya` |
| `stop_like` | String | Stop pattern match | `?stop_like=Peradeniya` |
| `min_fare` | Number | Minimum fare amount | `?min_fare=400` |
| `max_fare` | Number | Maximum fare amount | `?max_fare=800` |
| `from_stop` | String | Trip starts from stop | `?from_stop=Colombo` |
| `to_stop` | String | Trip ends at stop | `?to_stop=Kandy` |
| `aggregate` | String | Aggregation type | `?aggregate=count` |
| `sort` | String | Sort field | `?sort=departure_time` |
| `order` | String | Sort order (asc/desc) | `?order=asc` |
| `fields` | String | Select fields | `?fields=id,bus_id,departure_time` |
| `page` | Number | Page number (default: 1) | `?page=1` |
| `limit` | Number | Results per page (max: 100) | `?limit=20` |

**Security Note**: Operators can only view trips for buses in their own fleet (filtered by `operator_id` automatically).

### **Location Filters**

#### **Trip Location Filters** (`GET /trips/:tripId/location`)
| **Filter** | **Type** | **Description** | **Example** |
|------------|----------|-----------------|-------------|
| `progress_gt` | Number | Segment progress greater than | `?progress_gt=50` |
| `progress_lt` | Number | Segment progress less than | `?progress_lt=90` |
| `current_segment` | String | Filter by segment name | `?current_segment=Peradeniya` |
| `estimated_delay_gt` | Number | Delay greater than (minutes) | `?estimated_delay_gt=5` |

#### **Location History Filters** (`GET /buses/:busId/locations/history`)
| **Filter** | **Type** | **Description** | **Example** |
|------------|----------|-----------------|-------------|
| `from` | String | From datetime (ISO) | `?from=2025-10-06T00:00:00Z` |
| `to` | String | To datetime (ISO) | `?to=2025-10-06T23:59:59Z` |
| `speed_min` | Number | Minimum speed (km/h) | `?speed_min=20` |
| `speed_max` | Number | Maximum speed (km/h) | `?speed_max=80` |
| `segment_progress_min` | Number | Min segment progress % | `?segment_progress_min=50` |
| `segment_progress_max` | Number | Max segment progress % | `?segment_progress_max=90` |
| `total_progress_min` | Number | Min total progress % | `?total_progress_min=25` |
| `total_progress_max` | Number | Max total progress % | `?total_progress_max=75` |
| `delay_min` | Number | Min delay minutes | `?delay_min=-10` |
| `delay_max` | Number | Max delay minutes | `?delay_max=15` |
| `page` | Number | Page number (default: 1) | `?page=1` |
| `limit` | Number | Results per page (max: 100) | `?limit=50` |

**Security Note**: Operators can only view location history for buses in their own fleet with permit validation.

---

## 📊 Common Usage Examples

### **Find Luxury Buses on Route 01**
```bash
GET /buses?service_type=LU&passes_through_route=01
```

### **Find All Routes Through Peradeniya**
```bash
GET /routes?segment=Peradeniya
```

### **Find Buses Traveling Peradeniya to Kadugannawa**
```bash
GET /buses/segment-search?from_location=Peradeniya&to_location=Kadugannawa
```

### **Get Short Routes (Under 4 Hours)**
```bash
GET /routes?estimated_time_hrs_lt=4&sort=estimated_time_hrs&order=asc
```

### **Find Active Trips for Route 01**
```bash
GET /routes/01/trips?status_in=Scheduled,In Progress&sort=departure_time
```

### **Get Upcoming Trips for Route 08 (Next 2 Hours)**
```bash
GET /routes/08/trips?next_hours=2&direction=outbound
```

### **Find Available SLTB Buses (Not Currently on Trips)**
```bash
GET /buses?operator_type=SLTB&available=true
```

### **Get High-Capacity Buses**
```bash
GET /buses?capacity_gt=55&sort=capacity&order=desc
```

### **Get Recent Locations for a Bus (Operator Only)**
```bash
GET /buses/BUS001/locations/history?from=2025-10-06T00:00:00Z&limit=10
```

### **Get Current Trip Location with Progress Filter**
```bash
GET /trips/TRIP001/location?progress_gt=50&current_segment=Peradeniya
```

### **Update Location with GPS Progress Data (Operator Only)**
```bash
POST /buses/BUS001/location
Authorization: Bearer <operator_token>
{
  "latitude": 6.9271,
  "longitude": 79.8612,
  "speed_kmh": 45,
  "current_segment_id": 123,
  "segment_progress_percentage": 67.5,
  "total_route_progress_percentage": 34.2,
  "estimated_delay_minutes": -3,
  "timestamp": "2025-10-06T10:30:00Z"
}
```

### **Find Routes by Distance Range**
```bash
GET /routes?distance_km_gt=100&distance_km_lt=150&sort=distance_km
```

### **Find Multiple Routes by Numbers**
```bash
GET /routes?route_number_in=01,08,15&fields=route_number,from_city,to_city
```

---

## 🔐 Authentication Headers

All protected endpoints require:
```bash
Authorization: Bearer <jwt_token>
```

Get token from `/auth/login` endpoint. Tokens expire after 1 hour.

---

## ⚡ Performance Tips

1. **Use Pagination**: Always use `page` and `limit` parameters for large datasets
2. **Select Fields**: Use `fields` parameter to get only required data
3. **Filter Early**: Apply filters to reduce dataset size
4. **Cache Tokens**: Reuse JWT tokens until expiry
5. **Use Segment Search**: For route overlap queries, use `/buses/segment-search`

---

## 🚀 Advanced Features

### **Route Segment Discovery**
The system supports advanced route segment filtering to find buses that travel through specific locations, enabling discovery of overlapping routes and alternative transport options.

### **Real-Time Location Caching**
Location data is cached in Redis for optimal real-time performance, with automatic fallback to PostgreSQL for historical data.

### **Client-Side Progress Calculation**
Modern GPS devices can calculate and provide progress percentages, delay estimates, and segment positioning for enhanced accuracy compared to server-side time-based estimates.

### **Hybrid Progress System**
- **Primary**: Client-calculated progress data (recommended)
- **Fallback**: Server-calculated estimates based on scheduled times
- **Debug Mode**: Shows both client and server values for comparison

### **Bidirectional Trip Support**
All trips support both `outbound` and `inbound` directions, allowing for complete round-trip scheduling and tracking.

---

## 🔒 Security & Permit Validation

### **Role-Based Access Control**
- **Admin**: Full system access
- **Operator**: Own fleet access only (filtered by `operator_id`)
- **Commuter**: Read-only public access

### **NTC Permit Validation**
All location update operations include automatic permit validation:
```javascript
// Automatic validation for operators
POST /buses/BUS001/location
// System validates: operator owns bus through permit_number verification
```

### **Operator Fleet Isolation**
Operators are automatically restricted to their own fleet:
- SLTB01 can only access buses with `operator_id = 'SLTB01'`
- PVT01 can only access buses with `operator_id = 'PVT01'`
- No cross-operator data access

### **Token-Based Authentication**
All protected endpoints require JWT tokens:
```bash
Authorization: Bearer <jwt_token>
```
Tokens expire after 1 hour and include role and operator information.

---

## ⚡ Performance & Optimization

### **Pagination**
- Default: 20 results per page
- Maximum: 100 results per page
- Use `page` and `limit` parameters

### **Field Selection**
Use `fields` parameter to request only needed data:
```bash
GET /routes?fields=route_number,from_city,to_city
```

### **Caching Strategy**
- **Redis**: Real-time location data (1-minute TTL)
- **PostgreSQL**: Persistent data with optimized indexes
- **16 Database Indexes**: For efficient filtering and sorting

### **Filter Optimization**
- Apply filters early to reduce dataset size
- Use specific filters rather than broad pattern matching
- Combine multiple filters for targeted results

---

This comprehensive reference covers all API endpoints with their complete filter sets, role-based access controls, real-time caching, permit validation, and usage examples for the NTC Real-Time Bus Tracking System.