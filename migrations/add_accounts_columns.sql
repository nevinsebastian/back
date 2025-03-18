-- Add columns for accounts functionality
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS sales_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS accounts_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS manager_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS rto_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS emi DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS tenure INTEGER,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column(); 