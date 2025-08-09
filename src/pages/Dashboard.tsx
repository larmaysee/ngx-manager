import React, { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Navigation from "@/components/Navigation";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Plus,
  Globe,
  Shield,
  ShieldCheck,
  ShieldX,
  Settings,
  Activity,
  Lock,
  ExternalLink,
} from "lucide-react";
import { useForm, Controller } from "react-hook-form";

interface Proxy {
  id: number;
  domain: string;
  target_host: string;
  target_port: number;
  ssl_enabled: boolean;
  ssl_certificate_id?: number;
  status: "active" | "inactive" | "error";
  created_at: string;
  updated_at: string;
}

interface SSLCertificate {
  id: number;
  proxy_id: number;
  status: "active" | "pending" | "expired" | "error";
  expires_at?: string;
}

interface ProxyFormData {
  domain: string;
  target_host: string;
  target_port: number;
  ssl_enabled: boolean;
  ssl_force_redirect: boolean;
}

const Dashboard: React.FC = () => {
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [sslCertificates, setSslCertificates] = useState<SSLCertificate[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProxyFormData>({
    defaultValues: {
      domain: "",
      target_host: "",
      target_port: "" as unknown as number,
      ssl_enabled: false,
      ssl_force_redirect: false,
    },
  });

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
        // Ensure we get the proxies array from the response
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
          // Ensure we get the certificates array from the response
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

  const getSSLStatus = (proxyId: number) => {
    if (!Array.isArray(sslCertificates)) return "none";
    const cert = sslCertificates.find((c) => c.proxy_id === proxyId);
    return cert?.status || "none";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return (
          <Badge variant="default" className="bg-green-500">
            Active
          </Badge>
        );
      case "inactive":
        return <Badge variant="secondary">Inactive</Badge>;
      case "error":
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const getSSLBadge = (status: string) => {
    switch (status) {
      case "active":
        return (
          <div className="flex items-center gap-1 text-green-600">
            <ShieldCheck className="h-4 w-4" />
            <span className="text-sm">SSL Active</span>
          </div>
        );
      case "pending":
        return (
          <div className="flex items-center gap-1 text-yellow-600">
            <Shield className="h-4 w-4" />
            <span className="text-sm">SSL Pending</span>
          </div>
        );
      case "expired":
        return (
          <div className="flex items-center gap-1 text-red-600">
            <ShieldX className="h-4 w-4" />
            <span className="text-sm">SSL Expired</span>
          </div>
        );
      case "error":
        return (
          <div className="flex items-center gap-1 text-red-600">
            <ShieldX className="h-4 w-4" />
            <span className="text-sm">SSL Error</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-1 text-gray-500">
            <Shield className="h-4 w-4" />
            <span className="text-sm">No SSL</span>
          </div>
        );
    }
  };

  // Handle form submission for creating new proxy
  const onSubmit = async (data: ProxyFormData) => {
    setSubmitting(true);

    try {
      // Transform form data to match API expectations
      const apiData = {
        domain: data.domain,
        target_host: data.target_host,
        target_port: data.target_port,
        ssl_enabled: !!data.ssl_enabled,
        ssl_force_redirect: !!data.ssl_force_redirect,
      };

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
      reset();
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
  const handleAddNew = () => {
    reset();
    setDialogOpen(true);
  };

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
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <Navigation />
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
        ) : !Array.isArray(proxies) || proxies.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Globe className="h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No proxy hosts configured
              </h3>
              <p className="text-gray-500 text-center mb-6">
                Get started by adding your first proxy host to manage your
                domains and SSL certificates.
              </p>
              <Button onClick={handleAddNew}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Proxy Host
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6">
            {Array.isArray(proxies) &&
              proxies.map((proxy) => (
                <Card
                  key={proxy.id}
                  className="hover:shadow-md transition-shadow"
                >
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Globe className="h-5 w-5" />
                          {proxy.domain}
                          <ExternalLink className="h-4 w-4 text-gray-400" />
                        </CardTitle>
                        <CardDescription>
                          Forwarding to {proxy.target_host}:{proxy.target_port}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(proxy.status)}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-4">
                        {getSSLBadge(getSSLStatus(proxy.id))}
                        <div className="text-sm text-gray-500">
                          Created{" "}
                          {new Date(proxy.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm">
                          <Settings className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        {proxy.ssl_enabled && (
                          <Button variant="outline" size="sm">
                            <Shield className="h-4 w-4 mr-1" />
                            SSL
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
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
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="domain">Domain Name</Label>
                  <Input
                    id="domain"
                    placeholder="example.com"
                    {...register("domain", {
                      required: "Domain name is required",
                      pattern: {
                        value:
                          /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/,
                        message: "Invalid domain name format",
                      },
                    })}
                  />
                  {errors.domain && (
                    <p className="text-sm text-destructive">
                      {errors.domain.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="target_host">Target Host</Label>
                  <Input
                    id="target_host"
                    placeholder="localhost or IP address"
                    {...register("target_host", {
                      required: "Target host is required",
                    })}
                  />
                  {errors.target_host && (
                    <p className="text-sm text-destructive">
                      {errors.target_host.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="target_port">Target Port</Label>
                  <Input
                    id="target_port"
                    type="number"
                    placeholder="3000"
                    {...register("target_port", {
                      required: "Target port is required",
                      min: {
                        value: 1,
                        message: "Port must be between 1 and 65535",
                      },
                      max: {
                        value: 65535,
                        message: "Port must be between 1 and 65535",
                      },
                    })}
                  />
                  {errors.target_port && (
                    <p className="text-sm text-destructive">
                      {errors.target_port.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Controller
                    name="ssl_enabled"
                    control={control}
                    render={({ field }) => (
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="ssl_enabled"
                          checked={!!field.value}
                          onCheckedChange={(checked) =>
                            field.onChange(checked === true)
                          }
                        />
                        <Label htmlFor="ssl_enabled">Enable SSL</Label>
                      </div>
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <Controller
                    name="ssl_force_redirect"
                    control={control}
                    render={({ field }) => (
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="ssl_force_redirect"
                          checked={!!field.value}
                          onCheckedChange={(checked) =>
                            field.onChange(checked === true)
                          }
                        />
                        <Label htmlFor="ssl_force_redirect">
                          Force HTTPS Redirect
                        </Label>
                      </div>
                    )}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDialogOpen(false);
                    reset();
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Creating..." : "Create Proxy"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default Dashboard;
