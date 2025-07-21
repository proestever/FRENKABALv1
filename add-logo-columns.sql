-- Add new columns to token_logos table for 24-hour retry logic
ALTER TABLE token_logos 
ADD COLUMN IF NOT EXISTS has_logo BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS last_attempt TIMESTAMP NOT NULL DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();

-- Update existing rows to set has_logo=true where logo_url is not null
UPDATE token_logos 
SET has_logo = true 
WHERE logo_url IS NOT NULL;

-- Make logo_url nullable (it was NOT NULL before)
ALTER TABLE token_logos 
ALTER COLUMN logo_url DROP NOT NULL;

-- Drop the old last_updated column if it exists
ALTER TABLE token_logos 
DROP COLUMN IF EXISTS last_updated;