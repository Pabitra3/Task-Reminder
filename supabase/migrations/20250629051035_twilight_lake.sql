/*
  # Add task lists support with list_id column

  1. Schema Changes
    - Add list_id column to tasks table (already exists from previous migration)
    - Ensure proper foreign key constraints
    - Add indexes for performance

  2. Security
    - Maintain existing RLS policies
    - Add proper constraints and validation
*/

-- Ensure list_id column exists and has proper constraints
DO $$
BEGIN
  -- Check if foreign key constraint exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'tasks_list_id_fkey' 
    AND table_name = 'tasks'
  ) THEN
    -- Add foreign key constraint if it doesn't exist
    ALTER TABLE tasks 
    ADD CONSTRAINT tasks_list_id_fkey 
    FOREIGN KEY (list_id) REFERENCES task_lists(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Ensure indexes exist for performance
CREATE INDEX IF NOT EXISTS idx_tasks_list_id ON tasks(list_id);
CREATE INDEX IF NOT EXISTS idx_task_lists_user_id ON task_lists(user_id);

-- Add index for filtering tasks by list and status
CREATE INDEX IF NOT EXISTS idx_tasks_list_filter 
ON tasks(user_id, list_id, completed, priority) 
WHERE sync_status != 'deleted';

-- Add index for notification filtering
CREATE INDEX IF NOT EXISTS idx_tasks_notification_filter
ON tasks(user_id, notification_time, push_notification, email_reminder)
WHERE completed = false AND sync_status != 'deleted';

-- Update comments for documentation
COMMENT ON COLUMN tasks.list_id IS 'Optional reference to task_lists table for organization';
COMMENT ON INDEX idx_tasks_list_filter IS 'Optimizes filtering tasks by list, status, and priority';
COMMENT ON INDEX idx_tasks_notification_filter IS 'Optimizes filtering tasks by notification settings';