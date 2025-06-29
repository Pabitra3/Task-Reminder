import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Calendar, CheckSquare, User, LogOut, Plus, List, Trash2, Menu, X, Settings } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTask } from '../contexts/TaskContext';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth();
  const { taskLists, addTaskList, deleteTaskList } = useTask();
  const location = useLocation();
  const [showNewListInput, setShowNewListInput] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [screenSize, setScreenSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
    isMobile: window.innerWidth < 768,
    isTablet: window.innerWidth >= 768 && window.innerWidth < 1024,
    isDesktop: window.innerWidth >= 1024,
    isLargeDesktop: window.innerWidth >= 1440,
    isUltraWide: window.innerWidth >= 1920
  });

  // Monitor screen size changes
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      setScreenSize({
        width,
        height,
        isMobile: width < 768,
        isTablet: width >= 768 && width < 1024,
        isDesktop: width >= 1024,
        isLargeDesktop: width >= 1440,
        isUltraWide: width >= 1920
      });

      // Auto-close sidebar on mobile when screen becomes larger
      if (width >= 1024 && sidebarOpen) {
        setSidebarOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [sidebarOpen]);

  const navigation = [
    { name: 'Calendar', href: '/', icon: Calendar },
    { name: 'Tasks', href: '/tasks', icon: CheckSquare },
  ];

  const handleAddList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newListName.trim()) {
      try {
        await addTaskList(newListName.trim());
        setNewListName('');
        setShowNewListInput(false);
      } catch (error) {
        console.error('Error creating list:', error);
      }
    }
  };

  const handleDeleteList = async (listId: string, listName: string) => {
    if (window.confirm(`Are you sure you want to delete "${listName}" and all its tasks?`)) {
      try {
        await deleteTaskList(listId);
      } catch (error) {
        console.error('Error deleting list:', error);
      }
    }
  };

  const closeSidebar = () => setSidebarOpen(false);

  // Responsive sidebar width
  const getSidebarWidth = () => {
    if (screenSize.isUltraWide) return 'w-80'; // 320px for ultra-wide screens
    if (screenSize.isLargeDesktop) return 'w-72'; // 288px for large desktops
    if (screenSize.isDesktop) return 'w-64'; // 256px for regular desktops
    return 'w-72'; // 288px for mobile/tablet overlay
  };

  // Responsive padding for main content
  const getMainContentPadding = () => {
    if (screenSize.isMobile) return 'lg:pl-0';
    if (screenSize.isTablet) return 'lg:pl-64';
    if (screenSize.isDesktop) return 'lg:pl-64';
    if (screenSize.isLargeDesktop) return 'lg:pl-72';
    if (screenSize.isUltraWide) return 'lg:pl-80';
    return 'lg:pl-64';
  };

  // Responsive mobile menu button positioning
  const getMobileButtonPosition = () => {
    if (screenSize.width < 640) return 'top-3 left-3'; // Small mobile
    return 'top-4 left-4'; // Regular mobile and up
  };

  // Responsive mobile menu button size
  const getMobileButtonSize = () => {
    if (screenSize.width < 640) return 'p-2'; // Small mobile
    return 'p-2.5'; // Regular mobile and up
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile menu button - responsive positioning and sizing */}
      <div className={`lg:hidden fixed ${getMobileButtonPosition()} z-50`}>
        <button
          onClick={() => setSidebarOpen(true)}
          className={`${getMobileButtonSize()} bg-white rounded-xl shadow-sm border border-gray-200 text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-all duration-200`}
        >
          <Menu className={`${screenSize.width < 640 ? 'h-4 w-4' : 'h-5 w-5'}`} />
        </button>
      </div>

      {/* Mobile overlay with responsive backdrop */}
      {sidebarOpen && (
        <div 
          className="lg:hidden fixed inset-0 z-40 bg-gray-900 bg-opacity-50 backdrop-blur-sm transition-opacity duration-300"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar with responsive width */}
      <div className={`
        fixed inset-y-0 left-0 z-50 ${getSidebarWidth()} bg-white shadow-xl border-r border-gray-200 transform transition-transform duration-300 ease-in-out
        lg:translate-x-0 lg:static lg:inset-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex h-full flex-col">
          {/* Logo - responsive sizing */}
          <div className={`flex h-16 shrink-0 items-center justify-between ${screenSize.isUltraWide ? 'px-8' : 'px-6'} border-b border-gray-100`}>
            <div className="flex items-center">
              <div className={`${screenSize.isUltraWide ? 'h-10 w-10' : 'h-8 w-8'} bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center`}>
                <Calendar className={`${screenSize.isUltraWide ? 'h-6 w-6' : 'h-5 w-5'} text-white`} />
              </div>
              <span className={`ml-3 ${screenSize.isUltraWide ? 'text-2xl' : 'text-xl'} font-semibold text-gray-900`}>
                TaskReminder
              </span>
            </div>
            {/* Close button for mobile */}
            <button
              onClick={closeSidebar}
              className="lg:hidden p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navigation - responsive spacing */}
          <nav className={`flex-1 ${screenSize.isUltraWide ? 'px-6 py-8' : 'px-4 py-6'} space-y-6 overflow-y-auto`}>
            {/* Main Navigation */}
            <div className="space-y-1">
              {navigation.map((item) => {
                const current = location.pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={closeSidebar}
                    className={`
                      group flex items-center ${screenSize.isUltraWide ? 'px-4 py-3' : 'px-3 py-2.5'} ${screenSize.isUltraWide ? 'text-base' : 'text-sm'} font-medium rounded-xl transition-all duration-200
                      ${current
                        ? 'bg-blue-50 text-blue-700 shadow-sm border border-blue-100'
                        : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                      }
                    `}
                  >
                    <item.icon
                      className={`
                        ${screenSize.isUltraWide ? 'mr-4 h-6 w-6' : 'mr-3 h-5 w-5'} transition-colors
                        ${current ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-600'}
                      `}
                    />
                    {item.name}
                  </Link>
                );
              })}
            </div>

            {/* Task Lists Section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className={`${screenSize.isUltraWide ? 'text-sm' : 'text-xs'} font-semibold text-gray-500 uppercase tracking-wider`}>
                  My Lists
                </h3>
                <button
                  onClick={() => setShowNewListInput(true)}
                  className={`${screenSize.isUltraWide ? 'p-2' : 'p-1.5'} text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all duration-200`}
                  title="Add new list"
                >
                  <Plus className={`${screenSize.isUltraWide ? 'h-5 w-5' : 'h-4 w-4'}`} />
                </button>
              </div>

              {/* New List Input */}
              {showNewListInput && (
                <form onSubmit={handleAddList} className={`mb-3 ${screenSize.isUltraWide ? 'p-4' : 'p-3'} bg-gray-50 rounded-xl border border-gray-200`}>
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={newListName}
                      onChange={(e) => setNewListName(e.target.value)}
                      placeholder="List name"
                      className={`w-full ${screenSize.isUltraWide ? 'px-4 py-3 text-base' : 'px-3 py-2 text-sm'} border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors`}
                      autoFocus
                    />
                    <div className="flex space-x-2">
                      <button
                        type="submit"
                        className={`flex-1 ${screenSize.isUltraWide ? 'px-4 py-2.5 text-sm' : 'px-3 py-2 text-xs'} font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors`}
                      >
                        Add List
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowNewListInput(false);
                          setNewListName('');
                        }}
                        className={`flex-1 ${screenSize.isUltraWide ? 'px-4 py-2.5 text-sm' : 'px-3 py-2 text-xs'} font-medium text-gray-500 hover:text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors`}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {/* Task Lists */}
              <div className="space-y-1">
                {taskLists.map((list) => (
                  <div
                    key={list.id}
                    className={`group flex items-center justify-between ${screenSize.isUltraWide ? 'px-4 py-3' : 'px-3 py-2.5'} ${screenSize.isUltraWide ? 'text-base' : 'text-sm'} text-gray-700 hover:bg-gray-50 rounded-xl transition-all duration-200`}
                  >
                    <div className="flex items-center flex-1 min-w-0">
                      <List className={`${screenSize.isUltraWide ? 'h-5 w-5 mr-4' : 'h-4 w-4 mr-3'} text-gray-400 flex-shrink-0`} />
                      <span className="truncate font-medium">{list.name}</span>
                    </div>
                    <button
                      onClick={() => handleDeleteList(list.id, list.name)}
                      className={`opacity-0 group-hover:opacity-100 ${screenSize.isUltraWide ? 'p-2' : 'p-1.5'} text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200 flex-shrink-0`}
                      title="Delete list"
                    >
                      <Trash2 className={`${screenSize.isUltraWide ? 'h-4 w-4' : 'h-3.5 w-3.5'}`} />
                    </button>
                  </div>
                ))}
              </div>

              {taskLists.length === 0 && !showNewListInput && (
                <p className={`${screenSize.isUltraWide ? 'text-sm px-4 py-3' : 'text-xs px-3 py-2'} text-gray-500 text-center`}>
                  No lists yet. Click + to create one.
                </p>
              )}
            </div>
          </nav>

          {/* User section - responsive sizing */}
          <div className={`border-t border-gray-100 ${screenSize.isUltraWide ? 'p-6' : 'p-4'}`}>
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className={`${screenSize.isUltraWide ? 'h-12 w-12' : 'h-10 w-10'} rounded-full bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center`}>
                  <User className={`${screenSize.isUltraWide ? 'h-6 w-6' : 'h-5 w-5'} text-white`} />
                </div>
              </div>
              <div className={`${screenSize.isUltraWide ? 'ml-4' : 'ml-3'} flex-1 min-w-0`}>
                <p className={`${screenSize.isUltraWide ? 'text-base' : 'text-sm'} font-medium text-gray-900 truncate`}>
                  {user?.user_metadata?.name || user?.email?.split('@')[0]}
                </p>
                <p className={`${screenSize.isUltraWide ? 'text-sm' : 'text-xs'} text-gray-500 truncate`}>{user?.email}</p>
              </div>
              <div className="flex items-center space-x-1">
                {screenSize.isUltraWide && (
                  <button
                    className="flex-shrink-0 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all duration-200"
                    title="Settings"
                  >
                    <Settings className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={logout}
                  className={`flex-shrink-0 ${screenSize.isUltraWide ? 'p-2' : 'p-2'} text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all duration-200`}
                  title="Sign out"
                >
                  <LogOut className={`${screenSize.isUltraWide ? 'h-5 w-5' : 'h-4 w-4'}`} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content with responsive padding */}
      <div className={getMainContentPadding()}>
        <div className={`${screenSize.isMobile ? 'pt-14' : 'pt-16'} lg:pt-0`}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default Layout;