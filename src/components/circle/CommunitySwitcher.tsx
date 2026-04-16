import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthProvider";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ChevronDown, ChevronUp, Search, Plus, Compass, MessageSquare, Settings, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import KivoLogo from "@/assets/kivo-logo.svg";

interface CommunitySwitcherProps {
  currentCommunity: {
    id: string;
    name: string;
    slug: string;
    icon_url?: string | null;
  } | null;
  onCreateCommunity?: () => void;
}

export default function CommunitySwitcher({ currentCommunity, onCreateCommunity }: CommunitySwitcherProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentWorkspace, userWorkspaces } = useWorkspace();

  const isGuest = !user;

  const { data: communities = [] } = useQuery({
    queryKey: ["user-communities-switcher", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("community_members")
        .select("community_id, role, communities:community_id(id, name, slug, icon_url)")
        .eq("user_id", user.id)
        .eq("status", "ACTIVE");
      return (data || [])
        .map((m: any) => ({
          id: m.communities?.id,
          name: m.communities?.name,
          slug: m.communities?.slug,
          icon_url: m.communities?.icon_url,
          role: m.role,
        }))
        .filter((c: any) => c.id);
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return communities;
    const q = search.toLowerCase();
    return communities.filter((c: any) => c.name?.toLowerCase().includes(q));
  }, [communities, search]);

  const handleSelect = (slug: string) => {
    setOpen(false);
    setSearch("");
    navigate(`/circles/${slug}/feed`);
  };

  const handleCreate = () => {
    setOpen(false);
    setSearch("");
    if (isGuest) {
      navigate("/onboarding");
      return;
    }
    if (onCreateCommunity) {
      onCreateCommunity();
    } else if (currentWorkspace) {
      navigate("/circles");
    } else {
      navigate("/onboarding");
    }
  };

  const handleDiscover = () => {
    setOpen(false);
    setSearch("");
    navigate("/circles/explore");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2.5 min-w-0 rounded-lg px-2 py-1.5 hover:bg-muted/60 transition-colors">
          {currentCommunity ? (
            <>
              {currentCommunity.icon_url ? (
                <img
                  src={currentCommunity.icon_url}
                  alt=""
                  className="h-8 w-8 rounded-lg object-cover shrink-0"
                />
              ) : (
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <MessageSquare className="h-4 w-4 text-primary" />
                </div>
              )}
              <span className="font-semibold text-foreground text-sm truncate hidden sm:block max-w-[160px]">
                {currentCommunity.name}
              </span>
            </>
          ) : (
            <img src={KivoLogo} alt="Kivo" className="h-6 w-auto shrink-0" />
          )}
          {open ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-[260px] p-0"
      >
        {/* Search — hide for guests */}
        {!isGuest && (
          <div className="p-2 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-sm"
                autoFocus
              />
            </div>
            <button
              onClick={() => { setOpen(false); navigate(`/circles/${currentCommunity?.slug || ""}/settings`); }}
              className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Actions */}
        <div className="px-1">
          {!isGuest && (currentWorkspace || userWorkspaces.length > 0) && (
            <button
              onClick={() => { setOpen(false); navigate("/dashboard"); }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-muted/60 transition-colors text-foreground"
            >
              <ArrowLeft className="h-4 w-4 text-muted-foreground" />
              Voltar para o workspace
            </button>
          )}
          <button
            onClick={handleCreate}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-muted/60 transition-colors text-foreground"
          >
            <Plus className="h-4 w-4 text-muted-foreground" />
            Criar comunidade
          </button>
          <button
            onClick={handleDiscover}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-muted/60 transition-colors text-foreground"
          >
            <Compass className="h-4 w-4 text-muted-foreground" />
            Descobrir comunidades
          </button>
        </div>

        {/* Community list — only for logged-in users */}
        {!isGuest && (
          <>
            <Separator className="my-1" />
            <div className="px-1 pb-1 max-h-[280px] overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  {search ? "Nenhuma comunidade encontrada" : "Você ainda não faz parte de nenhuma comunidade"}
                </p>
              ) : (
                filtered.map((c: any) => {
                  const isActive = c.id === currentCommunity?.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => handleSelect(c.slug)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                        isActive
                          ? "bg-primary/8 font-medium"
                          : "hover:bg-muted/60"
                      )}
                    >
                      {c.icon_url ? (
                        <img src={c.icon_url} alt="" className="h-7 w-7 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-xs font-bold text-primary">
                          {(c.name || "C").charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="truncate text-foreground">{c.name}</span>
                    </button>
                  );
                })
              )}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
