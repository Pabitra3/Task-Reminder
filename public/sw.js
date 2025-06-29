const CACHE_NAME = 'taskreminder-v2.0.0';
const STATIC_CACHE_NAME = 'taskreminder-static-v2.0.0';
const DYNAMIC_CACHE_NAME = 'taskreminder-dynamic-v2.0.0';

// Enhanced assets to cache for offline functionality
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/notification.mp3',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/badge-72x72.png',
  // Add all icon sizes
  '/icon-72x72.png',
  '/icon-96x96.png',
  '/icon-128x128.png',
  '/icon-144x144.png',
  '/icon-152x152.png',
  '/icon-384x384.png',
];

// API endpoints that should be cached
const API_CACHE_PATTERNS = [
  /\/api\/tasks/,
  /\/api\/task-lists/,
  /\/api\/lists/,
  /\/auth\//
];

// FullCalendar and external assets patterns
const EXTERNAL_CACHE_PATTERNS = [
  /fullcalendar/,
  /\.css$/,
  /\.js$/,
  /\.woff2?$/,
  /\.ttf$/,
  /\.eot$/
];

// Notification storage
let scheduledNotifications = new Map();
let notificationQueue = [];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  
  event.waitUntil(
    Promise.all([
      // Cache static assets
      caches.open(STATIC_CACHE_NAME).then(cache => {
        console.log('Caching static assets...');
        return cache.addAll(STATIC_ASSETS.filter(asset => !asset.startsWith('http')));
      }),
      // Cache FullCalendar assets
      cacheFullCalendarAssets(),
      // Skip waiting to activate immediately
      self.skipWaiting()
    ])
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== STATIC_CACHE_NAME && 
                cacheName !== DYNAMIC_CACHE_NAME && 
                cacheName !== CACHE_NAME) {
              console.log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Take control of all clients
      self.clients.claim(),
      // Initialize notification system
      initializeNotificationSystem()
    ])
  );
});

// Enhanced fetch event - implement comprehensive caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and chrome-extension requests
  if (request.method !== 'GET' || url.protocol === 'chrome-extension:') {
    return;
  }

  // Handle different types of requests with appropriate strategies
  if (isStaticAsset(request)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE_NAME));
  } else if (isExternalAsset(request)) {
    event.respondWith(staleWhileRevalidate(request, DYNAMIC_CACHE_NAME));
  } else if (isAPIRequest(request)) {
    event.respondWith(networkFirst(request, DYNAMIC_CACHE_NAME));
  } else if (isNavigationRequest(request)) {
    event.respondWith(networkFirst(request, DYNAMIC_CACHE_NAME, '/index.html'));
  } else {
    event.respondWith(staleWhileRevalidate(request, DYNAMIC_CACHE_NAME));
  }
});

// Enhanced Push notification handling with toast integration
self.addEventListener('push', (event) => {
  console.log('Push event received:', event);
  
  if (event.data) {
    const data = event.data.json();
    
    const options = {
      body: data.body,
      icon: data.icon || '/icon-192x192.png',
      badge: data.badge || '/badge-72x72.png',
      sound: data.sound || '/notification.mp3',
      vibrate: data.vibrate || [200, 100, 200, 100, 200],
      data: data.data,
      requireInteraction: data.requireInteraction || true,
      silent: data.silent || false,
      tag: data.tag || `task-${data.data?.taskId}`,
      renotify: data.renotify || true,
      timestamp: data.timestamp || Date.now(),
      actions: data.actions || [
        {
          action: 'view',
          title: 'View Task',
          icon: '/icon-192x192.png'
        },
        {
          action: 'complete',
          title: 'Mark Complete',
          icon: '/icon-192x192.png'
        },
        {
          action: 'snooze',
          title: 'Snooze 5min',
          icon: '/icon-192x192.png'
        }
      ]
    };

    event.waitUntil(
      Promise.all([
        self.registration.showNotification(data.title, options),
        playCustomSound(data.sound || '/notification.mp3'),
        notifyClients('NOTIFICATION_RECEIVED', data)
      ])
    );
  }
});

// Enhanced Notification click handling
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event);
  
  event.notification.close();
  
  const taskId = event.notification.data?.taskId;
  const action = event.action;
  
  if (action === 'view') {
    event.waitUntil(
      clients.openWindow(`/?task=${taskId}`)
    );
  } else if (action === 'complete') {
    event.waitUntil(
      markTaskComplete(taskId)
    );
  } else if (action === 'snooze') {
    event.waitUntil(
      snoozeTask(taskId, 5)
    );
  } else {
    // Default click action
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then(clientList => {
        // Try to focus existing window
        for (const client of clientList) {
          if (client.url === self.location.origin && 'focus' in client) {
            return client.focus();
          }
        }
        // Open new window if none exists
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
    );
  }
});

// Enhanced background sync for offline operations
self.addEventListener('sync', (event) => {
  console.log('Background sync triggered:', event.tag);
  
  if (event.tag === 'sync-tasks') {
    event.waitUntil(syncOfflineTasks());
  } else if (event.tag === 'sync-task-lists') {
    event.waitUntil(syncOfflineTaskLists());
  } else if (event.tag === 'sync-notifications') {
    event.waitUntil(syncNotifications());
  } else if (event.tag === 'sync-all') {
    event.waitUntil(syncAllOfflineData());
  }
});

// Enhanced Message handling from main thread
self.addEventListener('message', (event) => {
  const { type, data } = event.data;
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
    case 'CACHE_TASK':
      cacheTaskData(data);
      break;
    case 'SYNC_OFFLINE_DATA':
      syncAllOfflineData();
      break;
    case 'CACHE_FULLCALENDAR':
      cacheFullCalendarAssets();
      break;
    case 'SCHEDULE_NOTIFICATION':
      scheduleNotification(data);
      break;
    case 'CANCEL_NOTIFICATION':
      cancelNotification(data.taskId);
      break;
    case 'PLAY_NOTIFICATION_SOUND':
      playCustomSound(data.soundUrl);
      break;
    case 'QUEUE_NOTIFICATION':
      queueNotification(data);
      break;
    case 'PROCESS_NOTIFICATION_QUEUE':
      processNotificationQueue();
      break;
    default:
      console.log('Unknown message type:', type);
  }
});

// Enhanced caching strategies
async function cacheFirst(request, cacheName) {
  try {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.error('Cache first strategy failed:', error);
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request, cacheName, fallbackUrl = null) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
      return networkResponse;
    }
    
    throw new Error('Network response not ok');
  } catch (error) {
    console.log('Network failed, trying cache:', error);
    
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    if (fallbackUrl) {
      const fallbackResponse = await cache.match(fallbackUrl);
      if (fallbackResponse) {
        return fallbackResponse;
      }
    }
    
    return new Response('Offline', { 
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  const fetchPromise = fetch(request).then(networkResponse => {
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch(() => cachedResponse);
  
  return cachedResponse || fetchPromise;
}

// Helper functions
function isStaticAsset(request) {
  const url = new URL(request.url);
  return STATIC_ASSETS.some(asset => url.pathname === asset) ||
         url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|ico|mp3|woff|woff2|ttf|eot)$/);
}

function isExternalAsset(request) {
  const url = new URL(request.url);
  return EXTERNAL_CACHE_PATTERNS.some(pattern => pattern.test(url.href)) ||
         url.hostname !== self.location.hostname;
}

function isAPIRequest(request) {
  const url = new URL(request.url);
  return API_CACHE_PATTERNS.some(pattern => pattern.test(url.pathname));
}

function isNavigationRequest(request) {
  return request.mode === 'navigate' || 
         (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'));
}

async function cacheFullCalendarAssets() {
  try {
    const cache = await caches.open(DYNAMIC_CACHE_NAME);
    
    // Cache FullCalendar CDN assets
    const fullCalendarAssets = [
      'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.js',
      'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.css'
    ];
    
    for (const asset of fullCalendarAssets) {
      try {
        const response = await fetch(asset);
        if (response.ok) {
          await cache.put(asset, response);
          console.log('Cached FullCalendar asset:', asset);
        }
      } catch (error) {
        console.warn('Failed to cache FullCalendar asset:', asset, error);
      }
    }
  } catch (error) {
    console.error('Error caching FullCalendar assets:', error);
  }
}

// Enhanced notification sound handling
async function playCustomSound(soundUrl) {
  try {
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'PLAY_NOTIFICATION_SOUND',
        soundUrl: soundUrl
      });
    });
  } catch (error) {
    console.error('Error playing custom sound:', error);
  }
}

// Notification system initialization
async function initializeNotificationSystem() {
  try {
    // Load queued notifications from storage
    const storedQueue = await getStoredData('notificationQueue');
    if (storedQueue) {
      notificationQueue = storedQueue;
      console.log('Loaded notification queue:', notificationQueue.length, 'items');
    }
    
    // Process any pending notifications
    await processNotificationQueue();
  } catch (error) {
    console.error('Error initializing notification system:', error);
  }
}

// Enhanced notification scheduling
function scheduleNotification(notificationData) {
  const { id, taskId, scheduledTime, title, body, data } = notificationData;
  
  const delay = scheduledTime - Date.now();
  
  if (delay <= 0) {
    // Show immediately if time has passed
    showScheduledNotification(notificationData);
    return;
  }
  
  // Store the timeout ID for potential cancellation
  const timeoutId = setTimeout(() => {
    showScheduledNotification(notificationData);
    scheduledNotifications.delete(taskId);
  }, delay);
  
  scheduledNotifications.set(taskId, timeoutId);
  
  console.log('Notification scheduled:', {
    taskId,
    scheduledTime: new Date(scheduledTime),
    delay: delay / 1000 / 60 + ' minutes'
  });
}

// Queue notification for offline processing
async function queueNotification(notificationData) {
  try {
    notificationQueue.push({
      ...notificationData,
      queuedAt: Date.now()
    });
    
    await storeData('notificationQueue', notificationQueue);
    console.log('Notification queued for offline processing');
  } catch (error) {
    console.error('Error queuing notification:', error);
  }
}

// Process queued notifications
async function processNotificationQueue() {
  try {
    if (notificationQueue.length === 0) return;
    
    const now = Date.now();
    const processedNotifications = [];
    
    for (const notification of notificationQueue) {
      if (notification.scheduledTime <= now) {
        // Show notification if time has passed
        await showScheduledNotification(notification);
        processedNotifications.push(notification);
      } else {
        // Schedule notification for future
        scheduleNotification(notification);
        processedNotifications.push(notification);
      }
    }
    
    // Remove processed notifications from queue
    notificationQueue = notificationQueue.filter(n => 
      !processedNotifications.includes(n)
    );
    
    await storeData('notificationQueue', notificationQueue);
    
    if (processedNotifications.length > 0) {
      console.log('Processed', processedNotifications.length, 'queued notifications');
    }
  } catch (error) {
    console.error('Error processing notification queue:', error);
  }
}

function cancelNotification(taskId) {
  const timeoutId = scheduledNotifications.get(taskId);
  if (timeoutId) {
    clearTimeout(timeoutId);
    scheduledNotifications.delete(taskId);
    console.log('Notification cancelled for task:', taskId);
  }
  
  // Also remove from queue
  notificationQueue = notificationQueue.filter(n => n.taskId !== taskId);
  storeData('notificationQueue', notificationQueue);
}

async function showScheduledNotification(notificationData) {
  const { title, body, data, taskId } = notificationData;
  
  const options = {
    body: body,
    icon: '/icon-192x192.png',
    badge: '/badge-72x72.png',
    sound: '/notification.mp3',
    vibrate: [200, 100, 200, 100, 200],
    data: data,
    requireInteraction: true,
    silent: false,
    tag: `task-${taskId}`,
    renotify: true,
    timestamp: Date.now(),
    actions: [
      {
        action: 'view',
        title: 'View Task',
        icon: '/icon-192x192.png'
      },
      {
        action: 'complete',
        title: 'Mark Complete',
        icon: '/icon-192x192.png'
      },
      {
        action: 'snooze',
        title: 'Snooze 5min',
        icon: '/icon-192x192.png'
      }
    ]
  };

  try {
    await self.registration.showNotification(title, options);
    await playCustomSound('/notification.mp3');
    await notifyClients('NOTIFICATION_SHOWN', { taskId, title });
    console.log('Scheduled notification shown:', title);
  } catch (error) {
    console.error('Error showing scheduled notification:', error);
  }
}

async function markTaskComplete(taskId) {
  try {
    console.log('Marking task complete:', taskId);
    
    await notifyClients('COMPLETE_TASK', { taskId });

    // Cancel any pending notifications for this task
    cancelNotification(taskId);

    await self.registration.showNotification('✅ Task Completed', {
      body: 'Task has been marked as complete',
      icon: '/icon-192x192.png',
      badge: '/badge-72x72.png',
      silent: true,
      tag: 'task-completed',
      requireInteraction: false
    });
  } catch (error) {
    console.error('Error marking task complete:', error);
  }
}

async function snoozeTask(taskId, minutes) {
  try {
    console.log(`Snoozing task ${taskId} for ${minutes} minutes`);
    
    await notifyClients('SNOOZE_TASK', { taskId, minutes });

    await self.registration.showNotification('⏰ Task Snoozed', {
      body: `Task reminder snoozed for ${minutes} minutes`,
      icon: '/icon-192x192.png',
      badge: '/badge-72x72.png',
      silent: true,
      tag: 'task-snoozed',
      requireInteraction: false
    });
  } catch (error) {
    console.error('Error snoozing task:', error);
  }
}

// Enhanced sync functions
async function syncAllOfflineData() {
  try {
    console.log('Syncing all offline data...');
    
    await Promise.all([
      syncOfflineTasks(),
      syncOfflineTaskLists(),
      syncNotifications()
    ]);
    
    await notifyClients('SYNC_COMPLETED', { timestamp: Date.now() });
  } catch (error) {
    console.error('Error syncing all offline data:', error);
    await notifyClients('SYNC_ERROR', { error: error.message });
  }
}

async function syncOfflineTasks() {
  try {
    console.log('Syncing offline tasks...');
    await notifyClients('SYNC_OFFLINE_TASKS');
  } catch (error) {
    console.error('Error syncing offline tasks:', error);
  }
}

async function syncOfflineTaskLists() {
  try {
    console.log('Syncing offline task lists...');
    await notifyClients('SYNC_OFFLINE_TASK_LISTS');
  } catch (error) {
    console.error('Error syncing offline task lists:', error);
  }
}

async function syncNotifications() {
  try {
    console.log('Syncing notifications...');
    await notifyClients('SYNC_NOTIFICATIONS');
  } catch (error) {
    console.error('Error syncing notifications:', error);
  }
}

async function cacheTaskData(data) {
  try {
    const cache = await caches.open(DYNAMIC_CACHE_NAME);
    const response = new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' }
    });
    await cache.put('/api/tasks/offline', response);
  } catch (error) {
    console.error('Error caching task data:', error);
  }
}

// Utility functions for data storage
async function storeData(key, data) {
  try {
    // Use IndexedDB through the main thread
    await notifyClients('STORE_DATA', { key, data });
  } catch (error) {
    console.error('Error storing data:', error);
  }
}

async function getStoredData(key) {
  try {
    // Request data from main thread
    const clients = await self.clients.matchAll();
    if (clients.length > 0) {
      return new Promise((resolve) => {
        const messageChannel = new MessageChannel();
        messageChannel.port1.onmessage = (event) => {
          resolve(event.data);
        };
        
        clients[0].postMessage({
          type: 'GET_STORED_DATA',
          key: key
        }, [messageChannel.port2]);
      });
    }
    return null;
  } catch (error) {
    console.error('Error getting stored data:', error);
    return null;
  }
}

// Notify all clients
async function notifyClients(type, data = {}) {
  try {
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({ type, data });
    });
  } catch (error) {
    console.error('Error notifying clients:', error);
  }
}