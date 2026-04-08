import {
  Home,
  DollarSign,
  Store,
  BarChart3,
  Settings,
  LogOut,
  Users,
  UserCheck,
  Tag,
  Mail,
  MessagesSquare,
  Receipt,
  Send,
  Activity,
  Rocket,
  Shield,
  Zap,
  MessageSquare,
  CalendarDays,
  Heart,
  FileText,
  MoreVertical,
  User,
  Plus,
  CalendarCheck,
  ChevronDown,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate, Link } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthProvider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { isAdminUser } from "@/lib/admin";
import { useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import kivoLogo from "@/assets/kivo-logo.svg";
import kivoSymbol from "@/assets/kivo-symbol.svg";
import { getMenuToolsState, optionalItems } from "@/lib/menuTools";
import type React from "react";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { getInitials } from "@/lib/avatarUtils";

/* ── Icon map for optional items ── */
const iconMap: Record<string, React.ElementType> = {
  MessagesSquare,
  CalendarCheck,
  Users,
  Tag,
  UserCheck,
  Mail,
  Send,
  Receipt,
  FileText,
  Zap,
};

interface NavItem {
  title: string;
  url: string;
  icon: React.ElementType;
}

const coreNavItems: NavItem[] = [
  { title: "Home", url: "/dashboard", icon: Home },
  { title: "Minha Loja", url: "/store", icon: Store },
  { title: "Circles", url: "/circles", icon: MessagesSquare },
  { title: "Vendas", url: "/earnings", icon: DollarSign },
  { title: "Relatórios", url: "/analytics", icon: BarChart3 },
  { title: "Clientes", url: "/clients", icon: Heart },
  { title: "Calendar", url: "/appointments", icon: CalendarCheck },
  { title: "AutoDM", url: "/autodm", icon: Zap },
  { title: "Afiliados Kivo", url: "/referrals", icon: Users },
];

const adminItems: NavItem[] = [
  { title: "Executivo", url: "/analytics/executive", icon: Activity },
  { title: "GTM", url: "/gtm", icon: Rocket },
  { title: "Ops", url: "/ops", icon: Shield },
  { title: "Launch", url: "/ops/launch", icon: Zap },
  { title: "Feedback", url: "/ops/feedback", icon: MessageSquare },
  { title: "Semana 1", url: "/ops/week-plan", icon: CalendarDays },
];

// getInitials moved to @/lib/avatarUtils

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
  const { signOut, user } = useAuth();
  const isAdmin = isAdminUser(user);
  const [menuToolsState, setLocalToolsState] = useState<Record<string, boolean>>(() => getMenuToolsState());

  const { data: avatarUrl } = useQuery({
    queryKey: ["sidebar-avatar", currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return null;
      const { data } = await supabase
        .from("storefronts")
        .select("avatar_url")
        .eq("workspace_id", currentWorkspace.id)
        .maybeSingle();
      return data?.avatar_url || null;
    },
    enabled: !!currentWorkspace?.id,
    staleTime: 1000 * 60 * 10,
  });

  const resolvedAvatar =
    avatarUrl || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;

  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split("@")[0] ||
    "Usuário";

  useEffect(() => {
    const sync = () => setLocalToolsState(getMenuToolsState());
    window.addEventListener("kivo:menu-tools-updated", sync as EventListener);
    return () => window.removeEventListener("kivo:menu-tools-updated", sync as EventListener);
  }, []);

  /* Build active optional nav items */
  const activeOptionalNavItems: NavItem[] = optionalItems
    .filter((item) => menuToolsState[item.id] === true)
    .map((item) => ({
      title: item.title,
      url: item.url,
      icon: iconMap[item.icon] || Store,
    }));

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  const navItemClass = (active: boolean) =>
    cn(
      "flex items-center gap-3 rounded-lg px-4 py-2.5 text-[15px] font-medium transition-colors group",
      active
        ? "bg-primary/10 text-primary"
        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
    );

  const renderNavItem = (item: NavItem) => {
    const active = isActive(item.url);
    return (
      <SidebarMenuItem key={item.url}>
        <SidebarMenuButton asChild tooltip={collapsed ? item.title : undefined}>
          <NavLink
            to={item.url}
            end={item.url !== "/circle"}
            className={cn(navItemClass(active), collapsed && "justify-center px-0")}
            activeClassName="bg-primary/10 text-primary"
          >
            <item.icon
              className={cn(
                "h-5 w-5 flex-shrink-0",
                active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
              )}
            />
            {!collapsed && <span>{item.title}</span>}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  const renderMoreLink = () => {
    const active = isActive("/menu-tools");
    return (
      <SidebarMenuItem>
        <SidebarMenuButton asChild tooltip={collapsed ? "Mais" : undefined}>
          <NavLink
            to="/menu-tools"
            className={cn(
              "flex items-center gap-3 rounded-lg px-4 py-2.5 text-[15px] font-medium transition-colors group",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            ,collapsed && "justify-center px-0")}
            activeClassName="bg-primary/10 text-primary"
          >
            <Plus
              className={cn(
                "h-5 w-5 flex-shrink-0",
                active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
              )}
            />
            {!collapsed && <span>Mais</span>}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-border/40">
      {/* ── Header ── */}
      <SidebarHeader className="border-b border-border/30 bg-sidebar px-4 py-4">
        <Link
          to="/dashboard"
          className={cn("flex items-center transition-all duration-200", collapsed ? "justify-center" : "gap-2 pl-[6px] pt-[4px] pb-[4px] mb-0 mt-0")}
        >
          <img
            src={collapsed ? kivoSymbol : kivoLogo}
            alt="Kivo"
            className={cn("object-contain", collapsed ? "h-7 w-7" : "h-7")}
          />
        </Link>
      </SidebarHeader>

      {/* ── Content ── */}
      <SidebarContent className="bg-sidebar px-3 py-4">
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1.5">
              {coreNavItems.map(renderNavItem)}
              {activeOptionalNavItems.map(renderNavItem)}
              {renderMoreLink()}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup className="mt-3 border-t border-border/30 pt-3 p-0">
            <SidebarGroupContent>
              <Collapsible>
                <SidebarMenuItem className="list-none">
                  <CollapsibleTrigger className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-[15px] font-medium transition-colors group",
                    adminItems.some(i => isActive(i.url))
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    collapsed && "justify-center px-0"
                  )}>
                    <Shield className={cn("h-5 w-5 flex-shrink-0", adminItems.some(i => isActive(i.url)) ? "text-primary" : "text-muted-foreground")} />
                    {!collapsed && (
                      <>
                        <span className="flex-1 text-left">Admin</span>
                        <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                      </>
                    )}
                  </CollapsibleTrigger>
                </SidebarMenuItem>
                <CollapsibleContent>
                  <SidebarMenu className="mt-1 space-y-0.5 pl-4">
                    {adminItems.map(renderNavItem)}
                  </SidebarMenu>
                </CollapsibleContent>
              </Collapsible>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* ── Footer ── */}
      <SidebarFooter className="border-t border-border/30 bg-sidebar px-4 py-3">
        <div className={cn("flex items-center", collapsed ? "justify-center" : "gap-3")}>
          {collapsed ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="rounded-full focus:outline-none focus:ring-2 focus:ring-ring">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={resolvedAvatar || ""} />
                    <AvatarFallback className="text-xs font-semibold text-muted-foreground bg-muted">
                      {getInitials(displayName, user?.email)}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" side="right" className="w-44">
                <DropdownMenuItem onClick={() => navigate("/settings")} className="gap-2 text-sm">
                  <User className="h-4 w-4" />
                  Editar perfil
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/settings")} className="gap-2 text-sm">
                  <Settings className="h-4 w-4" />
                  Configurações
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={signOut}
                  className="gap-2 text-sm text-destructive focus:text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Avatar className="h-9 w-9 flex-shrink-0">
                <AvatarImage src={resolvedAvatar || ""} />
                <AvatarFallback className="text-xs font-semibold text-muted-foreground bg-muted">
                  {getInitials(displayName, user?.email)}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{displayName}</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground">
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="top" className="w-44">
                  <DropdownMenuItem onClick={() => navigate("/settings")} className="gap-2 text-sm">
                    <User className="h-4 w-4" />
                    Editar perfil
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/settings")} className="gap-2 text-sm">
                    <Settings className="h-4 w-4" />
                    Configurações
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={signOut}
                    className="gap-2 text-sm text-destructive focus:text-destructive"
                  >
                    <LogOut className="h-4 w-4" />
                    Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
