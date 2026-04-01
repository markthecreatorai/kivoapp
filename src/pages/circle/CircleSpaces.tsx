import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { useAuth } from "@/contexts/AuthProvider";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "react-router-dom";
import { LayoutGrid, Search, Plus, Shield } from "lucide-react";
import SpaceFormModal from "@/components/circle/SpaceFormModal";

export default function CircleSpaces() {
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const { data: community } = useQuery({
    queryKey: ["community", currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace) return null;
      const { data } = await supabase
        .from("communities")
        .select("*")
        .eq("workspace_id", currentWorkspace.id)
        .single();
      return data;
    },
    enabled: !!currentWorkspace,
  });

  const { data: member } = useQuery({
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

  const { data: spaces, isLoading } = useQuery({
    queryKey: ["circle-spaces", community?.id],
    queryFn: async () => {
      if (!community) return [];
      const { data } = await supabase
        .from("community_spaces")
        .select("*")
        .eq("community_id", community.id)
        .eq("is_visible", true)
        .order("position");
      return data || [];
    },
    enabled: !!community,
  });

  const isAdmin = member?.role === "OWNER" || member?.role === "ADMIN";

  const filtered = spaces?.filter((s: any) =>
    !search || s.name.toLowerCase().includes(search.toLowerCase())
  );

  const basePath = community?.slug ? `/circles/${community.slug}` : "/circle";

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Espaços</h1>
          <p className="text-sm text-muted-foreground mt-1">Explore os canais da comunidade</p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Novo Espaço
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar espaços..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="p-6 animate-pulse">
              <div className="h-10 w-10 bg-muted rounded-xl mb-3" />
              <div className="h-4 bg-muted rounded w-2/3 mb-2" />
              <div className="h-3 bg-muted rounded w-full" />
            </Card>
          ))}
        </div>
      ) : filtered?.length === 0 ? (
        <Card className="p-12 text-center">
          <LayoutGrid className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="font-semibold text-foreground">
            {search ? "Nenhum espaço encontrado" : "Nenhum espaço criado"}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {search ? "Tente outra busca." : "O admin precisa criar espaços para a comunidade."}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered?.map((space: any) => (
            <Link key={space.id} to={`${basePath}/spaces/${space.slug}`}>
              <Card className="p-5 hover:shadow-md transition-all hover:border-primary/20 cursor-pointer h-full group">
                <div className="flex items-start gap-4">
                  <div
                    className="text-[40px] leading-none flex-shrink-0"
                    style={{ filter: "none" }}
                  >
                    {space.emoji || "💬"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-foreground group-hover:text-primary transition-colors">
                      {space.name}
                    </h3>
                    {space.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {space.description}
                      </p>
                    )}
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="text-xs">
                        {space.post_count} posts
                      </Badge>
                      {space.only_admins_can_post && (
                        <Badge variant="outline" className="text-xs text-destructive border-destructive/30">
                          <Shield className="h-3 w-3 mr-1" />
                          Só admins
                        </Badge>
                      )}
                      {space.is_default && (
                        <Badge variant="outline" className="text-xs">
                          Padrão
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Create Space Modal */}
      {showCreate && community && (
        <SpaceFormModal
          communityId={community.id}
          spacesCount={spaces?.length || 0}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
