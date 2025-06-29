/*
  # Add notification timing functionality

  1. Changes
    - Add `notification_time` column to tasks table with default '10min'
    - Add `push_notification` column to tasks table with default true
    - Create function to calculate notification trigger time
    - Create function to get tasks due for notifications
    - Update indexes for better performance

  2. Security
    - Functions use SECURITY DEFINER for proper access
    - Maintains existing RLS policies
*/

-- Add notification_time column to tasks table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'notification_time'
  ) THEN
    ALTER TABLE tasks ADD COLUMN notification_time text DEFAULT '10min';
  END IF;
END $$;

-- Add push_notification column to tasks table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'push_notification'
  ) THEN
    ALTER TABLE tasks ADD COLUMN push_notification boolean DEFAULT true;
  END IF;
END $$;

-- Drop existing function if it exists to avoid conflicts
DROP FUNCTION IF EXISTS get_tasks_due_for_notifications();

-- Create function to calculate notification trigger time
CREATE OR REPLACE FUNCTION calculate_notification_time(
  due_date date,
  due_time text,
  notification_time text
)
RETURNS timestamptz AS $$
DECLARE
  due_datetime timestamptz;
  notification_interval interval;
BEGIN
  -- Combine due_date and due_time into a timestamp
  due_datetime := (due_date || ' ' || due_time)::timestamptz;
  
  -- Convert notification_time to interval
  notification_interval := CASE notification_time
    WHEN '3min' THEN interval '3 minutes'
    WHEN '5min' THEN interval '5 minutes'
    WHEN '10min' THEN interval '10 minutes'
    WHEN '15min' THEN interval '15 minutes'
    WHEN '20min' THEN interval '20 minutes'
    WHEN '25min' THEN interval '25 minutes'
    WHEN '30min' THEN interval '30 minutes'
    WHEN '45min' THEN interval '45 minutes'
    WHEN '50min' THEN interval '50 minutes'
    WHEN '1hour' THEN interval '1 hour'
    WHEN '2hours' THEN interval '2 hours'
    WHEN '1day' THEN interval '1 day'
    ELSE interval '10 minutes'
  END;
  
  -- Return the notification trigger time
  RETURN due_datetime - notification_interval;
END;
$$ LANGUAGE plpgsql;

-- Create function to get tasks due for notifications with custom timing
CREATE OR REPLACE FUNCTION get_tasks_due_for_notifications()
RETURNS TABLE (
  task_id uuid,
  task_title text,
  task_description text,
  due_date date,
  due_time text,
  notification_time text,
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
    t.notification_time,
    t.user_id,
    u.email as user_email,
    t.priority
  FROM tasks t
  JOIN auth.users u ON t.user_id = u.id
  WHERE 
    t.completed = false 
    AND t.push_notification = true
    AND calculate_notification_time(t.due_date, t.due_time, t.notification_time) 
        BETWEEN NOW() - interval '1 minute' AND NOW() + interval '1 minute';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update index for better performance with notification timing
DROP INDEX IF EXISTS idx_tasks_push_notifications;
CREATE INDEX idx_tasks_push_notifications 
ON tasks (due_date, due_time, completed, push_notification, notification_time) 
WHERE completed = false AND push_notification = true;

-- Create additional index for notification calculations
CREATE INDEX IF NOT EXISTS idx_tasks_notification_lookup
ON tasks (user_id, due_date, due_time, notification_time, completed, push_notification)
WHERE completed = false AND push_notification = true;