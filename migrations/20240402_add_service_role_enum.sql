-- Add service role to the enum type
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'service'; 