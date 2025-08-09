import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import Navigation from '@/components/Navigation';
import { Shield, RefreshCw, Calendar, AlertCircle, CheckCircle, Clock } from 'lucide-react';

interface SSLCertificate {
  id: number;
  proxy_id: number;
  domain: string;
  status: 'active' | 'expired' | 'pending' | 'failed';
  expires_at: string;
  created_at: string;
  updated_at: string;
  proxy?: {
    domain: string;
    target_url: string;
  };
}

const SSLCertificates: React.FC = () => {
  const { toast } = useToast();
  const [certificates, setCertificates] = useState<SSLCertificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [renewingId, setRenewingId] = useState<number | null>(null);
  const [renewDialogOpen, setRenewDialogOpen] = useState(false);
  const [certificateToRenew, setCertificateToRenew] = useState<number | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      navigate('/login');
      return;
    }
    fetchCertificates();
  }, [navigate]);

  const fetchCertificates = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/ssl/certificates', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch SSL certificates');
      }

      const data = await response.json();
      // Ensure data is always an array to prevent .map() errors
      const certificatesArray = Array.isArray(data) ? data : [];
      setCertificates(certificatesArray);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err instanceof Error ? err.message : 'Failed to fetch SSL certificates'
      });
      // Set empty array on error to prevent .map() errors
      setCertificates([]);
    } finally {
      setLoading(false);
    }
  };

  // Handle renew confirmation
  const handleRenewClick = (certificateId: number) => {
    setCertificateToRenew(certificateId);
    setRenewDialogOpen(true);
  };

  const handleRenewCertificate = async () => {
    if (!certificateToRenew) return;

    try {
      setRenewingId(certificateToRenew);
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/ssl/certificates/${certificateToRenew}/renew`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to renew certificate');
      }

      toast({
        title: "Success",
        description: "Certificate renewal initiated successfully"
      });

      await fetchCertificates();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err instanceof Error ? err.message : 'Failed to renew certificate'
      });
    } finally {
      setRenewingId(null);
      setRenewDialogOpen(false);
      setCertificateToRenew(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <Badge className="bg-green-100 text-green-800 border-green-200">
            <CheckCircle className="h-3 w-3 mr-1" />
            Active
          </Badge>
        );
      case 'expired':
        return (
          <Badge className="bg-red-100 text-red-800 border-red-200">
            <AlertCircle className="h-3 w-3 mr-1" />
            Expired
          </Badge>
        );
      case 'pending':
        return (
          <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
      case 'failed':
        return (
          <Badge className="bg-red-100 text-red-800 border-red-200">
            <AlertCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            {status}
          </Badge>
        );
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getDaysUntilExpiry = (expiresAt: string) => {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diffTime = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <Navigation />
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
              <p className="text-gray-600">Loading SSL certificates...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <Navigation />
        <div className="mb-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">SSL Certificates</h1>
              <p className="text-gray-600">Manage SSL certificates for your proxy configurations</p>
            </div>
            <Button onClick={fetchCertificates} className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>

        {certificates.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Shield className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No SSL Certificates</h3>
              <p className="text-gray-600 mb-4">
                SSL certificates will be automatically generated when you create proxy configurations with HTTPS enabled.
              </p>
              <Button onClick={() => navigate('/proxies')} className="flex items-center gap-2 mx-auto">
                <Shield className="h-4 w-4" />
                Manage Proxies
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Domain</TableHead>
                    <TableHead>Proxy Target</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {certificates.map((cert) => {
                    const daysUntilExpiry = getDaysUntilExpiry(cert.expires_at);
                    const isExpiringSoon = daysUntilExpiry <= 30 && daysUntilExpiry > 0;
                    const isExpired = daysUntilExpiry <= 0;

                    return (
                      <TableRow key={cert.id} className={`${
                        isExpired ? 'bg-red-50 border-red-200' : 
                        isExpiringSoon ? 'bg-yellow-50 border-yellow-200' : ''
                      }`}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4 text-blue-600" />
                            <span>{cert.domain}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {cert.proxy ? (
                            <span className="font-mono text-sm">
                              {cert.proxy.domain} → {cert.proxy.target_url}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">No proxy</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(cert.status)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-3 w-3 text-gray-400" />
                              <span className={`text-sm ${
                                isExpired ? 'text-red-600 font-medium' : 
                                isExpiringSoon ? 'text-yellow-600 font-medium' : 
                                'text-gray-900'
                              }`}>
                                {formatDate(cert.expires_at)}
                              </span>
                            </div>
                            {isExpired && (
                              <span className="text-xs text-red-600 mt-1">Certificate has expired</span>
                            )}
                            {isExpiringSoon && !isExpired && (
                              <span className="text-xs text-yellow-600 mt-1">
                                Expires in {daysUntilExpiry} day{daysUntilExpiry !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {formatDate(cert.created_at)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {(cert.status === 'active' || cert.status === 'expired') && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRenewClick(cert.id)}
                              disabled={renewingId === cert.id}
                              className="flex items-center gap-2"
                            >
                              <RefreshCw className={`h-3 w-3 ${renewingId === cert.id ? 'animate-spin' : ''}`} />
                              {renewingId === cert.id ? 'Renewing...' : 'Renew'}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Renew Certificate Confirmation Dialog */}
        <AlertDialog open={renewDialogOpen} onOpenChange={setRenewDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Renew SSL Certificate</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to renew this SSL certificate? This will generate a new certificate and may take a few minutes to complete.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => {
                setRenewDialogOpen(false);
                setCertificateToRenew(null);
              }}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleRenewCertificate}>
                Renew Certificate
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default SSLCertificates;