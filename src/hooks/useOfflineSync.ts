import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { indexedDBManager, OfflineTask, OfflineTaskList, SyncQueueItem } from '../lib/indexedDB';

interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  pendingItems: number;
  syncError: string | null;
}

export const useOfflineSync = () => {
  const { user } = useAuth();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isOnline: navigator.onLine,
    isSyncing: false,
    lastSyncTime: null,
    pendingItems: 0,
    syncError: null
  });

  // Initialize IndexedDB
  useEffect(() => {
    indexedDBManager.init().catch(console.error);
  }, []);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setSyncStatus(prev => ({ ...prev, isOnline: true, syncError: null }));
      if (user) {
        syncOfflineData();
      }
    };

    const handleOffline = () => {
      setSyncStatus(prev => ({ ...prev, isOnline: false }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [user]);

  // Listen for service worker messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const { type } = event.data;
      
      switch (type) {
        case 'SYNC_OFFLINE_TASKS':
        case 'SYNC_OFFLINE_TASK_LISTS':
        case 'SYNC_ALL_OFFLINE_DATA':
          if (user) {
            syncOfflineData();
          }
          break;
      }
    };

    navigator.serviceWorker?.addEventListener('message', handleMessage);
    
    return () => {
      navigator.serviceWorker?.removeEventListener('message', handleMessage);
    };
  }, [user]);

  // Update pending items count
  const updatePendingCount = useCallback(async () => {
    try {
      const syncQueue = await indexedDBManager.getSyncQueue();
      setSyncStatus(prev => ({ ...prev, pendingItems: syncQueue.length }));
    } catch (error) {
      console.error('Error updating pending count:', error);
    }
  }, []);

  // Sync offline data with server
  const syncOfflineData = useCallback(async () => {
    if (!user || !syncStatus.isOnline || syncStatus.isSyncing) {
      return;
    }

    setSyncStatus(prev => ({ ...prev, isSyncing: true, syncError: null }));

    try {
      const syncQueue = await indexedDBManager.getSyncQueue();
      
      for (const item of syncQueue) {
        try {
          await processSyncItem(item);
          await indexedDBManager.removeSyncQueueItem(item.id);
        } catch (error) {
          console.error('Error processing sync item:', error);
          
          // Increment retry count
          item.retries += 1;
          
          // Remove item if too many retries
          if (item.retries >= 3) {
            await indexedDBManager.removeSyncQueueItem(item.id);
            console.warn('Removing sync item after max retries:', item);
          } else {
            await indexedDBManager.updateSyncQueueItem(item);
          }
        }
      }

      // Fetch latest data from server
      await fetchAndCacheServerData();

      setSyncStatus(prev => ({
        ...prev,
        isSyncing: false,
        lastSyncTime: new Date(),
        syncError: null
      }));

      await updatePendingCount();
      
    } catch (error) {
      console.error('Sync failed:', error);
      setSyncStatus(prev => ({
        ...prev,
        isSyncing: false,
        syncError: error instanceof Error ? error.message : 'Sync failed'
      }));
    }
  }, [user, syncStatus.isOnline, syncStatus.isSyncing]);

  // Process individual sync item
  const processSyncItem = async (item: SyncQueueItem) => {
    const { type, action, data } = item;

    if (type === 'task') {
      switch (action) {
        case 'create':
          await supabase.from('tasks').insert(data);
          break;
        case 'update':
          await supabase.from('tasks').update(data).eq('id', data.id);
          break;
        case 'delete':
          await supabase.from('tasks').delete().eq('id', data.id);
          break;
      }
    } else if (type === 'task_list') {
      switch (action) {
        case 'create':
          await supabase.from('task_lists').insert(data);
          break;
        case 'update':
          await supabase.from('task_lists').update(data).eq('id', data.id);
          break;
        case 'delete':
          await supabase.from('task_lists').delete().eq('id', data.id);
          break;
      }
    }
  };

  // Fetch and cache server data
  const fetchAndCacheServerData = async () => {
    if (!user) return;

    try {
      // Fetch tasks
      const { data: tasks, error: tasksError } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', user.id);

      if (tasksError) throw tasksError;

      if (tasks) {
        const offlineTasks: OfflineTask[] = tasks.map(task => ({
          ...task,
          sync_status: 'synced' as const
        }));
        await indexedDBManager.saveTasks(offlineTasks);
      }

      // Fetch task lists
      const { data: taskLists, error: listsError } = await supabase
        .from('task_lists')
        .select('*')
        .eq('user_id', user.id);

      if (listsError) throw listsError;

      if (taskLists) {
        const offlineTaskLists: OfflineTaskList[] = taskLists.map(list => ({
          ...list,
          sync_status: 'synced' as const
        }));
        await indexedDBManager.saveTaskLists(offlineTaskLists);
      }

      // Update last sync time
      await indexedDBManager.setAppState('lastSyncTime', new Date().toISOString());
      
    } catch (error) {
      console.error('Error fetching server data:', error);
      throw error;
    }
  };

  // Save task offline
  const saveTaskOffline = async (task: Partial<OfflineTask>, action: 'create' | 'update' | 'delete') => {
    if (!user) return;

    try {
      const taskId = task.id || crypto.randomUUID();
      const now = new Date().toISOString();

      const offlineTask: OfflineTask = {
        id: taskId,
        title: task.title || '',
        description: task.description,
        due_date: task.due_date || '',
        due_time: task.due_time || '',
        priority: task.priority || 'medium',
        completed: task.completed || false,
        user_id: user.id,
        list_id: task.list_id,
        email_reminder: task.email_reminder || false,
        push_notification: task.push_notification ?? true,
        notification_time: task.notification_time || '10min',
        recurrence: task.recurrence || 'none',
        recurrence_id: task.recurrence_id,
        is_recurring_parent: task.is_recurring_parent || false,
        sync_status: syncStatus.isOnline ? 'synced' : 'pending',
        created_at: task.created_at || now,
        updated_at: now,
        offline_created: !syncStatus.isOnline
      };

      if (action === 'delete') {
        offlineTask.sync_status = 'deleted';
      }

      await indexedDBManager.saveTask(offlineTask);

      // Add to sync queue if offline
      if (!syncStatus.isOnline || action === 'delete') {
        await indexedDBManager.addToSyncQueue({
          type: 'task',
          action,
          data: offlineTask
        });
      }

      await updatePendingCount();
      
      return offlineTask;
    } catch (error) {
      console.error('Error saving task offline:', error);
      throw error;
    }
  };

  // Save task list offline
  const saveTaskListOffline = async (taskList: Partial<OfflineTaskList>, action: 'create' | 'update' | 'delete') => {
    if (!user) return;

    try {
      const listId = taskList.id || crypto.randomUUID();
      const now = new Date().toISOString();

      const offlineTaskList: OfflineTaskList = {
        id: listId,
        name: taskList.name || '',
        user_id: user.id,
        sync_status: syncStatus.isOnline ? 'synced' : 'pending',
        created_at: taskList.created_at || now,
        updated_at: now,
        offline_created: !syncStatus.isOnline
      };

      if (action === 'delete') {
        offlineTaskList.sync_status = 'deleted';
      }

      await indexedDBManager.saveTaskList(offlineTaskList);

      // Add to sync queue if offline
      if (!syncStatus.isOnline || action === 'delete') {
        await indexedDBManager.addToSyncQueue({
          type: 'task_list',
          action,
          data: offlineTaskList
        });
      }

      await updatePendingCount();
      
      return offlineTaskList;
    } catch (error) {
      console.error('Error saving task list offline:', error);
      throw error;
    }
  };

  // Get offline tasks
  const getOfflineTasks = async (): Promise<OfflineTask[]> => {
    if (!user) return [];
    
    try {
      return await indexedDBManager.getTasks(user.id);
    } catch (error) {
      console.error('Error getting offline tasks:', error);
      return [];
    }
  };

  // Get offline task lists
  const getOfflineTaskLists = async (): Promise<OfflineTaskList[]> => {
    if (!user) return [];
    
    try {
      return await indexedDBManager.getTaskLists(user.id);
    } catch (error) {
      console.error('Error getting offline task lists:', error);
      return [];
    }
  };

  // Force sync
  const forceSync = useCallback(async () => {
    if (syncStatus.isOnline && !syncStatus.isSyncing) {
      await syncOfflineData();
    }
  }, [syncOfflineData, syncStatus.isOnline, syncStatus.isSyncing]);

  // Clear offline data
  const clearOfflineData = async () => {
    try {
      await indexedDBManager.clearAllData();
      setSyncStatus(prev => ({ ...prev, pendingItems: 0, lastSyncTime: null }));
    } catch (error) {
      console.error('Error clearing offline data:', error);
      throw error;
    }
  };

  // Initialize sync on user login
  useEffect(() => {
    if (user && syncStatus.isOnline) {
      updatePendingCount();
      
      // Sync after a short delay to allow UI to settle
      const timer = setTimeout(() => {
        syncOfflineData();
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [user, syncStatus.isOnline]);

  return {
    syncStatus,
    saveTaskOffline,
    saveTaskListOffline,
    getOfflineTasks,
    getOfflineTaskLists,
    forceSync,
    clearOfflineData,
    updatePendingCount
  };
};