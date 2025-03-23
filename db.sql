-- Drop existing objects if they exist
DROP TRIGGER IF EXISTS update_analytics_trigger ON customers;
DROP FUNCTION IF EXISTS update_analytics();
DROP TABLE IF EXISTS analytics;
DROP TABLE IF EXISTS notifications;

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    sender_id INTEGER NOT NULL REFERENCES employees(id),
    target_type VARCHAR(50) NOT NULL,
    target_id JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create notification_reads table
CREATE TABLE IF NOT EXISTS notification_reads (
    id SERIAL PRIMARY KEY,
    notification_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(notification_id, employee_id)
);

-- Create analytics table
CREATE TABLE IF NOT EXISTS analytics (
    id SERIAL PRIMARY KEY,
    total_customers INTEGER DEFAULT 0,
    pending_customers INTEGER DEFAULT 0,
    submitted_customers INTEGER DEFAULT 0,
    verified_customers INTEGER DEFAULT 0,
    total_revenue DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Function to update analytics
CREATE OR REPLACE FUNCTION update_analytics()
RETURNS TRIGGER AS $$
DECLARE
    total_count INTEGER;
    pending_count INTEGER;
    submitted_count INTEGER;
    verified_count INTEGER;
    revenue_sum DECIMAL(10,2);
BEGIN
    -- Calculate counts safely
    SELECT COUNT(*) INTO total_count FROM customers;
    SELECT COUNT(*) INTO pending_count FROM customers WHERE status = 'Pending';
    SELECT COUNT(*) INTO submitted_count FROM customers WHERE status = 'Submitted';
    SELECT COUNT(*) INTO verified_count FROM customers WHERE status = 'Verified';
    SELECT COALESCE(SUM(COALESCE(amount_paid, 0)), 0) INTO revenue_sum FROM customers;

    -- Update or insert analytics record
    INSERT INTO analytics (
        id, 
        total_customers, 
        pending_customers, 
        submitted_customers, 
        verified_customers, 
        total_revenue,
        updated_at
    ) 
    VALUES (
        1, 
        total_count,
        pending_count,
        submitted_count,
        verified_count,
        revenue_sum,
        CURRENT_TIMESTAMP
    )
    ON CONFLICT (id) DO UPDATE 
    SET total_customers = EXCLUDED.total_customers,
        pending_customers = EXCLUDED.pending_customers,
        submitted_customers = EXCLUDED.submitted_customers,
        verified_customers = EXCLUDED.verified_customers,
        total_revenue = EXCLUDED.total_revenue,
        updated_at = CURRENT_TIMESTAMP;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update analytics when customers table changes
CREATE TRIGGER update_analytics_trigger
AFTER INSERT OR UPDATE OR DELETE ON customers
FOR EACH STATEMENT
EXECUTE FUNCTION update_analytics();

-- Initialize analytics with one row
INSERT INTO analytics (id) 
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Initial update of analytics using a function wrapper
CREATE OR REPLACE FUNCTION initialize_analytics()
RETURNS void AS $$
DECLARE
    total_count INTEGER;
    pending_count INTEGER;
    submitted_count INTEGER;
    verified_count INTEGER;
    revenue_sum DECIMAL(10,2);
BEGIN
    -- Calculate counts safely
    SELECT COUNT(*) INTO total_count FROM customers;
    SELECT COUNT(*) INTO pending_count FROM customers WHERE status = 'Pending';
    SELECT COUNT(*) INTO submitted_count FROM customers WHERE status = 'Submitted';
    SELECT COUNT(*) INTO verified_count FROM customers WHERE status = 'Verified';
    SELECT COALESCE(SUM(COALESCE(amount_paid, 0)), 0) INTO revenue_sum FROM customers;

    -- Update analytics
    UPDATE analytics 
    SET total_customers = total_count,
        pending_customers = pending_count,
        submitted_customers = submitted_count,
        verified_customers = verified_count,
        total_revenue = revenue_sum,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = 1;
END;
$$ LANGUAGE plpgsql;

-- Run the initialization
SELECT initialize_analytics(); 