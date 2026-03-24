import { useState, useEffect, useCallback } from "react";
import {
  Home, DollarSign, Store, BarChart3, Settings, LogOut, Package, Users,
  UserCheck, Tag, Mail, MessagesSquare, Receipt, Send, Activity, Rocket,
  Shield, Zap, MessageSquare, CalendarDays, CalendarCheck, ChevronRight,
  Plus, CreditCard, Heart, FileText
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
    label: "Vendas",
    items: [
      { title: "Produtos", url: "/products", icon: Package },
      { title: "Cupons", url: "/coupons", icon: Tag },
      { title: "Clientes", url: "/clients", icon: Heart },
      { title: "Logs Pagamento", url: "/payment-logs", icon: FileText },
    ],
  },
  {
    label: "Audiência",
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

  // Determine which group contains the active route to auto-open it
  const activeGroupLabel = [...creatorGroups, ...(isAdmin ? [adminGroup] : [])]
    .find(g => g.items.some(i => location.pathname.startsWith(i.url)))?.label;

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const stored = loadOpenGroups();
    // Auto-open the group with the active route
    if (activeGroupLabel && stored[activeGroupLabel] === undefined) {
      stored[activeGroupLabel] = true;
    }
    return stored;
  });

  // Auto-open group when route changes
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

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + "/");

  const renderGroup = (group: NavGroup) => {
    const hasActive = group.items.some(i => isActive(i.url));
    const isOpen = openGroups[group.label] ?? hasActive;

    // Single-item groups render without collapsible
    if (group.items.length === 1) {
      const item = group.items[0];
      return (
        <SidebarMenuItem key={group.label}>
          <SidebarMenuButton asChild>
            <NavLink
              to={item.url}
              end
              className="hover:bg-muted/50 rounded-md px-3 py-2.5 text-[14px]"
              activeClassName="bg-primary/10 text-primary font-medium hover:bg-primary/15"
            >
              <item.icon className="flex-shrink-0 w-5 h-5" />
              {!collapsed && <span className="ml-3">{item.title}</span>}
            </NavLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    }

    return (
      <Collapsible key={group.label} open={collapsed ? false : isOpen} onOpenChange={() => toggleGroup(group.label)}>
        <CollapsibleTrigger asChild>
          <button
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-muted/50 transition-colors",
              hasActive && "text-primary"
            )}
          >
            {!collapsed && (
              <>
                <ChevronRight className={cn(
                  "h-3.5 w-3.5 transition-transform duration-200",
                  isOpen && "rotate-90"
                )} />
                <span>{group.label}</span>
              </>
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenu className="mt-0.5 space-y-0.5 pl-1">
            {group.items.map(item => (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton asChild>
                  <NavLink
                    to={item.url}
                    end={item.url === "/circle" ? false : true}
                    className="hover:bg-muted/50 rounded-md px-3 py-2 text-[14px]"
                    activeClassName="bg-primary/10 text-primary font-medium hover:bg-primary/15"
                  >
                    <item.icon className="flex-shrink-0 w-5 h-5" />
                    {!collapsed && <span className="ml-3">{item.title}</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <Sidebar collapsible="icon" className="w-60">
      <SidebarHeader className="border-b border-border/40 bg-sidebar">
        <div className="flex items-center justify-center p-4 group-data-[collapsible=icon]:group-data-[state=collapsed]:p-2 px-5 py-5">
          <img
            src="/src/assets/kivo-logo.svg"
            alt="Kivo"
            className="w-full h-auto max-h-12 group-data-[collapsible=icon]:group-data-[state=collapsed]:max-h-8 text-center object-contain px-0 mx-1 my-1"
          />
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 bg-sidebar overflow-y-auto">
        {/* CTA Criar Produto */}
        {!collapsed && (
          <div className="px-2 pt-3 pb-1">
            <Button
              size="sm"
              className="w-full gap-2 text-sm"
              onClick={() => navigate("/products/new")}
            >
              <Plus className="h-4 w-4" />
              Criar produto
            </Button>
          </div>
        )}

        {/* Creator Navigation Groups */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {creatorGroups.map(renderGroup)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Admin Section */}
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1">
                {renderGroup(adminGroup)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

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
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{user?.email?.split("@")[0] || "Usuário"}</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email || ""}</p>
                </div>
              )}
            </div>
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
