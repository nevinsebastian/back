-- Add service role to employees table
ALTER TYPE employee_role ADD VALUE IF NOT EXISTS 'service';

-- Create service_bookings table
CREATE TABLE IF NOT EXISTS service_bookings (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    service_employee_id INTEGER NOT NULL REFERENCES employees(id),
    booking_date TIMESTAMP NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create service_booking_status_history table
CREATE TABLE IF NOT EXISTS service_booking_status_history (
    id SERIAL PRIMARY KEY,
    service_booking_id INTEGER NOT NULL REFERENCES service_bookings(id),
    status VARCHAR(50) NOT NULL,
    notes TEXT,
    created_by INTEGER NOT NULL REFERENCES employees(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for better performance
CREATE INDEX idx_service_bookings_employee ON service_bookings(service_employee_id);
CREATE INDEX idx_service_bookings_customer ON service_bookings(customer_id);
CREATE INDEX idx_service_bookings_status ON service_bookings(status);
CREATE INDEX idx_service_booking_history_booking ON service_booking_status_history(service_booking_id);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_service_bookings_updated_at
    BEFORE UPDATE ON service_bookings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column(); 