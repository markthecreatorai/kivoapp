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
  CalendarCheck,
  Plus,
  Heart,
  FileText,
  MoreVertical,
  User,
  Grid3X3,
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
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthProvider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { isAdminUser } from "@/lib/admin";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import kivoLogo from "@/assets/kivo-logo.svg";
import kivoSymbol from "@/assets/kivo-symbol.svg";

interface NavItem {
  title: string;
  url: string;
  icon: React.ElementType;
}

const primaryItems: NavItem[] = [
  { title: "Home", url: "/dashboard", icon: Home },
  { title: "Minha Loja", url: "/store", icon: Store },
  { title: "Renda", url: "/earnings", icon: DollarSign },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
  { title: "Clientes", url: "/clients", icon: Heart },
  { title: "Agendamentos", url: "/appointments", icon: CalendarCheck },
];

const moreItems: NavItem[] = [
  { title: "Indicações", url: "/referrals", icon: Users },
  { title: "Cupons", url: "/coupons", icon: Tag },
  { title: "Logs Pagamento", url: "/payment-logs", icon: FileText },
  { title: "Leads", url: "/leads", icon: UserCheck },
  { title: "Email Flows", url: "/email-flows", icon: Mail },
  { title: "Campanhas", url: "/email-campaigns", icon: Send },
  { title: "Afiliados", url: "/affiliates", icon: Users },
  { title: "Circles", url: "/circles", icon: MessagesSquare },
  { title: "Fiscal", url: "/fiscal", icon: Receipt },
  { title: "Configurações", url: "/settings", icon: Settings },
];

const adminItems: NavItem[] = [
  { title: "Executivo", url: "/analytics/executive", icon: Activity },
  { title: "GTM", url: "/gtm", icon: Rocket },
  { title: "Ops", url: "/ops", icon: Shield },
  { title: "Launch", url: "/ops/launch", icon: Zap },
  { title: "Feedback", url: "/ops/feedback", icon: MessageSquare },
  { title: "Semana 1", url: "/ops/week-plan", icon: CalendarDays },
];

function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.charAt(0).toUpperCase();
  }
  return email?.charAt(0).toUpperCase() || "U";
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
  const { signOut, user } = useAuth();
  const isAdmin = isAdminUser(user);

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

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  const navItemClass = (active: boolean) =>
    cn(
      "flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors group",
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
                "h-4 w-4 flex-shrink-0",
                active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
              )}
            />
            {!collapsed && <span>{item.title}</span>}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  const renderMoreMenu = () => (
    <SidebarMenuItem>
      <DropdownMenu>
        <SidebarMenuButton asChild tooltip={collapsed ? "Mais" : undefined}>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex w-full items-center rounded-lg text-[13px] font-medium transition-colors",
                collapsed ? "justify-center p-2" : "gap-3 px-3 py-2",
                "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              <Grid3X3 className="h-4 w-4" />
              {!collapsed && <span>Mais</span>}
            </button>
          </DropdownMenuTrigger>
        </SidebarMenuButton>
        <DropdownMenuContent
          side={collapsed ? "right" : "right"}
          align="start"
          className="min-w-[200px]"
        >
          {moreItems.map((item) => (
            <DropdownMenuItem
              key={item.url}
              onClick={() => navigate(item.url)}
              className={cn("cursor-pointer gap-2 text-sm", isActive(item.url) && "bg-accent")}
            >
              <item.icon className="h-4 w-4" />
              {item.title}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );

  return (
    <Sidebar collapsible="icon" className="border-r border-border/40">
      <SidebarHeader className="border-b border-border/30 bg-sidebar px-3 py-3">
        <Link
          to="/dashboard"
          className={cn("flex items-center transition-all duration-200", collapsed ? "justify-center" : "gap-2")}
        >
          <img
            src={collapsed ? kivoSymbol : kivoLogo}
            alt="Kivo"
            className={cn("object-contain", collapsed ? "h-6 w-6" : "h-6")}
          />
        </Link>

        {!collapsed && currentWorkspace && (
          <div className="mt-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Store className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">{currentWorkspace.name || "Minha Loja"}</span>
            </div>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="bg-sidebar px-2 py-3">
        {!collapsed ? (
          <Button size="sm" className="mb-3 h-8 w-full gap-2 text-xs" onClick={() => navigate("/products/new")}>
            <Plus className="h-3.5 w-3.5" />
            Criar produto
          </Button>
        ) : (
          <div className="mb-3 flex justify-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" className="h-8 w-8" onClick={() => navigate("/products/new")}>
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Criar produto</TooltipContent>
            </Tooltip>
          </div>
        )}

        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {primaryItems.map(renderNavItem)}
              {renderMoreMenu()}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup className="mt-3 border-t border-border/30 pt-3 p-0">
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1">
                {adminItems.map(renderNavItem)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-border/30 bg-sidebar px-3 py-2.5">
        <div className={cn("flex items-center", collapsed ? "justify-center" : "gap-2")}>
          {collapsed ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="rounded-full focus:outline-none focus:ring-2 focus:ring-ring">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={resolvedAvatar || ""} />
                    <AvatarFallback className="text-[11px] font-semibold text-muted-foreground bg-muted">
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
              <Avatar className="h-8 w-8 flex-shrink-0">
                <AvatarImage src={resolvedAvatar || ""} />
                <AvatarFallback className="text-[11px] font-semibold text-muted-foreground bg-muted">
                  {getInitials(displayName, user?.email)}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">{displayName}</span>
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
