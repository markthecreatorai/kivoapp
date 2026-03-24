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
        {/* Desktop Sidebar */}
        <AppSidebar />

        <div className="flex-1 flex flex-col">
          {/* Header with sidebar trigger */}
          <header className="h-14 flex items-center border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex items-center px-4">
              <SidebarTrigger className="lg:inline-flex" />
              <div className="ml-4">
                <h1 className="text-lg font-semibold text-primary lg:hidden">Kivo</h1>
              </div>
            </div>
          </header>

          {/* Main content */}
          <main className={`flex-1 bg-white ${isMobile ? 'pb-20' : ''}`}>
            {children}
          </main>
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNavigation />
      <FeedbackButton />
    </SidebarProvider>
  );
}