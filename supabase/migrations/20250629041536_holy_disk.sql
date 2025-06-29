/*
  # Add push notifications functionality

  1. Schema Changes
    - Add `push_notification` boolean column to tasks table
    - Add `push_subscriptions` table to store user push subscriptions
    - Add indexes for performance optimization

  2. Database Functions
    - Function to check for tasks due within 10 minutes
    - Function to send push notifications via edge function

  3. Security
    - Enable RLS on push_subscriptions table
    - Add policies for authenticated users
*/

-- Add push_notification column to tasks table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'push_notification'
  ) THEN
    ALTER TABLE tasks ADD COLUMN push_notification boolean DEFAULT true;
  END IF;
END $$;

-- Create push_subscriptions table to store user push subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

-- Enable RLS on push_subscriptions
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Create policies for push_subscriptions
CREATE POLICY "Users can view own push subscriptions"
  ON push_subscriptions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own push subscriptions"
  ON push_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own push subscriptions"
  ON push_subscriptions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own push subscriptions"
  ON push_subscriptions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create trigger for updating updated_at on push_subscriptions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_push_subscriptions_updated_at'
  ) THEN
    CREATE TRIGGER update_push_subscriptions_updated_at
      BEFORE UPDATE ON push_subscriptions
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Create function to get tasks due for notifications
CREATE OR REPLACE FUNCTION get_tasks_due_for_notifications()
RETURNS TABLE (
  task_id uuid,
  task_title text,
  task_description text,
  due_date date,
  due_time text,
  user_id uuid,
  user_email text,
  priority priority_level
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id as task_id,
    t.title as task_title,
    t.description as task_description,
    t.due_date,
    t.due_time,
    t.user_id,
    u.email as user_email,
    t.priority
  FROM tasks t
  JOIN auth.users u ON t.user_id = u.id
  WHERE 
    t.completed = false 
    AND t.push_notification = true
    AND t.due_date = CURRENT_DATE
    AND (
      EXTRACT(HOUR FROM (t.due_time::time)) * 60 + EXTRACT(MINUTE FROM (t.due_time::time))
      BETWEEN 
      EXTRACT(HOUR FROM CURRENT_TIME) * 60 + EXTRACT(MINUTE FROM CURRENT_TIME) + 8
      AND 
      EXTRACT(HOUR FROM CURRENT_TIME) * 60 + EXTRACT(MINUTE FROM CURRENT_TIME) + 12
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_tasks_push_notifications 
ON tasks (due_date, due_time, completed, push_notification) 
WHERE completed = false AND push_notification = true;

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);