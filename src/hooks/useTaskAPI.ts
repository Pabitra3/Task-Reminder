import { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { indexedDBManager } from '../lib/indexedDB';
import type { Task, TaskList } from '../contexts/TaskContext';

interface SyncChange {
  type: 'task' | 'task_list';
  action: 'create' | 'update' | 'delete';
  data: any;
  clientTimestamp: string;
}

interface SyncResult {
  processed: number;
  errors: Array<{ change: SyncChange; error: string }>;
  conflicts: Array<{
    id: string;
    type: string;
    reason: string;
    serverTimestamp: string;
    clientTimestamp: string;
  }>;
}

export const useTaskAPI = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const getAuthHeaders = useCallback(async () => {
    if (!user) throw new Error('User not authenticated');
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('No valid session');

    return {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    };
  }, [user]);

  const isOnline = () => navigator.onLine;

  // Create task
  const createTask = useCallback(async (taskData: Partial<Task>) => {
    setLoading(true);
    setError(null);

    try {
      if (!isOnline()) {
        // Save offline
        const offlineTask = await saveTaskOffline(taskData, 'create');
        return offlineTask;
      }

      // Save online
      const headers = await getAuthHeaders();
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers,
        body: JSON.stringify(taskData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create task');
      }

      const task = await response.json();
      
      // Also save to IndexedDB for offline access
      await indexedDBManager.saveTask({
        ...task,
        sync_status: 'synced',
        offline_created: false
      });

      return task;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create task';
      setError(errorMessage);
      
      // Fallback to offline save
      if (isOnline()) {
        console.warn('Online save failed, falling back to offline:', errorMessage);
        return await saveTaskOffline(taskData, 'create');
      }
      
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  // Update task
  const updateTask = useCallback(async (id: string, updates: Partial<Task>) => {
    setLoading(true);
    setError(null);

    try {
      if (!isOnline()) {
        // Update offline
        const existingTask = await indexedDBManager.getTask(id);
        if (!existingTask) throw new Error('Task not found');
        
        const updatedTask = { ...existingTask, ...updates };
        return await saveTaskOffline(updatedTask, 'update');
      }

      // Update online
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/tasks/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update task');
      }

      const task = await response.json();
      
      // Update IndexedDB
      await indexedDBManager.saveTask({
        ...task,
        sync_status: 'synced'
      });

      return task;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update task';
      setError(errorMessage);
      
      // Fallback to offline update
      if (isOnline()) {
        console.warn('Online update failed, falling back to offline:', errorMessage);
        const existingTask = await indexedDBManager.getTask(id);
        if (existingTask) {
          const updatedTask = { ...existingTask, ...updates };
          return await saveTaskOffline(updatedTask, 'update');
        }
      }
      
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  // Delete task
  const deleteTask = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);

    try {
      const taskToDelete = await indexedDBManager.getTask(id);
      if (!taskToDelete) throw new Error('Task not found');

      if (!isOnline()) {
        // Delete offline
        return await saveTaskOffline(taskToDelete, 'delete');
      }

      // Delete online
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/tasks/${id}`, {
        method: 'DELETE',
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete task');
      }

      // Remove from IndexedDB
      await indexedDBManager.deleteTask(id);
      
      // If it's a recurring parent, remove all instances
      if (taskToDelete.is_recurring_parent) {
        const allTasks = await indexedDBManager.getTasks(user!.id);
        const instancesToDelete = allTasks.filter(t => t.recurrence_id === id);
        
        for (const instance of instancesToDelete) {
          await indexedDBManager.deleteTask(instance.id);
        }
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete task';
      setError(errorMessage);
      
      // Fallback to offline delete
      if (isOnline()) {
        console.warn('Online delete failed, falling back to offline:', errorMessage);
        const taskToDelete = await indexedDBManager.getTask(id);
        if (taskToDelete) {
          return await saveTaskOffline(taskToDelete, 'delete');
        }
      }
      
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders, user]);

  // Fetch tasks
  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (!isOnline()) {
        // Return offline tasks
        return await indexedDBManager.getTasks(user!.id);
      }

      // Fetch online
      const headers = await getAuthHeaders();
      const response = await fetch('/api/tasks', {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch tasks');
      }

      const tasks = await response.json();
      
      // Save to IndexedDB
      const offlineTasks = tasks.map((task: Task) => ({
        ...task,
        sync_status: 'synced',
        offline_created: false
      }));
      
      await indexedDBManager.saveTasks(offlineTasks);
      
      return tasks;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch tasks';
      setError(errorMessage);
      
      // Fallback to offline tasks
      if (isOnline()) {
        console.warn('Online fetch failed, falling back to offline:', errorMessage);
        return await indexedDBManager.getTasks(user!.id);
      }
      
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders, user]);

  // Sync offline changes
  const syncOfflineChanges = useCallback(async () => {
    if (!isOnline() || !user) return { processed: 0, errors: [], conflicts: [] };

    setLoading(true);
    setError(null);

    try {
      const syncQueue = await indexedDBManager.getSyncQueue();
      if (syncQueue.length === 0) {
        return { processed: 0, errors: [], conflicts: [] };
      }

      const changes: SyncChange[] = syncQueue.map(item => ({
        type: item.type as 'task' | 'task_list',
        action: item.action as 'create' | 'update' | 'delete',
        data: item.data,
        clientTimestamp: new Date(item.timestamp).toISOString()
      }));

      const headers = await getAuthHeaders();
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers,
        body: JSON.stringify({ changes }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Sync failed');
      }

      const result: SyncResult = await response.json();
      
      // Remove successfully processed items from sync queue
      for (let i = 0; i < result.processed; i++) {
        if (syncQueue[i]) {
          await indexedDBManager.removeSyncQueueItem(syncQueue[i].id);
        }
      }

      // Handle conflicts by fetching latest data
      if (result.conflicts.length > 0) {
        console.warn('Sync conflicts detected:', result.conflicts);
        // Refresh data to get latest from server
        await fetchTasks();
      }

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Sync failed';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders, user, fetchTasks]);

  // Helper function to save task offline
  const saveTaskOffline = async (taskData: Partial<Task>, action: 'create' | 'update' | 'delete') => {
    if (!user) throw new Error('User not authenticated');

    const taskId = taskData.id || crypto.randomUUID();
    const now = new Date().toISOString();

    const offlineTask = {
      id: taskId,
      title: taskData.title || '',
      description: taskData.description || null,
      due_date: taskData.due_date || '',
      due_time: taskData.due_time || '',
      priority: taskData.priority || 'medium',
      completed: taskData.completed || false,
      user_id: user.id,
      list_id: taskData.list_id || null,
      email_reminder: taskData.email_reminder || false,
      push_notification: taskData.push_notification ?? true,
      notification_time: taskData.notification_time || '10min',
      recurrence: taskData.recurrence || 'none',
      recurrence_id: taskData.recurrence_id || null,
      is_recurring_parent: taskData.is_recurring_parent || false,
      sync_status: action === 'delete' ? 'deleted' : 'pending',
      created_at: taskData.created_at || now,
      updated_at: now,
      offline_created: !taskData.id
    };

    await indexedDBManager.saveTask(offlineTask);

    // Add to sync queue
    await indexedDBManager.addToSyncQueue({
      type: 'task',
      action,
      data: offlineTask
    });

    return offlineTask;
  };

  return {
    createTask,
    updateTask,
    deleteTask,
    fetchTasks,
    syncOfflineChanges,
    loading,
    error,
    isOnline: isOnline()
  };
};