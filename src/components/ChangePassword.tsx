import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

interface ChangePasswordFormData {
  email: string;
  name: string;
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface ChangePasswordProps {
  onSuccess?: () => void;
  isFirstLogin?: boolean;
}

const ChangePassword: React.FC<ChangePasswordProps> = ({ onSuccess, isFirstLogin = false }) => {
  const { user, refreshUser } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
    reset,
  } = useForm<ChangePasswordFormData>({
    defaultValues: {
      email: user?.email || '',
      name: user?.name || '',
      oldPassword: '',
      newPassword: '',
      confirmPassword: ''
    }
  });

  const newPassword = watch('newPassword');

  const onSubmit = async (data: ChangePasswordFormData) => {
    setIsSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: data.email,
          name: data.name,
          oldPassword: data.oldPassword,
          newPassword: data.newPassword,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update profile');
      }

      // Refresh user data in context
      await refreshUser();

      setSuccess(true);
      reset();
      toast.success('Profile updated successfully!');

      // Call onSuccess callback after a short delay to show success message
      setTimeout(() => {
        onSuccess?.();
      }, 1500);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update profile';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full">
          <Card className="w-full">
            <CardContent className="pt-6">
              <div className="text-center space-y-4">
                <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
                <h2 className="text-2xl font-bold text-gray-900">Profile Updated Successfully!</h2>
                <p className="text-gray-600">
                  {isFirstLogin
                    ? 'Your profile has been set up successfully. You will be redirected to the dashboard.'
                    : 'Your profile information has been updated successfully.'
                  }
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {isFirstLogin && (
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome, {user?.name}!</h1>
            <p className="text-gray-600">Please change your password to continue</p>
          </div>
        )}

        <Card className="w-full">
          <CardHeader>
            <CardTitle>
              {isFirstLogin ? 'Complete Your Profile' : 'Update Profile & Password'}
            </CardTitle>
            <CardDescription>
              {isFirstLogin
                ? 'For security reasons, please update your profile information and set a new password.'
                : 'Update your profile information and change your password if needed.'
              }
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit(onSubmit)}>
            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  {...register('email', {
                    required: 'Email is required',
                    pattern: {
                      value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                      message: 'Invalid email format'
                    }
                  })}
                  className={errors.email ? 'border-red-500' : ''}
                />
                {errors.email && (
                  <p className="text-sm text-red-500">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Enter your name"
                  {...register('name', {
                    required: 'Name is required',
                    minLength: {
                      value: 2,
                      message: 'Name must be at least 2 characters'
                    }
                  })}
                  className={errors.name ? 'border-red-500' : ''}
                />
                {errors.name && (
                  <p className="text-sm text-red-500">{errors.name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="oldPassword">Current Password</Label>
                <div className="relative">
                  <Input
                    id="oldPassword"
                    type={showOldPassword ? 'text' : 'password'}
                    placeholder="Enter your current password"
                    {...register('oldPassword', {
                      required: 'Current password is required',
                    })}
                    className={errors.oldPassword ? 'border-red-500 pr-10' : 'pr-10'}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowOldPassword(!showOldPassword)}
                  >
                    {showOldPassword ? (
                      <EyeOff className="h-4 w-4 text-gray-400" />
                    ) : (
                      <Eye className="h-4 w-4 text-gray-400" />
                    )}
                  </button>
                </div>
                {errors.oldPassword && (
                  <p className="text-sm text-red-500">{errors.oldPassword.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showNewPassword ? 'text' : 'password'}
                    placeholder="Enter your new password"
                    {...register('newPassword', {
                      required: 'New password is required',
                      minLength: {
                        value: 12,
                        message: 'Password must be at least 12 characters',
                      },
                      validate: (value) => {
                        // Enhanced password validation to match backend
                        const errors = [];
                        if (!/[a-z]/.test(value)) {
                          errors.push('one lowercase letter');
                        }
                        if (!/[A-Z]/.test(value)) {
                          errors.push('one uppercase letter');
                        }
                        if (!/\d/.test(value)) {
                          errors.push('one number');
                        }
                        if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(value)) {
                          errors.push('one special character');
                        }
                        if (errors.length > 0) {
                          return `Password must contain at least: ${errors.join(', ')}`;
                        }
                        return true;
                      },
                    })}
                    className={errors.newPassword ? 'border-red-500 pr-10' : 'pr-10'}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                  >
                    {showNewPassword ? (
                      <EyeOff className="h-4 w-4 text-gray-400" />
                    ) : (
                      <Eye className="h-4 w-4 text-gray-400" />
                    )}
                  </button>
                </div>
                {errors.newPassword && (
                  <p className="text-sm text-red-500">{errors.newPassword.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Confirm your new password"
                    {...register('confirmPassword', {
                      required: 'Please confirm your new password',
                      validate: (value) => {
                        if (value !== newPassword) {
                          return 'Passwords do not match';
                        }
                        return true;
                      },
                    })}
                    className={errors.confirmPassword ? 'border-red-500 pr-10' : 'pr-10'}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4 text-gray-400" />
                    ) : (
                      <Eye className="h-4 w-4 text-gray-400" />
                    )}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <p className="text-sm text-red-500">{errors.confirmPassword.message}</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating Profile...
                  </>
                ) : (
                  isFirstLogin ? 'Complete Setup' : 'Update Profile'
                )}
              </Button>
            </CardContent>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default ChangePassword;