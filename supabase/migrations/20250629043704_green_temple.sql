/*
  # Add email notifications functionality

  1. Database Functions
    - Create function to get tasks due for email notifications
    - Reuse existing notification timing calculation function
    - Support customizable timing for both email and push notifications

  2. Indexes
    - Add index for efficient email notification queries
    - Optimize for notification timing calculations

  3. Security
    - Functions use SECURITY DEFINER for cross-user queries
    - Maintain existing RLS policies
*/

-- Create function to get tasks due for email notifications
CREATE OR REPLACE FUNCTION get_tasks_due_for_email_notifications()
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
    AND t.email_reminder = true
    AND calculate_notification_time(t.due_date, t.due_time, t.notification_time) 
        BETWEEN NOW() - interval '1 minute' AND NOW() + interval '1 minute';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create index for email notification queries
CREATE INDEX IF NOT EXISTS idx_tasks_email_notifications
ON tasks (due_date, due_time, completed, email_reminder, notification_time)
WHERE completed = false AND email_reminder = true;

-- Update the existing notification timing function to handle both email and push
COMMENT ON FUNCTION calculate_notification_time(date, text, text) IS 
'Calculates when to send notifications based on due date/time and user-selected timing. Used for both email and push notifications.';

COMMENT ON FUNCTION get_tasks_due_for_email_notifications() IS 
'Returns tasks that need email reminders sent based on their notification_time setting.';

COMMENT ON FUNCTION get_tasks_due_for_notifications() IS 
'Returns tasks that need push notifications sent based on their notification_time setting.';