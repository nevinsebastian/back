-- Add verification status fields to customers table
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS sales_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS accounts_verified BOOLEAN DEFAULT FALSE;

-- Create index for faster queries on verification status
CREATE INDEX IF NOT EXISTS idx_customers_verification_status 
ON customers(sales_verified, accounts_verified);

-- Update existing records to set default values
UPDATE customers 
SET sales_verified = FALSE, accounts_verified = FALSE 
WHERE sales_verified IS NULL OR accounts_verified IS NULL; 