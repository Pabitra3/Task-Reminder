import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const app = express();
const port = process.env.PORT || 3001;

// Supabase client
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.use(cors());
app.use(express.json());

// Middleware to verify Supabase JWT
const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
};

// POST /api/tasks - Create a new task
app.post('/api/tasks', authenticateUser, async (req, res) => {
  try {
    const {
      title,
      description,
      due_date,
      due_time,
      priority = 'medium',
      email_reminder = false,
      push_notification = true,
      notification_time = '10min',
      recurrence = 'none',
      list_id = null
    } = req.body;

    if (!title || !due_date || !due_time) {
      return res.status(400).json({ error: 'Title, due_date, and due_time are required' });
    }

    const taskData = {
      title,
      description,
      due_date,
      due_time,
      priority,
      user_id: req.user.id,
      completed: false,
      email_reminder,
      push_notification,
      notification_time,
      recurrence,
      list_id,
      sync_status: 'synced',
      is_recurring_parent: recurrence !== 'none'
    };

    const { data, error } = await supabase
      .from('tasks')
      .insert(taskData)
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Failed to create task' });
    }

    // Generate recurring instances if needed
    if (recurrence !== 'none') {
      try {
        await generateRecurringInstances(data.id, recurrence, taskData);
      } catch (recurringError) {
        console.error('Error generating recurring instances:', recurringError);
        // Don't fail the main request if recurring generation fails
      }
    }

    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tasks - Fetch tasks for authenticated user
app.get('/api/tasks', authenticateUser, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', req.user.id)
      .order('due_date', { ascending: true });

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Failed to fetch tasks' });
    }

    res.json(data || []);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/tasks/:id - Update a task by ID
app.put('/api/tasks/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };
    
    // Remove fields that shouldn't be updated directly
    delete updates.id;
    delete updates.user_id;
    delete updates.created_at;
    
    // Set sync status and updated timestamp
    updates.sync_status = 'synced';
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Failed to update task' });
    }

    if (!data) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json(data);
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/tasks/:id - Delete a task by ID
app.delete('/api/tasks/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if this is a recurring parent task
    const { data: taskToDelete } = await supabase
      .from('tasks')
      .select('is_recurring_parent')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (!taskToDelete) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (taskToDelete.is_recurring_parent) {
      // Delete all instances of this recurring task
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('user_id', req.user.id)
        .or(`id.eq.${id},recurrence_id.eq.${id}`);

      if (error) {
        console.error('Database error:', error);
        return res.status(500).json({ error: 'Failed to delete recurring task series' });
      }
    } else {
      // Delete single task
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', id)
        .eq('user_id', req.user.id);

      if (error) {
        console.error('Database error:', error);
        return res.status(500).json({ error: 'Failed to delete task' });
      }
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/lists - Create a new task list
app.post('/api/lists', authenticateUser, async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'List name is required' });
    }

    const listData = {
      name: name.trim(),
      user_id: req.user.id,
      sync_status: 'synced'
    };

    const { data, error } = await supabase
      .from('task_lists')
      .insert(listData)
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Failed to create task list' });
    }

    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating task list:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/lists - Fetch task lists for authenticated user
app.get('/api/lists', authenticateUser, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('task_lists')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Failed to fetch task lists' });
    }

    res.json(data || []);
  } catch (error) {
    console.error('Error fetching task lists:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/lists/:id - Delete a task list and its tasks
app.delete('/api/lists/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify the list belongs to the user
    const { data: listToDelete } = await supabase
      .from('task_lists')
      .select('id')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (!listToDelete) {
      return res.status(404).json({ error: 'Task list not found' });
    }

    // Delete the list (tasks will be deleted automatically due to CASCADE)
    const { error } = await supabase
      .from('task_lists')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.id);

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Failed to delete task list' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting task list:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/sync - Process batch of offline changes
app.post('/api/sync', authenticateUser, async (req, res) => {
  try {
    const { changes } = req.body;

    if (!Array.isArray(changes)) {
      return res.status(400).json({ error: 'Changes must be an array' });
    }

    const results = {
      processed: 0,
      errors: [],
      conflicts: []
    };

    for (const change of changes) {
      try {
        await processSyncChange(change, req.user.id, results);
        results.processed++;
      } catch (error) {
        console.error('Error processing sync change:', error);
        results.errors.push({
          change,
          error: error.message
        });
      }
    }

    res.json(results);
  } catch (error) {
    console.error('Error in sync endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/sync-emails - Process email notification queue
app.post('/api/sync-emails', authenticateUser, async (req, res) => {
  try {
    const { emailQueue } = req.body;

    if (!Array.isArray(emailQueue)) {
      return res.status(400).json({ error: 'Email queue must be an array' });
    }

    const results = {
      processed: 0,
      errors: [],
      sent: 0
    };

    for (const emailNotification of emailQueue) {
      try {
        // Validate that the task still exists and belongs to the user
        const { data: task, error: taskError } = await supabase
          .from('tasks')
          .select('*')
          .eq('id', emailNotification.taskId)
          .eq('user_id', req.user.id)
          .single();

        if (taskError || !task) {
          results.errors.push({
            emailNotification,
            error: 'Task not found or access denied'
          });
          continue;
        }

        // Check if task is still eligible for email notification
        if (!task.completed && task.email_reminder) {
          // Calculate if notification should still be sent
          const notificationTime = calculateNotificationTime(
            task.due_date,
            task.due_time,
            task.notification_time
          );

          const now = new Date();
          const timeDiff = notificationTime.getTime() - now.getTime();

          // Send if within 5 minutes of scheduled time (to account for sync delays)
          if (Math.abs(timeDiff) <= 5 * 60 * 1000) {
            await sendEmailNotification(task, req.user.email);
            results.sent++;
          }
        }

        results.processed++;
      } catch (error) {
        console.error('Error processing email notification:', error);
        results.errors.push({
          emailNotification,
          error: error.message
        });
      }
    }

    res.json(results);
  } catch (error) {
    console.error('Error in sync-emails endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to process individual sync changes
async function processSyncChange(change, userId, results) {
  const { type, action, data, clientTimestamp } = change;

  if (type === 'task') {
    switch (action) {
      case 'create':
        await handleTaskCreate(data, userId);
        break;
      case 'update':
        await handleTaskUpdate(data, userId, clientTimestamp, results);
        break;
      case 'delete':
        await handleTaskDelete(data.id, userId);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } else if (type === 'task_list') {
    switch (action) {
      case 'create':
        await handleTaskListCreate(data, userId);
        break;
      case 'update':
        await handleTaskListUpdate(data, userId, clientTimestamp, results);
        break;
      case 'delete':
        await handleTaskListDelete(data.id, userId);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } else {
    throw new Error(`Unknown type: ${type}`);
  }
}

// Task sync handlers
async function handleTaskCreate(data, userId) {
  const taskData = {
    ...data,
    user_id: userId,
    sync_status: 'synced'
  };

  const { error } = await supabase
    .from('tasks')
    .insert(taskData);

  if (error) throw error;

  // Generate recurring instances if needed
  if (data.recurrence && data.recurrence !== 'none' && data.is_recurring_parent) {
    try {
      await generateRecurringInstances(data.id, data.recurrence, taskData);
    } catch (recurringError) {
      console.error('Error generating recurring instances during sync:', recurringError);
    }
  }
}

async function handleTaskUpdate(data, userId, clientTimestamp, results) {
  // Check for conflicts by comparing timestamps
  const { data: existingTask } = await supabase
    .from('tasks')
    .select('updated_at')
    .eq('id', data.id)
    .eq('user_id', userId)
    .single();

  if (existingTask) {
    const serverTimestamp = new Date(existingTask.updated_at);
    const clientTime = new Date(clientTimestamp);

    if (serverTimestamp > clientTime) {
      // Server version is newer - conflict detected
      results.conflicts.push({
        id: data.id,
        type: 'task',
        reason: 'Server version is newer',
        serverTimestamp: existingTask.updated_at,
        clientTimestamp
      });
      return;
    }
  }

  const updates = {
    ...data,
    sync_status: 'synced',
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', data.id)
    .eq('user_id', userId);

  if (error) throw error;
}

async function handleTaskDelete(taskId, userId) {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', taskId)
    .eq('user_id', userId);

  if (error) throw error;
}

// Task list sync handlers
async function handleTaskListCreate(data, userId) {
  const listData = {
    ...data,
    user_id: userId,
    sync_status: 'synced'
  };

  const { error } = await supabase
    .from('task_lists')
    .insert(listData);

  if (error) throw error;
}

async function handleTaskListUpdate(data, userId, clientTimestamp, results) {
  // Check for conflicts
  const { data: existingList } = await supabase
    .from('task_lists')
    .select('updated_at')
    .eq('id', data.id)
    .eq('user_id', userId)
    .single();

  if (existingList) {
    const serverTimestamp = new Date(existingList.updated_at);
    const clientTime = new Date(clientTimestamp);

    if (serverTimestamp > clientTime) {
      results.conflicts.push({
        id: data.id,
        type: 'task_list',
        reason: 'Server version is newer',
        serverTimestamp: existingList.updated_at,
        clientTimestamp
      });
      return;
    }
  }

  const updates = {
    ...data,
    sync_status: 'synced',
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from('task_lists')
    .update(updates)
    .eq('id', data.id)
    .eq('user_id', userId);

  if (error) throw error;
}

async function handleTaskListDelete(listId, userId) {
  const { error } = await supabase
    .from('task_lists')
    .delete()
    .eq('id', listId)
    .eq('user_id', userId);

  if (error) throw error;
}

// Helper function to calculate notification time
function calculateNotificationTime(dueDate, dueTime, notificationTime) {
  const dueDateTime = new Date(`${dueDate}T${dueTime}`);
  
  const timingMap = {
    '3min': 3 * 60 * 1000,
    '5min': 5 * 60 * 1000,
    '10min': 10 * 60 * 1000,
    '15min': 15 * 60 * 1000,
    '20min': 20 * 60 * 1000,
    '25min': 25 * 60 * 1000,
    '30min': 30 * 60 * 1000,
    '45min': 45 * 60 * 1000,
    '50min': 50 * 60 * 1000,
    '1hour': 60 * 60 * 1000,
    '2hours': 2 * 60 * 60 * 1000,
    '1day': 24 * 60 * 60 * 1000,
  };

  const delay = timingMap[notificationTime] || timingMap['10min'];
  return new Date(dueDateTime.getTime() - delay);
}

// Helper function to send email notification
async function sendEmailNotification(task, userEmail) {
  // This would integrate with your email service
  // For now, we'll log the email that would be sent
  console.log('📧 EMAIL NOTIFICATION QUEUED:', {
    to: userEmail,
    subject: `⏰ Task Reminder: ${task.title}`,
    taskId: task.id,
    taskTitle: task.title,
    taskDescription: task.description,
    dueDate: task.due_date,
    dueTime: task.due_time,
    priority: task.priority,
    notificationTime: task.notification_time,
    timestamp: new Date().toISOString()
  });

  // In production, you would call your email service here
  // Example with Nodemailer:
  /*
  const nodemailer = require('nodemailer');
  
  const transporter = nodemailer.createTransporter({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: userEmail,
    subject: `⏰ Task Reminder: ${task.title}`,
    html: generateEmailHTML(task)
  });
  */
}

// Helper function to generate recurring task instances
async function generateRecurringInstances(parentId, recurrence, taskData) {
  const instances = [];
  const baseDate = new Date(taskData.due_date);
  const instanceCount = recurrence === 'daily' ? 30 : recurrence === 'weekly' ? 52 : 12;

  for (let i = 1; i <= instanceCount; i++) {
    const instanceDate = new Date(baseDate);
    
    switch (recurrence) {
      case 'daily':
        instanceDate.setDate(baseDate.getDate() + i);
        break;
      case 'weekly':
        instanceDate.setDate(baseDate.getDate() + (i * 7));
        break;
      case 'monthly':
        instanceDate.setMonth(baseDate.getMonth() + i);
        break;
    }

    instances.push({
      ...taskData,
      id: undefined, // Let database generate new ID
      due_date: instanceDate.toISOString().split('T')[0],
      recurrence_id: parentId,
      is_recurring_parent: false,
      recurrence: 'none' // Instances don't have their own recurrence
    });
  }

  if (instances.length > 0) {
    const { error } = await supabase
      .from('tasks')
      .insert(instances);

    if (error) throw error;
  }
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`Task API server running on port ${port}`);
});

export default app;