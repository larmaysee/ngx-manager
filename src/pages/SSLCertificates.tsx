import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import {
  Shield,
  RefreshCw,
  Calendar,
  AlertCircle,
  CheckCircle,
  Clock,
} from "lucide-react";

interface SSLCertificate {
  id: number;
  proxy_id: number;
  domain: string;
  status: "valid" | "expired" | "pending" | "failed";
  expires_at: string;
  created_at: string;
  updated_at: string;
}

interface ProxyItem {
  id: number;
  domain: string;
  target: string;
  ssl_enabled: number;
  status: string;
}

interface ReachabilityResult {
  domain: string;
  reachable: boolean;
  statusCode?: number;
  error?: string;
}

const SSLCertificates: React.FC = () => {
  const { toast } = useToast();
  const [certificates, setCertificates] = useState<SSLCertificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [renewingId, setRenewingId] = useState<number | null>(null);
  const [renewDialogOpen, setRenewDialogOpen] = useState(false);
  const [certificateToRenew, setCertificateToRenew] =
    useState<SSLCertificate | null>(null);
  const [proxies, setProxies] = useState<ProxyItem[]>([]);
  const [selectedProxyId, setSelectedProxyId] = useState<number | "">("");
  const [extraDomainInput, setExtraDomainInput] = useState("");
  const [extraDomains, setExtraDomains] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [reachability, setReachability] = useState<ReachabilityResult[] | null>(
    null
  );
  const [testingReach, setTestingReach] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      navigate("/login");
      return;
    }
    (async () => {
      await fetchCertificates();
      await fetchProxies();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const fetchCertificates = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("auth_token");
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/ssl/certificates`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch SSL certificates");
      }

      const data = await response.json();
      const certificatesArray = Array.isArray(data.certificates)
        ? data.certificates
        : [];
      setCertificates(certificatesArray);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description:
          err instanceof Error
            ? err.message
            : "Failed to fetch SSL certificates",
      });
      // Set empty array on error to prevent .map() errors
      setCertificates([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchProxies = async () => {
    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/proxies`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!response.ok) throw new Error("Failed to fetch proxies");
      const data = await response.json();
      setProxies(Array.isArray(data.proxies) ? data.proxies : []);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to load proxies",
      });
    }
  };

  // Handle renew confirmation
  const handleRenewClick = (certificate: SSLCertificate) => {
    setCertificateToRenew(certificate);
    setRenewDialogOpen(true);
  };

  const handleRenewCertificate = async () => {
    if (!certificateToRenew) return;

    try {
      setRenewingId(certificateToRenew.id);
      const token = localStorage.getItem("auth_token");
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/ssl/renew/${
          certificateToRenew.proxy_id
        }`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to renew certificate");
      }

      toast({
        title: "Success",
        description: "Certificate renewal initiated successfully",
      });

      await fetchCertificates();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to renew certificate",
      });
    } finally {
      setRenewingId(null);
      setRenewDialogOpen(false);
      setCertificateToRenew(null);
    }
  };

  const addExtraDomain = () => {
    const value = extraDomainInput.trim().toLowerCase();
    if (value && !extraDomains.includes(value)) {
      setExtraDomains([...extraDomains, value]);
    }
    setExtraDomainInput("");
  };

  const removeExtraDomain = (d: string) =>
    setExtraDomains(extraDomains.filter((x) => x !== d));

  const runReachabilityTest = async () => {
    if (!selectedProxyId) return;
    const primary = proxies.find((p) => p.id === selectedProxyId)?.domain;
    if (!primary) return;
    const domains = [primary, ...extraDomains];
    setTestingReach(true);
    setReachability(null);
    try {
      const token = localStorage.getItem("auth_token");
      const resp = await fetch(
        `${import.meta.env.VITE_API_URL}/api/ssl/reachability`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ domains }),
        }
      );
      const data = await resp.json();
      setReachability(data.results || []);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Error",
        description:
          e instanceof Error ? e.message : "Reachability test failed",
      });
    } finally {
      setTestingReach(false);
    }
  };

  const requestCertificate = async () => {
    if (!selectedProxyId) return;
    setRequesting(true);
    try {
      const token = localStorage.getItem("auth_token");
      const resp = await fetch(
        `${import.meta.env.VITE_API_URL}/api/ssl/request/${selectedProxyId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            extra_domains: extraDomains,
            email: email || undefined,
          }),
        }
      );
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.message || "Request failed");
      toast({
        title: "Requested",
        description: "SSL certificate request initiated",
      });
      setExtraDomains([]);
      setReachability(null);
      setEmail("");
      fetchCertificates();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e instanceof Error ? e.message : "Request failed",
      });
    } finally {
      setRequesting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "valid":
        return (
          <Badge className="bg-green-100 text-green-800 border-green-200">
            <CheckCircle className="h-3 w-3 mr-1" />
            Valid
          </Badge>
        );
      case "expired":
        return (
          <Badge className="bg-red-100 text-red-800 border-red-200">
            <AlertCircle className="h-3 w-3 mr-1" />
            Expired
          </Badge>
        );
      case "pending":
        return (
          <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
      case "failed":
        return (
          <Badge className="bg-red-100 text-red-800 border-red-200">
            <AlertCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
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
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                SSL Certificates
              </h1>
              <p className="text-gray-600">
                Manage SSL certificates for your proxy configurations
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={fetchCertificates}
                className="flex items-center gap-2"
                variant="outline"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
              <Dialog
                open={requestDialogOpen}
                onOpenChange={setRequestDialogOpen}
              >
                <DialogTrigger asChild>
                  <Button className="flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Request Certificate
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Request New Certificate</DialogTitle>
                    <DialogDescription>
                      Request a single or multi-domain (SAN) Let's Encrypt
                      certificate. Run a reachability test first.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          Proxy (primary domain)
                        </label>
                        <select
                          aria-label="Select proxy"
                          className="w-full border rounded px-3 py-2 text-sm"
                          value={selectedProxyId}
                          onChange={(e) =>
                            setSelectedProxyId(
                              e.target.value ? parseInt(e.target.value) : ""
                            )
                          }
                        >
                          <option value="">Select proxy</option>
                          {proxies.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.domain}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          Notification Email (optional)
                        </label>
                        <input
                          type="email"
                          className="w-full border rounded px-3 py-2 text-sm"
                          placeholder="admin@example.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Extra Domains (SAN)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          className="flex-1 border rounded px-3 py-2 text-sm"
                          placeholder="Add domain and press Add"
                          value={extraDomainInput}
                          onChange={(e) => setExtraDomainInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addExtraDomain();
                            }
                          }}
                        />
                        <Button
                          type="button"
                          onClick={addExtraDomain}
                          disabled={!extraDomainInput.trim()}
                        >
                          Add
                        </Button>
                      </div>
                      {extraDomains.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {extraDomains.map((d) => (
                            <span
                              key={d}
                              className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded text-xs"
                            >
                              {d}
                              <button
                                className="text-red-500"
                                onClick={() => removeExtraDomain(d)}
                                aria-label={`Remove ${d}`}
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={runReachabilityTest}
                        disabled={!selectedProxyId || testingReach}
                      >
                        {testingReach ? "Testing..." : "Test Reachability"}
                      </Button>
                      <Button
                        type="button"
                        onClick={requestCertificate}
                        disabled={!selectedProxyId || requesting}
                      >
                        {requesting ? "Requesting..." : "Request Certificate"}
                      </Button>
                    </div>
                    {reachability && (
                      <div className="border rounded p-3">
                        <h4 className="font-medium text-sm mb-2">
                          Reachability Results
                        </h4>
                        <div className="space-y-1 text-sm max-h-40 overflow-auto">
                          {reachability.map((r) => (
                            <div
                              key={r.domain}
                              className="flex justify-between items-center"
                            >
                              <span>{r.domain}</span>
                              {r.reachable ? (
                                <span className="text-green-600">
                                  Reachable
                                  {r.statusCode ? ` (${r.statusCode})` : ""}
                                </span>
                              ) : (
                                <span className="text-red-600">
                                  Unreachable{r.error ? ` - ${r.error}` : ""}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button
                      variant="ghost"
                      type="button"
                      onClick={() => setRequestDialogOpen(false)}
                    >
                      Close
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>

        {certificates.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Shield className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No SSL Certificates
              </h3>
              <p className="text-gray-600 mb-4">
                SSL certificates will be automatically generated when you create
                proxy configurations with HTTPS enabled.
              </p>
              <Button
                onClick={() => navigate("/proxies")}
                className="flex items-center gap-2 mx-auto"
              >
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
                    <TableHead>Proxy Domain</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {certificates.map((cert) => {
                    const daysUntilExpiry = getDaysUntilExpiry(cert.expires_at);
                    const isExpiringSoon =
                      daysUntilExpiry <= 30 && daysUntilExpiry > 0;
                    const isExpired = daysUntilExpiry <= 0;

                    return (
                      <TableRow
                        key={cert.id}
                        className={`${
                          isExpired
                            ? "bg-red-50 border-red-200"
                            : isExpiringSoon
                            ? "bg-yellow-50 border-yellow-200"
                            : ""
                        }`}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4 text-blue-600" />
                            <span>{cert.domain}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-sm">
                            {cert.domain}
                          </span>
                        </TableCell>
                        <TableCell>{getStatusBadge(cert.status)}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-3 w-3 text-gray-400" />
                              <span
                                className={`text-sm ${
                                  isExpired
                                    ? "text-red-600 font-medium"
                                    : isExpiringSoon
                                    ? "text-yellow-600 font-medium"
                                    : "text-gray-900"
                                }`}
                              >
                                {formatDate(cert.expires_at)}
                              </span>
                            </div>
                            {isExpired && (
                              <span className="text-xs text-red-600 mt-1">
                                Certificate has expired
                              </span>
                            )}
                            {isExpiringSoon && !isExpired && (
                              <span className="text-xs text-yellow-600 mt-1">
                                Expires in {daysUntilExpiry} day
                                {daysUntilExpiry !== 1 ? "s" : ""}
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
                          {(cert.status === "valid" ||
                            cert.status === "expired") && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRenewClick(cert)}
                              disabled={renewingId === cert.id}
                              className="flex items-center gap-2"
                            >
                              <RefreshCw
                                className={`h-3 w-3 ${
                                  renewingId === cert.id ? "animate-spin" : ""
                                }`}
                              />
                              {renewingId === cert.id ? "Renewing..." : "Renew"}
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
                Are you sure you want to renew this SSL certificate? This will
                generate a new certificate and may take a few minutes to
                complete.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  setRenewDialogOpen(false);
                  setCertificateToRenew(null);
                }}
              >
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
