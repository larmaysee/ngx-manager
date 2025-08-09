import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import { Plus, Edit, Trash2, Globe, Shield } from "lucide-react";
import { useForm, Controller } from "react-hook-form";

interface Proxy {
  id: number;
  domain: string;
  target_host: string;
  target_port: number;
  ssl_enabled: boolean;
  ssl_force_redirect?: boolean;
  status: "active" | "inactive" | "error";
  created_at: string;
  updated_at: string;
}

interface ProxyFormData {
  domain: string;
  target_host: string;
  target_port: number;
  ssl_enabled: boolean;
  ssl_force_redirect: boolean;
}

const Proxies: React.FC = () => {
  useAuth(); // ensure auth context hook runs (e.g., for redirect) without unused var
  const { toast } = useToast();
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProxy, setEditingProxy] = useState<Proxy | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [proxyToDelete, setProxyToDelete] = useState<number | null>(null);

  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<ProxyFormData>({
    defaultValues: {
      domain: "",
      target_host: "",
      // Initialize as empty string; will be converted to number on submit
      target_port: "" as unknown as number,
      ssl_enabled: false,
      ssl_force_redirect: false,
    },
  });

  // Fetch proxies
  const fetchProxies = async () => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/proxies`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch proxies");
      }

      const data = await response.json();
      setProxies(data.proxies || []);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to fetch proxies",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProxies();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchProxies stable
  }, []);

  // Handle form submission
  const onSubmit = async (data: ProxyFormData) => {
    setSubmitting(true);

    try {
      const url = editingProxy
        ? `${import.meta.env.VITE_API_URL}/api/proxies/${editingProxy.id}`
        : `${import.meta.env.VITE_API_URL}/api/proxies`;
      const method = editingProxy ? "PUT" : "POST";

      // Transform form data to match API expectations
      const apiData = {
        domain: data.domain,
        target_host: data.target_host,
        target_port: data.target_port,
        ssl_enabled: !!data.ssl_enabled,
        ssl_force_redirect: !!data.ssl_force_redirect,
      };

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify(apiData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save proxy");
      }

      // Show success toast
      toast({
        title: "Success",
        description: editingProxy
          ? "Proxy updated successfully"
          : "Proxy created successfully",
      });

      // Refresh proxies list
      await fetchProxies();

      // Reset form
      reset();
      setDialogOpen(false);
      setEditingProxy(null);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to save proxy",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Handle delete confirmation
  const handleDeleteClick = (id: number) => {
    setProxyToDelete(id);
    setDeleteDialogOpen(true);
  };

  // Handle delete
  const handleDelete = async () => {
    if (!proxyToDelete) return;

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/proxies/${proxyToDelete}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to delete proxy");
      }

      toast({
        title: "Success",
        description: "Proxy deleted successfully",
      });

      await fetchProxies();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to delete proxy",
      });
    } finally {
      setDeleteDialogOpen(false);
      setProxyToDelete(null);
    }
  };

  // Handle edit
  const handleEdit = (proxy: Proxy) => {
    setEditingProxy(proxy);
    setValue("domain", proxy.domain);
    setValue("target_host", proxy.target_host);
    setValue("target_port", proxy.target_port);
    setValue("ssl_enabled", proxy.ssl_enabled);
    setValue("ssl_force_redirect", proxy.ssl_force_redirect);
    setDialogOpen(true);
  };

  // Handle add new
  const handleAddNew = () => {
    setEditingProxy(null);
    reset();
    setDialogOpen(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="default">Active</Badge>;
      case "inactive":
        return <Badge variant="secondary">Inactive</Badge>;
      case "error":
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading proxies...</div>
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
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Proxy Management
              </h1>
              <p className="text-gray-600">
                Manage your nginx proxy configurations
              </p>
            </div>
            <Button onClick={handleAddNew} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add New Proxy
            </Button>
          </div>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingProxy ? "Edit Proxy" : "Add New Proxy"}
              </DialogTitle>
              <DialogDescription>
                {editingProxy
                  ? "Update proxy configuration"
                  : "Create a new nginx proxy configuration"}
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
                    setEditingProxy(null);
                    reset();
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting
                    ? "Saving..."
                    : editingProxy
                    ? "Update Proxy"
                    : "Create Proxy"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {proxies.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Globe className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                No proxies configured
              </h3>
              <p className="text-muted-foreground text-center mb-4">
                Get started by creating your first nginx proxy configuration.
              </p>
              <Button onClick={handleAddNew}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Proxy
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
                    <TableHead>Target</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>SSL</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {proxies.map((proxy) => (
                    <TableRow key={proxy.id}>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span>{proxy.domain}</span>
                          {proxy.ssl_force_redirect && (
                            <span className="text-xs text-blue-600">
                              Force HTTPS redirect
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm">
                          {proxy.target_host}:{proxy.target_port}
                        </span>
                      </TableCell>
                      <TableCell>{getStatusBadge(proxy.status)}</TableCell>
                      <TableCell>
                        {proxy.ssl_enabled ? (
                          <Badge
                            variant="outline"
                            className="flex items-center gap-1 w-fit"
                          >
                            <Shield className="h-3 w-3" />
                            Enabled
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Disabled</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {new Date(proxy.created_at).toLocaleDateString()}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(proxy)}
                            className="flex items-center gap-1"
                          >
                            <Edit className="h-3 w-3" />
                            Edit
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteClick(proxy.id)}
                            className="flex items-center gap-1"
                          >
                            <Trash2 className="h-3 w-3" />
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the
                proxy host configuration.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  setDeleteDialogOpen(false);
                  setProxyToDelete(null);
                }}
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default Proxies;
