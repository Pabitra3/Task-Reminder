import React, { useEffect, useState, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { Plus, Repeat, Clock, Flag, List as ListIcon, Bell, Mail, Filter } from 'lucide-react';
import { useTask, Task } from '../contexts/TaskContext';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import TaskModal from './TaskModal';

const CalendarView: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | undefined>();
  const [hoveredEvent, setHoveredEvent] = useState<any>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [listFilter, setListFilter] = useState<string>('all');
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
  
  const { tasks, refreshTasks, taskLists, isOffline } = useTask();
  const { user } = useAuth();
  const calendarRef = useRef<FullCalendar>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

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

  // Set up real-time subscription when online
  useEffect(() => {
    if (!user || isOffline) return;

    const channel = supabase
      .channel('calendar-tasks-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('Real-time calendar update:', payload);
          refreshTasks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, refreshTasks, isOffline]);

  // Refresh calendar when coming back online
  useEffect(() => {
    if (!isOffline && user) {
      refreshTasks();
    }
  }, [isOffline, user, refreshTasks]);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return '#ef4444'; // red-500
      case 'medium': return '#eab308'; // yellow-500
      case 'low': return '#22c55e'; // green-500
      default: return '#6b7280'; // gray-500
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'high': return 'High Priority';
      case 'medium': return 'Medium Priority';
      case 'low': return 'Low Priority';
      default: return 'Normal Priority';
    }
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

  const getTaskListName = (listId: string | null) => {
    if (!listId) return null;
    const list = taskLists.find(l => l.id === listId);
    return list?.name || 'Unknown List';
  };

  // Filter tasks based on selected list
  const filteredTasks = tasks.filter(task => {
    if (listFilter === 'all') return true;
    if (listFilter === 'no-list') return task.list_id === null;
    return task.list_id === listFilter;
  });

  const calendarEvents = filteredTasks.map(task => {
    const isRecurring = task.recurrence_id || task.is_recurring_parent;
    const listName = getTaskListName(task.list_id);
    
    return {
      id: task.id,
      title: task.title,
      date: task.due_date,
      backgroundColor: getPriorityColor(task.priority),
      borderColor: getPriorityColor(task.priority),
      textColor: '#ffffff',
      extendedProps: {
        task: task,
        priority: task.priority,
        priorityLabel: getPriorityLabel(task.priority),
        time: task.due_time,
        completed: task.completed,
        isRecurring: isRecurring,
        recurrenceType: task.recurrence,
        description: task.description,
        notificationTime: task.notification_time,
        notificationLabel: getNotificationLabel(task.notification_time || '10min'),
        emailReminder: task.email_reminder,
        pushNotification: task.push_notification,
        listName: listName,
        isOfflineCreated: (task as any).offline_created || false
      },
      classNames: [
        task.completed ? 'opacity-60' : '',
        isRecurring ? 'recurring-task' : '',
        (task as any).offline_created ? 'offline-task' : ''
      ].filter(Boolean),
    };
  });

  const handleDateClick = (info: any) => {
    setSelectedDate(new Date(info.dateStr));
    setSelectedTask(undefined);
    setIsModalOpen(true);
  };

  const handleEventClick = (info: any) => {
    const task = info.event.extendedProps.task;
    setSelectedTask(task);
    setSelectedDate(null);
    setIsModalOpen(true);
  };

  const handleEventMouseEnter = (info: any) => {
    if (screenSize.isMobile) return; // Disable tooltips on mobile
    
    const rect = info.el.getBoundingClientRect();
    setTooltipPosition({
      x: rect.left + rect.width / 2,
      y: rect.top - 10
    });
    setHoveredEvent(info.event);
  };

  const handleEventMouseLeave = () => {
    setHoveredEvent(null);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedDate(null);
    setSelectedTask(undefined);
  };

  // Responsive calendar configuration
  const getCalendarHeight = () => {
    if (screenSize.isSmallMobile) return 'auto';
    if (screenSize.isMobile) return 'auto';
    if (screenSize.isTablet) return '600px';
    if (screenSize.isDesktop) return '700px';
    if (screenSize.isLargeDesktop) return '800px';
    if (screenSize.isUltraWide) return '900px';
    return '700px';
  };

  const getAspectRatio = () => {
    if (screenSize.isSmallMobile) return 0.6;
    if (screenSize.isMobile) return 0.8;
    if (screenSize.isTablet) return 1.0;
    if (screenSize.isDesktop) return 1.35;
    if (screenSize.isLargeDesktop) return 1.5;
    if (screenSize.isUltraWide) return 1.8;
    return 1.35;
  };

  const getDayMaxEvents = () => {
    if (screenSize.isSmallMobile) return 1;
    if (screenSize.isMobile) return 2;
    if (screenSize.isTablet) return 3;
    if (screenSize.isDesktop) return 4;
    if (screenSize.isLargeDesktop) return 5;
    if (screenSize.isUltraWide) return 6;
    return 3;
  };

  // Responsive padding
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

  const getCalendarPadding = () => {
    if (screenSize.isSmallMobile) return 'p-2';
    if (screenSize.isMobile) return 'p-3';
    if (screenSize.isTablet) return 'p-4';
    if (screenSize.isDesktop) return 'p-6';
    if (screenSize.isLargeDesktop) return 'p-8';
    if (screenSize.isUltraWide) return 'p-10';
    return 'p-6';
  };

  // Responsive text sizes
  const getTitleSize = () => {
    if (screenSize.isSmallMobile) return 'text-lg';
    if (screenSize.isMobile) return 'text-xl';
    if (screenSize.isTablet) return 'text-xl';
    if (screenSize.isDesktop) return 'text-2xl';
    if (screenSize.isLargeDesktop) return 'text-3xl';
    if (screenSize.isUltraWide) return 'text-4xl';
    return 'text-2xl';
  };

  const getLegendTextSize = () => {
    if (screenSize.isSmallMobile) return 'text-xs';
    if (screenSize.isMobile) return 'text-xs';
    if (screenSize.isTablet) return 'text-sm';
    if (screenSize.isDesktop) return 'text-sm';
    if (screenSize.isLargeDesktop) return 'text-base';
    if (screenSize.isUltraWide) return 'text-lg';
    return 'text-sm';
  };

  // Responsive button sizes
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

  return (
    <div className={getContainerPadding()}>
      <div className="bg-white rounded-xl lg:rounded-2xl shadow-sm border border-gray-200">
        {/* Header */}
        <div className={`flex flex-col space-y-4 ${getHeaderPadding()} border-b border-gray-200 ${screenSize.isDesktop ? 'lg:flex-row lg:items-center lg:justify-between lg:space-y-0' : ''}`}>
          <div className={`flex flex-col space-y-4 ${screenSize.isDesktop ? 'lg:flex-row lg:items-center lg:space-y-0 lg:space-x-6' : ''}`}>
            <h1 className={`${getTitleSize()} font-bold text-gray-900 flex items-center`}>
              Calendar
              {isOffline && (
                <span className={`ml-2 px-2 py-1 bg-orange-100 text-orange-800 ${screenSize.isSmallMobile ? 'text-xs' : 'text-xs'} rounded-full`}>
                  Offline
                </span>
              )}
            </h1>
            
            {/* List Filter */}
            <div className="flex items-center space-x-2">
              <Filter className={`${getIconSize()} text-gray-500`} />
              <select
                value={listFilter}
                onChange={(e) => setListFilter(e.target.value)}
                className={`${screenSize.isSmallMobile ? 'text-xs' : 'text-sm'} border border-gray-300 rounded-md px-2 py-1 focus:ring-1 focus:ring-blue-500 focus:border-blue-500`}
              >
                <option value="all">All Lists</option>
                <option value="no-list">No List</option>
                {taskLists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Legend - responsive layout */}
            <div className={`flex flex-wrap items-center gap-2 ${screenSize.isDesktop ? 'lg:gap-4' : ''} ${getLegendTextSize()}`}>
              <div className="flex items-center space-x-2">
                <div className={`${screenSize.isSmallMobile ? 'w-2 h-2' : 'w-3 h-3'} rounded-full bg-red-500`}></div>
                <span className="text-gray-600">High Priority</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className={`${screenSize.isSmallMobile ? 'w-2 h-2' : 'w-3 h-3'} rounded-full bg-yellow-500`}></div>
                <span className="text-gray-600">Medium Priority</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className={`${screenSize.isSmallMobile ? 'w-2 h-2' : 'w-3 h-3'} rounded-full bg-green-500`}></div>
                <span className="text-gray-600">Low Priority</span>
              </div>
              <div className="flex items-center space-x-2">
                <Repeat className={`${screenSize.isSmallMobile ? 'w-2 h-2' : 'w-3 h-3'} text-blue-600`} />
                <span className="text-gray-600">Recurring</span>
              </div>
            </div>
          </div>
          
          <button
            onClick={() => setIsModalOpen(true)}
            className={`flex items-center justify-center ${getButtonSize()} bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm`}
          >
            <Plus className={`${getIconSize()} ${screenSize.isMobile ? 'mr-1' : 'mr-2'}`} />
            <span className={screenSize.isSmallMobile ? 'hidden' : screenSize.isMobile ? 'inline' : 'inline'}>
              {screenSize.isSmallMobile ? 'New' : 'New Task'}
            </span>
          </button>
        </div>

        {/* Calendar */}
        <div className={getCalendarPadding()}>
          <div className="fullcalendar-container">
            <FullCalendar
              ref={calendarRef}
              plugins={[dayGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              events={calendarEvents}
              dateClick={handleDateClick}
              eventClick={handleEventClick}
              eventMouseEnter={handleEventMouseEnter}
              eventMouseLeave={handleEventMouseLeave}
              height={getCalendarHeight()}
              headerToolbar={{
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth',
              }}
              dayMaxEvents={getDayMaxEvents()}
              moreLinkClick="popover"
              eventDisplay="block"
              displayEventTime={false}
              aspectRatio={getAspectRatio()}
              eventContent={(eventInfo) => {
                const task = eventInfo.event.extendedProps.task;
                const isRecurring = eventInfo.event.extendedProps.isRecurring;
                const isOfflineCreated = eventInfo.event.extendedProps.isOfflineCreated;
                
                return (
                  <div className={`p-1 ${screenSize.isSmallMobile ? 'text-xs' : 'text-xs'} font-medium truncate`}>
                    <div className="flex items-center space-x-1">
                      {isRecurring && (
                        <Repeat className={`${screenSize.isSmallMobile ? 'h-2 w-2' : 'h-2 w-2 lg:h-3 lg:w-3'} flex-shrink-0 opacity-75`} />
                      )}
                      {isOfflineCreated && (
                        <div className={`${screenSize.isSmallMobile ? 'h-2 w-2' : 'h-2 w-2 lg:h-3 lg:w-3'} rounded-full bg-orange-400 flex-shrink-0`} title="Created offline" />
                      )}
                      <span className="truncate">{eventInfo.event.title}</span>
                      {task.completed && (
                        <span className={`${screenSize.isSmallMobile ? 'text-xs' : 'text-xs'} opacity-75`}>✓</span>
                      )}
                    </div>
                    <div className={`${screenSize.isSmallMobile ? 'text-xs' : 'text-xs'} opacity-75 flex items-center space-x-1`}>
                      <Clock className={`${screenSize.isSmallMobile ? 'h-2 w-2' : 'h-2 w-2 lg:h-3 lg:w-3'}`} />
                      <span>{eventInfo.event.extendedProps.time}</span>
                    </div>
                  </div>
                );
              }}
              // Mobile-specific options
              dayHeaderFormat={screenSize.isMobile ? { weekday: 'narrow' } : { weekday: 'short' }}
              eventTimeFormat={{
                hour: 'numeric',
                minute: '2-digit',
                meridiem: 'short'
              }}
            />
          </div>
        </div>
      </div>

      {/* Enhanced Tooltip - only show on desktop */}
      {hoveredEvent && !screenSize.isMobile && (
        <div
          ref={tooltipRef}
          className={`fixed z-50 bg-gray-900 text-white ${screenSize.isLargeDesktop ? 'p-4' : 'p-3'} rounded-lg shadow-lg ${screenSize.isLargeDesktop ? 'max-w-md' : 'max-w-xs'} pointer-events-none transform -translate-x-1/2 -translate-y-full`}
          style={{
            left: tooltipPosition.x,
            top: tooltipPosition.y,
          }}
        >
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <h3 className={`font-semibold ${screenSize.isLargeDesktop ? 'text-base' : 'text-sm'}`}>{hoveredEvent.title}</h3>
              {hoveredEvent.extendedProps.completed && (
                <span className={`text-green-400 ${screenSize.isLargeDesktop ? 'text-sm' : 'text-xs'}`}>✓ Completed</span>
              )}
            </div>
            
            {hoveredEvent.extendedProps.description && (
              <p className={`${screenSize.isLargeDesktop ? 'text-sm' : 'text-xs'} text-gray-300 line-clamp-2`}>
                {hoveredEvent.extendedProps.description}
              </p>
            )}
            
            <div className={`space-y-1 ${screenSize.isLargeDesktop ? 'text-sm' : 'text-xs'}`}>
              <div className="flex items-center space-x-2">
                <Clock className={`${screenSize.isLargeDesktop ? 'h-4 w-4' : 'h-3 w-3'}`} />
                <span>Due: {hoveredEvent.extendedProps.time}</span>
              </div>
              
              <div className="flex items-center space-x-2">
                <Flag className={`${screenSize.isLargeDesktop ? 'h-4 w-4' : 'h-3 w-3'}`} />
                <span>{hoveredEvent.extendedProps.priorityLabel}</span>
              </div>
              
              {hoveredEvent.extendedProps.listName && (
                <div className="flex items-center space-x-2">
                  <ListIcon className={`${screenSize.isLargeDesktop ? 'h-4 w-4' : 'h-3 w-3'}`} />
                  <span>{hoveredEvent.extendedProps.listName}</span>
                </div>
              )}
              
              {hoveredEvent.extendedProps.isRecurring && (
                <div className="flex items-center space-x-2">
                  <Repeat className={`${screenSize.isLargeDesktop ? 'h-4 w-4' : 'h-3 w-3'}`} />
                  <span>
                    {hoveredEvent.extendedProps.task.is_recurring_parent 
                      ? `Recurring ${hoveredEvent.extendedProps.recurrenceType}`
                      : 'Recurring instance'
                    }
                  </span>
                </div>
              )}
              
              <div className="border-t border-gray-700 pt-1 mt-2">
                <div className={`${screenSize.isLargeDesktop ? 'text-sm' : 'text-xs'} text-gray-400`}>Notifications:</div>
                <div className="flex items-center space-x-1 mt-1">
                  {hoveredEvent.extendedProps.pushNotification && (
                    <div className="flex items-center space-x-1">
                      <Bell className={`${screenSize.isLargeDesktop ? 'h-4 w-4' : 'h-3 w-3'} text-blue-400`} />
                      <span className={`${screenSize.isLargeDesktop ? 'text-sm' : 'text-xs'}`}>Push</span>
                    </div>
                  )}
                  {hoveredEvent.extendedProps.emailReminder && (
                    <div className="flex items-center space-x-1">
                      <Mail className={`${screenSize.isLargeDesktop ? 'h-4 w-4' : 'h-3 w-3'} text-green-400`} />
                      <span className={`${screenSize.isLargeDesktop ? 'text-sm' : 'text-xs'}`}>Email</span>
                    </div>
                  )}
                  <span className={`${screenSize.isLargeDesktop ? 'text-sm' : 'text-xs'} text-gray-400`}>
                    ({hoveredEvent.extendedProps.notificationLabel} before)
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Tooltip arrow */}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
        </div>
      )}

      <TaskModal 
        isOpen={isModalOpen} 
        onClose={handleModalClose}
        task={selectedTask}
        selectedDate={selectedDate}
      />

      {/* Responsive FullCalendar styles */}
      <style jsx global>{`
        .fullcalendar-container .fc {
          font-family: inherit;
        }
        
        .fullcalendar-container .fc-theme-standard td,
        .fullcalendar-container .fc-theme-standard th {
          border-color: #e5e7eb;
        }
        
        .fullcalendar-container .fc-button-primary {
          background-color: #2563eb;
          border-color: #2563eb;
          color: white;
          font-weight: 500;
          border-radius: 0.5rem;
          transition: all 0.2s;
          font-size: ${screenSize.isSmallMobile ? '0.75rem' : screenSize.isMobile ? '0.875rem' : screenSize.isLargeDesktop ? '1.125rem' : '1rem'};
          padding: ${screenSize.isSmallMobile ? '0.25rem 0.5rem' : screenSize.isMobile ? '0.375rem 0.75rem' : screenSize.isLargeDesktop ? '0.75rem 1.25rem' : '0.5rem 1rem'};
        }
        
        .fullcalendar-container .fc-button-primary:hover {
          background-color: #1d4ed8;
          border-color: #1d4ed8;
        }
        
        .fullcalendar-container .fc-button-primary:disabled {
          background-color: #9ca3af;
          border-color: #9ca3af;
        }
        
        .fullcalendar-container .fc-toolbar-title {
          font-weight: 700;
          color: #111827;
          font-size: ${screenSize.isSmallMobile ? '1rem' : screenSize.isMobile ? '1.125rem' : screenSize.isLargeDesktop ? '1.875rem' : '1.5rem'};
        }
        
        .fullcalendar-container .fc-col-header-cell {
          background-color: #f9fafb;
          font-weight: 600;
          color: #374151;
          padding: ${screenSize.isSmallMobile ? '0.375rem 0.125rem' : screenSize.isMobile ? '0.5rem 0.25rem' : screenSize.isLargeDesktop ? '1rem 0.75rem' : '0.75rem 0.5rem'};
          font-size: ${screenSize.isSmallMobile ? '0.75rem' : screenSize.isMobile ? '0.875rem' : screenSize.isLargeDesktop ? '1.125rem' : '1rem'};
        }
        
        .fullcalendar-container .fc-daygrid-day {
          cursor: pointer;
          transition: background-color 0.2s;
          min-height: ${screenSize.isSmallMobile ? '60px' : screenSize.isMobile ? '80px' : screenSize.isLargeDesktop ? '140px' : '120px'};
        }
        
        .fullcalendar-container .fc-daygrid-day:hover {
          background-color: #f3f4f6;
        }
        
        .fullcalendar-container .fc-daygrid-day-number {
          color: #374151;
          font-weight: 500;
          padding: ${screenSize.isSmallMobile ? '0.125rem' : screenSize.isMobile ? '0.25rem' : screenSize.isLargeDesktop ? '0.75rem' : '0.5rem'};
          font-size: ${screenSize.isSmallMobile ? '0.75rem' : screenSize.isMobile ? '0.875rem' : screenSize.isLargeDesktop ? '1.125rem' : '1rem'};
        }
        
        .fullcalendar-container .fc-day-today {
          background-color: #dbeafe !important;
        }
        
        .fullcalendar-container .fc-day-today .fc-daygrid-day-number {
          background-color: #2563eb;
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          width: ${screenSize.isSmallMobile ? '1.25rem' : screenSize.isMobile ? '1.5rem' : screenSize.isLargeDesktop ? '2.5rem' : '2rem'};
          height: ${screenSize.isSmallMobile ? '1.25rem' : screenSize.isMobile ? '1.5rem' : screenSize.isLargeDesktop ? '2.5rem' : '2rem'};
          margin: ${screenSize.isSmallMobile ? '0.125rem' : screenSize.isMobile ? '0.125rem' : screenSize.isLargeDesktop ? '0.5rem' : '0.25rem'};
        }
        
        .fullcalendar-container .fc-event {
          border-radius: ${screenSize.isSmallMobile ? '0.125rem' : screenSize.isMobile ? '0.25rem' : '0.375rem'};
          border: none;
          margin: ${screenSize.isSmallMobile ? '0.5px' : screenSize.isMobile ? '1px' : '1px 2px'};
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
          font-size: ${screenSize.isSmallMobile ? '0.625rem' : screenSize.isMobile ? '0.75rem' : screenSize.isLargeDesktop ? '1rem' : '0.875rem'};
        }
        
        .fullcalendar-container .fc-event:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          z-index: 10;
        }
        
        .fullcalendar-container .fc-event.opacity-60 {
          opacity: 0.6;
        }
        
        .fullcalendar-container .fc-event.recurring-task {
          border-left: ${screenSize.isSmallMobile ? '2px' : '3px'} solid rgba(37, 99, 235, 0.8);
        }
        
        .fullcalendar-container .fc-event.offline-task {
          border-right: ${screenSize.isSmallMobile ? '2px' : '3px'} solid #f97316;
        }
        
        .fullcalendar-container .fc-more-link {
          color: #2563eb;
          font-weight: 500;
          text-decoration: none;
          padding: ${screenSize.isSmallMobile ? '0.125rem 0.25rem' : screenSize.isMobile ? '0.125rem 0.25rem' : '0.25rem 0.5rem'};
          border-radius: 0.25rem;
          transition: background-color 0.2s;
          font-size: ${screenSize.isSmallMobile ? '0.625rem' : screenSize.isMobile ? '0.75rem' : '0.875rem'};
        }
        
        .fullcalendar-container .fc-more-link:hover {
          background-color: #dbeafe;
        }
        
        .fullcalendar-container .fc-popover {
          border-radius: 0.5rem;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
          border: 1px solid #e5e7eb;
          z-index: 1000;
        }
        
        .fullcalendar-container .fc-popover-header {
          background-color: #f9fafb;
          border-bottom: 1px solid #e5e7eb;
          padding: ${screenSize.isSmallMobile ? '0.375rem 0.5rem' : screenSize.isMobile ? '0.5rem 0.75rem' : '0.75rem 1rem'};
          font-weight: 600;
          font-size: ${screenSize.isSmallMobile ? '0.75rem' : screenSize.isMobile ? '0.875rem' : '1rem'};
        }
        
        .fullcalendar-container .fc-popover-body {
          padding: ${screenSize.isSmallMobile ? '0.25rem' : screenSize.isMobile ? '0.375rem' : '0.5rem'};
          max-height: 300px;
          overflow-y: auto;
        }
        
        .fullcalendar-container .fc-daygrid-day-events {
          margin-top: ${screenSize.isSmallMobile ? '0.125rem' : screenSize.isMobile ? '0.125rem' : '0.25rem'};
        }
        
        .fullcalendar-container .fc-h-event {
          border-radius: ${screenSize.isSmallMobile ? '0.125rem' : screenSize.isMobile ? '0.25rem' : '0.375rem'};
        }
        
        /* Mobile touch improvements */
        @media (max-width: 639px) {
          .fullcalendar-container .fc-event {
            min-height: ${screenSize.isSmallMobile ? '20px' : '24px'};
            padding: ${screenSize.isSmallMobile ? '1px 2px' : '2px 4px'};
          }
          
          .fullcalendar-container .fc-toolbar {
            flex-direction: column;
            gap: 0.5rem;
          }
          
          .fullcalendar-container .fc-toolbar-chunk {
            display: flex;
            justify-content: center;
          }
        }
        
        /* Line clamp utility for tooltip */
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
};

export default CalendarView;