import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { CheckCircle2, Circle, ChevronDown, ChevronUp, X, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface MemberWelcomeCardProps {
  communityId: string;
  memberId: string;
  slug: string;
}

const DISMISSED_KEY = (cid: string, mid: string) => `member-welcome-dismissed-${cid}-${mid}`;
const COLLAPSED_KEY = (cid: string, mid: string) => `member-welcome-collapsed-${cid}-${mid}`;

export default function MemberWelcomeCard({ communityId, memberId, slug }: MemberWelcomeCardProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [dismissed, setDismissed] = useState(() =>
    localStorage.getItem(DISMISSED_KEY(communityId, memberId)) === "true"
  );
  const [collapsed, setCollapsed] = useState(() => {
    const stored = localStorage.getItem(COLLAPSED_KEY(communityId, memberId));
    return stored === null ? true : stored === "true";
  });

  // Fetch active tasks
  const { data: tasks } = useQuery({
    queryKey: ["member-onboarding-tasks", communityId],
    queryFn: async () => {
      const { data } = await supabase
        .from("community_onboarding_tasks")
        .select("*")
        .eq("community_id", communityId)
        .eq("is_active", true)
        .order("position");
      return (data || []) as any[];
    },
    enabled: !dismissed,
  });

  // Fetch member progress
  const { data: progress } = useQuery({
    queryKey: ["member-onboarding-progress", memberId],
    queryFn: async () => {
      const { data } = await supabase
        .from("community_onboarding_progress")
        .select("task_id")
        .eq("member_id", memberId);
      return new Set((data || []).map((p: any) => p.task_id));
    },
    enabled: !dismissed && !!tasks && tasks.length > 0,
  });

  const completeTask = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from("community_onboarding_progress")
        .insert({ task_id: taskId, member_id: memberId });
      if (error && !error.message.includes("duplicate")) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["member-onboarding-progress"] });
      toast.success("Tarefa concluída!");
    },
  });

  const doneCount = useMemo(() => {
    if (!tasks || !progress) return 0;
    return tasks.filter((t: any) => progress.has(t.id)).length;
  }, [tasks, progress]);

  const totalTasks = tasks?.length || 0;
  const allDone = totalTasks > 0 && doneCount === totalTasks;

  // Don't render if: dismissed, no tasks, or all done
  if (dismissed || !tasks || tasks.length === 0 || allDone) return null;

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY(communityId, memberId), "true");
    setDismissed(true);
  };

  const handleToggle = () => {
    const next = !collapsed;
    localStorage.setItem(COLLAPSED_KEY(communityId, memberId), String(next));
    setCollapsed(next);
  };

  const handleTaskClick = (task: any) => {
    const isDone = progress?.has(task.id);
    if (isDone) return;

    // Navigate or act based on type
    if (task.target_url) {
      // If it's a relative URL, navigate internally
      if (task.target_url.startsWith("/")) {
        navigate(task.target_url.replace(":slug", slug));
      } else if (task.target_url.startsWith("http")) {
        window.open(task.target_url, "_blank");
      }
    }

    // For custom and visit_page, mark immediately
    if (task.task_type === "custom" || task.task_type === "visit_page" || task.task_type === "video") {
      completeTask.mutate(task.id);
    }
    // For social_action and link, mark on click (best effort)
    if (task.task_type === "social_action" || task.task_type === "link") {
      completeTask.mutate(task.id);
    }
  };

  return (
    <Card className="rounded-xl border-0 overflow-hidden" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <button onClick={handleToggle} className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-bold text-foreground">Bem-vindo! Comece por aqui</span>
          <span className="text-[11px] text-muted-foreground font-medium">{doneCount}/{totalTasks}</span>
          {collapsed ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronUp className="h-3 w-3 text-muted-foreground" />}
        </button>
        <button
          onClick={handleDismiss}
          className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded hover:bg-muted"
          title="Ocultar por agora"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Tasks */}
      {!collapsed && (
        <div className="px-3 pb-3 space-y-0.5">
          {tasks.map((task: any) => {
            const isDone = progress?.has(task.id);
            return (
              <button
                key={task.id}
                onClick={() => handleTaskClick(task)}
                disabled={isDone || completeTask.isPending}
                className={cn(
                  "flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-lg transition-colors",
                  isDone ? "opacity-60 cursor-default" : "hover:bg-muted/60 cursor-pointer"
                )}
              >
                {isDone ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                )}
                <span className={cn("text-xs font-medium", isDone ? "line-through text-muted-foreground" : "text-foreground")}>
                  {task.title}
                </span>
                {task.target_url && !isDone && (
                  <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 ml-auto" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}
