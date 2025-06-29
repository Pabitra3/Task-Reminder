import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { indexedDBManager } from '../lib/indexedDB';
import { useNotifications } from './useNotifications';

interface RecurringTaskInstance {
  id: string;
  title: string;
  description?: string;
  due_date: string;
  due_time: string;
  priority: 'low' | 'medium' | 'high';
  user_id: string;
  list_id?: string;
  email_reminder: boolean;
  push_notification: boolean;
  notification_time: string;
  recurrence: 'none';
  recurrence_id: string;
  is_recurring_parent: boolean;
  sync_status: 'pending' | 'synced';
  created_at: string;
  updated_at: string;
  offline_created: boolean;
}

export const useRecurringTasks = () => {
  const { user } = useAuth();
  const { scheduleTaskNotification } = useNotifications();

  // Generate recurring task instances offline
  const generateRecurringInstances = useCallback(async (
    parentTask: any,
    recurrenceType: 'daily' | 'weekly' | 'monthly',
    instanceCount: number = 52
  ) => {
    if (!user || recurrenceType === 'none') return [];

    const instances: RecurringTaskInstance[] = [];
    const baseDate = new Date(parentTask.due_date);
    const now = new Date();
    const oneYearFromNow = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

    for (let i = 1; i <= instanceCount; i++) {
      const instanceDate = new Date(baseDate);
      
      // Calculate next due date based on recurrence pattern
      switch (recurrenceType) {
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

      // Don't create instances more than 1 year in the future
      if (instanceDate > oneYearFromNow) {
        break;
      }

      const instance: RecurringTaskInstance = {
        id: crypto.randomUUID(),
        title: parentTask.title,
        description: parentTask.description,
        due_date: instanceDate.toISOString().split('T')[0],
        due_time: parentTask.due_time,
        priority: parentTask.priority,
        user_id: user.id,
        list_id: parentTask.list_id,
        email_reminder: parentTask.email_reminder,
        push_notification: parentTask.push_notification,
        notification_time: parentTask.notification_time,
        recurrence: 'none',
        recurrence_id: parentTask.id,
        is_recurring_parent: false,
        sync_status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        offline_created: true
      };

      instances.push(instance);
    }

    return instances;
  }, [user]);

  // Save recurring instances to IndexedDB
  const saveRecurringInstances = useCallback(async (instances: RecurringTaskInstance[]) => {
    try {
      // Save each instance to IndexedDB
      for (const instance of instances) {
        await indexedDBManager.saveTask(instance);
        
        // Add to sync queue
        await indexedDBManager.addToSyncQueue({
          type: 'task',
          action: 'create',
          data: instance
        });

        // Schedule notification if enabled
        if (instance.push_notification) {
          await scheduleTaskNotification(instance);
        }
      }

      console.log(`Generated ${instances.length} recurring task instances`);
    } catch (error) {
      console.error('Error saving recurring instances:', error);
      throw error;
    }
  }, [scheduleTaskNotification]);

  // Create recurring task with instances
  const createRecurringTask = useCallback(async (taskData: any) => {
    if (!user || taskData.recurrence === 'none') return null;

    try {
      // Create parent task
      const parentTask = {
        ...taskData,
        id: crypto.randomUUID(),
        user_id: user.id,
        is_recurring_parent: true,
        sync_status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        offline_created: true
      };

      // Save parent task
      await indexedDBManager.saveTask(parentTask);
      await indexedDBManager.addToSyncQueue({
        type: 'task',
        action: 'create',
        data: parentTask
      });

      // Generate and save instances
      const instances = await generateRecurringInstances(
        parentTask,
        taskData.recurrence,
        getInstanceCount(taskData.recurrence)
      );

      if (instances.length > 0) {
        await saveRecurringInstances(instances);
      }

      // Schedule notification for parent task if enabled
      if (parentTask.push_notification) {
        await scheduleTaskNotification(parentTask);
      }

      return parentTask;
    } catch (error) {
      console.error('Error creating recurring task:', error);
      throw error;
    }
  }, [user, generateRecurringInstances, saveRecurringInstances, scheduleTaskNotification]);

  // Handle recurring task completion
  const completeRecurringTask = useCallback(async (task: any) => {
    if (!user) return;

    try {
      // Mark current task as completed
      const updatedTask = { ...task, completed: true };
      await indexedDBManager.saveTask(updatedTask);

      // If this is a recurring parent or has recurrence, generate next instance
      if (task.recurrence !== 'none' || task.recurrence_id) {
        const parentId = task.recurrence_id || task.id;
        const recurrenceType = task.recurrence !== 'none' ? task.recurrence : 
          await getParentRecurrenceType(parentId);

        if (recurrenceType && recurrenceType !== 'none') {
          const nextInstance = await generateNextInstance(task, recurrenceType);
          if (nextInstance) {
            await indexedDBManager.saveTask(nextInstance);
            await indexedDBManager.addToSyncQueue({
              type: 'task',
              action: 'create',
              data: nextInstance
            });

            // Schedule notification for next instance
            if (nextInstance.push_notification) {
              await scheduleTaskNotification(nextInstance);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error completing recurring task:', error);
      throw error;
    }
  }, [user, scheduleTaskNotification]);

  // Generate next instance when a recurring task is completed
  const generateNextInstance = useCallback(async (
    completedTask: any,
    recurrenceType: 'daily' | 'weekly' | 'monthly'
  ) => {
    const currentDate = new Date(completedTask.due_date);
    const nextDate = new Date(currentDate);

    // Calculate next due date
    switch (recurrenceType) {
      case 'daily':
        nextDate.setDate(currentDate.getDate() + 1);
        break;
      case 'weekly':
        nextDate.setDate(currentDate.getDate() + 7);
        break;
      case 'monthly':
        nextDate.setMonth(currentDate.getMonth() + 1);
        break;
    }

    // Don't create instances more than 1 year in the future
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
    
    if (nextDate > oneYearFromNow) {
      return null;
    }

    // Check if next instance already exists
    const existingTasks = await indexedDBManager.getTasks(user!.id);
    const parentId = completedTask.recurrence_id || completedTask.id;
    const nextDateStr = nextDate.toISOString().split('T')[0];
    
    const existingNext = existingTasks.find(task => 
      task.recurrence_id === parentId && 
      task.due_date === nextDateStr &&
      !task.completed
    );

    if (existingNext) {
      return null; // Next instance already exists
    }

    // Create next instance
    const nextInstance: RecurringTaskInstance = {
      id: crypto.randomUUID(),
      title: completedTask.title,
      description: completedTask.description,
      due_date: nextDateStr,
      due_time: completedTask.due_time,
      priority: completedTask.priority,
      user_id: user!.id,
      list_id: completedTask.list_id,
      email_reminder: completedTask.email_reminder,
      push_notification: completedTask.push_notification,
      notification_time: completedTask.notification_time,
      recurrence: 'none',
      recurrence_id: parentId,
      is_recurring_parent: false,
      sync_status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      offline_created: true
    };

    return nextInstance;
  }, [user]);

  // Get parent task's recurrence type
  const getParentRecurrenceType = useCallback(async (parentId: string) => {
    try {
      const parentTask = await indexedDBManager.getTask(parentId);
      return parentTask?.recurrence || 'none';
    } catch (error) {
      console.error('Error getting parent recurrence type:', error);
      return 'none';
    }
  }, []);

  // Get instance count based on recurrence type
  const getInstanceCount = (recurrenceType: string) => {
    switch (recurrenceType) {
      case 'daily': return 30; // 30 days
      case 'weekly': return 52; // 52 weeks (1 year)
      case 'monthly': return 12; // 12 months (1 year)
      default: return 0;
    }
  };

  // Delete recurring task series
  const deleteRecurringSeries = useCallback(async (taskId: string, isParent: boolean) => {
    if (!user) return;

    try {
      const allTasks = await indexedDBManager.getTasks(user.id);
      const parentId = isParent ? taskId : 
        allTasks.find(t => t.id === taskId)?.recurrence_id;

      if (!parentId) return;

      // Find all tasks in the series
      const seriesToDelete = allTasks.filter(task => 
        task.id === parentId || task.recurrence_id === parentId
      );

      // Delete each task in the series
      for (const task of seriesToDelete) {
        await indexedDBManager.deleteTask(task.id);
        
        // Add to sync queue for deletion
        await indexedDBManager.addToSyncQueue({
          type: 'task',
          action: 'delete',
          data: task
        });
      }

      console.log(`Deleted ${seriesToDelete.length} tasks from recurring series`);
    } catch (error) {
      console.error('Error deleting recurring series:', error);
      throw error;
    }
  }, [user]);

  // Sync recurring tasks with server
  const syncRecurringTasks = useCallback(async () => {
    if (!user || !navigator.onLine) return;

    try {
      // This will be handled by the main sync process
      // The server will generate instances for recurring tasks
      console.log('Recurring tasks will be synced with main sync process');
    } catch (error) {
      console.error('Error syncing recurring tasks:', error);
    }
  }, [user]);

  return {
    generateRecurringInstances,
    saveRecurringInstances,
    createRecurringTask,
    completeRecurringTask,
    deleteRecurringSeries,
    syncRecurringTasks
  };
};