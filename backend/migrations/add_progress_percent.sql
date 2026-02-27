-- Add progress_percent column to clone_status table
-- Run this migration to add progress tracking to clone operations

ALTER TABLE clone_status 
ADD COLUMN IF NOT EXISTS progress_percent INTEGER DEFAULT 0;

-- Add comment explaining the column
COMMENT ON COLUMN clone_status.progress_percent IS 'Clone progress percentage (0-100)';
