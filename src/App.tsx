import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { TaskProvider } from './contexts/TaskContext';
import Layout from './components/Layout';
import Login from './components/Login';
import Register from './components/Register';
import CalendarView from './components/CalendarView';
import TaskList from './components/TaskList';
import NotificationPrompt from './components/NotificationPrompt';
import OfflineIndicator from './components/OfflineIndicator';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="text-gray-600 text-sm">Loading TaskReminder...</p>
        </div>
      </div>
    );
  }
  
  return user ? <>{children}</> : <Navigate to="/login" />;
};

const ProtectedApp: React.FC = () => {
  return (
    <TaskProvider>
      <Routes>
        <Route path="/" element={
          <Layout>
            <CalendarView />
          </Layout>
        } />
        <Route path="/tasks" element={
          <Layout>
            <TaskList />
          </Layout>
        } />
      </Routes>
      
      {/* Show notification prompt for authenticated users */}
      <NotificationPrompt />
      
      {/* Show offline indicator */}
      <OfflineIndicator />
    </TaskProvider>
  );
};

const AppRoutes: React.FC = () => {
  const { user } = useAuth();
  
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/" /> : <Register />} />
      <Route path="/*" element={
        <ProtectedRoute>
          <ProtectedApp />
        </ProtectedRoute>
      } />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-gray-50">
          <AppRoutes />
          
          {/* Toast notifications container */}
          <ToastContainer
            position="bottom-right"
            autoClose={4000}
            hideProgressBar={false}
            newestOnTop={false}
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
            theme="light"
            className="!bottom-4 !right-4"
            toastClassName="!bg-white !text-gray-900 !shadow-lg !border !border-gray-200 !rounded-lg"
            bodyClassName="!text-sm !font-medium"
            progressClassName="!bg-blue-600"
          />
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;