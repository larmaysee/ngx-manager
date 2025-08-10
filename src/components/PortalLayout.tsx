import React from "react";
import Sidebar from "@/components/Sidebar";
import { cn } from "@/lib/utils";

interface PortalLayoutProps {
  children: React.ReactNode;
  className?: string;
}

const PortalLayout: React.FC<PortalLayoutProps> = ({ children, className }) => {
  return (
    <div className="min-h-screen w-full bg-background">
      <Sidebar />
      <main
        className={cn(
          "pt-4 lg:pt-8 pb-10 px-4 lg:px-8 lg:ml-64 transition-[margin]",
          className
        )}
      >
        {children}
      </main>
    </div>
  );
};

export default PortalLayout;
