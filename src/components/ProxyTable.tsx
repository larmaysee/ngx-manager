import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Shield, Edit, Trash2, ExternalLink } from "lucide-react";

export interface ProxyRecord {
  id: number;
  domain: string;
  target_host: string;
  target_port: number;
  ssl_enabled: boolean;
  ssl_force_redirect?: boolean;
  status: "active" | "inactive" | "error" | string;
  created_at: string;
  updated_at: string;
}

interface ProxyTableProps {
  proxies: ProxyRecord[];
  loading?: boolean;
  onEdit?: (proxy: ProxyRecord) => void;
  onDelete?: (proxy: ProxyRecord) => void;
  showActions?: boolean;
  limit?: number; // optionally limit rows (e.g. dashboard preview)
  emptyMessage?: string;
}

const statusBadge = (status: string) => {
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

export const ProxyTable: React.FC<ProxyTableProps> = ({
  proxies,
  loading,
  onEdit,
  onDelete,
  showActions = true,
  limit,
  emptyMessage = "No proxies configured",
}) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Loading proxies...
      </div>
    );
  }

  if (!proxies.length) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  const rows = typeof limit === "number" ? proxies.slice(0, limit) : proxies;

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Domain</TableHead>
            <TableHead>Target</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>SSL</TableHead>
            <TableHead>Created</TableHead>
            {showActions && (
              <TableHead className="text-right">Actions</TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((proxy) => (
            <TableRow key={proxy.id}>
              <TableCell className="font-medium">
                <div className="flex flex-col">
                  <span className="flex items-center gap-2">
                    {proxy.domain}
                    <a
                      href={`${proxy.ssl_enabled ? "https" : "http"}://${
                        proxy.domain
                      }`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-xs text-muted-foreground hover:text-primary transition-colors"
                      title={`Open ${proxy.ssl_enabled ? "https" : "http"}://${
                        proxy.domain
                      }`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </span>
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
              <TableCell>{statusBadge(proxy.status)}</TableCell>
              <TableCell>
                {proxy.ssl_enabled ? (
                  <Badge
                    variant="outline"
                    className="flex items-center gap-1 w-fit"
                  >
                    <Shield className="h-3 w-3" /> Enabled
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
              {showActions && (
                <TableCell className="text-right">
                  <div className="flex gap-2 justify-end">
                    {onEdit && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onEdit(proxy)}
                        className="flex items-center gap-1"
                      >
                        <Edit className="h-3 w-3" /> Edit
                      </Button>
                    )}
                    {onDelete && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => onDelete(proxy)}
                        className="flex items-center gap-1"
                      >
                        <Trash2 className="h-3 w-3" /> Delete
                      </Button>
                    )}
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default ProxyTable;
