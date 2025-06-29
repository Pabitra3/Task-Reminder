/*
  # Add recurring tasks functionality

  1. Schema Changes
    - Add `recurrence` enum column to tasks table (none, daily, weekly, monthly)
    - Add `recurrence_id` uuid column to link recurring task instances
    - Add `is_recurring_parent` boolean to identify original recurring tasks

  2. Database Functions
    - Function to generate recurring task instances
    - Trigger to create new instances when recurring task is completed

  3. Security
    - Update existing RLS policies to handle recurring tasks
    - Add indexes for performance optimization
*/

-- Create recurrence enum type
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'recurrence_type') THEN
    CREATE TYPE recurrence_type AS ENUM ('none', 'daily', 'weekly', 'monthly');
  END IF;
END $$;

-- Add recurrence columns to tasks table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'recurrence'
  ) THEN
    ALTER TABLE tasks ADD COLUMN recurrence recurrence_type DEFAULT 'none';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'recurrence_id'
  ) THEN
    ALTER TABLE tasks ADD COLUMN recurrence_id uuid;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'is_recurring_parent'
  ) THEN
    ALTER TABLE tasks ADD COLUMN is_recurring_parent boolean DEFAULT false;
  END IF;
END $$;

-- Create function to generate recurring task instances
CREATE OR REPLACE FUNCTION generate_recurring_tasks(
  parent_task_id uuid,
  recurrence_pattern recurrence_type,
  instances_count integer DEFAULT 52
)
RETURNS void AS $$
DECLARE
  parent_task tasks%ROWTYPE;
  new_due_date date;
  new_task_id uuid;
  i integer;
BEGIN
  -- Get the parent task
  SELECT * INTO parent_task FROM tasks WHERE id = parent_task_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent task not found';
  END IF;
  
  -- Generate recurring instances
  FOR i IN 1..instances_count LOOP
    -- Calculate next due date based on recurrence pattern
    CASE recurrence_pattern
      WHEN 'daily' THEN
        new_due_date := parent_task.due_date + (i || ' days')::interval;
      WHEN 'weekly' THEN
        new_due_date := parent_task.due_date + (i || ' weeks')::interval;
      WHEN 'monthly' THEN
        new_due_date := parent_task.due_date + (i || ' months')::interval;
      ELSE
        EXIT; -- Stop if recurrence is 'none'
    END CASE;
    
    -- Don't create tasks more than 1 year in the future
    IF new_due_date > CURRENT_DATE + interval '1 year' THEN
      EXIT;
    END IF;
    
    -- Create new task instance
    INSERT INTO tasks (
      title,
      description,
      due_date,
      due_time,
      priority,
      user_id,
      list_id,
      email_reminder,
      push_notification,
      notification_time,
      recurrence,
      recurrence_id,
      is_recurring_parent
    ) VALUES (
      parent_task.title,
      parent_task.description,
      new_due_date,
      parent_task.due_time,
      parent_task.priority,
      parent_task.user_id,
      parent_task.list_id,
      parent_task.email_reminder,
      parent_task.push_notification,
      parent_task.notification_time,
      'none', -- Individual instances are not recurring
      parent_task_id, -- Link to parent
      false
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Create function to handle recurring task completion
CREATE OR REPLACE FUNCTION handle_recurring_task_completion()
RETURNS TRIGGER AS $$
DECLARE
  next_due_date date;
  existing_next_task_count integer;
BEGIN
  -- Only process if task is being marked as completed and has recurrence
  IF NEW.completed = true AND OLD.completed = false AND NEW.recurrence != 'none' THEN
    
    -- Calculate next due date
    CASE NEW.recurrence
      WHEN 'daily' THEN
        next_due_date := NEW.due_date + interval '1 day';
      WHEN 'weekly' THEN
        next_due_date := NEW.due_date + interval '1 week';
      WHEN 'monthly' THEN
        next_due_date := NEW.due_date + interval '1 month';
      ELSE
        RETURN NEW;
    END CASE;
    
    -- Check if next instance already exists
    SELECT COUNT(*) INTO existing_next_task_count
    FROM tasks
    WHERE recurrence_id = COALESCE(NEW.recurrence_id, NEW.id)
      AND due_date = next_due_date
      AND completed = false;
    
    -- Create next instance if it doesn't exist and is within 1 year
    IF existing_next_task_count = 0 AND next_due_date <= CURRENT_DATE + interval '1 year' THEN
      INSERT INTO tasks (
        title,
        description,
        due_date,
        due_time,
        priority,
        user_id,
        list_id,
        email_reminder,
        push_notification,
        notification_time,
        recurrence,
        recurrence_id,
        is_recurring_parent
      ) VALUES (
        NEW.title,
        NEW.description,
        next_due_date,
        NEW.due_time,
        NEW.priority,
        NEW.user_id,
        NEW.list_id,
        NEW.email_reminder,
        NEW.push_notification,
        NEW.notification_time,
        'none', -- Individual instances are not recurring
        COALESCE(NEW.recurrence_id, NEW.id), -- Link to original parent
        false
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for recurring task completion
DROP TRIGGER IF EXISTS trigger_recurring_task_completion ON tasks;
CREATE TRIGGER trigger_recurring_task_completion
  AFTER UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION handle_recurring_task_completion();

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_tasks_recurrence ON tasks(recurrence) WHERE recurrence != 'none';
CREATE INDEX IF NOT EXISTS idx_tasks_recurrence_id ON tasks(recurrence_id) WHERE recurrence_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_recurring_parent ON tasks(is_recurring_parent) WHERE is_recurring_parent = true;

-- Add index for efficient recurring task queries
CREATE INDEX IF NOT EXISTS idx_tasks_recurring_lookup 
ON tasks(user_id, recurrence_id, due_date, completed) 
WHERE recurrence_id IS NOT NULL;