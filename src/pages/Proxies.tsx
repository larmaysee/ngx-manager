import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import ProxyForm, { type ProxyFormValues } from "@/components/ProxyForm";
// Table presentation refactored into shared component
import ProxyTable, { type ProxyRecord } from "@/components/ProxyTable";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import PortalLayout from "@/components/PortalLayout";
import { Plus, Globe } from "lucide-react";
// Form state handled inside ProxyForm

type Proxy = ProxyRecord;

// Replaced by ProxyFormValues

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

  // Local page no longer manages individual form inputs

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
  const handleSave = async (data: ProxyFormValues) => {
    setSubmitting(true);

    try {
      const url = editingProxy
        ? `${import.meta.env.VITE_API_URL}/api/proxies/${editingProxy.id}`
        : `${import.meta.env.VITE_API_URL}/api/proxies`;
      const method = editingProxy ? "PUT" : "POST";

      // Transform form data to match API expectations
      const apiData = { ...data };

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
    setDialogOpen(true);
  };

  // Handle add new
  const handleAddNew = () => {
    setEditingProxy(null);
    setDialogOpen(true);
  };

  // status badges handled within ProxyTable component

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
    <PortalLayout>
      <div className="max-w-7xl mx-auto">
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
            <ProxyForm
              key={editingProxy?.id ?? "new"}
              mode={editingProxy ? "edit" : "create"}
              submitting={submitting}
              initialValues={editingProxy || undefined}
              onSubmit={handleSave}
              onCancel={() => {
                setDialogOpen(false);
                setEditingProxy(null);
              }}
            />
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
              <ProxyTable
                proxies={proxies}
                onEdit={(p) => handleEdit(p)}
                onDelete={(p) => handleDeleteClick(p.id)}
              />
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
    </PortalLayout>
  );
};

export default Proxies;
