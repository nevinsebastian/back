-- Drop the existing CHECK constraint if it exists
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_role_check;

-- Add the new CHECK constraint with 'service' role
ALTER TABLE employees ADD CONSTRAINT employees_role_check 
    CHECK (role IN ('admin', 'sales', 'accounts', 'rto', 'service')); 