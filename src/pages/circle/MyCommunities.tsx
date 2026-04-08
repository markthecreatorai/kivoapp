import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthProvider";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUserAvatar } from "@/hooks/useUserAvatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import CommunitySwitcher from "@/components/circle/CommunitySwitcher";
import {
  Plus, Users, MessageSquare, Lock, Globe, Crown,
  Loader2, ArrowRight, Settings, ChevronRight,
  LogOut, LogIn,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function slugify(str: string) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

interface CommunityCard {
  id: string;
  name: string;
  slug: string;
  description?: string;
  cover_image_url?: string;
  icon_url?: string;
  member_count?: number;
  access_type?: string;
  is_active?: boolean;
  role?: string;
}

export default function MyCommunities() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const { avatarUrl, initials } = useUserAvatar();
  const queryClient = useQueryClient();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);

  // Fetch communities where user is a member
  const { data: communities = [], isLoading } = useQuery<CommunityCard[]>({
    queryKey: ["my-communities", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("community_members")
        .select(`
          role,
          community:communities(
            id, name, slug, description, cover_image_url,
            icon_url, member_count, access_type, is_active
          )
        `)
        .eq("user_id", user.id)
        .eq("status", "ACTIVE")
        .order("created_at", { ascending: false });

      return ((data || []) as any[])
        .filter((m: any) => m.community?.is_active)
        .map((m: any) => ({ ...m.community, role: m.role }));
    },
    enabled: !!user,
  });

  const createCommunity = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Usuário não autenticado");
      const slug = newSlug || slugify(newName);
      if (!slug) throw new Error("Informe um nome válido");

      // Ensure the session is fresh before any Supabase DB calls
      const { error: sessionErr } = await supabase.auth.refreshSession();
      if (sessionErr) throw new Error("Sessão expirada. Faça login novamente.");

      // Resolve workspace — create one on the fly if user doesn't have one yet
      let workspaceId = currentWorkspace?.id;
      if (!workspaceId) {
        const wsName = user.user_metadata?.full_name || user.email?.split("@")[0] || "Meu Workspace";
        const wsSlug = slugify(wsName) + "-" + Date.now().toString(36);
        const { data: ws, error: wsErr } = await supabase
          .from("workspaces")
          .insert({ name: wsName, slug: wsSlug, owner_id: user.id })
          .select()
          .single();
        if (wsErr) throw new Error("Erro ao preparar workspace: " + wsErr.message);
        workspaceId = ws.id;
        await supabase.from("workspace_members").insert({
          workspace_id: workspaceId,
          user_id: user.id,
          role: "OWNER",
        });
      }

      // Check slug uniqueness
      const { data: existing } = await supabase
        .from("communities")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (existing) throw new Error("Esse link já está em uso. Tente outro nome.");

      // Create community
      const { data: community, error } = await supabase
        .from("communities")
        .insert({
          workspace_id: workspaceId,
          name: newName.trim(),
          slug,
          description: newDescription.trim() || null,
          is_active: true,
          access_type: "OPEN",
          require_approval: false,
        })
        .select()
        .single();
      if (error) throw error;

      // Add creator as OWNER member (uses SECURITY DEFINER to bypass RLS)
      const displayName = user.user_metadata?.full_name || user.email?.split("@")[0] || "Owner";
      await supabase.rpc("join_community", {
        p_community_id: community.id,
        p_user_id: user.id,
        p_display_name: displayName,
        p_role: "OWNER",
        p_status: "ACTIVE",
      });

      // Create default spaces
      const defaultSpaces = [
        { community_id: community.id, name: "Geral", slug: "geral", emoji: "💬", is_default: true, position: 0 },
        { community_id: community.id, name: "Anúncios", slug: "anuncios", emoji: "📢", only_admins_can_post: true, position: 1 },
        { community_id: community.id, name: "Perguntas", slug: "perguntas", emoji: "❓", position: 2 },
        { community_id: community.id, name: "Conquistas", slug: "conquistas", emoji: "🏆", position: 3 },
      ];
      await supabase.from("community_spaces").upsert(defaultSpaces, { onConflict: "community_id,slug", ignoreDuplicates: true });

      return community;
    },
    onSuccess: (community) => {
      toast.success(`Comunidade "${community.name}" criada!`);
      queryClient.invalidateQueries({ queryKey: ["my-communities"] });
      queryClient.invalidateQueries({ queryKey: ["workspace"] });
      setShowCreateModal(false);
      setNewName(""); setNewDescription(""); setNewSlug(""); setSlugEdited(false);
      navigate(`/circles/${community.slug}/about`);
    },
    onError: (err: any) => toast.error(err.message || "Erro ao criar comunidade"),
  });


  const handleNameChange = (val: string) => {
    setNewName(val);
    if (!slugEdited) setNewSlug(slugify(val));
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header — same as CircleLayout / Discovery */}
      <header className="sticky top-0 z-30 bg-card border-b border-border">
        <div className="flex items-center h-14 px-4 max-w-5xl mx-auto">
          <div className="flex items-center gap-1 min-w-0">
            <CommunitySwitcher currentCommunity={null} onCreateCommunity={() => setShowCreateModal(true)} />
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setShowCreateModal(true)} className="gap-2" id="create-community-btn">
              <Plus className="h-4 w-4" /> Nova Comunidade
            </Button>
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="rounded-full focus:outline-none focus:ring-2 focus:ring-ring">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={avatarUrl || ""} />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <div className="px-3 py-2 border-b border-border">
                    <p className="text-sm font-medium text-foreground truncate">{user.email?.split("@")[0]}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
                  </div>
                  <DropdownMenuItem onClick={() => navigate("/settings")} className="gap-2 text-sm cursor-pointer">
                    <Settings className="h-4 w-4" /> Configurações
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut} className="gap-2 text-sm text-destructive focus:text-destructive cursor-pointer">
                    <LogOut className="h-4 w-4" /> Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button variant="outline" size="sm" onClick={() => navigate("/login")} className="gap-2">
                <LogIn className="h-4 w-4" /> Entrar
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : communities.length === 0 ? (
          /* Empty state */
          <div className="text-center py-20 space-y-5">
            <div className="h-24 w-24 rounded-full bg-muted flex items-center justify-center mx-auto">
              <Users className="h-10 w-10 text-muted-foreground/40" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Você ainda não tem comunidades</h2>
              <p className="text-muted-foreground mt-1">Crie sua primeira comunidade ou entre em uma existente.</p>
            </div>
            <div className="flex items-center justify-center gap-3">
              <Button onClick={() => setShowCreateModal(true)} className="gap-2">
                <Plus className="h-4 w-4" /> Criar comunidade
              </Button>
              <Button variant="outline" onClick={() => navigate("/circles/explore")} className="gap-2">
                <Globe className="h-4 w-4" /> Explorar
              </Button>
            </div>
          </div>
        ) : (
          /* Grid */
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {communities.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(`/circles/${c.slug}/feed`)}
                className="text-left group"
              >
                <Card className="overflow-hidden border-border hover:border-primary/40 hover:shadow-md transition-all duration-200 h-full flex flex-col">
                  {/* Cover */}
                  <div className="relative h-28 overflow-hidden bg-gradient-to-br from-primary/20 to-muted shrink-0">
                    {c.cover_image_url && (
                      <img src={c.cover_image_url} alt="" className="w-full h-full object-cover" />
                    )}
                    {/* Role badge */}
                    <div className="absolute top-2 right-2">
                      {c.role === "OWNER" ? (
                        <Badge className="text-[10px] bg-amber-500/90 text-white border-0 gap-1">
                          <Crown className="h-2.5 w-2.5" /> Dono
                        </Badge>
                      ) : c.role === "ADMIN" ? (
                        <Badge className="text-[10px] bg-primary/90 text-primary-foreground border-0">
                          Admin
                        </Badge>
                      ) : null}
                    </div>
                  </div>

                  {/* Body */}
                  <div className="p-4 pt-0 flex-1 flex flex-col items-center text-center">
                    <div className="-mt-8 relative z-10 mb-2">
                      {c.icon_url ? (
                        <img src={c.icon_url} alt="" className="h-14 w-14 rounded-xl object-cover ring-2 ring-background shadow-md" />
                      ) : (
                        <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center ring-2 ring-background shadow-md">
                          <MessageSquare className="h-6 w-6 text-primary" />
                        </div>
                      )}
                    </div>

                    <h3 className="font-semibold text-foreground text-sm line-clamp-1 group-hover:text-primary transition-colors">
                      {c.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Users className="h-3 w-3" />{c.member_count || 0}</span>
                      {c.access_type === "PAID_SUBSCRIPTION" ? (
                        <span className="flex items-center gap-1 text-purple-500"><Lock className="h-3 w-3" />Paga</span>
                      ) : (
                        <span className="flex items-center gap-1 text-emerald-500"><Globe className="h-3 w-3" />Gratuita</span>
                      )}
                    </div>

                    {c.description && (
                      <p className="text-xs text-muted-foreground mt-2 line-clamp-2 flex-1">{c.description}</p>
                    )}

                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50 w-full">
                      <span className="text-xs font-medium text-primary group-hover:underline">
                        Acessar comunidade
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                </Card>
              </button>
            ))}

            {/* Create new card */}
            <button onClick={() => setShowCreateModal(true)} className="text-left group">
              <Card className={cn(
                "h-full min-h-[200px] flex items-center justify-center border-dashed border-2 border-border/50",
                "hover:border-primary/50 hover:bg-primary/5 transition-all duration-200"
              )}>
                <div className="text-center space-y-2 p-6">
                  <div className="h-12 w-12 rounded-full border-2 border-dashed border-muted-foreground/30 group-hover:border-primary/50 flex items-center justify-center mx-auto transition-colors">
                    <Plus className="h-6 w-6 text-muted-foreground/50 group-hover:text-primary transition-colors" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">Nova comunidade</p>
                </div>
              </Card>
            </button>
          </div>
        )}
      </div>

      {/* Create Community Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Criar nova comunidade</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="com-name">Nome da comunidade *</Label>
              <Input
                id="com-name"
                placeholder="Ex: Clube dos Empreendedores"
                value={newName}
                onChange={(e) => handleNameChange(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="com-slug">Link público</Label>
              <div className="flex items-center gap-0">
                <span className="text-xs px-3 h-10 flex items-center bg-muted border border-r-0 border-input rounded-l-md text-muted-foreground whitespace-nowrap">
                  {window.location.host}/circles/
                </span>
                <Input
                  id="com-slug"
                  placeholder="minha-comunidade"
                  value={newSlug}
                  onChange={(e) => { setNewSlug(slugify(e.target.value)); setSlugEdited(true); }}
                  className="h-10 rounded-l-none"
                />
              </div>
              <p className="text-xs text-muted-foreground">Esse link será compartilhável e público.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="com-desc">Descrição (opcional)</Label>
              <Textarea
                id="com-desc"
                placeholder="Do que trata essa comunidade?"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={3}
                maxLength={300}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowCreateModal(false)}>Cancelar</Button>
              <Button
                className="flex-1 gap-2"
                disabled={!newName.trim() || createCommunity.isPending}
                onClick={() => createCommunity.mutate()}
                id="create-community-submit"
              >
                {createCommunity.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Criar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
