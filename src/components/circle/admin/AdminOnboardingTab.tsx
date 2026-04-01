import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, GripVertical, Trash2, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  community: any;
}

const TASK_TYPES = [
  { value: "video", label: "Vídeo" },
  { value: "link", label: "Link interno" },
  { value: "visit_page", label: "Visitar página" },
  { value: "social_action", label: "Ação social" },
  { value: "custom", label: "Tarefa manual" },
];

const TEMPLATES = [
  { title: "Assista ao vídeo de introdução", task_type: "video", target_url: "", description: "Conheça a comunidade em poucos minutos" },
  { title: "Leia o post fixado", task_type: "link", target_url: "", description: "Entenda as regras e o propósito da comunidade" },
  { title: "Apresente-se no post de boas-vindas", task_type: "social_action", target_url: "", description: "Comente no post de boas-vindas" },
  { title: "Comente em um post da comunidade", task_type: "social_action", target_url: "", description: "Participe de uma discussão" },
  { title: "Complete seu perfil", task_type: "visit_page", target_url: "/profile", description: "Adicione foto e bio" },
];

export default function AdminOnboardingTab({ community }: Props) {
  const queryClient = useQueryClient();
  const [showPreview, setShowPreview] = useState(false);

  const { data: tasks, isLoading } = useQuery({
    queryKey: ["admin-onboarding-tasks", community.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("community_onboarding_tasks")
        .select("*")
        .eq("community_id", community.id)
        .order("position");
      return (data || []) as any[];
    },
  });

  const addTask = useMutation({
    mutationFn: async (template?: typeof TEMPLATES[0]) => {
      const position = (tasks?.length || 0);
      const { error } = await supabase.from("community_onboarding_tasks").insert({
        community_id: community.id,
        title: template?.title || "Nova tarefa",
        description: template?.description || "",
        task_type: template?.task_type || "custom",
        target_url: template?.target_url || "",
        position,
        is_required: false,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-onboarding-tasks"] });
      toast.success("Tarefa adicionada");
    },
    onError: () => toast.error("Erro ao adicionar tarefa"),
  });

  const updateTask = useMutation({
    mutationFn: async ({ id, ...updates }: any) => {
      const { error } = await supabase
        .from("community_onboarding_tasks")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-onboarding-tasks"] }),
    onError: () => toast.error("Erro ao salvar"),
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("community_onboarding_tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-onboarding-tasks"] });
      toast.success("Tarefa removida");
    },
    onError: () => toast.error("Erro ao remover"),
  });

  const activeTasks = (tasks || []).filter((t: any) => t.is_active);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">Onboarding de membros</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure o passo a passo que novos membros verão ao entrar na comunidade.
        </p>
      </div>

      {/* Templates */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Templates prontos</h3>
        <div className="flex flex-wrap gap-2">
          {TEMPLATES.map((t, i) => (
            <button
              key={i}
              onClick={() => addTask.mutate(t)}
              disabled={addTask.isPending}
              className="text-xs px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              + {t.title}
            </button>
          ))}
        </div>
      </div>

      {/* Task list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Tarefas ({activeTasks.length} ativas)
          </h3>
          <Button size="sm" variant="outline" onClick={() => addTask.mutate(undefined)} disabled={addTask.isPending}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (tasks || []).length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-sm text-muted-foreground">Nenhuma tarefa configurada. Use os templates acima ou adicione manualmente.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {(tasks || []).map((task: any, idx: number) => (
              <Card key={task.id} className={cn("p-4 space-y-3", !task.is_active && "opacity-50")}>
                <div className="flex items-start gap-3">
                  <GripVertical className="h-4 w-4 text-muted-foreground mt-1 shrink-0 cursor-grab" />
                  <div className="flex-1 space-y-2">
                    <Input
                      value={task.title}
                      onChange={(e) => updateTask.mutate({ id: task.id, title: e.target.value })}
                      className="font-medium text-sm h-8"
                      placeholder="Título da tarefa"
                    />
                    <div className="flex gap-2">
                      <Select
                        value={task.task_type}
                        onValueChange={(v) => updateTask.mutate({ id: task.id, task_type: v })}
                      >
                        <SelectTrigger className="w-36 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TASK_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        value={task.target_url || ""}
                        onChange={(e) => updateTask.mutate({ id: task.id, target_url: e.target.value })}
                        placeholder="URL ou caminho (opcional)"
                        className="flex-1 h-8 text-xs"
                      />
                    </div>
                    <Input
                      value={task.description || ""}
                      onChange={(e) => updateTask.mutate({ id: task.id, description: e.target.value })}
                      placeholder="Descrição curta (opcional)"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="flex flex-col items-center gap-2 shrink-0">
                    <Switch
                      checked={task.is_active}
                      onCheckedChange={(v) => updateTask.mutate({ id: task.id, is_active: v })}
                    />
                    <button
                      onClick={() => deleteTask.mutate(task.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors p-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Preview */}
      {activeTasks.length > 0 && (
        <div>
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            <Eye className="h-3.5 w-3.5" /> {showPreview ? "Ocultar preview" : "Ver preview do membro"}
          </button>
          {showPreview && (
            <Card className="mt-3 p-4 border-dashed space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-foreground">Bem-vindo! Comece por aqui</span>
                <span className="text-xs text-muted-foreground">0/{activeTasks.length}</span>
              </div>
              <div className="w-full h-1.5 bg-muted rounded-full" />
              <div className="space-y-2">
                {activeTasks.map((t: any) => (
                  <div key={t.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="h-4 w-4 rounded-full border border-muted-foreground/30 shrink-0" />
                    <span>{t.title}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
