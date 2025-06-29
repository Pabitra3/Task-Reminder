import React, { useState } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';
import { ChevronLeft, ChevronRight, Plus, Filter, List } from 'lucide-react';
import { useTask } from '../contexts/TaskContext';
import TaskModal from './TaskModal';

const Calendar: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [listFilter, setListFilter] = useState<string>('all');
  const { tasks, taskLists } = useTask();

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const getTasksForDate = (date: Date) => {
    return tasks.filter(task => {
      const taskDate = new Date(task.due_date);
      const sameDay = isSameDay(taskDate, date);
      
      // Apply list filter
      if (listFilter !== 'all') {
        if (listFilter === 'no-list' && task.list_id !== null) return false;
        if (listFilter !== 'no-list' && task.list_id !== listFilter) return false;
      }
      
      return sameDay;
    });
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedDate(null);
  };

  const getTaskListName = (listId: string | null) => {
    if (!listId) return 'No list';
    const list = taskLists.find(l => l.id === listId);
    return list?.name || 'Unknown list';
  };

  return (
    <div className="p-6">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
        {/* Calendar Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold text-gray-900">
              {format(currentDate, 'MMMM yyyy')}
            </h1>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentDate(subMonths(currentDate, 1))}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronLeft className="h-5 w-5 text-gray-600" />
              </button>
              <button
                onClick={() => setCurrentDate(addMonths(currentDate, 1))}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronRight className="h-5 w-5 text-gray-600" />
              </button>
            </div>
            
            {/* List Filter */}
            <div className="flex items-center space-x-2">
              <Filter className="h-4 w-4 text-gray-500" />
              <select
                value={listFilter}
                onChange={(e) => setListFilter(e.target.value)}
                className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
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
          </div>
          
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-5 w-5 mr-2" />
            New Task
          </button>
        </div>

        {/* Calendar Grid */}
        <div className="p-6">
          {/* Day Headers */}
          <div className="grid grid-cols-7 gap-px mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="p-3 text-center text-sm font-medium text-gray-500">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Days */}
          <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
            {calendarDays.map(day => {
              const dayTasks = getTasksForDate(day);
              const isToday = isSameDay(day, new Date());
              const isCurrentMonth = isSameMonth(day, currentDate);

              return (
                <div
                  key={day.toISOString()}
                  onClick={() => handleDateClick(day)}
                  className={`
                    min-h-[120px] p-3 bg-white cursor-pointer hover:bg-gray-50 transition-colors
                    ${!isCurrentMonth ? 'text-gray-400' : ''}
                  `}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`
                      text-sm font-medium
                      ${isToday ? 'bg-blue-600 text-white px-2 py-1 rounded-full' : ''}
                    `}>
                      {format(day, 'd')}
                    </span>
                  </div>
                  
                  <div className="space-y-1">
                    {dayTasks.slice(0, 2).map(task => (
                      <div
                        key={task.id}
                        className="flex items-center space-x-2 text-xs"
                        title={`${task.title} - ${getTaskListName(task.list_id)}`}
                      >
                        <div className={`w-2 h-2 rounded-full ${getPriorityColor(task.priority)}`} />
                        <span className="truncate flex-1">{task.title}</span>
                        {task.list_id && (
                          <List className="h-3 w-3 text-gray-400" />
                        )}
                      </div>
                    ))}
                    {dayTasks.length > 2 && (
                      <div className="text-xs text-gray-500">
                        +{dayTasks.length - 2} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <TaskModal 
        isOpen={isModalOpen} 
        onClose={handleModalClose}
        selectedDate={selectedDate}
      />
    </div>
  );
};

export default Calendar;