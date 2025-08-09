import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import ChangePassword from '@/components/ChangePassword';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, token, isLoading, requiresPasswordChange, setRequiresPasswordChange } = useAuth();

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!user || !token) {
    return <Navigate to="/login" replace />;
  }

  console.log('user', user);
  console.log('token', token);
  console.log('requiresPasswordChange', requiresPasswordChange);


  // Show password change form if required
  if (requiresPasswordChange) {
    return (
      <ChangePassword
        isFirstLogin={true}
        onSuccess={() => {
          setRequiresPasswordChange(false);
        }}
      />
    );
  }

  // Render protected content
  return <>{children}</>;
};

export default ProtectedRoute;