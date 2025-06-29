import React, { useEffect, useState } from 'react';
import { Bell, X, Volume2, Smartphone, Wifi, WifiOff, CheckCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import { useNotifications } from '../hooks/useNotifications';

const NotificationPrompt: React.FC = () => {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const { 
    supported, 
    permission, 
    requestPermission, 
    playNotificationSound, 
    testNotification,
    syncNotifications 
  } = useNotifications();

  useEffect(() => {
    // Monitor online/offline status
    const handleOnline = () => {
      setIsOnline(true);
      // Sync notifications when coming back online
      syncNotifications();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncNotifications]);

  useEffect(() => {
    // Show prompt if notifications are supported but not granted
    if (supported && permission === 'default') {
      // Delay showing the prompt to avoid being too intrusive
      const timer = setTimeout(() => {
        const dismissed = localStorage.getItem('notificationPromptDismissed');
        if (!dismissed) {
          setShowPrompt(true);
        }
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [supported, permission]);

  const handleEnableNotifications = async () => {
    const granted = await requestPermission();
    if (granted) {
      setShowPrompt(false);
      
      // Show success toast
      toast.success('🔔 Notifications enabled! You\'ll receive reminders for your tasks.', {
        icon: '🔔',
        autoClose: 4000,
      });
      
      // Play a test sound to confirm audio works
      playNotificationSound('/notification.mp3');
      
      // Sync notifications if online
      if (isOnline) {
        await syncNotifications();
      }
      
      // Show success message with test notification
      setTimeout(() => {
        testNotification();
        toast.info('🎵 Test notification sent! Check if you heard the custom ringtone.', {
          icon: '🎵',
          autoClose: 5000,
        });
      }, 1000);
    } else {
      toast.error('❌ Notifications were blocked. Please enable them in your browser settings.', {
        icon: '❌',
        autoClose: 6000,
      });
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    // Store dismissal in localStorage to avoid showing again
    localStorage.setItem('notificationPromptDismissed', 'true');
    
    toast.info('💡 You can enable notifications later in your browser settings.', {
      icon: '💡',
      autoClose: 4000,
    });
  };

  const handleTestSound = () => {
    playNotificationSound('/notification.mp3');
    toast.success('🎵 Playing notification sound...', {
      icon: '🎵',
      autoClose: 2000,
    });
  };

  const handleTestNotification = () => {
    testNotification();
    toast.info('🔔 Test notification sent!', {
      icon: '🔔',
      autoClose: 3000,
    });
  };

  if (!showPrompt || !supported || permission !== 'default') {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm">
      <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-6 mx-4 sm:mx-0 backdrop-blur-sm">
        <div className="flex items-start space-x-4">
          <div className="flex-shrink-0">
            <div className="relative">
              <div className="h-10 w-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center">
                <Bell className="h-5 w-5 text-white" />
              </div>
              {!isOnline && (
                <WifiOff className="h-3 w-3 text-orange-500 absolute -top-1 -right-1 bg-white rounded-full" />
              )}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center">
              Enable Smart Notifications
              {isOnline ? (
                <Wifi className="h-3 w-3 text-green-500 ml-2" />
              ) : (
                <WifiOff className="h-3 w-3 text-orange-500 ml-2" />
              )}
            </h3>
            <p className="text-sm text-gray-600 mt-1 leading-relaxed">
              Get reminded before your tasks are due with custom ringtone, vibration, and interactive actions.
            </p>
            
            <div className="mt-4 space-y-2">
              <div className="text-xs text-gray-500 space-y-2">
                <div className="flex items-center space-x-2">
                  <Smartphone className="h-3 w-3 text-blue-500" />
                  <span>Works on mobile & desktop</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Volume2 className="h-3 w-3 text-green-500" />
                  <span>Custom notification sound</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Bell className="h-3 w-3 text-purple-500" />
                  <span>Customizable timing (3min to 1day before)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-3 w-3 text-indigo-500" />
                  <span>Interactive actions (view, complete, snooze)</span>
                </div>
                {!isOnline && (
                  <div className="flex items-center space-x-2 text-orange-600">
                    <WifiOff className="h-3 w-3" />
                    <span>Works offline - notifications queued locally</span>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex flex-col space-y-3 mt-5">
              <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                <button
                  onClick={handleEnableNotifications}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-sm font-medium rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 flex items-center justify-center shadow-sm"
                >
                  <Bell className="h-4 w-4 mr-2" />
                  Enable Notifications
                </button>
                <button
                  onClick={handleTestSound}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-green-600 to-green-700 text-white text-sm font-medium rounded-lg hover:from-green-700 hover:to-green-800 transition-all duration-200 flex items-center justify-center shadow-sm"
                >
                  <Volume2 className="h-4 w-4 mr-2" />
                  Test Sound
                </button>
              </div>
              <button
                onClick={handleDismiss}
                className="px-4 py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
              >
                Maybe later
              </button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotificationPrompt;