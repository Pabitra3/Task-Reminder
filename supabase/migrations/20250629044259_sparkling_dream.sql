/*
  # Add sync_status columns for offline functionality

  1. Changes to existing tables
    - Add `sync_status` column to `tasks` table
    - Add `sync_status` column to `task_lists` table
    - Add indexes for sync status queries

  2. Security
    - No changes to RLS policies needed
    - Columns inherit existing security policies
*/

-- Add sync_status column to tasks table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'sync_status'
  ) THEN
    ALTER TABLE tasks ADD COLUMN sync_status text DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending', 'updated', 'deleted'));
  END IF;
END $$;

-- Add sync_status column to task_lists table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_lists' AND column_name = 'sync_status'
  ) THEN
    ALTER TABLE task_lists ADD COLUMN sync_status text DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending', 'updated', 'deleted'));
  END IF;
END $$;

-- Add indexes for sync status queries
CREATE INDEX IF NOT EXISTS idx_tasks_sync_status ON tasks(sync_status, user_id);
CREATE INDEX IF NOT EXISTS idx_task_lists_sync_status ON task_lists(sync_status, user_id);

-- Add comments for documentation
COMMENT ON COLUMN tasks.sync_status IS 'Tracks synchronization status for offline functionality';
COMMENT ON COLUMN task_lists.sync_status IS 'Tracks synchronization status for offline functionality';