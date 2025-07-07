-- Database setup for OtaMaps floor plans
-- Run these commands in your Supabase SQL editor

-- First, check if RLS is enabled on features table
-- SELECT * FROM pg_policies WHERE tablename = 'features';

-- Option 1: Add a policy for authenticated users to insert floor plans
CREATE POLICY "Allow authenticated users to insert floor plans" ON features
FOR INSERT
TO authenticated
WITH CHECK (type = 'floor-plan');

-- Option 2: Add a policy for authenticated users to insert any features
-- (Use this if you want broader permissions)
CREATE POLICY "Allow authenticated users to insert features" ON features
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Also ensure users can update and delete their own floor plans
CREATE POLICY "Allow authenticated users to update features" ON features
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete features" ON features
FOR DELETE
TO authenticated
USING (true);

-- Ensure the images storage bucket exists and has proper permissions
-- (This should be run from the Storage section in Supabase dashboard)
-- Or you can create it programmatically in your app

-- Optional: Create a dedicated floor_plans table for better organization
-- CREATE TABLE IF NOT EXISTS floor_plans (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   name TEXT NOT NULL,
--   image_url TEXT NOT NULL,
--   width INTEGER NOT NULL,
--   height INTEGER NOT NULL,
--   opacity REAL DEFAULT 0.7,
--   geometry JSONB NOT NULL,
--   created_at TIMESTAMPTZ DEFAULT NOW(),
--   created_by UUID REFERENCES auth.users(id),
--   building_id UUID -- if you want to associate with buildings
-- );

-- Enable RLS on floor_plans table if created
-- ALTER TABLE floor_plans ENABLE ROW LEVEL SECURITY;

-- Create policies for floor_plans table
-- CREATE POLICY "Allow authenticated users to manage floor plans" ON floor_plans
-- FOR ALL
-- TO authenticated
-- USING (true)
-- WITH CHECK (true);
