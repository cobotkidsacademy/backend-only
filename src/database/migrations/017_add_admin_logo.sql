-- Add logo_url column to admins table
ALTER TABLE admins ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Add company_name column to admins table (for COBOT KIDS KENYA)
ALTER TABLE admins ADD COLUMN IF NOT EXISTS company_name TEXT DEFAULT 'COBOT KIDS KENYA';


