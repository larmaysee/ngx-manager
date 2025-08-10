import React, { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import ProxyTable, { type ProxyRecord } from "@/components/ProxyTable";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import PortalLayout from "@/components/PortalLayout";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Plus,
  Globe,
  ShieldCheck,
  Activity,
  Lock,
} from "lucide-react";
import ProxyForm, { type ProxyFormValues } from "@/components/ProxyForm";

type Proxy = ProxyRecord;

interface SSLCertificate {
  id: number;
  proxy_id: number;
  status: "active" | "pending" | "expired" | "error";
  expires_at?: string;
}

// Form values interface replaced by shared ProxyFormValues

const Dashboard: React.FC = () => {
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [sslCertificates, setSslCertificates] = useState<SSLCertificate[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Reusable ProxyForm will manage its own form state

  // Fetch data function
  const fetchData = async () => {
    try {
      setIsLoadingData(true);
      const token = localStorage.getItem("auth_token");

      // Fetch proxies
      const proxiesResponse = await fetch(
        `${import.meta.env.VITE_API_URL}/api/proxies`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (proxiesResponse.ok) {
        const proxiesData = await proxiesResponse.json();
        const proxiesArray = Array.isArray(proxiesData)
          ? proxiesData
          : proxiesData.proxies || [];
        setProxies(proxiesArray);

        // Fetch SSL certificates
        const sslResponse = await fetch(
          `${import.meta.env.VITE_API_URL}/api/ssl/certificates`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );
        if (sslResponse.ok) {
          const sslData = await sslResponse.json();
          const certificatesArray = Array.isArray(sslData)
            ? sslData
            : sslData.certificates || [];
          setSslCertificates(certificatesArray);
        }
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to fetch data",
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Network Error",
        description: "Network error occurred while fetching data",
      });
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchData stable
  }, []);

  // Redirect if not logged in
  if (!isLoading && !user) {
    return <Navigate to="/login" replace />;
  }

  // Show loading spinner while checking auth status
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // SSL status helpers removed in refactor (table preview does not display SSL badge yet)

  // Handle form submission for creating new proxy
  const handleCreate = async (data: ProxyFormValues) => {
    setSubmitting(true);

    try {
      // Transform form data to match API expectations
      const apiData = { ...data };

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/proxies`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
          },
          body: JSON.stringify(apiData),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create proxy");
      }

      // Show success toast
      toast({
        title: "Success",
        description: "Proxy host created successfully",
      });

      // Refresh data
      await fetchData();

      // Reset form and close dialog
      setDialogOpen(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to create proxy",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Handle add new proxy
  const handleAddNew = () => setDialogOpen(true);

  const stats = {
    totalProxies: Array.isArray(proxies) ? proxies.length : 0,
    activeProxies: Array.isArray(proxies)
      ? proxies.filter((p) => p.status === "active").length
      : 0,
    sslEnabled: Array.isArray(proxies)
      ? proxies.filter((p) => p.ssl_enabled).length
      : 0,
    sslActive: Array.isArray(sslCertificates)
      ? sslCertificates.filter((c) => c.status === "active").length
      : 0,
  };

  return (
    <PortalLayout>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h1>
          <p className="text-gray-600">
            Overview of your proxy configurations and SSL certificates
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Proxies
              </CardTitle>
              <Globe className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalProxies}</div>
              <p className="text-xs text-muted-foreground">
                Configured proxy hosts
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Active Proxies
              </CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {stats.activeProxies}
              </div>
              <p className="text-xs text-muted-foreground">Currently running</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">SSL Enabled</CardTitle>
              <Lock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.sslEnabled}</div>
              <p className="text-xs text-muted-foreground">
                With SSL configuration
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">SSL Active</CardTitle>
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {stats.sslActive}
              </div>
              <p className="text-xs text-muted-foreground">
                Valid certificates
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Proxies Section */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Proxy Hosts</h2>
          <Button onClick={handleAddNew}>
            <Plus className="h-4 w-4 mr-2" />
            Add Proxy Host
          </Button>
        </div>

        {isLoadingData ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Recent Proxies
              </CardTitle>
              <CardDescription>
                Showing {Math.min(proxies.length, 10)} of {proxies.length}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ProxyTable
                proxies={proxies}
                loading={false}
                limit={10}
                showActions={false}
              />
            </CardContent>
          </Card>
        )}

        {/* Add Proxy Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add New Proxy</DialogTitle>
              <DialogDescription>
                Create a new nginx proxy configuration
              </DialogDescription>
            </DialogHeader>
            <ProxyForm
              mode="create"
              submitting={submitting}
              onSubmit={handleCreate}
              onCancel={() => setDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>
    </PortalLayout>
  );
};

export default Dashboard;
