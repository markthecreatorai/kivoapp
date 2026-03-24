import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { BottomNavigation } from "@/components/BottomNavigation";
import { useIsMobile } from "@/hooks/use-mobile";
import { FeedbackButton } from "@/components/FeedbackButton";

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const isMobile = useIsMobile();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <div className="flex-1 flex flex-col min-w-0">
          {/* Thin topbar — always mounted */}
          <header className="h-12 flex items-center border-b border-border/40 bg-background shrink-0">
            <div className="flex items-center px-4">
              <SidebarTrigger className="lg:inline-flex" />
            </div>
          </header>

          {/* Page content swaps here — sidebar/topbar persist, fade-in on swap */}
          <main className={`flex-1 bg-[hsl(var(--page-background))] animate-in fade-in-0 duration-150 ${isMobile ? 'pb-20' : ''}`}>
            {children}
          </main>
        </div>
      </div>

      <BottomNavigation />
      <FeedbackButton />
    </SidebarProvider>
  );
}
