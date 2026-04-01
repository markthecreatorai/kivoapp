import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle2, Circle, ChevronDown, ChevronUp, X, Play, ImagePlus, UserPlus, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

interface AdminSetupChecklistProps {
  community: any;
  member: any;
  slug: string;
  onOpenComposer: () => void;
  onOpenInvite: () => void;
}

const STORAGE_KEY = (communityId: string) => `admin-setup-dismissed-${communityId}`;
const COLLAPSED_KEY = (communityId: string) => `admin-setup-collapsed-${communityId}`;
const INTRO_WATCHED_KEY = (communityId: string) => `admin-intro-watched-${communityId}`;

export default function AdminSetupChecklist({ community, member, slug, onOpenComposer, onOpenInvite }: AdminSetupChecklistProps) {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(() =>
    localStorage.getItem(STORAGE_KEY(community.id)) === "true"
  );
  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem(COLLAPSED_KEY(community.id)) === "true"
  );
  const [showVideo, setShowVideo] = useState(false);
  const [introWatched, setIntroWatched] = useState(() =>
    localStorage.getItem(INTRO_WATCHED_KEY(community.id)) === "true"
  );

  // Check if cover image is set
  const hasCover = !!community.cover_image_url;

  // Check member count >= 3
  const hasInvited3 = (community.member_count || 0) >= 3;

  // Check if admin/owner has at least 1 post
  const { data: adminPostCount } = useQuery({
    queryKey: ["admin-post-count", community.id, member.id],
    queryFn: async () => {
      const { count } = await supabase
        .from("community_posts")
        .select("id", { count: "exact", head: true })
        .eq("community_id", community.id)
        .eq("author_id", member.id)
        .is("deleted_at", null);
      return count || 0;
    },
    enabled: !dismissed,
  });

  const hasFirstPost = (adminPostCount || 0) > 0;

  const tasks = useMemo(() => [
    {
      key: "intro",
      label: "Assistir vídeo de introdução (2 min)",
      icon: Play,
      done: introWatched,
      action: () => setShowVideo(true),
    },
    {
      key: "cover",
      label: "Definir imagem de capa",
      icon: ImagePlus,
      done: hasCover,
      action: () => navigate(`/circles/${slug}/about`),
    },
    {
      key: "invite",
      label: "Convidar 3 pessoas",
      icon: UserPlus,
      done: hasInvited3,
      action: () => onOpenInvite(),
    },
    {
      key: "post",
      label: "Escrever seu primeiro post",
      icon: PenLine,
      done: hasFirstPost,
      action: () => onOpenComposer(),
    },
  ], [introWatched, hasCover, hasInvited3, hasFirstPost, slug, navigate, onOpenInvite, onOpenComposer]);

  const doneCount = tasks.filter(t => t.done).length;
  const allDone = doneCount === tasks.length;

  if (dismissed || allDone) return null;

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY(community.id), "true");
    setDismissed(true);
  };

  const handleToggleCollapse = () => {
    const next = !collapsed;
    localStorage.setItem(COLLAPSED_KEY(community.id), String(next));
    setCollapsed(next);
  };

  const handleMarkIntroWatched = () => {
    localStorage.setItem(INTRO_WATCHED_KEY(community.id), "true");
    setIntroWatched(true);
    setShowVideo(false);
  };

  return (
    <>
      <Card className="rounded-xl border-0 overflow-hidden" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={handleToggleCollapse} className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-bold text-foreground">Configure seu grupo</span>
            <span className="text-xs text-muted-foreground font-medium">{doneCount}/{tasks.length}</span>
            {collapsed ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
          <button
            onClick={handleDismiss}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-muted"
            title="Ocultar checklist"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="px-4 pb-2">
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${(doneCount / tasks.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Task list */}
        {!collapsed && (
          <div className="px-4 pb-4 space-y-1">
            {tasks.map((task) => (
              <button
                key={task.key}
                onClick={task.done ? undefined : task.action}
                disabled={task.done}
                className={cn(
                  "flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-lg transition-colors",
                  task.done
                    ? "opacity-60 cursor-default"
                    : "hover:bg-muted/60 cursor-pointer"
                )}
              >
                {task.done ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground/50 shrink-0" />
                )}
                <task.icon className={cn("h-4 w-4 shrink-0", task.done ? "text-muted-foreground" : "text-foreground")} />
                <span className={cn("text-sm font-medium", task.done ? "line-through text-muted-foreground" : "text-foreground")}>
                  {task.label}
                </span>
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Intro video modal */}
      <Dialog open={showVideo} onOpenChange={setShowVideo}>
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="text-lg font-bold">Vídeo de introdução</DialogTitle>
          </DialogHeader>
          <div className="px-4 pb-4 space-y-4">
            <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
              <div className="text-center space-y-2">
                <Play className="h-12 w-12 text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">
                  Dicas rápidas para configurar sua comunidade e engajar seus membros.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowVideo(false)}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted"
              >
                Fechar
              </button>
              <button
                onClick={handleMarkIntroWatched}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Marcar como assistido
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
