import { Home, DollarSign, Store, BarChart3, Heart, Settings, LogOut, Package, Users, UserCheck, Tag, Mail, CalendarCheck, MessagesSquare } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthProvider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const navigationItems = [
  { title: "Home", url: "/dashboard", icon: Home },
  { title: "Produtos", url: "/products", icon: Package },
  { title: "Cupons", url: "/coupons", icon: Tag },
  { title: "Minha Loja", url: "/store", icon: Store },
  { title: "Leads", url: "/leads", icon: UserCheck },
  { title: "Email Flows", url: "/email-flows", icon: Mail },
  { title: "Agendamentos", url: "/appointments", icon: CalendarCheck },
  { title: "Circles", url: "/circle", icon: MessagesSquare },
  { title: "Renda", url: "/earnings", icon: DollarSign },
  { title: "Afiliados", url: "/affiliates", icon: Users },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
  { title: "Clientes", url: "/clients", icon: Heart },
  { title: "Configurações", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const currentPath = location.pathname;
  const { currentWorkspace } = useWorkspace();
  const { signOut, user } = useAuth();

  const isActive = (path: string) => currentPath === path;
  const isExpanded = navigationItems.some((i) => isActive(i.url));

  return (
    <Sidebar collapsible="icon" className="w-60">
      <SidebarHeader className="border-b border-border/40">
        <div className="flex items-center gap-3 p-4">
          <div className="flex-shrink-0">
            <img 
              src="/src/assets/kivo-logo.svg" 
              alt="Kora"
              className="h-8 w-8" 
            />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-primary truncate">Kora</h2>
              <p className="text-sm text-muted-foreground truncate">
                {currentWorkspace?.name || "Meu Workspace"}
              </p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        {/* Navigation */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {navigationItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      className="hover:bg-muted/50 rounded-lg px-3 py-2.5"
                      activeClassName="bg-primary/10 text-primary font-medium hover:bg-primary/15"
                    >
                      <item.icon className="mr-3 h-5 w-5 flex-shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Sign Out */}
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Button
                    variant="ghost"
                    className="w-full justify-start hover:bg-muted/50 rounded-lg px-3 py-2.5"
                    onClick={signOut}
                  >
                    <LogOut className="mr-3 h-5 w-5 flex-shrink-0" />
                    {!collapsed && <span>Sair</span>}
                  </Button>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}