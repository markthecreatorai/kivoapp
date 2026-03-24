import { useState, useEffect, useCallback } from "react";
import {
  Home, DollarSign, Store, BarChart3, Settings, LogOut, Package, Users,
  UserCheck, Tag, Mail, MessagesSquare, Receipt, Send, Activity, Rocket,
  Shield, Zap, MessageSquare, CalendarDays, CalendarCheck, ChevronRight,
  Plus, Heart, FileText, Megaphone, Truck, Wallet, Wrench, ShieldCheck,
  MoreVertical, User,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader,
  SidebarFooter, useSidebar
} from "@/components/ui/sidebar";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthProvider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { isAdminUser } from "@/lib/admin";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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

interface NavGroup {
  label: string;
  icon?: React.ElementType;
  items: NavItem[];
}

const creatorGroups: NavGroup[] = [
  {
    label: "Visão Geral",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: Home },
    ],
  },
  {
    label: "Sua Loja",
    icon: Store,
    items: [
      { title: "Minha Loja", url: "/store", icon: Store },
      { title: "Produtos", url: "/products", icon: Package },
      { title: "Cupons", url: "/coupons", icon: Tag },
      { title: "Clientes", url: "/clients", icon: Heart },
      { title: "Logs Pagamento", url: "/payment-logs", icon: FileText },
    ],
  },
  {
    label: "Marketing",
    icon: Megaphone,
    items: [
      { title: "Leads", url: "/leads", icon: UserCheck },
      { title: "Email Flows", url: "/email-flows", icon: Mail },
      { title: "Campanhas", url: "/email-campaigns", icon: Send },
      { title: "Afiliados", url: "/affiliates", icon: Users },
    ],
  },
  {
    label: "Entrega",
    icon: Truck,
    items: [
      { title: "Circles", url: "/circle", icon: MessagesSquare },
      { title: "Agendamentos", url: "/appointments", icon: CalendarCheck },
    ],
  },
  {
    label: "Financeiro",
    icon: Wallet,
    items: [
      { title: "Renda", url: "/earnings", icon: DollarSign },
      { title: "Fiscal", url: "/fiscal", icon: Receipt },
    ],
  },
  {
    label: "Configurações",
    icon: Wrench,
    items: [
      { title: "Analytics", url: "/analytics", icon: BarChart3 },
      { title: "Configurações", url: "/settings", icon: Settings },
    ],
  },
];

const adminGroup: NavGroup = {
  label: "Admin",
  icon: ShieldCheck,
  items: [
    { title: "Executivo", url: "/analytics/executive", icon: Activity },
    { title: "GTM", url: "/gtm", icon: Rocket },
    { title: "Ops", url: "/ops", icon: Shield },
    { title: "Launch", url: "/ops/launch", icon: Zap },
    { title: "Feedback", url: "/ops/feedback", icon: MessageSquare },
    { title: "Semana 1", url: "/ops/week-plan", icon: CalendarDays },
  ],
};

const STORAGE_KEY = "kivo-sidebar-open";

function loadOpenGroup(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY) || null;
  } catch {}
  return null;
}

function saveOpenGroup(label: string | null) {
  try {
    if (label) localStorage.setItem(STORAGE_KEY, label);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

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

  const resolvedAvatar = avatarUrl
    || user?.user_metadata?.avatar_url
    || user?.user_metadata?.picture
    || null;

  const displayName = user?.user_metadata?.full_name
    || user?.user_metadata?.name
    || user?.email?.split("@")[0]
    || "Usuário";

  const allGroups = [...creatorGroups, ...(isAdmin ? [adminGroup] : [])];
  const activeGroupLabel = allGroups.find(g =>
    g.items.some(i => location.pathname === i.url || location.pathname.startsWith(i.url + "/"))
  )?.label;

  const [openGroup, setOpenGroup] = useState<string | null>(() => {
    const stored = loadOpenGroup();
    return stored || activeGroupLabel || null;
  });

  useEffect(() => {
    if (activeGroupLabel && openGroup !== activeGroupLabel) {
      setOpenGroup(activeGroupLabel);
      saveOpenGroup(activeGroupLabel);
    }
  }, [activeGroupLabel]);

  const toggleGroup = useCallback((label: string) => {
    setOpenGroup(prev => {
      const next = prev === label ? null : label;
      saveOpenGroup(next);
      return next;
    });
  }, []);

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  /* ── Single nav item (no group parent, e.g. Dashboard) ── */
  const renderNavItem = (item: NavItem) => (
    <SidebarMenuItem key={item.url}>
      <SidebarMenuButton asChild tooltip={collapsed ? item.title : undefined}>
        <NavLink
          to={item.url}
          end={item.url !== "/circle"}
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium transition-colors",
            "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            collapsed && "justify-center px-0"
          )}
          activeClassName="bg-[hsl(var(--nav-active-bg))] text-[hsl(var(--nav-active-foreground))] hover:bg-[hsl(var(--nav-active-bg))]"
        >
          <item.icon className="flex-shrink-0 w-[18px] h-[18px]" />
          {!collapsed && <span>{item.title}</span>}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  /* ── Collapsed: group icon with dropdown submenu ── */
  const renderCollapsedGroup = (group: NavGroup) => {
    const hasActive = group.items.some(i => isActive(i.url));
    const GroupIcon = group.icon || Home;

    return (
      <SidebarMenuItem key={group.label}>
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "flex w-full items-center justify-center rounded-md p-2 transition-colors",
                    "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    hasActive && "text-[hsl(var(--nav-active-foreground))] bg-[hsl(var(--nav-active-bg))]"
                  )}
                >
                  <GroupIcon className="h-[18px] w-[18px] flex-shrink-0" />
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="right">{group.label}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent side="right" align="start" className="min-w-[160px]">
            {group.items.map(item => (
              <DropdownMenuItem
                key={item.url}
                onClick={() => navigate(item.url)}
                className={cn(
                  "gap-2 text-sm cursor-pointer",
                  isActive(item.url) && "bg-accent font-medium"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.title}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    );
  };

  /* ── Expanded: collapsible group with inline submenu ── */
  const renderExpandedGroup = (group: NavGroup) => {
    const hasActive = group.items.some(i => isActive(i.url));
    const isOpen = openGroup === group.label;

    return (
      <Collapsible
        key={group.label}
        open={isOpen}
        onOpenChange={() => toggleGroup(group.label)}
      >
        <CollapsibleTrigger asChild>
          <button
            className={cn(
              "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors",
              "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              hasActive && "text-foreground"
            )}
          >
            {group.icon && <group.icon className="h-[18px] w-[18px] flex-shrink-0" />}
            <span className="flex-1 text-left">{group.label}</span>
            <ChevronRight className={cn(
              "h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/50 transition-transform duration-200",
              isOpen && "rotate-90"
            )} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="relative ml-[22px] mt-1 mb-1">
            <div className="absolute left-0 top-0 bottom-0 w-px bg-border/60" />
            <SidebarMenu className="space-y-px pl-4">
              {group.items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url !== "/circle"}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-normal transition-colors",
                        "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      )}
                      activeClassName="bg-[hsl(var(--nav-active-bg))] text-[hsl(var(--nav-active-foreground))] font-medium hover:bg-[hsl(var(--nav-active-bg))]"
                    >
                      <item.icon className="flex-shrink-0 w-4 h-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  const renderGroup = (group: NavGroup) => {
    // Single-item groups render as a direct link
    if (group.items.length === 1) {
      return <div key={group.label}>{renderNavItem(group.items[0])}</div>;
    }
    return collapsed ? renderCollapsedGroup(group) : renderExpandedGroup(group);
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-border/50">
      {/* ── Header: Logo ── */}
      <SidebarHeader className="border-b border-border/30 bg-sidebar px-3 py-3">
        <div className={cn(
          "flex items-center transition-all duration-200",
          collapsed ? "justify-center" : "gap-2"
        )}>
          <img
            src={collapsed ? kivoSymbol : kivoLogo}
            alt="Kivo"
            className={cn(
              "object-contain transition-all duration-200",
              collapsed ? "h-6 w-6" : "h-7"
            )}
          />
        </div>
        {!collapsed && currentWorkspace && (
          <div className="mt-2 px-1">
            <div className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground">
              <Store className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">{currentWorkspace.name || "Minha Loja"}</span>
            </div>
          </div>
        )}
      </SidebarHeader>

      {/* ── Content ── */}
      <SidebarContent className="px-2 py-2 bg-sidebar overflow-y-auto overflow-x-hidden">
        {!collapsed && (
          <div className="px-1 pb-2">
            <Button
              size="sm"
              className="w-full gap-2 text-xs h-8"
              onClick={() => navigate("/products/new")}
            >
              <Plus className="h-3.5 w-3.5" />
              Criar produto
            </Button>
          </div>
        )}

        {collapsed && (
          <div className="flex justify-center pb-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="default"
                  className="h-8 w-8"
                  onClick={() => navigate("/products/new")}
                >
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
              {creatorGroups.map(renderGroup)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup className="mt-2 pt-2 border-t border-border/30 p-0">
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1">
                {renderGroup(adminGroup)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* ── Footer: compact user block ── */}
      <SidebarFooter className="border-t border-border/30 bg-sidebar p-2">
        <div className={cn(
          "flex items-center transition-all duration-200",
          collapsed ? "justify-center" : "gap-2.5"
        )}>
          {collapsed ? (
            /* Collapsed: avatar as dropdown trigger */
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="rounded-full focus:outline-none focus:ring-2 focus:ring-ring">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={resolvedAvatar || ""} />
                    <AvatarFallback className="text-[11px] bg-muted text-muted-foreground font-semibold">
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
                <DropdownMenuItem onClick={signOut} className="gap-2 text-sm text-destructive focus:text-destructive">
                  <LogOut className="h-4 w-4" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            /* Expanded: avatar + name + ⋮ */
            <>
              <Avatar className="h-8 w-8 flex-shrink-0">
                <AvatarImage src={resolvedAvatar || ""} />
                <AvatarFallback className="text-[11px] bg-muted text-muted-foreground font-semibold">
                  {getInitials(displayName, user?.email)}
                </AvatarFallback>
              </Avatar>
              <span className="flex-1 min-w-0 text-[13px] font-medium text-foreground truncate">
                {displayName}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex-shrink-0 p-1 rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors">
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
                  <DropdownMenuItem onClick={signOut} className="gap-2 text-sm text-destructive focus:text-destructive">
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