import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Home,
  Globe,
  Shield,
  LogOut,
  Menu,
  X,
  UserCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { label: "Dashboard", path: "/dashboard", icon: Home },
  { label: "Proxies", path: "/proxies", icon: Globe },
  { label: "SSL Certificates", path: "/ssl", icon: Shield },
];

const Sidebar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [openMobile, setOpenMobile] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b bg-background sticky top-0 z-40">
        <div className="flex items-center gap-2 font-semibold">
          <span className="text-primary">NGX Manager</span>
        </div>
        <Button
          size="icon"
          variant="outline"
          onClick={() => setOpenMobile((o) => !o)}
          aria-label={openMobile ? "Close menu" : "Open menu"}
        >
          {openMobile ? (
            <X className="h-4 w-4" />
          ) : (
            <Menu className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Overlay for mobile */}
      {openMobile && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setOpenMobile(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-muted/40 border-r flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0",
          openMobile ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="h-14 hidden lg:flex items-center px-4 border-b font-semibold tracking-wide text-sm">
          <span className="text-primary">NGX Manager</span>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map(({ path, label, icon: Icon }) => (
            <Link key={path} to={path} onClick={() => setOpenMobile(false)}>
              <div
                className={cn(
                  "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                  isActive(path)
                    ? "bg-primary text-primary-foreground shadow"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </div>
            </Link>
          ))}
        </nav>
        <div className="border-t p-4 space-y-3">
          {user && (
            <div className="flex items-center gap-3 text-sm">
              <UserCircle2 className="h-6 w-6 text-muted-foreground" />
              <div className="flex flex-col leading-tight">
                <span className="font-medium truncate max-w-[140px]">
                  {user.name}
                </span>
                <span className="text-xs text-muted-foreground truncate max-w-[140px]">
                  {user.email}
                </span>
              </div>
            </div>
          )}
          <Button
            variant="outline"
            className="w-full flex items-center gap-2"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" /> Logout
          </Button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
