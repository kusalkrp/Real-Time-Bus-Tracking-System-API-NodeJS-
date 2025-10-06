-- Migration script to create database schema for NTC Real-Time Bus Tracking System
-- This will be automatically executed when the PostgreSQL container starts

-- Create routes table with NTC route numbers and segments
CREATE TABLE IF NOT EXISTS routes (
    id SERIAL PRIMARY KEY,
    route_number VARCHAR(10) NOT NULL UNIQUE, -- NTC route number like '01', '08', '15'
    from_city VARCHAR(100) NOT NULL,
    to_city VARCHAR(100) NOT NULL,
    distance_km INTEGER NOT NULL CHECK (distance_km > 0),
    estimated_time_hrs FLOAT NOT NULL CHECK (estimated_time_hrs > 0),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create route segments table for detailed route information
CREATE TABLE IF NOT EXISTS route_segments (
    id SERIAL PRIMARY KEY,
    route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    segment_order INTEGER NOT NULL,
    from_location VARCHAR(100) NOT NULL,
    to_location VARCHAR(100) NOT NULL,
    distance_km FLOAT NOT NULL CHECK (distance_km > 0),
    estimated_time_hrs FLOAT NOT NULL CHECK (estimated_time_hrs > 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(route_id, segment_order)
);

-- Create buses table with NTC-compliant fields
CREATE TABLE IF NOT EXISTS buses (
    id VARCHAR(10) PRIMARY KEY,
    plate_no VARCHAR(20) NOT NULL UNIQUE,
    permit_number VARCHAR(20) NOT NULL UNIQUE, -- NTC permit number
    operator_id VARCHAR(10) NOT NULL,
    operator_type VARCHAR(10) NOT NULL CHECK (operator_type IN ('SLTB', 'Private')),
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    service_type VARCHAR(5) NOT NULL CHECK (service_type IN ('N', 'LU', 'SE')), -- Normal, Luxury, Semi-Express
    type VARCHAR(50) NOT NULL CHECK (type IN ('AC Luxury', 'Semi-Luxury', 'Normal')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create trips table with bidirectional support and service types
CREATE TABLE IF NOT EXISTS trips (
    id VARCHAR(10) PRIMARY KEY,
    bus_id VARCHAR(10) NOT NULL REFERENCES buses(id) ON DELETE RESTRICT,
    route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE RESTRICT,
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('outbound', 'inbound')),
    service_type VARCHAR(5) NOT NULL CHECK (service_type IN ('N', 'LU', 'SE')),
    departure_time TIMESTAMP NOT NULL,
    arrival_time TIMESTAMP NOT NULL,
    interval_min INTEGER, -- Interval between trips in minutes
    status VARCHAR(20) NOT NULL CHECK (status IN ('Scheduled', 'In Progress', 'Completed', 'Delayed', 'Cancelled')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create trip segments for detailed progress tracking
CREATE TABLE IF NOT EXISTS trip_segments (
    id SERIAL PRIMARY KEY,
    trip_id VARCHAR(10) NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    segment_id INTEGER NOT NULL REFERENCES route_segments(id) ON DELETE RESTRICT,
    scheduled_arrival_time TIMESTAMP,
    actual_arrival_time TIMESTAMP,
    progress_percentage FLOAT DEFAULT 0 CHECK (progress_percentage BETWEEN 0 AND 100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create locations table with enhanced progress tracking
CREATE TABLE IF NOT EXISTS locations (
    id SERIAL PRIMARY KEY,
    trip_id VARCHAR(10) NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    bus_id VARCHAR(10) NOT NULL REFERENCES buses(id) ON DELETE CASCADE,
    current_segment_id INTEGER REFERENCES route_segments(id),
    latitude FLOAT NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude FLOAT NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    speed_kmh INTEGER NOT NULL CHECK (speed_kmh >= 0),
    segment_progress_percentage FLOAT DEFAULT 0 CHECK (segment_progress_percentage BETWEEN 0 AND 100),
    total_route_progress_percentage FLOAT DEFAULT 0 CHECK (total_route_progress_percentage BETWEEN 0 AND 100),
    estimated_delay_minutes INTEGER DEFAULT 0, -- Positive = delayed, Negative = ahead of schedule
    timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create fares table for future expansion
CREATE TABLE IF NOT EXISTS fares (
    id SERIAL PRIMARY KEY,
    route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    service_type VARCHAR(5) NOT NULL CHECK (service_type IN ('N', 'LU', 'SE')),
    from_segment_id INTEGER NOT NULL REFERENCES route_segments(id),
    to_segment_id INTEGER NOT NULL REFERENCES route_segments(id),
    fare_amount DECIMAL(8,2) NOT NULL CHECK (fare_amount >= 0),
    currency VARCHAR(3) DEFAULT 'LKR',
    effective_date DATE NOT NULL,
    expiry_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_routes_route_number ON routes (route_number);
CREATE INDEX IF NOT EXISTS idx_routes_from_to ON routes (from_city, to_city);
CREATE INDEX IF NOT EXISTS idx_route_segments_route_id ON route_segments (route_id);
CREATE INDEX IF NOT EXISTS idx_buses_operator_id ON buses (operator_id);
CREATE INDEX IF NOT EXISTS idx_buses_permit_number ON buses (permit_number);
CREATE INDEX IF NOT EXISTS idx_buses_service_type ON buses (service_type);
CREATE INDEX IF NOT EXISTS idx_trips_route_id ON trips (route_id);
CREATE INDEX IF NOT EXISTS idx_trips_bus_id ON trips (bus_id);
CREATE INDEX IF NOT EXISTS idx_trips_direction ON trips (direction);
CREATE INDEX IF NOT EXISTS idx_trips_service_type ON trips (service_type);
CREATE INDEX IF NOT EXISTS idx_trips_departure_time ON trips (departure_time);
CREATE INDEX IF NOT EXISTS idx_trip_segments_trip_id ON trip_segments (trip_id);
CREATE INDEX IF NOT EXISTS idx_locations_trip_id ON locations (trip_id);
CREATE INDEX IF NOT EXISTS idx_locations_bus_id ON locations (bus_id);
CREATE INDEX IF NOT EXISTS idx_locations_timestamp ON locations (timestamp);
CREATE INDEX IF NOT EXISTS idx_locations_segment_id ON locations (current_segment_id);
CREATE INDEX IF NOT EXISTS idx_fares_route_service ON fares (route_id, service_type);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updating updated_at
DROP TRIGGER IF EXISTS update_routes_updated_at ON routes;
CREATE TRIGGER update_routes_updated_at
    BEFORE UPDATE ON routes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_buses_updated_at ON buses;
CREATE TRIGGER update_buses_updated_at
    BEFORE UPDATE ON buses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_trips_updated_at ON trips;
CREATE TRIGGER update_trips_updated_at
    BEFORE UPDATE ON trips
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_trip_segments_updated_at ON trip_segments;
CREATE TRIGGER update_trip_segments_updated_at
    BEFORE UPDATE ON trip_segments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_fares_updated_at ON fares;
CREATE TRIGGER update_fares_updated_at
    BEFORE UPDATE ON fares
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert sample NTC routes data for testing (accurate data from NTC timetables)
INSERT INTO routes (route_number, from_city, to_city, distance_km, estimated_time_hrs) VALUES 
('01', 'Colombo', 'Kandy', 116, 4.17),
('02', 'Colombo', 'Matara', 162, 4.5),
('04', 'Colombo', 'Puttalam', 132, 4.0),
('08', 'Colombo', 'Matale', 141.3, 4.0),
('15', 'Colombo', 'Anuradhapura', 200, 5.0)
ON CONFLICT (route_number) DO NOTHING;

-- Insert route segments for Route 01 (Colombo-Kandy)
INSERT INTO route_segments (route_id, segment_order, from_location, to_location, distance_km, estimated_time_hrs) VALUES 
((SELECT id FROM routes WHERE route_number = '01'), 1, 'Colombo', 'Peradeniya', 80, 1.67),
((SELECT id FROM routes WHERE route_number = '01'), 2, 'Peradeniya', 'Kadugannawa', 20, 1.0),
((SELECT id FROM routes WHERE route_number = '01'), 3, 'Kadugannawa', 'Kandy', 16, 1.5)
ON CONFLICT (route_id, segment_order) DO NOTHING;

-- Insert route segments for Route 02 (Colombo-Matara)
INSERT INTO route_segments (route_id, segment_order, from_location, to_location, distance_km, estimated_time_hrs) VALUES 
((SELECT id FROM routes WHERE route_number = '02'), 1, 'Colombo', 'Galle', 116, 3.0),
((SELECT id FROM routes WHERE route_number = '02'), 2, 'Galle', 'Matara', 46, 1.5)
ON CONFLICT (route_id, segment_order) DO NOTHING;

-- Insert route segments for Route 04 (Colombo-Puttalam)
INSERT INTO route_segments (route_id, segment_order, from_location, to_location, distance_km, estimated_time_hrs) VALUES 
((SELECT id FROM routes WHERE route_number = '04'), 1, 'Colombo', 'Chilaw', 80, 2.5),
((SELECT id FROM routes WHERE route_number = '04'), 2, 'Chilaw', 'Puttalam', 52, 1.5)
ON CONFLICT (route_id, segment_order) DO NOTHING;

-- Insert route segments for Route 08 (Colombo-Matale)
INSERT INTO route_segments (route_id, segment_order, from_location, to_location, distance_km, estimated_time_hrs) VALUES 
((SELECT id FROM routes WHERE route_number = '08'), 1, 'Colombo', 'Peradeniya', 80, 1.25),
((SELECT id FROM routes WHERE route_number = '08'), 2, 'Peradeniya', 'Kadugannawa', 15, 0.55),
((SELECT id FROM routes WHERE route_number = '08'), 3, 'Kadugannawa', 'Mawanela', 15, 0.55),
((SELECT id FROM routes WHERE route_number = '08'), 4, 'Mawanela', 'Matale', 20, 0.95)
ON CONFLICT (route_id, segment_order) DO NOTHING;

-- Insert route segments for Route 15 (Colombo-Anuradhapura)
INSERT INTO route_segments (route_id, segment_order, from_location, to_location, distance_km, estimated_time_hrs) VALUES 
((SELECT id FROM routes WHERE route_number = '15'), 1, 'Colombo', 'Kurunegala', 93, 2.5),
((SELECT id FROM routes WHERE route_number = '15'), 2, 'Kurunegala', 'Anuradhapura', 107, 2.5)
ON CONFLICT (route_id, segment_order) DO NOTHING;

-- Insert sample buses with NTC-compliant data (5 buses per route = 25 total)

-- Route 01 (Colombo-Kandy) Buses
INSERT INTO buses (id, plate_no, permit_number, operator_id, operator_type, capacity, service_type, type) VALUES 
('BUS001', 'NB-1234', 'NTC2023001', 'SLTB01', 'SLTB', 50, 'LU', 'AC Luxury'),
('BUS002', 'NB-5678', 'NTC2023002', 'SLTB01', 'SLTB', 45, 'SE', 'Semi-Luxury'),
('BUS003', 'NB-9012', 'NTC2023003', 'SLTB01', 'SLTB', 60, 'N', 'Normal'),
('BUS004', 'WP-3456', 'NTC2023004', 'PVT01', 'Private', 55, 'LU', 'AC Luxury'),
('BUS005', 'CP-7890', 'NTC2023005', 'PVT01', 'Private', 48, 'SE', 'Semi-Luxury'),

-- Route 02 (Colombo-Matara) Buses
('BUS006', 'SP-2341', 'NTC2023006', 'SLTB02', 'SLTB', 52, 'LU', 'AC Luxury'),
('BUS007', 'SP-6785', 'NTC2023007', 'SLTB02', 'SLTB', 58, 'N', 'Normal'),
('BUS008', 'SP-1029', 'NTC2023008', 'PVT02', 'Private', 46, 'SE', 'Semi-Luxury'),
('BUS009', 'GA-4567', 'NTC2023009', 'PVT02', 'Private', 50, 'LU', 'AC Luxury'),
('BUS010', 'GA-8901', 'NTC2023010', 'SLTB02', 'SLTB', 62, 'N', 'Normal'),

-- Route 04 (Colombo-Puttalam) Buses
('BUS011', 'WP-2345', 'NTC2023011', 'SLTB03', 'SLTB', 48, 'SE', 'Semi-Luxury'),
('BUS012', 'WP-6789', 'NTC2023012', 'SLTB03', 'SLTB', 55, 'N', 'Normal'),
('BUS013', 'PT-1234', 'NTC2023013', 'PVT03', 'Private', 44, 'LU', 'AC Luxury'),
('BUS014', 'PT-5678', 'NTC2023014', 'PVT03', 'Private', 50, 'SE', 'Semi-Luxury'),
('BUS015', 'CH-9012', 'NTC2023015', 'SLTB03', 'SLTB', 60, 'N', 'Normal'),

-- Route 08 (Colombo-Matale) Buses
('BUS016', 'KE-3456', 'NTC2023016', 'SLTB04', 'SLTB', 47, 'LU', 'AC Luxury'),
('BUS017', 'KE-7890', 'NTC2023017', 'SLTB04', 'SLTB', 56, 'N', 'Normal'),
('BUS018', 'ML-1234', 'NTC2023018', 'PVT04', 'Private', 42, 'SE', 'Semi-Luxury'),
('BUS019', 'ML-5678', 'NTC2023019', 'PVT04', 'Private', 49, 'LU', 'AC Luxury'),
('BUS020', 'DM-9012', 'NTC2023020', 'SLTB04', 'SLTB', 58, 'N', 'Normal'),

-- Route 15 (Colombo-Anuradhapura) Buses
('BUS021', 'KU-2345', 'NTC2023021', 'SLTB05', 'SLTB', 51, 'LU', 'AC Luxury'),
('BUS022', 'KU-6789', 'NTC2023022', 'SLTB05', 'SLTB', 59, 'N', 'Normal'),
('BUS023', 'AD-1234', 'NTC2023023', 'PVT05', 'Private', 45, 'SE', 'Semi-Luxury'),
('BUS024', 'AD-5678', 'NTC2023024', 'PVT05', 'Private', 53, 'LU', 'AC Luxury'),
('BUS025', 'NC-9012', 'NTC2023025', 'SLTB05', 'SLTB', 61, 'N', 'Normal')
ON CONFLICT (id) DO NOTHING;

-- Insert sample fares for Route 01 (Colombo to Kandy - full route)
INSERT INTO fares (route_id, service_type, from_segment_id, to_segment_id, fare_amount, effective_date) VALUES 
((SELECT id FROM routes WHERE route_number = '01'), 'N', 
 (SELECT id FROM route_segments WHERE route_id = (SELECT id FROM routes WHERE route_number = '01') AND segment_order = 1),
 (SELECT id FROM route_segments WHERE route_id = (SELECT id FROM routes WHERE route_number = '01') AND segment_order = 3),
 450.00, '2025-01-01'),
((SELECT id FROM routes WHERE route_number = '01'), 'LU', 
 (SELECT id FROM route_segments WHERE route_id = (SELECT id FROM routes WHERE route_number = '01') AND segment_order = 1),
 (SELECT id FROM route_segments WHERE route_id = (SELECT id FROM routes WHERE route_number = '01') AND segment_order = 3),
 680.00, '2025-01-01'),
((SELECT id FROM routes WHERE route_number = '01'), 'SE', 
 (SELECT id FROM route_segments WHERE route_id = (SELECT id FROM routes WHERE route_number = '01') AND segment_order = 1),
 (SELECT id FROM route_segments WHERE route_id = (SELECT id FROM routes WHERE route_number = '01') AND segment_order = 3),
 565.00, '2025-01-01'),
-- Sample fares for Route 02 (Colombo to Matara - full route)
((SELECT id FROM routes WHERE route_number = '02'), 'N', 
 (SELECT id FROM route_segments WHERE route_id = (SELECT id FROM routes WHERE route_number = '02') AND segment_order = 1),
 (SELECT id FROM route_segments WHERE route_id = (SELECT id FROM routes WHERE route_number = '02') AND segment_order = 2),
 520.00, '2025-01-01'),
((SELECT id FROM routes WHERE route_number = '02'), 'LU', 
 (SELECT id FROM route_segments WHERE route_id = (SELECT id FROM routes WHERE route_number = '02') AND segment_order = 1),
 (SELECT id FROM route_segments WHERE route_id = (SELECT id FROM routes WHERE route_number = '02') AND segment_order = 2),
 780.00, '2025-01-01'),
-- Sample fares for Route 08 (Colombo to Matale - full route)
((SELECT id FROM routes WHERE route_number = '08'), 'N', 
 (SELECT id FROM route_segments WHERE route_id = (SELECT id FROM routes WHERE route_number = '08') AND segment_order = 1),
 (SELECT id FROM route_segments WHERE route_id = (SELECT id FROM routes WHERE route_number = '08') AND segment_order = 3),
 485.00, '2025-01-01'),
((SELECT id FROM routes WHERE route_number = '08'), 'LU', 
 (SELECT id FROM route_segments WHERE route_id = (SELECT id FROM routes WHERE route_number = '08') AND segment_order = 1),
 (SELECT id FROM route_segments WHERE route_id = (SELECT id FROM routes WHERE route_number = '08') AND segment_order = 3),
 728.00, '2025-01-01'),
((SELECT id FROM routes WHERE route_number = '08'), 'SE', 
 (SELECT id FROM route_segments WHERE route_id = (SELECT id FROM routes WHERE route_number = '08') AND segment_order = 1),
 (SELECT id FROM route_segments WHERE route_id = (SELECT id FROM routes WHERE route_number = '08') AND segment_order = 3),
 606.00, '2025-01-01'),

-- Sample fares for Route 04 (Colombo to Puttalam - full route)
((SELECT id FROM routes WHERE route_number = '04'), 'N', 
 (SELECT id FROM route_segments WHERE route_id = (SELECT id FROM routes WHERE route_number = '04') AND segment_order = 1),
 (SELECT id FROM route_segments WHERE route_id = (SELECT id FROM routes WHERE route_number = '04') AND segment_order = 2),
 420.00, '2025-01-01'),
((SELECT id FROM routes WHERE route_number = '04'), 'LU', 
 (SELECT id FROM route_segments WHERE route_id = (SELECT id FROM routes WHERE route_number = '04') AND segment_order = 1),
 (SELECT id FROM route_segments WHERE route_id = (SELECT id FROM routes WHERE route_number = '04') AND segment_order = 2),
 630.00, '2025-01-01'),
((SELECT id FROM routes WHERE route_number = '04'), 'SE', 
 (SELECT id FROM route_segments WHERE route_id = (SELECT id FROM routes WHERE route_number = '04') AND segment_order = 1),
 (SELECT id FROM route_segments WHERE route_id = (SELECT id FROM routes WHERE route_number = '04') AND segment_order = 2),
 525.00, '2025-01-01'),

-- Sample fares for Route 15 (Colombo to Anuradhapura - full route)
((SELECT id FROM routes WHERE route_number = '15'), 'N', 
 (SELECT id FROM route_segments WHERE route_id = (SELECT id FROM routes WHERE route_number = '15') AND segment_order = 1),
 (SELECT id FROM route_segments WHERE route_id = (SELECT id FROM routes WHERE route_number = '15') AND segment_order = 2),
 650.00, '2025-01-01'),
((SELECT id FROM routes WHERE route_number = '15'), 'LU', 
 (SELECT id FROM route_segments WHERE route_id = (SELECT id FROM routes WHERE route_number = '15') AND segment_order = 1),
 (SELECT id FROM route_segments WHERE route_id = (SELECT id FROM routes WHERE route_number = '15') AND segment_order = 2),
 975.00, '2025-01-01'),
((SELECT id FROM routes WHERE route_number = '15'), 'SE', 
 (SELECT id FROM route_segments WHERE route_id = (SELECT id FROM routes WHERE route_number = '15') AND segment_order = 1),
 (SELECT id FROM route_segments WHERE route_id = (SELECT id FROM routes WHERE route_number = '15') AND segment_order = 2),
 812.00, '2025-01-01')
ON CONFLICT DO NOTHING;

-- Insert sample trips to connect buses to routes (essential for segment search)
-- Route 01 (Colombo-Kandy) trips
INSERT INTO trips (id, bus_id, route_id, direction, service_type, departure_time, arrival_time, interval_min, status) VALUES 
('TRIP001', 'BUS001', (SELECT id FROM routes WHERE route_number = '01'), 'outbound', 'LU', '2025-10-05 08:00:00', '2025-10-05 12:10:00', 60, 'Scheduled'),
('TRIP002', 'BUS002', (SELECT id FROM routes WHERE route_number = '01'), 'outbound', 'SE', '2025-10-05 09:00:00', '2025-10-05 13:10:00', 90, 'Scheduled'),
('TRIP003', 'BUS003', (SELECT id FROM routes WHERE route_number = '01'), 'outbound', 'N', '2025-10-05 10:00:00', '2025-10-05 14:10:00', 120, 'Scheduled'),

-- Route 08 (Colombo-Matale) trips - This route ALSO passes through Peradeniya-Kadugannawa
('TRIP004', 'BUS016', (SELECT id FROM routes WHERE route_number = '08'), 'outbound', 'LU', '2025-10-05 08:30:00', '2025-10-05 12:30:00', 60, 'Scheduled'),
('TRIP005', 'BUS017', (SELECT id FROM routes WHERE route_number = '08'), 'outbound', 'N', '2025-10-05 09:30:00', '2025-10-05 13:30:00', 90, 'Scheduled'),
('TRIP006', 'BUS018', (SELECT id FROM routes WHERE route_number = '08'), 'outbound', 'SE', '2025-10-05 10:30:00', '2025-10-05 14:30:00', 120, 'Scheduled'),

-- Route 02 (Colombo-Matara) trips
('TRIP007', 'BUS006', (SELECT id FROM routes WHERE route_number = '02'), 'outbound', 'LU', '2025-10-05 07:00:00', '2025-10-05 11:30:00', 90, 'Scheduled'),
('TRIP008', 'BUS007', (SELECT id FROM routes WHERE route_number = '02'), 'outbound', 'N', '2025-10-05 08:00:00', '2025-10-05 12:30:00', 120, 'Scheduled'),

-- Route 04 (Colombo-Puttalam) trips
('TRIP009', 'BUS011', (SELECT id FROM routes WHERE route_number = '04'), 'outbound', 'SE', '2025-10-05 07:30:00', '2025-10-05 11:30:00', 90, 'Scheduled'),
('TRIP010', 'BUS012', (SELECT id FROM routes WHERE route_number = '04'), 'outbound', 'N', '2025-10-05 08:30:00', '2025-10-05 12:30:00', 120, 'Scheduled'),

-- Route 15 (Colombo-Anuradhapura) trips
('TRIP011', 'BUS021', (SELECT id FROM routes WHERE route_number = '15'), 'outbound', 'LU', '2025-10-05 06:00:00', '2025-10-05 11:00:00', 120, 'Scheduled'),
('TRIP012', 'BUS022', (SELECT id FROM routes WHERE route_number = '15'), 'outbound', 'N', '2025-10-05 07:00:00', '2025-10-05 12:00:00', 150, 'Scheduled')
ON CONFLICT (id) DO NOTHING;