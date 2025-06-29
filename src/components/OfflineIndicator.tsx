import React, { useEffect, useState } from 'react';
import { Wifi, WifiOff, RefreshCw, AlertCircle, CheckCircle, Cloud, CloudOff } from 'lucide-react';
import { toast } from 'react-toastify';
import { useTask } from '../contexts/TaskContext';

const OfflineIndicator: React.FC = () => {
  const { isOffline, syncStatus, syncOfflineData } = useTask();
  const [lastOnlineState, setLastOnlineState] = useState(!isOffline);

  // Show toast notifications for online/offline state changes
  useEffect(() => {
    if (isOffline !== lastOnlineState) {
      if (isOffline) {
        toast.warn('📱 You\'re now offline. Changes will be saved locally and synced when you reconnect.', {
          icon: '📱',
          autoClose: 5000,
        });
      } else {
        toast.success('🌐 You\'re back online! Syncing your changes...', {
          icon: '🌐',
          autoClose: 3000,
        });
      }
      setLastOnlineState(!isOffline);
    }
  }, [isOffline, lastOnlineState]);

  // Show toast for sync status changes
  useEffect(() => {
    if (syncStatus.isSyncing) {
      toast.info('🔄 Syncing your changes...', {
        icon: '🔄',
        autoClose: 2000,
      });
    } else if (syncStatus.lastSyncTime && syncStatus.pendingItems === 0) {
      toast.success('✅ All changes synced successfully!', {
        icon: '✅',
        autoClose: 3000,
      });
    }
  }, [syncStatus.isSyncing, syncStatus.lastSyncTime, syncStatus.pendingItems]);

  // Show toast for sync errors
  useEffect(() => {
    if (syncStatus.syncError) {
      toast.error(`❌ Sync failed: ${syncStatus.syncError}`, {
        icon: '❌',
        autoClose: 6000,
      });
    }
  }, [syncStatus.syncError]);

  if (!isOffline && syncStatus.pendingItems === 0) {
    return null; // Don't show anything when online and synced
  }

  const handleForceSync = () => {
    if (!isOffline && !syncStatus.isSyncing) {
      syncOfflineData();
    }
  };

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50">
      <div className={`
        flex items-center space-x-3 px-4 py-3 rounded-xl shadow-lg border backdrop-blur-sm text-sm font-medium transition-all duration-300
        ${isOffline 
          ? 'bg-red-50/90 text-red-700 border-red-200' 
          : syncStatus.isSyncing
          ? 'bg-blue-50/90 text-blue-700 border-blue-200'
          : 'bg-orange-50/90 text-orange-700 border-orange-200'
        }
      `}>
        {isOffline ? (
          <CloudOff className="h-4 w-4" />
        ) : syncStatus.isSyncing ? (
          <RefreshCw className="h-4 w-4 animate-spin" />
        ) : (
          <Cloud className="h-4 w-4" />
        )}
        
        <span>
          {isOffline ? (
            'Working offline'
          ) : syncStatus.isSyncing ? (
            'Syncing changes...'
          ) : syncStatus.pendingItems > 0 ? (
            `${syncStatus.pendingItems} change${syncStatus.pendingItems === 1 ? '' : 's'} to sync`
          ) : (
            'Online'
          )}
        </span>

        {syncStatus.syncError && (
          <AlertCircle className="h-4 w-4 text-red-500" title={syncStatus.syncError} />
        )}

        {syncStatus.lastSyncTime && !syncStatus.isSyncing && syncStatus.pendingItems === 0 && (
          <CheckCircle className="h-4 w-4 text-green-500" title="All changes synced" />
        )}

        {!isOffline && syncStatus.pendingItems > 0 && !syncStatus.isSyncing && (
          <button
            onClick={handleForceSync}
            className="p-1 hover:bg-blue-100 rounded-lg transition-colors"
            title="Sync now"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        )}
      </div>
      
      {syncStatus.lastSyncTime && (
        <div className="text-center mt-2">
          <span className="text-xs text-gray-500 bg-white/80 backdrop-blur-sm px-2 py-1 rounded-lg shadow-sm">
            Last sync: {syncStatus.lastSyncTime.toLocaleTimeString()}
          </span>
        </div>
      )}
    </div>
  );
};

export default OfflineIndicator;