import { useState, useEffect, useCallback } from "react";
import {
  Home, DollarSign, Store, BarChart3, Settings, LogOut, Package, Users,
  UserCheck, Tag, Mail, MessagesSquare, Receipt, Send, Activity, Rocket,
  Shield, Zap, MessageSquare, CalendarDays, CalendarCheck, ChevronRight,
  Plus, Heart, FileText, Megaphone, Truck, Wallet, Wrench, ShieldCheck
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader,
  useSidebar
} from "@/components/ui/sidebar";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthProvider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { isAdminUser } from "@/lib/admin";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

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
    items: [
      { title: "Produtos", url: "/products", icon: Package },
      { title: "Cupons", url: "/coupons", icon: Tag },
      { title: "Clientes", url: "/clients", icon: Heart },
      { title: "Logs Pagamento", url: "/payment-logs", icon: FileText },
    ],
  },
  {
    label: "Marketing",
    items: [
      { title: "Leads", url: "/leads", icon: UserCheck },
      { title: "Email Flows", url: "/email-flows", icon: Mail },
      { title: "Campanhas", url: "/email-campaigns", icon: Send },
      { title: "Afiliados", url: "/affiliates", icon: Users },
    ],
  },
  {
    label: "Entrega",
    items: [
      { title: "Circles", url: "/circle", icon: MessagesSquare },
      { title: "Agendamentos", url: "/appointments", icon: CalendarCheck },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { title: "Renda", url: "/earnings", icon: DollarSign },
      { title: "Fiscal", url: "/fiscal", icon: Receipt },
    ],
  },
  {
    label: "Configurações",
    items: [
      { title: "Minha Loja", url: "/store", icon: Store },
      { title: "Analytics", url: "/analytics", icon: BarChart3 },
      { title: "Configurações", url: "/settings", icon: Settings },
    ],
  },
];

const adminGroup: NavGroup = {
  label: "Admin",
  items: [
    { title: "Executivo", url: "/analytics/executive", icon: Activity },
    { title: "GTM", url: "/gtm", icon: Rocket },
    { title: "Ops", url: "/ops", icon: Shield },
    { title: "Launch", url: "/ops/launch", icon: Zap },
    { title: "Feedback", url: "/ops/feedback", icon: MessageSquare },
    { title: "Semana 1", url: "/ops/week-plan", icon: CalendarDays },
  ],
};

const STORAGE_KEY = "kivo-sidebar-groups";

function loadOpenGroups(): Record<string, boolean> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return {};
}

function saveOpenGroups(state: Record<string, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
  const { signOut, user } = useAuth();
  const isAdmin = isAdminUser(user);

  const allGroups = [...creatorGroups, ...(isAdmin ? [adminGroup] : [])];
  const activeGroupLabel = allGroups.find(g =>
    g.items.some(i => location.pathname === i.url || location.pathname.startsWith(i.url + "/"))
  )?.label;

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const stored = loadOpenGroups();
    if (activeGroupLabel && stored[activeGroupLabel] === undefined) {
      stored[activeGroupLabel] = true;
    }
    return stored;
  });

  useEffect(() => {
    if (activeGroupLabel && !openGroups[activeGroupLabel]) {
      setOpenGroups(prev => {
        const next = { ...prev, [activeGroupLabel]: true };
        saveOpenGroups(next);
        return next;
      });
    }
  }, [activeGroupLabel]);

  const toggleGroup = useCallback((label: string) => {
    setOpenGroups(prev => {
      const next = { ...prev, [label]: !prev[label] };
      saveOpenGroups(next);
      return next;
    });
  }, []);

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  const renderNavItem = (item: NavItem) => {
    const active = isActive(item.url);
    return (
      <SidebarMenuItem key={item.url}>
        <SidebarMenuButton asChild>
          <NavLink
            to={item.url}
            end={item.url !== "/circle"}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium transition-colors",
              "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
            activeClassName="bg-[hsl(var(--nav-active-bg))] text-[hsl(var(--nav-active-foreground))] hover:bg-[hsl(var(--nav-active-bg))]"
          >
            <item.icon className="flex-shrink-0 w-[18px] h-[18px]" />
            {!collapsed && <span>{item.title}</span>}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  const renderGroup = (group: NavGroup) => {
    const hasActive = group.items.some(i => isActive(i.url));
    const isOpen = openGroups[group.label] ?? hasActive;

    // Single-item groups: render flat
    if (group.items.length === 1) {
      return (
        <div key={group.label}>
          {renderNavItem(group.items[0])}
        </div>
      );
    }

    return (
      <Collapsible
        key={group.label}
        open={collapsed ? false : isOpen}
        onOpenChange={() => toggleGroup(group.label)}
      >
        <CollapsibleTrigger asChild>
          <button
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors",
              "text-muted-foreground/70 hover:text-foreground",
              hasActive && "text-foreground"
            )}
          >
            {!collapsed && (
              <>
                <ChevronRight className={cn(
                  "h-3 w-3 transition-transform duration-200",
                  isOpen && "rotate-90"
                )} />
                <span>{group.label}</span>
              </>
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenu className="mt-0.5 space-y-0.5">
            {group.items.map(renderNavItem)}
          </SidebarMenu>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <Sidebar collapsible="icon" className="w-56 border-r border-border/50">
      <SidebarHeader className="border-b border-border/30 bg-sidebar px-4 py-3">
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:group-data-[state=collapsed]:justify-center">
          <img
            src="/src/assets/kivo-logo.svg"
            alt="Kivo"
            className="h-7 group-data-[collapsible=icon]:group-data-[state=collapsed]:h-6 object-contain"
          />
        </div>
        {/* Workspace select placeholder */}
        {!collapsed && currentWorkspace && (
          <div className="mt-2 px-1">
            <div className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground">
              <Store className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">{currentWorkspace.name || "Minha Loja"}</span>
            </div>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="px-2 py-2 bg-sidebar overflow-y-auto">
        {/* CTA */}
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

        {/* Creator groups */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {creatorGroups.map(renderGroup)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Admin */}
        {isAdmin && (
          <SidebarGroup className="mt-2 pt-2 border-t border-border/30">
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1">
                {renderGroup(adminGroup)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Footer: user + logout */}
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <div className="flex items-center gap-2.5 px-3 py-2 border-t border-border/30 mt-2 pt-3">
              <Avatar className="h-7 w-7 flex-shrink-0">
                <AvatarImage src="" />
                <AvatarFallback className="text-[10px] bg-muted text-muted-foreground font-medium">
                  {user?.email?.charAt(0).toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate text-foreground">
                    {user?.email?.split("@")[0] || "Usuário"}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {user?.email || ""}
                  </p>
                </div>
              )}
            </div>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Button
                    variant="ghost"
                    className="w-full justify-start hover:bg-muted/50 rounded-md px-3 py-2 h-auto text-xs text-muted-foreground"
                    onClick={signOut}
                  >
                    <LogOut className="mr-2 h-4 w-4 flex-shrink-0" />
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
