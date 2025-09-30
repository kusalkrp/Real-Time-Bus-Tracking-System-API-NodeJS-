-- Migration script to create database schema for NTC Real-Time Bus Tracking System
-- This will be automatically executed when the PostgreSQL container starts

-- Create routes table
CREATE TABLE IF NOT EXISTS routes (
    id SERIAL PRIMARY KEY,
    from_city VARCHAR(100) NOT NULL,
    to_city VARCHAR(100) NOT NULL,
    distance_km INTEGER NOT NULL CHECK (distance_km > 0),
    estimated_time_hrs FLOAT NOT NULL CHECK (estimated_time_hrs > 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create buses table
CREATE TABLE IF NOT EXISTS buses (
    id VARCHAR(10) PRIMARY KEY,
    plate_no VARCHAR(20) NOT NULL UNIQUE,
    operator_id VARCHAR(10) NOT NULL,
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    type VARCHAR(50) NOT NULL CHECK (type IN ('AC Luxury', 'Semi-Luxury', 'Normal')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create trips table
CREATE TABLE IF NOT EXISTS trips (
    id VARCHAR(10) PRIMARY KEY,
    bus_id VARCHAR(10) NOT NULL REFERENCES buses(id) ON DELETE RESTRICT,
    route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE RESTRICT,
    departure_time TIMESTAMP NOT NULL,
    arrival_time TIMESTAMP NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('Scheduled', 'In Progress', 'Completed', 'Delayed', 'Cancelled')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create locations table
CREATE TABLE IF NOT EXISTS locations (
    id SERIAL PRIMARY KEY,
    trip_id VARCHAR(10) NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    bus_id VARCHAR(10) NOT NULL REFERENCES buses(id) ON DELETE CASCADE,
    latitude FLOAT NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude FLOAT NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    speed_kmh INTEGER NOT NULL CHECK (speed_kmh >= 0),
    timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_routes_from_to ON routes (from_city, to_city);
CREATE INDEX IF NOT EXISTS idx_buses_operator_id ON buses (operator_id);
CREATE INDEX IF NOT EXISTS idx_trips_route_id ON trips (route_id);
CREATE INDEX IF NOT EXISTS idx_trips_bus_id ON trips (bus_id);
CREATE INDEX IF NOT EXISTS idx_trips_departure_time ON trips (departure_time);
CREATE INDEX IF NOT EXISTS idx_locations_trip_id ON locations (trip_id);
CREATE INDEX IF NOT EXISTS idx_locations_bus_id ON locations (bus_id);
CREATE INDEX IF NOT EXISTS idx_locations_timestamp ON locations (timestamp);

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

-- Insert sample data for testing
INSERT INTO routes (from_city, to_city, distance_km, estimated_time_hrs) VALUES 
('Colombo', 'Kandy', 116, 3.0),
('Colombo', 'Galle', 119, 2.5),
('Kandy', 'Nuwara Eliya', 77, 2.0),
('Colombo', 'Negombo', 37, 1.0)
ON CONFLICT DO NOTHING;

INSERT INTO buses (id, plate_no, operator_id, capacity, type) VALUES 
('BUS001', 'NB-1234', 'op1', 50, 'AC Luxury'),
('BUS002', 'NB-5678', 'op1', 45, 'Semi-Luxury'),
('BUS003', 'NB-9012', 'op1', 60, 'Normal')
ON CONFLICT DO NOTHING;