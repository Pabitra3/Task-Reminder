import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, Flag, List, Mail, Repeat, Bell, Wifi, WifiOff } from 'lucide-react';
import { useTask, Task } from '../contexts/TaskContext';
import { format } from 'date-fns';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  task?: Task;
  selectedDate?: Date;
}

const TaskModal: React.FC<TaskModalProps> = ({ isOpen, onClose, task, selectedDate }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [listId, setListId] = useState<string>('');
  const [emailReminder, setEmailReminder] = useState(false);
  const [pushNotification, setPushNotification] = useState(true);
  const [notificationTime, setNotificationTime] = useState('10min');
  const [recurrence, setRecurrence] = useState<'none' | 'daily' | 'weekly' | 'monthly'>('none');
  const [loading, setLoading] = useState(false);
  const [screenSize, setScreenSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
    isMobile: window.innerWidth < 640,
    isSmallMobile: window.innerWidth < 480,
    isTablet: window.innerWidth >= 640 && window.innerWidth < 1024,
    isDesktop: window.innerWidth >= 1024,
    isLargeDesktop: window.innerWidth >= 1440,
    isUltraWide: window.innerWidth >= 1920
  });
  
  const { addTask, updateTask, taskLists, isOffline } = useTask();

  // Monitor screen size changes
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      setScreenSize({
        width,
        height,
        isMobile: width < 640,
        isSmallMobile: width < 480,
        isTablet: width >= 640 && width < 1024,
        isDesktop: width >= 1024,
        isLargeDesktop: width >= 1440,
        isUltraWide: width >= 1920
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setDueDate(format(new Date(task.due_date), 'yyyy-MM-dd'));
      setDueTime(task.due_time);
      setPriority(task.priority);
      setListId(task.list_id || '');
      setEmailReminder(task.email_reminder || false);
      setPushNotification(task.push_notification ?? true);
      setNotificationTime(task.notification_time || '10min');
      setRecurrence(task.recurrence || 'none');
    } else {
      setTitle('');
      setDescription('');
      setDueDate(selectedDate ? format(selectedDate, 'yyyy-MM-dd') : '');
      setDueTime('');
      setPriority('medium');
      setListId('');
      setEmailReminder(false);
      setPushNotification(true);
      setNotificationTime('10min');
      setRecurrence('none');
    }
  }, [task, selectedDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const taskData = {
        title,
        description: description || null,
        due_date: dueDate,
        due_time: dueTime,
        priority,
        list_id: listId || null,
        email_reminder: emailReminder,
        push_notification: pushNotification,
        notification_time: notificationTime,
        recurrence,
      };

      if (task) {
        // For existing tasks, don't allow changing recurrence if it's already a recurring task
        const updateData = task.recurrence_id || task.is_recurring_parent 
          ? { ...taskData, recurrence: task.recurrence }
          : taskData;
        await updateTask(task.id, updateData);
      } else {
        await addTask(taskData);
      }

      onClose();
    } catch (error) {
      console.error('Error saving task:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const priorityColors = {
    low: 'bg-green-50 text-green-700 border-green-200',
    medium: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    high: 'bg-red-50 text-red-700 border-red-200',
  };

  const recurrenceColors = {
    none: 'bg-gray-50 text-gray-700 border-gray-200',
    daily: 'bg-blue-50 text-blue-700 border-blue-200',
    weekly: 'bg-purple-50 text-purple-700 border-purple-200',
    monthly: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  };

  const notificationTimeOptions = [
    { value: '3min', label: '3 minutes' },
    { value: '5min', label: '5 minutes' },
    { value: '10min', label: '10 minutes' },
    { value: '15min', label: '15 minutes' },
    { value: '20min', label: '20 minutes' },
    { value: '25min', label: '25 minutes' },
    { value: '30min', label: '30 minutes' },
    { value: '45min', label: '45 minutes' },
    { value: '50min', label: '50 minutes' },
    { value: '1hour', label: '1 hour' },
    { value: '2hours', label: '2 hours' },
    { value: '1day', label: '1 day' },
  ];

  const isRecurringTask = task?.recurrence_id || task?.is_recurring_parent;
  const isRecurringInstance = task?.recurrence_id && !task?.is_recurring_parent;

  // Responsive sizing functions
  const getModalWidth = () => {
    if (screenSize.isSmallMobile) return 'max-w-sm w-full mx-2';
    if (screenSize.isMobile) return 'max-w-md w-full mx-4';
    if (screenSize.isTablet) return 'max-w-lg w-full mx-4';
    if (screenSize.isDesktop) return 'max-w-xl w-full mx-4';
    if (screenSize.isLargeDesktop) return 'max-w-2xl w-full mx-4';
    if (screenSize.isUltraWide) return 'max-w-4xl w-full mx-4';
    return 'max-w-md w-full mx-4';
  };

  const getModalPadding = () => {
    if (screenSize.isSmallMobile) return 'p-3';
    if (screenSize.isMobile) return 'p-4';
    if (screenSize.isTablet) return 'p-4';
    if (screenSize.isDesktop) return 'p-6';
    if (screenSize.isLargeDesktop) return 'p-8';
    if (screenSize.isUltraWide) return 'p-10';
    return 'p-6';
  };

  const getTitleSize = () => {
    if (screenSize.isSmallMobile) return 'text-base';
    if (screenSize.isMobile) return 'text-lg';
    if (screenSize.isTablet) return 'text-lg';
    if (screenSize.isDesktop) return 'text-xl';
    if (screenSize.isLargeDesktop) return 'text-2xl';
    if (screenSize.isUltraWide) return 'text-3xl';
    return 'text-xl';
  };

  const getInputSize = () => {
    if (screenSize.isSmallMobile) return 'px-3 py-2 text-sm';
    if (screenSize.isMobile) return 'px-3 py-2 text-sm';
    if (screenSize.isTablet) return 'px-3 py-2 text-sm';
    if (screenSize.isDesktop) return 'px-4 py-3 text-base';
    if (screenSize.isLargeDesktop) return 'px-5 py-4 text-lg';
    if (screenSize.isUltraWide) return 'px-6 py-5 text-xl';
    return 'px-4 py-3 text-base';
  };

  const getButtonSize = () => {
    if (screenSize.isSmallMobile) return 'px-3 py-2 text-sm';
    if (screenSize.isMobile) return 'px-4 py-2.5 text-sm';
    if (screenSize.isTablet) return 'px-4 py-2.5 text-sm';
    if (screenSize.isDesktop) return 'px-4 py-3 text-base';
    if (screenSize.isLargeDesktop) return 'px-6 py-4 text-lg';
    if (screenSize.isUltraWide) return 'px-8 py-5 text-xl';
    return 'px-4 py-3 text-base';
  };

  const getIconSize = () => {
    if (screenSize.isSmallMobile) return 'h-4 w-4';
    if (screenSize.isMobile) return 'h-4 w-4';
    if (screenSize.isTablet) return 'h-4 w-4';
    if (screenSize.isDesktop) return 'h-5 w-5';
    if (screenSize.isLargeDesktop) return 'h-6 w-6';
    if (screenSize.isUltraWide) return 'h-7 w-7';
    return 'h-5 w-5';
  };

  const getSpacing = () => {
    if (screenSize.isSmallMobile) return 'space-y-3';
    if (screenSize.isMobile) return 'space-y-4';
    if (screenSize.isTablet) return 'space-y-4';
    if (screenSize.isDesktop) return 'space-y-5';
    if (screenSize.isLargeDesktop) return 'space-y-6';
    if (screenSize.isUltraWide) return 'space-y-8';
    return 'space-y-5';
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose} />
        
        <div className={`relative bg-white rounded-xl lg:rounded-2xl shadow-xl ${getModalWidth()} ${getModalPadding()} max-h-[90vh] overflow-y-auto`}>
          <div className={`flex items-center justify-between ${screenSize.isSmallMobile ? 'mb-3' : screenSize.isMobile ? 'mb-4' : 'mb-6'}`}>
            <div className="flex items-center space-x-2">
              <h3 className={`${getTitleSize()} font-semibold text-gray-900`}>
                {task ? 'Edit Task' : 'Create New Task'}
              </h3>
              {isRecurringInstance && (
                <span className={`px-2 py-1 bg-blue-100 text-blue-800 ${screenSize.isSmallMobile ? 'text-xs' : 'text-xs'} rounded-full flex items-center`}>
                  <Repeat className={`${screenSize.isSmallMobile ? 'h-3 w-3' : 'h-3 w-3'} mr-1`} />
                  Recurring
                </span>
              )}
              {isOffline && (
                <span className={`px-2 py-1 bg-orange-100 text-orange-800 ${screenSize.isSmallMobile ? 'text-xs' : 'text-xs'} rounded-full flex items-center`}>
                  <WifiOff className={`${screenSize.isSmallMobile ? 'h-3 w-3' : 'h-3 w-3'} mr-1`} />
                  Offline
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              className={`text-gray-400 hover:text-gray-600 transition-colors ${screenSize.isSmallMobile ? 'p-1' : 'p-1.5'}`}
            >
              <X className={getIconSize()} />
            </button>
          </div>

          {isRecurringInstance && (
            <div className={`${screenSize.isSmallMobile ? 'mb-3 p-2' : screenSize.isMobile ? 'mb-4 p-3' : 'mb-4 p-3'} bg-blue-50 border border-blue-200 rounded-lg`}>
              <p className={`${screenSize.isSmallMobile ? 'text-xs' : 'text-sm'} text-blue-800`}>
                <Repeat className={`${getIconSize()} inline mr-1`} />
                This is part of a recurring task series. Changes will only apply to this instance.
              </p>
            </div>
          )}

          {isOffline && (
            <div className={`${screenSize.isSmallMobile ? 'mb-3 p-2' : screenSize.isMobile ? 'mb-4 p-3' : 'mb-4 p-3'} bg-orange-50 border border-orange-200 rounded-lg`}>
              <p className={`${screenSize.isSmallMobile ? 'text-xs' : 'text-sm'} text-orange-800`}>
                <WifiOff className={`${getIconSize()} inline mr-1`} />
                You're offline. Changes will be saved locally and synced when you're back online.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className={getSpacing()}>
            <div>
              <label htmlFor="title" className={`block ${screenSize.isSmallMobile ? 'text-sm' : 'text-sm'} font-medium text-gray-700 mb-2`}>
                Task Title *
              </label>
              <input
                id="title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={`w-full ${getInputSize()} border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors`}
                placeholder="Enter task title"
              />
            </div>

            <div>
              <label htmlFor="description" className={`block ${screenSize.isSmallMobile ? 'text-sm' : 'text-sm'} font-medium text-gray-700 mb-2`}>
                Description
              </label>
              <textarea
                id="description"
                rows={screenSize.isSmallMobile ? 2 : 3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={`w-full ${getInputSize()} border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-none`}
                placeholder="Enter task description"
              />
            </div>

            <div>
              <label htmlFor="listId" className={`block ${screenSize.isSmallMobile ? 'text-sm' : 'text-sm'} font-medium text-gray-700 mb-2`}>
                <List className={`inline ${getIconSize()} mr-1`} />
                List
              </label>
              <select
                id="listId"
                value={listId}
                onChange={(e) => setListId(e.target.value)}
                className={`w-full ${getInputSize()} border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors`}
              >
                <option value="">No list</option>
                {taskLists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
              </select>
            </div>

            <div className={`grid grid-cols-1 ${screenSize.isMobile ? 'sm:grid-cols-2' : ''} gap-4`}>
              <div>
                <label htmlFor="dueDate" className={`block ${screenSize.isSmallMobile ? 'text-sm' : 'text-sm'} font-medium text-gray-700 mb-2`}>
                  <Calendar className={`inline ${getIconSize()} mr-1`} />
                  Due Date *
                </label>
                <input
                  id="dueDate"
                  type="date"
                  required
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className={`w-full ${getInputSize()} border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors`}
                />
              </div>

              <div>
                <label htmlFor="dueTime" className={`block ${screenSize.isSmallMobile ? 'text-sm' : 'text-sm'} font-medium text-gray-700 mb-2`}>
                  <Clock className={`inline ${getIconSize()} mr-1`} />
                  Due Time *
                </label>
                <input
                  id="dueTime"
                  type="time"
                  required
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                  className={`w-full ${getInputSize()} border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors`}
                />
              </div>
            </div>

            <div>
              <label className={`block ${screenSize.isSmallMobile ? 'text-sm' : 'text-sm'} font-medium text-gray-700 mb-2`}>
                <Flag className={`inline ${getIconSize()} mr-1`} />
                Priority
              </label>
              <div className={`grid ${screenSize.isSmallMobile ? 'grid-cols-1 gap-2' : 'grid-cols-3 gap-2'}`}>
                {(['low', 'medium', 'high'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`
                      ${getButtonSize()} rounded-lg border-2 font-medium capitalize transition-colors
                      ${priority === p 
                        ? priorityColors[p]
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                      }
                    `}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {!isRecurringTask && (
              <div>
                <label className={`block ${screenSize.isSmallMobile ? 'text-sm' : 'text-sm'} font-medium text-gray-700 mb-2`}>
                  <Repeat className={`inline ${getIconSize()} mr-1`} />
                  Recurrence
                </label>
                <div className={`grid ${screenSize.isSmallMobile ? 'grid-cols-2 gap-2' : screenSize.isMobile ? 'grid-cols-2 gap-2' : 'grid-cols-4 gap-2'}`}>
                  {(['none', 'daily', 'weekly', 'monthly'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRecurrence(r)}
                      className={`
                        ${getButtonSize()} rounded-lg border-2 font-medium capitalize transition-colors
                        ${recurrence === r 
                          ? recurrenceColors[r]
                          : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                        }
                      `}
                    >
                      {r === 'none' ? 'None' : r}
                    </button>
                  ))}
                </div>
                {recurrence !== 'none' && (
                  <p className={`${screenSize.isSmallMobile ? 'text-xs' : 'text-xs'} text-gray-500 mt-2`}>
                    Recurring tasks will be automatically created for up to 1 year in advance.
                  </p>
                )}
              </div>
            )}

            <div className={`${getSpacing()}`}>
              <div className={`bg-gray-50 rounded-lg ${getModalPadding()} ${getSpacing()}`}>
                <h4 className={`${screenSize.isSmallMobile ? 'text-sm' : 'text-sm'} font-medium text-gray-900 flex items-center`}>
                  <Bell className={`${getIconSize()} mr-2`} />
                  Notification Settings
                </h4>
                
                {/* Notification Timing */}
                <div>
                  <label htmlFor="notificationTime" className={`block ${screenSize.isSmallMobile ? 'text-sm' : 'text-sm'} font-medium text-gray-700 mb-2`}>
                    Notification Timing
                  </label>
                  <select
                    id="notificationTime"
                    value={notificationTime}
                    onChange={(e) => setNotificationTime(e.target.value)}
                    className={`w-full ${getInputSize()} border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors`}
                  >
                    {notificationTimeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label} before
                      </option>
                    ))}
                  </select>
                  <p className={`${screenSize.isSmallMobile ? 'text-xs' : 'text-xs'} text-gray-500 mt-1`}>
                    This timing applies to both email and push notifications
                  </p>
                </div>

                {/* Email Reminder */}
                <div>
                  <label className="flex items-start space-x-3">
                    <input
                      type="checkbox"
                      checked={emailReminder}
                      onChange={(e) => setEmailReminder(e.target.checked)}
                      className={`${screenSize.isSmallMobile ? 'h-4 w-4' : 'h-4 w-4'} text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-0.5 flex-shrink-0`}
                    />
                    <div>
                      <span className={`${screenSize.isSmallMobile ? 'text-sm' : 'text-sm'} font-medium text-gray-700`}>
                        <Mail className={`inline ${getIconSize()} mr-1`} />
                        Send email reminder
                      </span>
                      <p className={`${screenSize.isSmallMobile ? 'text-xs' : 'text-xs'} text-gray-500 mt-1`}>
                        Receive a detailed email reminder with task information
                      </p>
                    </div>
                  </label>
                </div>

                {/* Push Notification */}
                <div>
                  <label className="flex items-start space-x-3">
                    <input
                      type="checkbox"
                      checked={pushNotification}
                      onChange={(e) => setPushNotification(e.target.checked)}
                      className={`${screenSize.isSmallMobile ? 'h-4 w-4' : 'h-4 w-4'} text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-0.5 flex-shrink-0`}
                    />
                    <div>
                      <span className={`${screenSize.isSmallMobile ? 'text-sm' : 'text-sm'} font-medium text-gray-700`}>
                        <Bell className={`inline ${getIconSize()} mr-1`} />
                        Send push notification
                      </span>
                      <p className={`${screenSize.isSmallMobile ? 'text-xs' : 'text-xs'} text-gray-500 mt-1`}>
                        Instant alerts with custom ringtone and vibration on mobile devices
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            <div className={`flex flex-col ${screenSize.isMobile ? 'sm:flex-row' : ''} space-y-2 ${screenSize.isMobile ? 'sm:space-y-0 sm:space-x-3' : ''} pt-4`}>
              <button
                type="button"
                onClick={onClose}
                className={`flex-1 ${getButtonSize()} border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors`}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className={`flex-1 ${getButtonSize()} bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center`}
              >
                {loading ? (
                  <>
                    <div className={`animate-spin rounded-full ${screenSize.isSmallMobile ? 'h-3 w-3' : 'h-4 w-4'} border-b-2 border-white mr-2`}></div>
                    Saving...
                  </>
                ) : (
                  <>
                    {isOffline && <WifiOff className={`${getIconSize()} mr-2`} />}
                    {task ? 'Update Task' : 'Create Task'}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default TaskModal;