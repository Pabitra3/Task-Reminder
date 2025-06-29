import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { indexedDBManager } from '../lib/indexedDB';

interface NotificationState {
  permission: NotificationPermission;
  supported: boolean;
  subscription: PushSubscription | null;
  serviceWorkerReady: boolean;
}

interface ScheduledNotification {
  id: string;
  taskId: string;
  title: string;
  body: string;
  scheduledTime: number;
  notificationTime: string;
  taskData: any;
  sync_status: 'pending' | 'synced' | 'cancelled';
}

export const useNotifications = () => {
  const [state, setState] = useState<NotificationState>({
    permission: 'default',
    supported: false,
    subscription: null,
    serviceWorkerReady: false,
  });
  const [scheduledNotifications, setScheduledNotifications] = useState<ScheduledNotification[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    // Check if notifications and service workers are supported
    const supported = 'Notification' in window && 
                     'serviceWorker' in navigator && 
                     'PushManager' in window;
    
    setState(prev => ({
      ...prev,
      supported,
      permission: supported ? Notification.permission : 'denied',
    }));

    if (supported) {
      registerServiceWorker();
      setupMessageListener();
      loadScheduledNotifications();
    }
  }, []);

  // Load scheduled notifications from IndexedDB
  const loadScheduledNotifications = async () => {
    try {
      const notifications = await indexedDBManager.getAppState('scheduledNotifications') || [];
      setScheduledNotifications(notifications);
      
      // Schedule any pending notifications
      notifications.forEach(notification => {
        if (notification.sync_status === 'pending' && notification.scheduledTime > Date.now()) {
          scheduleLocalNotification(notification);
        }
      });
    } catch (error) {
      console.error('Error loading scheduled notifications:', error);
    }
  };

  // Save scheduled notifications to IndexedDB
  const saveScheduledNotifications = async (notifications: ScheduledNotification[]) => {
    try {
      await indexedDBManager.setAppState('scheduledNotifications', notifications);
      setScheduledNotifications(notifications);
    } catch (error) {
      console.error('Error saving scheduled notifications:', error);
    }
  };

  const setupMessageListener = () => {
    // Listen for messages from service worker
    navigator.serviceWorker?.addEventListener('message', (event) => {
      const { type, data } = event.data;
      
      switch (type) {
        case 'PLAY_NOTIFICATION_SOUND':
          playNotificationSound(data.soundUrl);
          break;
        case 'COMPLETE_TASK':
          handleTaskCompletion(data.taskId);
          break;
        case 'SNOOZE_TASK':
          handleTaskSnooze(data.taskId, data.minutes);
          break;
        case 'NOTIFICATION_CLICKED':
          handleNotificationClick(data);
          break;
      }
    });
  };

  const playNotificationSound = useCallback((soundUrl: string = '/notification.mp3') => {
    try {
      // Create and play audio with enhanced mobile support
      const audio = new Audio(soundUrl);
      audio.volume = 0.8;
      audio.preload = 'auto';
      
      // Add error handling for iOS and mobile devices
      const playPromise = audio.play();
      
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log('Notification sound played successfully');
          })
          .catch(error => {
            console.log('Could not play notification sound:', error);
            // Fallback: try to play a system sound or vibrate
            if ('vibrate' in navigator) {
              navigator.vibrate([200, 100, 200, 100, 200]);
            }
          });
      }

      // Additional fallback for older browsers
      audio.addEventListener('error', (error) => {
        console.log('Audio loading error:', error);
        // Fallback vibration for mobile devices
        if ('vibrate' in navigator) {
          navigator.vibrate([200, 100, 200, 100, 200]);
        }
      });

    } catch (error) {
      console.log('Audio playback not available:', error);
      // Fallback vibration
      if ('vibrate' in navigator) {
        navigator.vibrate([200, 100, 200, 100, 200]);
      }
    }
  }, []);

  const handleTaskCompletion = async (taskId: string) => {
    try {
      // Update task completion status
      await supabase
        .from('tasks')
        .update({ completed: true })
        .eq('id', taskId)
        .eq('user_id', user?.id);
      
      console.log('Task marked complete from notification');
      
      // Cancel any pending notifications for this task
      await cancelTaskNotifications(taskId);
      
      // Show success feedback
      if (state.permission === 'granted') {
        new Notification('✅ Task Completed', {
          body: 'Task has been marked as complete',
          icon: '/icon-192x192.png',
          silent: true
        });
      }
    } catch (error) {
      console.error('Error completing task from notification:', error);
    }
  };

  const handleTaskSnooze = async (taskId: string, minutes: number) => {
    try {
      console.log(`Snoozing task ${taskId} for ${minutes} minutes`);
      
      // Cancel current notification
      await cancelTaskNotifications(taskId);
      
      // Schedule new notification
      const snoozeTime = Date.now() + (minutes * 60 * 1000);
      
      // Get task data for rescheduling
      const { data: task } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .single();
      
      if (task) {
        await scheduleTaskNotification(task, snoozeTime);
      }
      
      // Show snooze confirmation
      if (state.permission === 'granted') {
        new Notification('⏰ Task Snoozed', {
          body: `Task reminder snoozed for ${minutes} minutes`,
          icon: '/icon-192x192.png',
          silent: true
        });
      }
    } catch (error) {
      console.error('Error snoozing task:', error);
    }
  };

  const handleNotificationClick = (data: any) => {
    // Focus or open the app window
    if ('clients' in self) {
      // This would be handled in the service worker
      console.log('Notification clicked:', data);
    }
  };

  const registerServiceWorker = async () => {
    try {
      if (!navigator.serviceWorker) {
        console.log('Service Worker not supported in this environment');
        return;
      }

      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });
      
      console.log('Service Worker registered:', registration);
      
      // Wait for service worker to be ready
      await navigator.serviceWorker.ready;
      setState(prev => ({ ...prev, serviceWorkerReady: true }));
      
      // Get existing subscription
      const subscription = await registration.pushManager.getSubscription();
      setState(prev => ({ ...prev, subscription }));
      
    } catch (error) {
      console.log('Service Worker registration failed:', error);
    }
  };

  const requestPermission = async (): Promise<boolean> => {
    if (!state.supported) {
      console.log('Notifications not supported');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      setState(prev => ({ ...prev, permission }));
      
      if (permission === 'granted') {
        await subscribeToPush();
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  };

  const subscribeToPush = async () => {
    try {
      if (!navigator.serviceWorker || !state.serviceWorkerReady) {
        console.log('Service Worker not ready for push subscription');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      
      // VAPID public key - in production, this should come from environment
      const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY || 
        'BEl62iUYgUivxIkv69yViEuiBIa40HI80NM9f8HnKJuOmLWjMpS_7VnYkYdYWjAlstT7p4homRjp88o-vQ5NUyU';
      
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      setState(prev => ({ ...prev, subscription }));
      
      // Store subscription in database
      if (user) {
        await storeSubscription(subscription);
      }
      
      console.log('Push subscription created:', subscription);
    } catch (error) {
      console.error('Error subscribing to push notifications:', error);
    }
  };

  const storeSubscription = async (subscription: PushSubscription) => {
    try {
      const subscriptionData = subscription.toJSON();
      
      await supabase
        .from('push_subscriptions')
        .upsert({
          user_id: user?.id,
          endpoint: subscriptionData.endpoint!,
          p256dh: subscriptionData.keys!.p256dh!,
          auth: subscriptionData.keys!.auth!,
          user_agent: navigator.userAgent,
        }, {
          onConflict: 'user_id,endpoint'
        });
      
      console.log('Push subscription stored in database');
    } catch (error) {
      console.error('Error storing push subscription:', error);
    }
  };

  const showNotification = (title: string, options?: NotificationOptions) => {
    if (state.permission === 'granted') {
      const notification = new Notification(title, {
        icon: '/icon-192x192.png',
        badge: '/badge-72x72.png',
        vibrate: [200, 100, 200, 100, 200],
        ...options,
      });

      // Play custom sound
      playNotificationSound('/notification.mp3');

      return notification;
    }
  };

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
    return timingMap[timing] || 10 * 60 * 1000; // Default to 10 minutes
  };

  const getTimingLabel = (timing: string): string => {
    const timingMap: { [key: string]: string } = {
      '3min': '3 minutes',
      '5min': '5 minutes',
      '10min': '10 minutes',
      '15min': '15 minutes',
      '20min': '20 minutes',
      '25min': '25 minutes',
      '30min': '30 minutes',
      '45min': '45 minutes',
      '50min': '50 minutes',
      '1hour': '1 hour',
      '2hours': '2 hours',
      '1day': '1 day',
    };
    return timingMap[timing] || '10 minutes';
  };

  // Schedule a task notification
  const scheduleTaskNotification = async (task: any, customTime?: number) => {
    if (!task.push_notification || task.completed) return;

    const taskDateTime = new Date(`${task.due_date}T${task.due_time}`);
    const notificationDelay = getNotificationDelay(task.notification_time || '10min');
    const reminderTime = customTime || (taskDateTime.getTime() - notificationDelay);
    const now = Date.now();

    if (reminderTime <= now) {
      console.log('Task notification time has already passed');
      return;
    }

    const timingLabel = getTimingLabel(task.notification_time || '10min');
    
    const scheduledNotification: ScheduledNotification = {
      id: crypto.randomUUID(),
      taskId: task.id,
      title: '🔔 Task Due Soon!',
      body: `${task.title} is due in ${timingLabel}`,
      scheduledTime: reminderTime,
      notificationTime: task.notification_time || '10min',
      taskData: task,
      sync_status: 'pending'
    };

    // Add to scheduled notifications
    const updatedNotifications = [...scheduledNotifications, scheduledNotification];
    await saveScheduledNotifications(updatedNotifications);

    // Schedule the local notification
    scheduleLocalNotification(scheduledNotification);

    console.log('Task notification scheduled:', {
      taskId: task.id,
      reminderTime: new Date(reminderTime),
      timingLabel
    });
  };

  // Schedule local notification using setTimeout
  const scheduleLocalNotification = (notification: ScheduledNotification) => {
    const delay = notification.scheduledTime - Date.now();
    
    if (delay <= 0) {
      // Show immediately if time has passed
      showTaskNotification(notification);
      return;
    }

    setTimeout(() => {
      showTaskNotification(notification);
    }, delay);
  };

  // Show the actual notification
  const showTaskNotification = (notification: ScheduledNotification) => {
    if (state.permission !== 'granted') return;

    const notificationOptions: NotificationOptions = {
      body: notification.body,
      icon: '/icon-192x192.png',
      badge: '/badge-72x72.png',
      sound: '/notification.mp3',
      vibrate: [200, 100, 200, 100, 200],
      data: {
        taskId: notification.taskId,
        taskTitle: notification.taskData.title,
        taskDescription: notification.taskData.description,
        dueTime: notification.taskData.due_time,
        priority: notification.taskData.priority,
        notificationTime: notification.notificationTime,
        url: '/',
        sound: '/notification.mp3'
      },
      requireInteraction: true,
      silent: false,
      tag: `task-${notification.taskId}`,
      renotify: true,
      actions: [
        {
          action: 'view',
          title: 'View Task'
        },
        {
          action: 'complete',
          title: 'Mark Complete'
        },
        {
          action: 'snooze',
          title: 'Snooze 5min'
        }
      ]
    };

    const browserNotification = new Notification(notification.title, notificationOptions);

    // Play custom sound
    playNotificationSound('/notification.mp3');

    // Handle notification clicks
    browserNotification.onclick = () => {
      window.focus();
      // Navigate to task or open app
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(registration => {
          registration.active?.postMessage({
            type: 'NOTIFICATION_CLICKED',
            data: notification.taskData
          });
        });
      }
      browserNotification.close();
    };

    // Remove from scheduled notifications
    const updatedNotifications = scheduledNotifications.filter(n => n.id !== notification.id);
    saveScheduledNotifications(updatedNotifications);
  };

  // Cancel notifications for a specific task
  const cancelTaskNotifications = async (taskId: string) => {
    const updatedNotifications = scheduledNotifications.filter(n => n.taskId !== taskId);
    await saveScheduledNotifications(updatedNotifications);
  };

  // Update notification when task changes
  const updateTaskNotification = async (task: any) => {
    // Cancel existing notifications for this task
    await cancelTaskNotifications(task.id);
    
    // Schedule new notification if needed
    if (task.push_notification && !task.completed) {
      await scheduleTaskNotification(task);
    }
  };

  // Sync notifications with server when online
  const syncNotifications = async () => {
    if (!navigator.onLine || !user) return;

    try {
      // Get tasks that need notifications
      const { data: tasks, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', user.id)
        .eq('push_notification', true)
        .eq('completed', false);

      if (error) throw error;

      // Clear existing scheduled notifications
      await saveScheduledNotifications([]);

      // Schedule notifications for all eligible tasks
      if (tasks) {
        for (const task of tasks) {
          await scheduleTaskNotification(task);
        }
      }

      console.log('Notifications synced with server');
    } catch (error) {
      console.error('Error syncing notifications:', error);
    }
  };

  const unsubscribeFromPush = async () => {
    try {
      if (state.subscription) {
        await state.subscription.unsubscribe();
        
        // Remove from database
        if (user) {
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('user_id', user.id)
            .eq('endpoint', state.subscription.endpoint);
        }
        
        setState(prev => ({ ...prev, subscription: null }));
        console.log('Unsubscribed from push notifications');
      }
    } catch (error) {
      console.error('Error unsubscribing from push notifications:', error);
    }
  };

  // Test notification functionality
  const testNotification = () => {
    if (state.permission === 'granted') {
      showNotification('🔔 Test Notification', {
        body: 'This is a test notification with custom sound!',
        requireInteraction: false
      });
    } else {
      console.log('Notification permission not granted');
    }
  };

  return {
    ...state,
    scheduledNotifications,
    requestPermission,
    showNotification,
    scheduleTaskNotification,
    updateTaskNotification,
    cancelTaskNotifications,
    syncNotifications,
    unsubscribeFromPush,
    playNotificationSound,
    testNotification,
    getTimingLabel,
    getNotificationDelay
  };
};

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}