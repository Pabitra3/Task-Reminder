// IndexedDB wrapper for offline storage
export interface OfflineTask {
  id: string;
  title: string;
  description?: string;
  due_date: string;
  due_time: string;
  priority: 'low' | 'medium' | 'high';
  completed: boolean;
  user_id: string;
  list_id?: string;
  email_reminder: boolean;
  push_notification: boolean;
  notification_time: string;
  recurrence: 'none' | 'daily' | 'weekly' | 'monthly';
  recurrence_id?: string;
  is_recurring_parent: boolean;
  sync_status: 'synced' | 'pending' | 'updated' | 'deleted';
  created_at: string;
  updated_at: string;
  offline_created?: boolean;
}

export interface OfflineTaskList {
  id: string;
  name: string;
  user_id: string;
  sync_status: 'synced' | 'pending' | 'updated' | 'deleted';
  created_at: string;
  updated_at: string;
  offline_created?: boolean;
}

export interface SyncQueueItem {
  id: string;
  type: 'task' | 'task_list';
  action: 'create' | 'update' | 'delete';
  data: any;
  timestamp: number;
  retries: number;
}

export interface ScheduledNotification {
  id: string;
  taskId: string;
  title: string;
  body: string;
  scheduledTime: number;
  notificationTime: string;
  taskData: any;
  sync_status: 'pending' | 'synced' | 'cancelled';
}

class IndexedDBManager {
  private dbName = 'TaskReminderDB';
  private version = 2; // Incremented for notification support
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        console.error('IndexedDB failed to open');
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('IndexedDB opened successfully');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create tasks store
        if (!db.objectStoreNames.contains('tasks')) {
          const tasksStore = db.createObjectStore('tasks', { keyPath: 'id' });
          tasksStore.createIndex('user_id', 'user_id', { unique: false });
          tasksStore.createIndex('sync_status', 'sync_status', { unique: false });
          tasksStore.createIndex('due_date', 'due_date', { unique: false });
          tasksStore.createIndex('list_id', 'list_id', { unique: false });
          tasksStore.createIndex('push_notification', 'push_notification', { unique: false });
          tasksStore.createIndex('completed', 'completed', { unique: false });
        }

        // Create task_lists store
        if (!db.objectStoreNames.contains('task_lists')) {
          const listsStore = db.createObjectStore('task_lists', { keyPath: 'id' });
          listsStore.createIndex('user_id', 'user_id', { unique: false });
          listsStore.createIndex('sync_status', 'sync_status', { unique: false });
        }

        // Create sync_queue store
        if (!db.objectStoreNames.contains('sync_queue')) {
          const syncStore = db.createObjectStore('sync_queue', { keyPath: 'id' });
          syncStore.createIndex('type', 'type', { unique: false });
          syncStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Create app_state store for misc data (including notifications)
        if (!db.objectStoreNames.contains('app_state')) {
          db.createObjectStore('app_state', { keyPath: 'key' });
        }

        // Create notifications store (new in version 2)
        if (!db.objectStoreNames.contains('notifications')) {
          const notificationsStore = db.createObjectStore('notifications', { keyPath: 'id' });
          notificationsStore.createIndex('taskId', 'taskId', { unique: false });
          notificationsStore.createIndex('scheduledTime', 'scheduledTime', { unique: false });
          notificationsStore.createIndex('sync_status', 'sync_status', { unique: false });
        }
      };
    });
  }

  private async getStore(storeName: string, mode: IDBTransactionMode = 'readonly'): Promise<IDBObjectStore> {
    if (!this.db) {
      await this.init();
    }
    const transaction = this.db!.transaction([storeName], mode);
    return transaction.objectStore(storeName);
  }

  // Tasks operations
  async saveTasks(tasks: OfflineTask[]): Promise<void> {
    const store = await this.getStore('tasks', 'readwrite');
    const promises = tasks.map(task => {
      return new Promise<void>((resolve, reject) => {
        const request = store.put(task);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });
    await Promise.all(promises);
  }

  async saveTask(task: OfflineTask): Promise<void> {
    const store = await this.getStore('tasks', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put(task);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getTasks(userId: string): Promise<OfflineTask[]> {
    const store = await this.getStore('tasks');
    const index = store.index('user_id');
    
    return new Promise((resolve, reject) => {
      const request = index.getAll(userId);
      request.onsuccess = () => {
        const tasks = request.result.filter(task => task.sync_status !== 'deleted');
        resolve(tasks);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getTask(taskId: string): Promise<OfflineTask | null> {
    const store = await this.getStore('tasks');
    
    return new Promise((resolve, reject) => {
      const request = store.get(taskId);
      request.onsuccess = () => {
        const task = request.result;
        if (task && task.sync_status !== 'deleted') {
          resolve(task);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteTask(taskId: string): Promise<void> {
    const store = await this.getStore('tasks', 'readwrite');
    
    return new Promise((resolve, reject) => {
      const request = store.delete(taskId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Get tasks that need notifications
  async getTasksForNotifications(userId: string): Promise<OfflineTask[]> {
    const store = await this.getStore('tasks');
    const index = store.index('user_id');
    
    return new Promise((resolve, reject) => {
      const request = index.getAll(userId);
      request.onsuccess = () => {
        const tasks = request.result.filter(task => 
          task.sync_status !== 'deleted' && 
          task.push_notification && 
          !task.completed
        );
        resolve(tasks);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Task Lists operations
  async saveTaskLists(taskLists: OfflineTaskList[]): Promise<void> {
    const store = await this.getStore('task_lists', 'readwrite');
    const promises = taskLists.map(list => {
      return new Promise<void>((resolve, reject) => {
        const request = store.put(list);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });
    await Promise.all(promises);
  }

  async saveTaskList(taskList: OfflineTaskList): Promise<void> {
    const store = await this.getStore('task_lists', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put(taskList);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getTaskLists(userId: string): Promise<OfflineTaskList[]> {
    const store = await this.getStore('task_lists');
    const index = store.index('user_id');
    
    return new Promise((resolve, reject) => {
      const request = index.getAll(userId);
      request.onsuccess = () => {
        const lists = request.result.filter(list => list.sync_status !== 'deleted');
        resolve(lists);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteTaskList(listId: string): Promise<void> {
    const store = await this.getStore('task_lists', 'readwrite');
    
    return new Promise((resolve, reject) => {
      const request = store.delete(listId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Notifications operations
  async saveNotification(notification: ScheduledNotification): Promise<void> {
    const store = await this.getStore('notifications', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put(notification);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getNotifications(): Promise<ScheduledNotification[]> {
    const store = await this.getStore('notifications');
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const notifications = request.result.filter(n => n.sync_status !== 'cancelled');
        resolve(notifications);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getNotificationsByTask(taskId: string): Promise<ScheduledNotification[]> {
    const store = await this.getStore('notifications');
    const index = store.index('taskId');
    
    return new Promise((resolve, reject) => {
      const request = index.getAll(taskId);
      request.onsuccess = () => {
        const notifications = request.result.filter(n => n.sync_status !== 'cancelled');
        resolve(notifications);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteNotification(notificationId: string): Promise<void> {
    const store = await this.getStore('notifications', 'readwrite');
    
    return new Promise((resolve, reject) => {
      const request = store.delete(notificationId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteNotificationsByTask(taskId: string): Promise<void> {
    const store = await this.getStore('notifications', 'readwrite');
    const index = store.index('taskId');
    
    return new Promise((resolve, reject) => {
      const request = index.getAll(taskId);
      request.onsuccess = () => {
        const notifications = request.result;
        const deletePromises = notifications.map(notification => {
          return new Promise<void>((deleteResolve, deleteReject) => {
            const deleteRequest = store.delete(notification.id);
            deleteRequest.onsuccess = () => deleteResolve();
            deleteRequest.onerror = () => deleteReject(deleteRequest.error);
          });
        });
        
        Promise.all(deletePromises)
          .then(() => resolve())
          .catch(reject);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Sync Queue operations
  async addToSyncQueue(item: Omit<SyncQueueItem, 'id' | 'timestamp' | 'retries'>): Promise<void> {
    const store = await this.getStore('sync_queue', 'readwrite');
    const syncItem: SyncQueueItem = {
      ...item,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      retries: 0
    };
    
    return new Promise((resolve, reject) => {
      const request = store.put(syncItem);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getSyncQueue(): Promise<SyncQueueItem[]> {
    const store = await this.getStore('sync_queue');
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async removeSyncQueueItem(itemId: string): Promise<void> {
    const store = await this.getStore('sync_queue', 'readwrite');
    
    return new Promise((resolve, reject) => {
      const request = store.delete(itemId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async updateSyncQueueItem(item: SyncQueueItem): Promise<void> {
    const store = await this.getStore('sync_queue', 'readwrite');
    
    return new Promise((resolve, reject) => {
      const request = store.put(item);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clearSyncQueue(): Promise<void> {
    const store = await this.getStore('sync_queue', 'readwrite');
    
    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // App State operations
  async setAppState(key: string, value: any): Promise<void> {
    const store = await this.getStore('app_state', 'readwrite');
    
    return new Promise((resolve, reject) => {
      const request = store.put({ key, value, timestamp: Date.now() });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAppState(key: string): Promise<any> {
    const store = await this.getStore('app_state');
    
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.value : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Utility methods
  async clearAllData(): Promise<void> {
    const storeNames = ['tasks', 'task_lists', 'sync_queue', 'app_state', 'notifications'];
    const promises = storeNames.map(async (storeName) => {
      const store = await this.getStore(storeName, 'readwrite');
      return new Promise<void>((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });
    
    await Promise.all(promises);
  }

  async getStorageUsage(): Promise<{ used: number; quota: number }> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return {
        used: estimate.usage || 0,
        quota: estimate.quota || 0
      };
    }
    return { used: 0, quota: 0 };
  }
}

export const indexedDBManager = new IndexedDBManager();