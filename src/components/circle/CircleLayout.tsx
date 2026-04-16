import { Suspense, useState } from "react";
import MessagesPopover from "@/components/circle/MessagesPopover";
import CircleRightSidebarSkool from "@/components/circle/CircleRightSidebarSkool";
import CircleAdminModal from "@/components/circle/admin/CircleAdminModal";
import { Link, Navigate, Outlet, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { PageSkeleton } from "@/components/PageSkeleton";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { useAuth } from "@/contexts/AuthProvider";
import { useDailyLogin } from "@/hooks/useDailyLogin";
import { notifyMemberJoined } from "@/lib/notifications";
import CirclePaywall from "@/components/circle/CirclePaywall";
import CommunitySwitcher from "@/components/circle/CommunitySwitcher";
import {
  MessageSquare,
  Users,
  Calendar,
  BookOpen,
  LogIn,
  ShieldX,
  Clock,
  UserPlus,
  Eye,
  SlidersHorizontal,
  Star,
  Settings,
  User,
  LogOut,
  Trophy,
  ArrowLeft,
  FolderOpen,
  ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import NotificationPanel from "@/components/circle/NotificationPanel";
import LevelBadge from "@/components/circle/LevelBadge";

// Level thresholds
export const LEVEL_THRESHOLDS = [
  { level: 1, min: 0, label: "Level 1" },
  { level: 2, min: 50, label: "Level 2" },
  { level: 3, min: 150, label: "Level 3" },
  { level: 4, min: 350, label: "Level 4" },
  { level: 5, min: 750, label: "Level 5" },
  { level: 6, min: 1200, label: "Level 6" },
  { level: 7, min: 2000, label: "Level 7" },
  { level: 8, min: 3500, label: "Level 8" },
  { level: 9, min: 5000, label: "Level 9" },
];

export function getLevelInfo(points: number) {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (points >= LEVEL_THRESHOLDS[i].min) return LEVEL_THRESHOLDS[i];
  }
  return LEVEL_THRESHOLDS[0];
}

// No more props — layout is persistent via Outlet

const ALL_TABS: Record<string, { label: string; icon: typeof MessageSquare; pathSuffix: string }> = {
  feed: { label: "Comunidade", icon: MessageSquare, pathSuffix: "feed" },
  classroom: { label: "Classroom", icon: BookOpen, pathSuffix: "classroom" },
  members: { label: "Membros", icon: Users, pathSuffix: "members" },
  leaderboard: { label: "Ranking", icon: Trophy, pathSuffix: "leaderboard" },
  events: { label: "Calendário", icon: Calendar, pathSuffix: "events" },
  resources: { label: "Recursos", icon: FolderOpen, pathSuffix: "resources" },
  tasks: { label: "Tarefas", icon: ListChecks, pathSuffix: "tasks" },
  about: { label: "Sobre", icon: Star, pathSuffix: "about" },
};

const DEFAULT_TAB_ORDER = ["feed", "classroom", "members", "leaderboard", "events", "resources", "tasks", "about"];

function getTabItems(slug: string, community?: any) {
  const tabsConfig = community?.tabs_config as Record<string, boolean> | null;
  const tabsOrder = community?.tabs_order as string[] | null;

  const order = tabsOrder?.length ? tabsOrder : DEFAULT_TAB_ORDER;

  return order
    .filter((key) => {
      const tab = ALL_TABS[key];
      if (!tab) return false;
      // If tabs_config exists, respect it; otherwise default all to true
      if (tabsConfig && typeof tabsConfig[key] === "boolean") return tabsConfig[key];
      return true;
    })
    .map((key) => ({
      label: ALL_TABS[key].label,
      icon: ALL_TABS[key].icon,
      path: `/circles/${slug}/${ALL_TABS[key].pathSuffix}`,
    }));
}

export default function CircleLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const { currentWorkspace, userWorkspaces } = useWorkspace();
  const { user, loading: authLoading, signOut } = useAuth();
  const queryClient = useQueryClient();

  const [showAdminModal, setShowAdminModal] = useState(false);

  // tabItems defined below after community query

  // Load community by slug from URL
  const { data: community, isLoading: communityLoading } = useQuery({
    queryKey: ["community-slug", slug],
    queryFn: async () => {
      if (!slug) return null;
      const { data } = await supabase
        .from("communities")
        .select("*")
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();
      return data;
    },
    enabled: !!slug,
  });

  const tabItems = slug ? getTabItems(slug, community) : [];

  const { data: member, isLoading: memberLoading } = useQuery({
    queryKey: ["circle-member", community?.id, user?.id],
    queryFn: async () => {
      if (!community || !user) return null;
      const { data } = await supabase
        .from("community_members")
        .select("*")
        .eq("community_id", community.id)
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!community && !!user,
  });

  const { data: hasEntitlement } = useQuery({
    queryKey: ["circle-entitlement", community?.linked_product_id, user?.id],
    queryFn: async () => {
      if (!community?.linked_product_id || !user) return false;
      const { data } = await supabase
        .from("entitlements" as any)
        .select("id")
        .eq("product_id", community.linked_product_id)
        .is("revoked_at", null)
        .limit(1);
      return ((data as any[])?.length || 0) > 0;
    },
    enabled: !!community?.linked_product_id && !!user && community?.access_type === "FREE_WITH_PRODUCT",
  });

  // Check circle subscription status for PAID_SUBSCRIPTION communities
  const { data: subscriptionData } = useQuery({
    queryKey: ["circle-subscription", community?.id, user?.id],
    queryFn: async () => {
      if (!community || !user) return null;
      const { data } = await supabase
        .from("circle_subscriptions" as any)
        .select("id, status")
        .eq("community_id", community.id)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);
      const sub = (data as any[])?.[0] || null;
      return sub;
    },
    enabled: !!community && !!user && community?.access_type === "PAID_SUBSCRIPTION",
  });

  const { data: unreadCount } = useQuery({
    queryKey: ["circle-unread", member?.id],
    queryFn: async () => {
      if (!member) return 0;
      const { count } = await supabase
        .from("community_notifications")
        .select("*", { count: "exact", head: true })
        .eq("recipient_id", member.id)
        .eq("is_read", false);
      return count || 0;
    },
    enabled: !!member,
  });

  // Unread DM count
  const { data: dmUnreadCount } = useQuery({
    queryKey: ["circle-dm-unread", member?.id],
    queryFn: async () => {
      if (!member) return 0;
      const { data: memberships } = await supabase
        .from("community_conversation_members" as any)
        .select("conversation_id, last_read_at")
        .eq("member_id", member.id);
      if (!memberships?.length) return 0;

      let unread = 0;
      for (const m of memberships as any[]) {
        const q = supabase
          .from("community_messages" as any)
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", m.conversation_id)
          .neq("sender_id", member.id)
          .is("deleted_at", null);
        if (m.last_read_at) {
          q.gt("created_at", m.last_read_at);
        }
        const { count } = await q;
        unread += count || 0;
      }
      return unread;
    },
    enabled: !!member,
  });


  const joinCommunity = useMutation({
    mutationFn: async () => {
      if (!community || !user) throw new Error("Missing data");
      const status = community.require_approval ? "PENDING" : "ACTIVE";
      const { error } = await supabase.rpc("join_community", {
        p_community_id: community.id,
        p_user_id: user.id,
        p_display_name: user.email?.split("@")[0] || "Membro",
        p_role: "MEMBER",
        p_status: status,
      });
      if (error) throw error;
      return status;
    },
    onSuccess: (status) => {
      queryClient.invalidateQueries({ queryKey: ["circle-member"] });
      queryClient.invalidateQueries({ queryKey: ["community"] });
      if (status === "PENDING") {
        toast.success("Solicitação enviada! Aguarde aprovação do admin.");
      } else {
        toast.success("Bem-vindo à comunidade!");
        if (community) {
          notifyMemberJoined(community.id, user?.email?.split("@")[0] || "Novo membro", "");
        }
      }
    },
    onError: () => toast.error("Erro ao entrar na comunidade"),
  });

  const autoJoin = useMutation({
    mutationFn: async () => {
      if (!community || !user) throw new Error("Missing");
      const { error } = await supabase.rpc("join_community", {
        p_community_id: community.id,
        p_user_id: user.id,
        p_display_name: user.email?.split("@")[0] || "Membro",
        p_role: "MEMBER",
        p_status: "ACTIVE",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circle-member"] });
      toast.success("Acesso liberado! Bem-vindo à comunidade!");
    },
  });

  const isAdmin = member?.role === "OWNER" || member?.role === "ADMIN";
  const isPreviewVisitor = searchParams.get("preview") === "visitor";
  const isActive = (path: string) => {
    if (path === `/circles/${slug}/feed`) {
      return location.pathname === `/circles/${slug}/feed` ||
        location.pathname === `/circles/${slug}` ||
        location.pathname.startsWith(`/circles/${slug}/spaces/`) ||
        location.pathname.startsWith(`/circles/${slug}/post/`);
    }
    return location.pathname === path || location.pathname.startsWith(path + "/");
  };

  useDailyLogin(member, community);

  // Loading
  if (authLoading || communityLoading || (user && memberLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Check if current route is the /about page (allow without auth/member)
  const isAboutPage = location.pathname.endsWith("/about");

  // No community found — show 404 (before auth check to avoid redirect loops)
  if (!community) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md p-8 text-center space-y-4">
          <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto" />
          <h1 className="text-xl font-bold text-foreground">Comunidade não encontrada</h1>
          <p className="text-sm text-muted-foreground">Esta comunidade não existe ou foi desativada.</p>
          <Button variant="outline" onClick={() => navigate("/circles")}>Ver Comunidades</Button>
        </Card>
      </div>
    );
  }

  // Not logged in — allow about page, redirect others
  if (!user) {
    if (isAboutPage) {
      // Render layout with Outlet for about page (no member needed)
      return (
        <div className="min-h-screen bg-muted/40 flex flex-col">
          <header className="sticky top-0 z-30 bg-card border-b border-border">
            <div className="flex items-center h-14 px-4 max-w-5xl mx-auto">
              <div className="flex items-center gap-2">
                {community.icon_url ? (
                  <img src={community.icon_url} alt="" className="h-8 w-8 rounded-lg object-cover" />
                ) : (
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <MessageSquare className="h-4 w-4 text-primary" />
                  </div>
                )}
                <span className="font-semibold text-foreground">{community.name}</span>
              </div>
              <div className="flex-1" />
              <Button size="sm" onClick={() => navigate(`/login?redirect=/circles/${slug}/about`)}>
                <LogIn className="h-4 w-4 mr-1.5" /> Entrar
              </Button>
            </div>
          </header>
          <main className="flex-1 pb-6">
            <div className="max-w-5xl mx-auto flex flex-col md:flex-row gap-0">
              <div className="flex-1 min-w-0">
                <Suspense fallback={<PageSkeleton />}>
                  <Outlet />
                </Suspense>
              </div>
              <div className="w-full md:w-[340px] shrink-0">
                <CircleRightSidebarSkool
                  community={community}
                  member={null}
                  isAdmin={false}
                  activeTab="about"
                />
              </div>
            </div>
          </main>
        </div>
      );
    }
    return <Navigate to={`/circles/${slug}/about`} replace />;
  }



  // Member status gates
  if (member) {
    if (member.status === "BANNED") {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Card className="max-w-md p-8 text-center space-y-4">
            <ShieldX className="h-12 w-12 text-destructive mx-auto" />
            <h1 className="text-xl font-bold text-foreground">Acesso Negado</h1>
            <p className="text-sm text-muted-foreground">
              Seu acesso foi revogado.
              {member.ban_reason && <span className="block mt-1">Motivo: {member.ban_reason}</span>}
            </p>
            <Button variant="outline" onClick={() => navigate("/dashboard")}>Voltar ao Dashboard</Button>
          </Card>
        </div>
      );
    }
    if (member.status === "PENDING") {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Card className="max-w-md p-8 text-center space-y-4">
            <Clock className="h-12 w-12 text-muted-foreground mx-auto" />
            <h1 className="text-xl font-bold text-foreground">Aguardando Aprovação</h1>
            <p className="text-sm text-muted-foreground">Sua solicitação está pendente de aprovação.</p>
            <Button variant="outline" onClick={() => navigate("/dashboard")}>Voltar</Button>
          </Card>
        </div>
      );
    }
    if (member.status === "LEFT") {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Card className="max-w-md p-8 text-center space-y-4">
            <UserPlus className="h-12 w-12 text-muted-foreground mx-auto" />
            <h1 className="text-xl font-bold text-foreground">Você saiu desta comunidade</h1>
            <Button onClick={() => joinCommunity.mutate()} disabled={joinCommunity.isPending}>Entrar Novamente</Button>
          </Card>
        </div>
      );
    }
  } else {
    // ── PAID_SUBSCRIPTION: show paywall ──
    if (community.access_type === "PAID_SUBSCRIPTION") {
      return <CirclePaywall community={community} />;
    }

    // Non-member: redirect to about page (which shows join button)
    if (!isAboutPage) {
      return <Navigate to={`/circles/${slug}/about`} replace />;
    }
    // If already on about page, fall through to render layout with Outlet
  }

  // ── PAID_SUBSCRIPTION: active member but subscription not active? ──
  const hasActiveSubscription = subscriptionData?.status === "active" || subscriptionData?.status === "trialing";
  const isPastDue = subscriptionData?.status === "past_due";

  if (community.access_type === "PAID_SUBSCRIPTION" && !isAdmin && !hasActiveSubscription) {
    return <CirclePaywall community={community} isPastDue={isPastDue} />;
  }

  // === MAIN LAYOUT — Skool-style ===
  const isMuted = !!(member?.muted_until && new Date(member.muted_until) > new Date());

  const navItems = tabItems;

  // Determine showRightSidebar based on current route
  const hideRightSidebar = location.pathname.includes("/settings") || location.pathname.includes("/profile") || location.pathname.includes("/classroom") || location.pathname.includes("/leaderboard") || location.pathname.includes("/resources") || location.pathname.includes("/tasks");

  return (
    <div className="min-h-screen bg-muted/40 flex flex-col">
      {/* Fixed Header */}
      <header className="sticky top-0 z-30 bg-card border-b border-border">
        <div className="flex items-center h-14 px-4 max-w-5xl mx-auto">
          <div className="flex items-center gap-1 min-w-0">
            <CommunitySwitcher currentCommunity={community} />
          </div>

          <div className="flex-1" />

          {/* Right: level + notifications + avatar */}
          <div className="flex items-center gap-2">
            {member && (
              <span className="text-[11px] text-muted-foreground hidden sm:flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1">
                🔥 {member.current_streak}
                <span className="opacity-60">•</span>
                {member.total_points} pts
              </span>
            )}
            {member && community && (
              <NotificationPanel
                memberId={member.id}
                communityId={community.id}
                unreadCount={unreadCount ?? 0}
              />
            )}
            {member && community && (
              <MessagesPopover
                memberId={member.id}
                communityId={community.id}
                memberDisplayName={member.display_name || undefined}
                unreadCount={dmUnreadCount ?? 0}
              />
            )}
            {member && isAdmin && !isPreviewVisitor && (
              <button
                onClick={() => setShowAdminModal(true)}
                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground"
                title="Configurações"
              >
                <SlidersHorizontal className="h-4 w-4" />
              </button>
            )}
            {member && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="rounded-full focus:outline-none focus:ring-2 focus:ring-ring">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={member.avatar_url || undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {(member.display_name || user?.email || "U").charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <div className="px-3 py-2 border-b border-border">
                    <p className="text-sm font-medium text-foreground truncate">{member.display_name || user?.email?.split("@")[0]}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{member.username ? `@${member.username}` : user?.email}</p>
                  </div>
                  <DropdownMenuItem onClick={() => navigate(`/circles/${slug}/settings?section=profile`)} className="gap-2 text-sm cursor-pointer">
                    <User className="h-4 w-4" /> Perfil da comunidade
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(`/circles/${slug}/settings?section=account`)} className="gap-2 text-sm cursor-pointer">
                    <Settings className="h-4 w-4" /> Configurações da conta
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut} className="gap-2 text-sm text-destructive focus:text-destructive cursor-pointer">
                    <LogOut className="h-4 w-4" /> Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* Muted banner */}
        {isMuted && (
          <div className="px-4 py-1.5 bg-destructive/10 text-destructive text-xs text-center">
            🔇 Somente leitura
          </div>
        )}

        {/* Horizontal Tab Bar — desktop */}
        <nav className="hidden md:flex items-center gap-0 max-w-5xl mx-auto px-4 border-t border-border">
          {navItems.map((item) => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors relative",
                  active
                    ? "border-primary text-primary bg-primary/5"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      {/* Central content — two columns on desktop */}
      <main className="flex-1 pb-20 md:pb-6">
        <div className="max-w-5xl mx-auto flex gap-0">
          {/* Main feed column ~65% */}
          <div className="flex-1 min-w-0">
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </div>
          {/* Right sidebar ~35% — desktop only, hidden on classroom/settings/profile */}
          {!hideRightSidebar && (
            <div className="hidden lg:block w-[340px] shrink-0">
              <div className="sticky top-[108px]">
                <CircleRightSidebarSkool
                community={community}
                member={member}
                onOpenAdmin={() => setShowAdminModal(true)}
              />
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Mobile bottom tab bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-card border-t border-border safe-area-pb">
        <nav className="flex items-center justify-around h-16">
          {navItems.map((item) => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-3 py-2 min-w-0 relative rounded-lg", 
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <item.icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* ── Admin Modal ── */}
      {showAdminModal && community && member && (
        <CircleAdminModal
          community={community}
          member={member}
          onClose={() => setShowAdminModal(false)}
        />
      )}
    </div>
  );
}
