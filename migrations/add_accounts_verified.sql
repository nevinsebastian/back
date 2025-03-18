-- Add accounts_verified column to customers table
ALTER TABLE customers ADD COLUMN IF NOT EXISTS accounts_verified BOOLEAN DEFAULT FALSE; 