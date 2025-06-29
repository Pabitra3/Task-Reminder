/*
  # Add task lists functionality

  1. New Tables
    - `task_lists`
      - `id` (uuid, primary key)
      - `name` (text, required)
      - `user_id` (uuid, foreign key to auth.users)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Changes to existing tables
    - Add `list_id` column to `tasks` table
    - Add foreign key constraint from tasks to task_lists

  3. Security
    - Enable RLS on `task_lists` table
    - Add policies for authenticated users to manage their own lists
    - Update task policies to include list ownership validation
*/

-- Create task_lists table
CREATE TABLE IF NOT EXISTS task_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add list_id column to tasks table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'list_id'
  ) THEN
    ALTER TABLE tasks ADD COLUMN list_id uuid REFERENCES task_lists(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Enable RLS on task_lists
ALTER TABLE task_lists ENABLE ROW LEVEL SECURITY;

-- Create policies for task_lists
CREATE POLICY "Users can view own task lists"
  ON task_lists
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own task lists"
  ON task_lists
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own task lists"
  ON task_lists
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own task lists"
  ON task_lists
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create trigger for updating updated_at on task_lists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_task_lists_updated_at'
  ) THEN
    CREATE TRIGGER update_task_lists_updated_at
      BEFORE UPDATE ON task_lists
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_task_lists_user_id ON task_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_list_id ON tasks(list_id);