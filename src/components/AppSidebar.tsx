import { Home, DollarSign, Store, BarChart3, Heart, Settings, LogOut, Package, Users, UserCheck, Tag, Mail, CalendarCheck, MessagesSquare, FileText, Receipt, Send, Activity, Rocket } from "lucide-react";
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
  useSidebar } from
"@/components/ui/sidebar";
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
{ title: "Campanhas", url: "/email-campaigns", icon: Send },
{ title: "Agendamentos", url: "/appointments", icon: CalendarCheck },
{ title: "Circles", url: "/circle", icon: MessagesSquare },
{ title: "Renda", url: "/earnings", icon: DollarSign },
{ title: "Afiliados", url: "/affiliates", icon: Users },
{ title: "Analytics", url: "/analytics", icon: BarChart3 },
{ title: "Executivo", url: "/analytics/executive", icon: Activity },
{ title: "Clientes", url: "/clients", icon: Heart },
{ title: "Logs Pagamento", url: "/payment-logs", icon: FileText },
{ title: "Fiscal", url: "/fiscal", icon: Receipt },
{ title: "Configurações", url: "/settings", icon: Settings }];


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
      <SidebarHeader className="border-b border-border/40 bg-sidebar">
        <div className="flex items-center justify-center p-4 group-data-[collapsible=icon]:group-data-[state=collapsed]:p-2 px-[20px] py-[20px]">
          <img
            src="/src/assets/kivo-logo.svg"
            alt="Kivo"
            className="w-full h-auto max-h-12 group-data-[collapsible=icon]:group-data-[state=collapsed]:max-h-8 text-center object-contain px-0 mx-[4px] my-[4px]" />
          
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 bg-sidebar">
        {/* Navigation */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {navigationItems.map((item) =>
              <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                    to={item.url}
                    end
                    className="hover:bg-muted/50 rounded px-3 py-2.5 text-[15px]"
                    activeClassName="bg-primary/10 text-primary font-medium hover:bg-primary/15">
                    
                      <item.icon className="flex-shrink-0 w-[24px] h-[24px]" />
                      {!collapsed && <span className="ml-3">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Profile + Sign Out */}
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <div className="flex items-center gap-3 px-3 py-2.5 border-t border-border/40 pt-3">
              <Avatar className="h-8 w-8 flex-shrink-0">
                <AvatarImage src="" />
                <AvatarFallback className="text-xs bg-primary/10 text-primary">
                  {user?.email?.charAt(0).toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              {!collapsed &&
              <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{user?.email?.split("@")[0] || "Usuário"}</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email || ""}</p>
                </div>
              }
            </div>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Button
                    variant="ghost"
                    className="w-full justify-start hover:bg-muted/50 rounded-lg px-3 py-2.5"
                    onClick={signOut}>
                    
                    <LogOut className="mr-3 h-5 w-5 flex-shrink-0" />
                    {!collapsed && <span>Sair</span>}
                  </Button>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>);

}