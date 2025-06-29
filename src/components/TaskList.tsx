import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Plus, Edit2, Trash2, Check, Clock, Flag, Filter, List, Repeat, Bell, Mail } from 'lucide-react';
import { useTask, Task } from '../contexts/TaskContext';
import TaskModal from './TaskModal';

const TaskList: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | undefined>();
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'low' | 'medium' | 'high'>('all');
  const [listFilter, setListFilter] = useState<string>('all');
  const [notificationFilter, setNotificationFilter] = useState<string>('all');
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
  
  const { tasks, taskLists, updateTask, deleteTask } = useTask();

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

  const filteredTasks = tasks.filter(task => {
    // Status filter
    if (statusFilter === 'pending' && task.completed) return false;
    if (statusFilter === 'completed' && !task.completed) return false;
    
    // Priority filter
    if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false;
    
    // List filter
    if (listFilter !== 'all') {
      if (listFilter === 'no-list' && task.list_id !== null) return false;
      if (listFilter !== 'no-list' && task.list_id !== listFilter) return false;
    }
    
    // Notification filter
    if (notificationFilter !== 'all') {
      if (notificationFilter === 'push-only' && (!task.push_notification || task.email_reminder)) return false;
      if (notificationFilter === 'email-only' && (!task.email_reminder || task.push_notification)) return false;
      if (notificationFilter === 'both' && (!task.push_notification || !task.email_reminder)) return false;
      if (notificationFilter === 'none' && (task.push_notification || task.email_reminder)) return false;
      if (notificationFilter !== 'push-only' && notificationFilter !== 'email-only' && 
          notificationFilter !== 'both' && notificationFilter !== 'none' && 
          task.notification_time !== notificationFilter) return false;
    }
    
    return true;
  });

  const handleToggleComplete = async (task: Task) => {
    await updateTask(task.id, { completed: !task.completed });
  };

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setIsModalOpen(true);
  };

  const handleDeleteTask = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    let confirmMessage = 'Are you sure you want to delete this task?';
    
    if (task?.is_recurring_parent) {
      confirmMessage = 'This will delete the entire recurring task series. Are you sure?';
    } else if (task?.recurrence_id) {
      confirmMessage = 'Are you sure you want to delete this recurring task instance?';
    }
    
    if (window.confirm(confirmMessage)) {
      await deleteTask(taskId);
    }
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditingTask(undefined);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-600 bg-red-50';
      case 'medium': return 'text-yellow-600 bg-yellow-50';
      case 'low': return 'text-green-600 bg-green-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getPriorityBorder = (priority: string) => {
    switch (priority) {
      case 'high': return 'border-l-red-500';
      case 'medium': return 'border-l-yellow-500';
      case 'low': return 'border-l-green-500';
      default: return 'border-l-gray-500';
    }
  };

  const getTaskListName = (listId: string | null) => {
    if (!listId) return 'No list';
    const list = taskLists.find(l => l.id === listId);
    return list?.name || 'Unknown list';
  };

  const getRecurrenceLabel = (task: Task) => {
    if (task.is_recurring_parent) {
      return `Recurring ${task.recurrence}`;
    } else if (task.recurrence_id) {
      return 'Recurring instance';
    }
    return null;
  };

  const getNotificationLabel = (timing: string) => {
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

  // Responsive sizing functions
  const getContainerPadding = () => {
    if (screenSize.isSmallMobile) return 'p-2';
    if (screenSize.isMobile) return 'p-3';
    if (screenSize.isTablet) return 'p-4';
    if (screenSize.isDesktop) return 'p-6';
    if (screenSize.isLargeDesktop) return 'p-8';
    if (screenSize.isUltraWide) return 'p-10';
    return 'p-6';
  };

  const getHeaderPadding = () => {
    if (screenSize.isSmallMobile) return 'p-3';
    if (screenSize.isMobile) return 'p-4';
    if (screenSize.isTablet) return 'p-4';
    if (screenSize.isDesktop) return 'p-6';
    if (screenSize.isLargeDesktop) return 'p-8';
    if (screenSize.isUltraWide) return 'p-10';
    return 'p-6';
  };

  const getContentPadding = () => {
    if (screenSize.isSmallMobile) return 'p-2';
    if (screenSize.isMobile) return 'p-3';
    if (screenSize.isTablet) return 'p-4';
    if (screenSize.isDesktop) return 'p-6';
    if (screenSize.isLargeDesktop) return 'p-8';
    if (screenSize.isUltraWide) return 'p-10';
    return 'p-6';
  };

  const getTitleSize = () => {
    if (screenSize.isSmallMobile) return 'text-lg';
    if (screenSize.isMobile) return 'text-xl';
    if (screenSize.isTablet) return 'text-xl';
    if (screenSize.isDesktop) return 'text-2xl';
    if (screenSize.isLargeDesktop) return 'text-3xl';
    if (screenSize.isUltraWide) return 'text-4xl';
    return 'text-2xl';
  };

  const getButtonSize = () => {
    if (screenSize.isSmallMobile) return 'px-2 py-1.5 text-xs';
    if (screenSize.isMobile) return 'px-3 py-2 text-sm';
    if (screenSize.isTablet) return 'px-3 py-2 text-sm';
    if (screenSize.isDesktop) return 'px-4 py-2 text-base';
    if (screenSize.isLargeDesktop) return 'px-6 py-3 text-lg';
    if (screenSize.isUltraWide) return 'px-8 py-4 text-xl';
    return 'px-4 py-2 text-base';
  };

  const getIconSize = () => {
    if (screenSize.isSmallMobile) return 'h-3 w-3';
    if (screenSize.isMobile) return 'h-4 w-4';
    if (screenSize.isTablet) return 'h-4 w-4';
    if (screenSize.isDesktop) return 'h-5 w-5';
    if (screenSize.isLargeDesktop) return 'h-6 w-6';
    if (screenSize.isUltraWide) return 'h-7 w-7';
    return 'h-5 w-5';
  };

  const getTaskPadding = () => {
    if (screenSize.isSmallMobile) return 'p-2';
    if (screenSize.isMobile) return 'p-3';
    if (screenSize.isTablet) return 'p-3';
    if (screenSize.isDesktop) return 'p-4';
    if (screenSize.isLargeDesktop) return 'p-6';
    if (screenSize.isUltraWide) return 'p-8';
    return 'p-4';
  };

  const getTaskTextSize = () => {
    if (screenSize.isSmallMobile) return 'text-sm';
    if (screenSize.isMobile) return 'text-sm';
    if (screenSize.isTablet) return 'text-sm';
    if (screenSize.isDesktop) return 'text-base';
    if (screenSize.isLargeDesktop) return 'text-lg';
    if (screenSize.isUltraWide) return 'text-xl';
    return 'text-base';
  };

  const getFilterSize = () => {
    if (screenSize.isSmallMobile) return 'text-xs px-1 py-0.5';
    if (screenSize.isMobile) return 'text-xs px-2 py-1';
    if (screenSize.isTablet) return 'text-sm px-2 py-1';
    if (screenSize.isDesktop) return 'text-sm px-2 py-1';
    if (screenSize.isLargeDesktop) return 'text-base px-3 py-2';
    if (screenSize.isUltraWide) return 'text-lg px-4 py-3';
    return 'text-sm px-2 py-1';
  };

  return (
    <div className={getContainerPadding()}>
      <div className="bg-white rounded-xl lg:rounded-2xl shadow-sm border border-gray-200">
        {/* Header */}
        <div className={`flex flex-col space-y-4 ${getHeaderPadding()} border-b border-gray-200 ${screenSize.isDesktop ? 'lg:flex-row lg:items-center lg:justify-between lg:space-y-0' : ''}`}>
          <div className={`flex flex-col space-y-4 ${screenSize.isDesktop ? 'lg:flex-row lg:items-center lg:space-y-0 lg:space-x-4' : ''}`}>
            <h1 className={`${getTitleSize()} font-bold text-gray-900`}>Tasks</h1>
            
            {/* Filters */}
            <div className={`flex flex-col space-y-2 ${screenSize.isTablet ? 'sm:flex-row sm:space-y-0 sm:space-x-2' : ''} ${screenSize.isDesktop ? 'lg:space-x-4' : ''}`}>
              <div className="flex items-center space-x-2">
                <Filter className={`${getIconSize()} text-gray-500 flex-shrink-0`} />
                
                {/* Status Filter */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className={`${getFilterSize()} border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 min-w-0`}
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="completed">Completed</option>
                </select>

                {/* Priority Filter */}
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value as any)}
                  className={`${getFilterSize()} border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 min-w-0`}
                >
                  <option value="all">All Priority</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>

                {/* List Filter */}
                <select
                  value={listFilter}
                  onChange={(e) => setListFilter(e.target.value)}
                  className={`${getFilterSize()} border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 min-w-0`}
                >
                  <option value="all">All Lists</option>
                  <option value="no-list">No List</option>
                  {taskLists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name}
                    </option>
                  ))}
                </select>

                {/* Notification Filter - only show on larger screens */}
                {!screenSize.isSmallMobile && (
                  <select
                    value={notificationFilter}
                    onChange={(e) => setNotificationFilter(e.target.value)}
                    className={`${getFilterSize()} border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 min-w-0`}
                  >
                    <option value="all">All Notifications</option>
                    <option value="push-only">Push Only</option>
                    <option value="email-only">Email Only</option>
                    <option value="both">Both</option>
                    <option value="none">No Notifications</option>
                    {!screenSize.isMobile && (
                      <optgroup label="By Timing">
                        {notificationTimeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label} before
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                )}
              </div>
            </div>
          </div>
          
          <button
            onClick={() => setIsModalOpen(true)}
            className={`flex items-center justify-center ${getButtonSize()} bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors`}
          >
            <Plus className={`${getIconSize()} ${screenSize.isMobile ? 'mr-1' : 'mr-2'}`} />
            <span className={screenSize.isSmallMobile ? 'hidden' : screenSize.isMobile ? 'inline' : 'inline'}>
              {screenSize.isSmallMobile ? 'New' : 'New Task'}
            </span>
          </button>
        </div>

        {/* Task List */}
        <div className={getContentPadding()}>
          {filteredTasks.length === 0 ? (
            <div className={`text-center ${screenSize.isSmallMobile ? 'py-6' : screenSize.isMobile ? 'py-8' : screenSize.isLargeDesktop ? 'py-16' : 'py-12'}`}>
              <div className="text-gray-400 mb-4">
                <Clock className={`${screenSize.isSmallMobile ? 'h-6 w-6' : screenSize.isMobile ? 'h-8 w-8' : screenSize.isLargeDesktop ? 'h-16 w-16' : 'h-12 w-12'} mx-auto`} />
              </div>
              <h3 className={`${screenSize.isSmallMobile ? 'text-base' : screenSize.isMobile ? 'text-base' : screenSize.isLargeDesktop ? 'text-2xl' : 'text-lg'} font-medium text-gray-900 mb-2`}>No tasks found</h3>
              <p className={`${screenSize.isSmallMobile ? 'text-sm' : screenSize.isMobile ? 'text-sm' : screenSize.isLargeDesktop ? 'text-lg' : 'text-base'} text-gray-500 px-4`}>
                {statusFilter === 'all' && priorityFilter === 'all' && listFilter === 'all' && notificationFilter === 'all'
                  ? "You don't have any tasks yet. Create your first task to get started!"
                  : "No tasks match your current filters."
                }
              </p>
            </div>
          ) : (
            <div className={`space-y-3 ${screenSize.isLargeDesktop ? 'lg:space-y-6' : 'lg:space-y-4'}`}>
              {filteredTasks.map(task => {
                const recurrenceLabel = getRecurrenceLabel(task);
                
                return (
                  <div
                    key={task.id}
                    className={`
                      bg-white border-l-4 rounded-lg ${getTaskPadding()} shadow-sm hover:shadow-md transition-shadow
                      ${getPriorityBorder(task.priority)}
                      ${task.completed ? 'opacity-60' : ''}
                    `}
                  >
                    <div className="flex items-start justify-between">
                      <div className={`flex items-start ${screenSize.isSmallMobile ? 'space-x-2' : 'space-x-3'} flex-1 min-w-0`}>
                        <button
                          onClick={() => handleToggleComplete(task)}
                          className={`
                            mt-1 ${screenSize.isSmallMobile ? 'p-0.5' : 'p-1'} rounded-full transition-colors flex-shrink-0
                            ${task.completed
                              ? 'bg-green-100 text-green-600'
                              : 'bg-gray-100 text-gray-400 hover:bg-green-100 hover:text-green-600'
                            }
                          `}
                        >
                          <Check className={`${screenSize.isSmallMobile ? 'h-3 w-3' : screenSize.isMobile ? 'h-3 w-3' : screenSize.isLargeDesktop ? 'h-5 w-5' : 'h-4 w-4'}`} />
                        </button>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            <h3 className={`
                              ${getTaskTextSize()} font-medium truncate
                              ${task.completed ? 'line-through text-gray-500' : 'text-gray-900'}
                            `}>
                              {task.title}
                            </h3>
                            {recurrenceLabel && (
                              <span className={`px-2 py-1 bg-blue-100 text-blue-800 ${screenSize.isSmallMobile ? 'text-xs' : 'text-xs'} rounded-full flex items-center flex-shrink-0`}>
                                <Repeat className={`${screenSize.isSmallMobile ? 'h-2 w-2' : screenSize.isMobile ? 'h-2 w-2' : 'h-3 w-3'} mr-1`} />
                                {task.is_recurring_parent ? task.recurrence : 'Instance'}
                              </span>
                            )}
                          </div>
                          {task.description && (
                            <p className={`${screenSize.isSmallMobile ? 'text-xs' : screenSize.isMobile ? 'text-xs' : screenSize.isLargeDesktop ? 'text-base' : 'text-sm'} text-gray-600 mt-1 line-clamp-2`}>{task.description}</p>
                          )}
                          
                          <div className={`flex flex-wrap items-center ${screenSize.isSmallMobile ? 'gap-1' : 'gap-2'} ${screenSize.isDesktop ? 'lg:gap-4' : ''} mt-2`}>
                            <div className={`flex items-center ${screenSize.isSmallMobile ? 'text-xs' : screenSize.isMobile ? 'text-xs' : screenSize.isLargeDesktop ? 'text-base' : 'text-sm'} text-gray-500`}>
                              <Clock className={`${screenSize.isSmallMobile ? 'h-3 w-3' : screenSize.isMobile ? 'h-3 w-3' : screenSize.isLargeDesktop ? 'h-5 w-5' : 'h-4 w-4'} mr-1 flex-shrink-0`} />
                              <span className="truncate">
                                {format(new Date(task.due_date), 'MMM d, yyyy')} at {task.due_time}
                              </span>
                            </div>
                            
                            <span className={`
                              px-2 py-1 rounded-full ${screenSize.isSmallMobile ? 'text-xs' : 'text-xs'} font-medium capitalize flex items-center
                              ${getPriorityColor(task.priority)}
                            `}>
                              <Flag className={`${screenSize.isSmallMobile ? 'h-2 w-2' : screenSize.isMobile ? 'h-2 w-2' : 'h-3 w-3'} inline mr-1 flex-shrink-0`} />
                              {task.priority}
                            </span>

                            {task.list_id && (
                              <span className={`px-2 py-1 rounded-full ${screenSize.isSmallMobile ? 'text-xs' : 'text-xs'} font-medium bg-blue-50 text-blue-700 flex items-center`}>
                                <List className={`${screenSize.isSmallMobile ? 'h-2 w-2' : screenSize.isMobile ? 'h-2 w-2' : 'h-3 w-3'} inline mr-1 flex-shrink-0`} />
                                <span className={`truncate ${screenSize.isSmallMobile ? 'max-w-16' : screenSize.isMobile ? 'max-w-20' : 'max-w-none'}`}>
                                  {getTaskListName(task.list_id)}
                                </span>
                              </span>
                            )}

                            {/* Notification indicators - only show on larger screens */}
                            {!screenSize.isSmallMobile && (
                              <div className="flex items-center space-x-1">
                                {task.push_notification && (
                                  <span className={`px-2 py-1 rounded-full ${screenSize.isMobile ? 'text-xs' : 'text-xs'} font-medium bg-green-50 text-green-700 flex items-center`}>
                                    <Bell className={`${screenSize.isMobile ? 'h-2 w-2' : 'h-3 w-3'} inline mr-1 flex-shrink-0`} />
                                    Push
                                  </span>
                                )}
                                {task.email_reminder && (
                                  <span className={`px-2 py-1 rounded-full ${screenSize.isMobile ? 'text-xs' : 'text-xs'} font-medium bg-purple-50 text-purple-700 flex items-center`}>
                                    <Mail className={`${screenSize.isMobile ? 'h-2 w-2' : 'h-3 w-3'} inline mr-1 flex-shrink-0`} />
                                    Email
                                  </span>
                                )}
                                {(task.push_notification || task.email_reminder) && (
                                  <span className={`${screenSize.isMobile ? 'text-xs' : 'text-xs'} text-gray-500`}>
                                    ({getNotificationLabel(task.notification_time || '10min')} before)
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className={`flex items-center ${screenSize.isSmallMobile ? 'space-x-0.5' : 'space-x-1'} ${screenSize.isDesktop ? 'lg:space-x-2' : ''} flex-shrink-0 ml-2`}>
                        <button
                          onClick={() => handleEditTask(task)}
                          className={`${screenSize.isSmallMobile ? 'p-1' : 'p-1.5'} ${screenSize.isDesktop ? 'lg:p-2' : ''} text-gray-400 hover:text-blue-600 transition-colors`}
                        >
                          <Edit2 className={`${screenSize.isSmallMobile ? 'h-3 w-3' : screenSize.isMobile ? 'h-3 w-3' : screenSize.isLargeDesktop ? 'h-5 w-5' : 'h-4 w-4'}`} />
                        </button>
                        <button
                          onClick={() => handleDeleteTask(task.id)}
                          className={`${screenSize.isSmallMobile ? 'p-1' : 'p-1.5'} ${screenSize.isDesktop ? 'lg:p-2' : ''} text-gray-400 hover:text-red-600 transition-colors`}
                        >
                          <Trash2 className={`${screenSize.isSmallMobile ? 'h-3 w-3' : screenSize.isMobile ? 'h-3 w-3' : screenSize.isLargeDesktop ? 'h-5 w-5' : 'h-4 w-4'}`} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <TaskModal 
        isOpen={isModalOpen} 
        onClose={handleModalClose}
        task={editingTask}
      />
    </div>
  );
};

export default TaskList;