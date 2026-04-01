import { ReactNode, useState } from "react";
import MessagesPopover from "@/components/circle/MessagesPopover";
import CircleRightSidebarSkool from "@/components/circle/CircleRightSidebarSkool";
import CircleAdminModal from "@/components/circle/admin/CircleAdminModal";
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
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
  Bell,
  ChevronLeft,
  LogIn,
  ShieldX,
  Clock,
  ShoppingCart,
  UserPlus,
  Eye,
  Lock,
  Mail,
  SlidersHorizontal,
  LayoutGrid,
  Star,
  Settings,
  User,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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

interface CircleLayoutProps {
  children: ReactNode;
  showRightSidebar?: boolean;
}

function getTabItems(slug: string) {
  return [
    { label: "Comunidade", icon: MessageSquare, path: `/circles/${slug}/feed` },
    { label: "Classroom", icon: BookOpen, path: `/circles/${slug}/classroom` },
    { label: "Calendário", icon: Calendar, path: `/circles/${slug}/events` },
    { label: "Membros", icon: Users, path: `/circles/${slug}/members` },
    { label: "Ranking", icon: Trophy, path: `/circles/${slug}/leaderboard` },
    { label: "Sobre", icon: Star, path: `/circles/${slug}/about` },
  ];
}

export default function CircleLayout({ children, showRightSidebar = true }: CircleLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const { currentWorkspace } = useWorkspace();
  const { user, loading: authLoading, signOut } = useAuth();
  const queryClient = useQueryClient();

  const [showAdminModal, setShowAdminModal] = useState(false);

  const tabItems = slug ? getTabItems(slug) : [];

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

  const { data: previewPosts } = useQuery({
    queryKey: ["circle-preview-posts", community?.id],
    queryFn: async () => {
      if (!community) return [];
      const { data } = await supabase
        .from("community_posts")
        .select("*, author:community_members!author_id(display_name, avatar_url)")
        .eq("community_id", community.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(3);
      return data || [];
    },
    enabled: !!community && !member,
  });

  const joinCommunity = useMutation({
    mutationFn: async () => {
      if (!community || !user) throw new Error("Missing data");
      const status = community.require_approval ? "PENDING" : "ACTIVE";
      const { error } = await supabase.from("community_members").insert({
        community_id: community.id,
        user_id: user.id,
        role: "MEMBER",
        status,
        display_name: user.email?.split("@")[0] || "Membro",
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
      const { error } = await supabase.from("community_members").insert({
        community_id: community.id,
        user_id: user.id,
        role: "MEMBER",
        status: "ACTIVE",
        display_name: user.email?.split("@")[0] || "Membro",
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

  // Not logged in — redirect to community landing
  if (!user) {
    return <Navigate to={`/circles/${slug}`} replace />;
  }

  // No community
  if (!community) {
    return children;
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

    // Landing page for non-members (OPEN / FREE_WITH_PRODUCT)
    return (
      <div className="min-h-screen bg-background">
        <div className="relative h-48 md:h-64 bg-gradient-to-br from-primary/20 via-primary/10 to-muted overflow-hidden">
          {community.cover_image_url && (
            <img src={community.cover_image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
        </div>
        <div className="max-w-2xl mx-auto px-4 -mt-16 relative z-10 pb-12">
          <div className="flex items-end gap-4 mb-6">
            {community.icon_url ? (
              <img src={community.icon_url} alt="" className="h-20 w-20 rounded-2xl object-cover border-4 border-background shadow-lg" />
            ) : (
              <div className="h-20 w-20 rounded-2xl bg-primary/10 border-4 border-background shadow-lg flex items-center justify-center">
                <MessageSquare className="h-8 w-8 text-primary" />
              </div>
            )}
            <div className="pb-1">
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">{community.name}</h1>
              <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                <span className="flex items-center gap-1"><Users className="h-4 w-4" />{community.member_count} membros</span>
                <span className="flex items-center gap-1"><MessageSquare className="h-4 w-4" />{community.post_count} posts</span>
              </div>
            </div>
          </div>
          {community.description && <p className="text-muted-foreground mb-6">{community.description}</p>}
          <div className="mb-8">
            {community.access_type === "OPEN" && (
              <Button size="lg" onClick={() => joinCommunity.mutate()} disabled={joinCommunity.isPending} className="w-full md:w-auto">
                <UserPlus className="h-5 w-5 mr-2" />
                {community.require_approval ? "Solicitar Entrada" : "Entrar na Comunidade"}
              </Button>
            )}
            {community.access_type === "FREE_WITH_PRODUCT" && (
              <>
                {hasEntitlement ? (
                  <Button size="lg" onClick={() => { if (!autoJoin.isPending && !autoJoin.isSuccess) autoJoin.mutate(); }} disabled={autoJoin.isPending} className="w-full md:w-auto">
                    <UserPlus className="h-5 w-5 mr-2" />Entrar na Comunidade
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Lock className="h-4 w-4" /><span>Acesso incluso na compra do produto vinculado</span>
                    </div>
                    <Button size="lg" onClick={() => navigate(`/checkout/${community.linked_product_id}`)} className="w-full md:w-auto">
                      <ShoppingCart className="h-5 w-5 mr-2" />Comprar para Acessar
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
          {previewPosts && previewPosts.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Posts recentes</h3>
              {previewPosts.map((post: any, i: number) => (
                <Card key={post.id} className={cn("p-4 relative overflow-hidden", i > 0 && "blur-[2px] pointer-events-none select-none")}>
                  <div className="flex items-start gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={post.author?.avatar_url || undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {(post.author?.display_name || "U").charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm">{post.author?.display_name || "Membro"}</span>
                      <h4 className="font-semibold text-foreground mt-1">{post.title}</h4>
                      {post.body && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{post.body}</p>}
                    </div>
                  </div>
                </Card>
              ))}
              <div className="text-center">
                <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                  <Eye className="h-4 w-4" /> Entre para ver todos os posts
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
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
            {children}
          </div>
          {/* Right sidebar ~35% — desktop only, hidden on classroom and settings */}
          {showRightSidebar && !location.pathname.includes("/classroom") && !location.pathname.includes("/settings") && (
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
