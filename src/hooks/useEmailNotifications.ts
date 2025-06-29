import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { indexedDBManager } from '../lib/indexedDB';

interface EmailNotification {
  id: string;
  taskId: string;
  scheduledTime: number;
  taskData: any;
  sync_status: 'pending' | 'synced' | 'cancelled';
  created_at: string;
}

export const useEmailNotifications = () => {
  const [emailQueue, setEmailQueue] = useState<EmailNotification[]>([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const { user } = useAuth();

  useEffect(() => {
    // Monitor online/offline status
    const handleOnline = () => {
      setIsOnline(true);
      syncEmailQueue();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (user) {
      loadEmailQueue();
    }
  }, [user]);

  // Load email queue from IndexedDB
  const loadEmailQueue = async () => {
    try {
      const queue = await indexedDBManager.getAppState('emailQueue') || [];
      setEmailQueue(queue);
    } catch (error) {
      console.error('Error loading email queue:', error);
    }
  };

  // Save email queue to IndexedDB
  const saveEmailQueue = async (queue: EmailNotification[]) => {
    try {
      await indexedDBManager.setAppState('emailQueue', queue);
      setEmailQueue(queue);
    } catch (error) {
      console.error('Error saving email queue:', error);
    }
  };

  // Schedule email notification
  const scheduleEmailNotification = useCallback(async (task: any) => {
    if (!task.email_reminder || task.completed || !user) return;

    const taskDateTime = new Date(`${task.due_date}T${task.due_time}`);
    const notificationDelay = getNotificationDelay(task.notification_time || '1hour');
    const reminderTime = taskDateTime.getTime() - notificationDelay;
    const now = Date.now();

    if (reminderTime <= now) {
      console.log('Email notification time has already passed');
      return;
    }

    const emailNotification: EmailNotification = {
      id: crypto.randomUUID(),
      taskId: task.id,
      scheduledTime: reminderTime,
      taskData: task,
      sync_status: 'pending',
      created_at: new Date().toISOString()
    };

    // Add to queue
    const updatedQueue = [...emailQueue, emailNotification];
    await saveEmailQueue(updatedQueue);

    // If online, try to sync immediately
    if (isOnline) {
      await syncEmailQueue();
    }

    console.log('Email notification scheduled:', {
      taskId: task.id,
      reminderTime: new Date(reminderTime),
      timing: task.notification_time
    });
  }, [emailQueue, isOnline, user]);

  // Cancel email notifications for a task
  const cancelEmailNotifications = useCallback(async (taskId: string) => {
    const updatedQueue = emailQueue.filter(notification => notification.taskId !== taskId);
    await saveEmailQueue(updatedQueue);
  }, [emailQueue]);

  // Update email notification when task changes
  const updateEmailNotification = useCallback(async (task: any) => {
    // Cancel existing notifications for this task
    await cancelEmailNotifications(task.id);
    
    // Schedule new notification if needed
    if (task.email_reminder && !task.completed) {
      await scheduleEmailNotification(task);
    }
  }, [cancelEmailNotifications, scheduleEmailNotification]);

  // Sync email queue with server
  const syncEmailQueue = useCallback(async () => {
    if (!isOnline || !user || emailQueue.length === 0) return;

    try {
      const pendingNotifications = emailQueue.filter(n => n.sync_status === 'pending');
      
      if (pendingNotifications.length === 0) return;

      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const response = await fetch('/api/sync-emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          emailQueue: pendingNotifications
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Email queue synced:', result);

        // Mark synced notifications as processed
        const updatedQueue = emailQueue.map(notification => 
          pendingNotifications.some(p => p.id === notification.id)
            ? { ...notification, sync_status: 'synced' as const }
            : notification
        );

        await saveEmailQueue(updatedQueue);
      }
    } catch (error) {
      console.error('Error syncing email queue:', error);
    }
  }, [isOnline, user, emailQueue]);

  // Sync all email notifications for user's tasks
  const syncAllEmailNotifications = useCallback(async () => {
    if (!user) return;

    try {
      // Get all tasks that need email notifications
      const tasks = await indexedDBManager.getTasks(user.id);
      const emailTasks = tasks.filter(task => 
        task.email_reminder && !task.completed
      );

      // Clear existing queue
      await saveEmailQueue([]);

      // Schedule notifications for all eligible tasks
      for (const task of emailTasks) {
        await scheduleEmailNotification(task);
      }

      console.log('All email notifications synced');
    } catch (error) {
      console.error('Error syncing all email notifications:', error);
    }
  }, [user, scheduleEmailNotification]);

  // Parse notification timing to milliseconds
  const getNotificationDelay = (timing: string): number => {
    const timingMap: { [key: string]: number } = {
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
    return timingMap[timing] || 60 * 60 * 1000; // Default to 1 hour
  };

  return {
    emailQueue,
    scheduleEmailNotification,
    cancelEmailNotifications,
    updateEmailNotification,
    syncEmailQueue,
    syncAllEmailNotifications,
    isOnline
  };
};