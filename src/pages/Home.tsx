import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Shield, Server, Lock } from 'lucide-react';
import { useEffect } from 'react';

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Shield className="h-16 w-16 text-blue-600" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Nginx Proxy Manager
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Manage your reverse proxy configurations and SSL certificates with ease
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                Proxy Management
              </CardTitle>
              <CardDescription>
                Configure and manage your reverse proxy hosts
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                SSL Certificates
              </CardTitle>
              <CardDescription>
                Automatic SSL certificate management with Let's Encrypt
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Security
              </CardTitle>
              <CardDescription>
                Secure authentication and access control
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        <div className="text-center">
          <div className="space-x-4">
            <Button 
              onClick={() => navigate('/login')}
              size="lg"
              className="bg-blue-600 hover:bg-blue-700"
            >
              Get Started
            </Button>
            <Button 
              onClick={() => navigate('/login')}
              variant="outline"
              size="lg"
            >
              Sign In
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}