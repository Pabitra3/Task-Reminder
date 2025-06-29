import React, { createContext, useContext, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { useTaskAPI } from '../hooks/useTaskAPI';
import { useNotifications } from '../hooks/useNotifications';
import { useRecurringTasks } from '../hooks/useRecurringTasks';
import { indexedDBManager } from '../lib/indexedDB';
import type { Database } from '../lib/supabase';

export type Task = Database['public']['Tables']['tasks']['Row'];
export type TaskList = Database['public']['Tables']['task_lists']['Row'];

interface TaskContextType {
  tasks: Task[];
  taskLists: TaskList[];
  addTask: (task: Database['public']['Tables']['tasks']['Insert']) => Promise<void>;
  updateTask: (id: string, updates: Database['public']['Tables']['tasks']['Update']) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  addTaskList: (name: string) => Promise<void>;
  deleteTaskList: (id: string) => Promise<void>;
  loading: boolean;
  refreshTasks: () => Promise<void>;
  refreshTaskLists: () => Promise<void>;
  syncOfflineData: () => Promise<void>;
  isOffline: boolean;
  syncStatus: {
    isSyncing: boolean;
    pendingItems: number;
    lastSyncTime: Date | null;
    syncError: string | null;
  };
}

const TaskContext = createContext<TaskContextType | undefined>(undefined);

export const useTask = () => {
  const context = useContext(TaskContext);
  if (context === undefined) {
    throw new Error('useTask must be used within a TaskProvider');
  }
  return context;
};

export const TaskProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskLists, setTaskLists] = useState<TaskList[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState({
    isSyncing: false,
    pendingItems: 0,
    lastSyncTime: null as Date | null,
    syncError: null as string | null
  });
  
  const { user } = useAuth();
  const { 
    createTask: apiCreateTask, 
    updateTask: apiUpdateTask, 
    deleteTask: apiDeleteTask,
    fetchTasks: apiFetchTasks,
    syncOfflineChanges,
    isOnline
  } = useTaskAPI();

  const {
    scheduleTaskNotification,
    updateTaskNotification,
    cancelTaskNotifications,
    syncNotifications
  } = useNotifications();

  const {
    createRecurringTask,
    completeRecurringTask,
    deleteRecurringSeries
  } = useRecurringTasks();

  const isOffline = !isOnline;

  useEffect(() => {
    if (user) {
      initializeData();
      setupRealtimeSubscriptions();
      updatePendingCount();
      setupServiceWorkerListeners();
    }
  }, [user]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (user && isOnline && !syncStatus.isSyncing) {
      const timer = setTimeout(() => {
        syncOfflineData();
        syncNotifications(); // Sync notifications when coming back online
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [user, isOnline, syncStatus.isSyncing, syncNotifications]);

  const setupServiceWorkerListeners = () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        const { type, data } = event.data;
        
        switch (type) {
          case 'COMPLETE_TASK':
            handleTaskCompletion(data.taskId);
            break;
          case 'SNOOZE_TASK':
            handleTaskSnooze(data.taskId, data.minutes);
            break;
          case 'SYNC_COMPLETED':
            toast.success('✅ All changes synced successfully!', {
              icon: '✅',
            });
            refreshTasks();
            refreshTaskLists();
            break;
          case 'SYNC_ERROR':
            toast.error(`❌ Sync failed: ${data.error}`, {
              icon: '❌',
            });
            break;
          case 'NOTIFICATION_SHOWN':
            toast.info(`🔔 Reminder: ${data.title}`, {
              icon: '🔔',
              autoClose: 3000,
            });
            break;
        }
      });
    }
  };

  const handleTaskCompletion = async (taskId: string) => {
    try {
      await updateTask(taskId, { completed: true });
      toast.success('✅ Task marked as complete!', {
        icon: '✅',
        autoClose: 3000,
      });
    } catch (error) {
      console.error('Error completing task from notification:', error);
    }
  };

  const handleTaskSnooze = async (taskId: string, minutes: number) => {
    try {
      // This would reschedule the notification
      toast.info(`⏰ Task snoozed for ${minutes} minutes`, {
        icon: '⏰',
        autoClose: 3000,
      });
    } catch (error) {
      console.error('Error snoozing task:', error);
    }
  };

  const initializeData = async () => {
    setLoading(true);
    try {
      if (isOnline) {
        // Fetch from API (which also caches to IndexedDB)
        const fetchedTasks = await apiFetchTasks();
        setTasks(fetchedTasks);
        await fetchTaskLists();
        
        // Sync notifications for fetched tasks
        await syncNotifications();
        
        toast.success('📊 Data loaded successfully!', {
          icon: '📊',
          autoClose: 2000,
        });
      } else {
        // Load from IndexedDB
        await loadOfflineData();
        toast.info('📱 Working offline - using cached data', {
          icon: '📱',
          autoClose: 3000,
        });
      }
    } catch (error) {
      console.error('Error initializing data:', error);
      // Fallback to offline data
      await loadOfflineData();
      toast.warn('⚠️ Using offline data due to connection issues', {
        icon: '⚠️',
        autoClose: 4000,
      });
    } finally {
      setLoading(false);
    }
  };

  const loadOfflineData = async () => {
    if (!user) return;
    
    try {
      const [offlineTasks, offlineTaskLists] = await Promise.all([
        indexedDBManager.getTasks(user.id),
        indexedDBManager.getTaskLists(user.id)
      ]);
      
      setTasks(offlineTasks as Task[]);
      setTaskLists(offlineTaskLists as TaskList[]);
      
      // Schedule notifications for offline tasks
      for (const task of offlineTasks) {
        if (task.push_notification && !task.completed) {
          await scheduleTaskNotification(task);
        }
      }
    } catch (error) {
      console.error('Error loading offline data:', error);
      toast.error('❌ Failed to load offline data', {
        icon: '❌',
      });
    }
  };

  const setupRealtimeSubscriptions = () => {
    if (!user || isOffline) return;

    const tasksSubscription = supabase
      .channel('tasks_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('Real-time task update:', payload);
          refreshTasks();
          toast.info('🔄 Tasks updated', {
            icon: '🔄',
            autoClose: 2000,
          });
        }
      )
      .subscribe();

    const listsSubscription = supabase
      .channel('task_lists_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_lists',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          refreshTaskLists();
          toast.info('📋 Lists updated', {
            icon: '📋',
            autoClose: 2000,
          });
        }
      )
      .subscribe();

    return () => {
      tasksSubscription.unsubscribe();
      listsSubscription.unsubscribe();
    };
  };

  const updatePendingCount = async () => {
    try {
      const syncQueue = await indexedDBManager.getSyncQueue();
      setSyncStatus(prev => ({ ...prev, pendingItems: syncQueue.length }));
    } catch (error) {
      console.error('Error updating pending count:', error);
    }
  };

  const addTask = async (task: Database['public']['Tables']['tasks']['Insert']) => {
    try {
      const taskData = { 
        ...task, 
        user_id: user!.id,
        is_recurring_parent: task.recurrence !== 'none',
        push_notification: task.push_notification ?? true,
        notification_time: task.notification_time || '10min',
        email_reminder: task.email_reminder || false,
      };

      let newTask;

      // Handle recurring tasks
      if (taskData.recurrence && taskData.recurrence !== 'none') {
        newTask = await createRecurringTask(taskData);
        if (!newTask) throw new Error('Failed to create recurring task');
        
        toast.success(`🔄 Recurring task created! Generated instances for the next year.`, {
          icon: '🔄',
          autoClose: 4000,
        });
      } else {
        newTask = await apiCreateTask(taskData);
        
        toast.success('✅ Task created successfully!', {
          icon: '✅',
          autoClose: 3000,
        });
      }
      
      // Update local state
      setTasks(prev => [...prev, newTask]);
      await updatePendingCount();
      
      // Schedule notification for the new task
      if (newTask.push_notification && !newTask.completed) {
        await scheduleTaskNotification(newTask);
      }
      
    } catch (error) {
      console.error('Error adding task:', error);
      toast.error('❌ Failed to create task', {
        icon: '❌',
      });
      throw error;
    }
  };

  const updateTask = async (id: string, updates: Database['public']['Tables']['tasks']['Update']) => {
    try {
      const updatedTask = await apiUpdateTask(id, updates);
      
      // Handle recurring task completion
      if (updates.completed && !tasks.find(t => t.id === id)?.completed) {
        const task = tasks.find(t => t.id === id);
        if (task && (task.recurrence !== 'none' || task.recurrence_id)) {
          await completeRecurringTask(updatedTask);
          toast.success('✅ Recurring task completed! Next instance created.', {
            icon: '✅',
            autoClose: 4000,
          });
        } else {
          toast.success('✅ Task completed!', {
            icon: '✅',
            autoClose: 3000,
          });
        }
      } else {
        toast.success('📝 Task updated successfully!', {
          icon: '📝',
          autoClose: 2000,
        });
      }
      
      // Update local state
      setTasks(prev => prev.map(task => task.id === id ? updatedTask : task));
      await updatePendingCount();
      
      // Update notification for the task
      await updateTaskNotification(updatedTask);
      
    } catch (error) {
      console.error('Error updating task:', error);
      toast.error('❌ Failed to update task', {
        icon: '❌',
      });
      throw error;
    }
  };

  const deleteTask = async (id: string) => {
    try {
      const taskToDelete = tasks.find(t => t.id === id);
      if (!taskToDelete) throw new Error('Task not found');

      // Handle recurring task deletion
      if (taskToDelete.is_recurring_parent || taskToDelete.recurrence_id) {
        await deleteRecurringSeries(id, taskToDelete.is_recurring_parent);
        
        // Update local state to remove all instances
        const parentId = taskToDelete.is_recurring_parent ? id : taskToDelete.recurrence_id;
        setTasks(prev => prev.filter(task => 
          task.id !== parentId && task.recurrence_id !== parentId
        ));
        
        toast.success('🗑️ Recurring task series deleted!', {
          icon: '🗑️',
          autoClose: 3000,
        });
      } else {
        await apiDeleteTask(id);
        setTasks(prev => prev.filter(task => task.id !== id));
        
        toast.success('🗑️ Task deleted successfully!', {
          icon: '🗑️',
          autoClose: 2000,
        });
      }
      
      // Cancel notifications for the deleted task(s)
      await cancelTaskNotifications(id);
      
      await updatePendingCount();
      
    } catch (error) {
      console.error('Error deleting task:', error);
      toast.error('❌ Failed to delete task', {
        icon: '❌',
      });
      throw error;
    }
  };

  const fetchTaskLists = async () => {
    if (!user) return;

    try {
      if (isOnline) {
        const { data, error } = await supabase
          .from('task_lists')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true });

        if (error) throw error;
        
        setTaskLists(data || []);
        
        // Cache to IndexedDB
        if (data) {
          const offlineTaskLists = data.map(list => ({
            ...list,
            sync_status: 'synced' as const,
            offline_created: false
          }));
          await indexedDBManager.saveTaskLists(offlineTaskLists);
        }
      } else {
        const offlineTaskLists = await indexedDBManager.getTaskLists(user.id);
        setTaskLists(offlineTaskLists as TaskList[]);
      }
    } catch (error) {
      console.error('Error fetching task lists:', error);
      // Fallback to offline data
      const offlineTaskLists = await indexedDBManager.getTaskLists(user.id);
      setTaskLists(offlineTaskLists as TaskList[]);
    }
  };

  const addTaskList = async (name: string) => {
    if (!user) return;

    try {
      const listData = { 
        id: crypto.randomUUID(),
        name, 
        user_id: user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      if (isOnline) {
        const { data, error } = await supabase
          .from('task_lists')
          .insert(listData)
          .select()
          .single();

        if (error) throw error;
        setTaskLists(prev => [...prev, data]);
        
        // Cache to IndexedDB
        await indexedDBManager.saveTaskList({
          ...data,
          sync_status: 'synced',
          offline_created: false
        });
        
        toast.success('📋 List created successfully!', {
          icon: '📋',
          autoClose: 3000,
        });
      } else {
        // Save offline
        const offlineTaskList = {
          ...listData,
          sync_status: 'pending' as const,
          offline_created: true
        };
        
        await indexedDBManager.saveTaskList(offlineTaskList);
        await indexedDBManager.addToSyncQueue({
          type: 'task_list',
          action: 'create',
          data: offlineTaskList
        });
        
        setTaskLists(prev => [...prev, offlineTaskList as TaskList]);
        await updatePendingCount();
        
        toast.success('📋 List created offline - will sync when online!', {
          icon: '📋',
          autoClose: 4000,
        });
      }
    } catch (error) {
      console.error('Error adding task list:', error);
      toast.error('❌ Failed to create list', {
        icon: '❌',
      });
      throw error;
    }
  };

  const deleteTaskList = async (id: string) => {
    try {
      if (isOnline) {
        const { error } = await supabase
          .from('task_lists')
          .delete()
          .eq('id', id)
          .eq('user_id', user?.id);

        if (error) throw error;
        setTaskLists(prev => prev.filter(list => list.id !== id));
        
        // Remove from IndexedDB
        await indexedDBManager.deleteTaskList(id);
        
        toast.success('🗑️ List deleted successfully!', {
          icon: '🗑️',
          autoClose: 3000,
        });
      } else {
        // Mark for deletion offline
        const listToDelete = taskLists.find(l => l.id === id);
        if (listToDelete) {
          await indexedDBManager.addToSyncQueue({
            type: 'task_list',
            action: 'delete',
            data: listToDelete
          });
          
          setTaskLists(prev => prev.filter(list => list.id !== id));
          await updatePendingCount();
          
          toast.success('🗑️ List deleted offline - will sync when online!', {
            icon: '🗑️',
            autoClose: 4000,
          });
        }
      }
    } catch (error) {
      console.error('Error deleting task list:', error);
      toast.error('❌ Failed to delete list', {
        icon: '❌',
      });
      throw error;
    }
  };

  const refreshTasks = async () => {
    if (isOffline) {
      await loadOfflineData();
    } else {
      try {
        const fetchedTasks = await apiFetchTasks();
        setTasks(fetchedTasks);
        
        // Sync notifications for refreshed tasks
        await syncNotifications();
      } catch (error) {
        console.error('Error refreshing tasks:', error);
        await loadOfflineData();
      }
    }
  };

  const refreshTaskLists = async () => {
    await fetchTaskLists();
  };

  const syncOfflineData = async () => {
    if (!isOnline || !user || syncStatus.isSyncing) return;

    setSyncStatus(prev => ({ ...prev, isSyncing: true, syncError: null }));

    try {
      const result = await syncOfflineChanges();
      
      // Refresh data after sync
      await Promise.all([refreshTasks(), refreshTaskLists()]);
      
      setSyncStatus(prev => ({
        ...prev,
        isSyncing: false,
        lastSyncTime: new Date(),
        syncError: null
      }));
      
      await updatePendingCount();
      
      // Sync notifications after successful data sync
      await syncNotifications();
      
      console.log('Sync completed:', result);
    } catch (error) {
      console.error('Sync failed:', error);
      setSyncStatus(prev => ({
        ...prev,
        isSyncing: false,
        syncError: error instanceof Error ? error.message : 'Sync failed'
      }));
    }
  };

  const value = {
    tasks,
    taskLists,
    addTask,
    updateTask,
    deleteTask,
    addTaskList,
    deleteTaskList,
    loading,
    refreshTasks,
    refreshTaskLists,
    syncOfflineData,
    isOffline,
    syncStatus,
  };

  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>;
};