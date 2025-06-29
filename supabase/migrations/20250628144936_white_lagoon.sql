/*
  # Add email reminder functionality

  1. Changes
    - Add `email_reminder` boolean column to tasks table
    - Set default value to false
    - Add index for performance on reminder queries

  2. Security
    - No changes to RLS policies needed
    - Column inherits existing security policies
*/

-- Add email_reminder column to tasks table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'email_reminder'
  ) THEN
    ALTER TABLE tasks ADD COLUMN email_reminder boolean DEFAULT false;
  END IF;
END $$;

-- Add index for efficient reminder queries
CREATE INDEX IF NOT EXISTS idx_tasks_reminders 
ON tasks (due_date, due_time, completed, email_reminder) 
WHERE completed = false;