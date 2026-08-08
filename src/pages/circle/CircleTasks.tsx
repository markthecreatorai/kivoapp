import { useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Plus, Search, Loader2, CheckCircle2, Circle, Clock, ArrowRight,
  Trash2, Calendar, Flag, User, MoreHorizontal, GripVertical,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const STATUS_CONFIG = {
  todo: { label: "A fazer", icon: Circle, color: "text-muted-foreground", bg: "bg-muted/50" },
  doing: { label: "Em progresso", icon: Clock, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
  done: { label: "Concluído", icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/30" },
} as const;

const PRIORITY_CONFIG = {
  low: { label: "Baixa", color: "text-muted-foreground" },
  medium: { label: "Média", color: "text-yellow-600" },
  high: { label: "Alta", color: "text-red-600" },
} as const;

type TaskStatus = keyof typeof STATUS_CONFIG;
type TaskPriority = keyof typeof PRIORITY_CONFIG;

interface TaskRow {
  id: string;
  community_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  created_by: string;
  completed_at: string | null;
  created_at: string;
  creator?: { id: string; display_name: string | null; avatar_url: string | null };
  assignees?: { member_id: string; member?: { id: string; display_name: string | null; avatar_url: string | null } }[];
}

export default function CircleTasks() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | TaskStatus>("all");
  const [viewMode, setViewMode] = useState<"board" | "list">("board");
  const [editTask, setEditTask] = useState<TaskRow | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data: community } = useQuery({
    queryKey: ["community-slug", slug],
    queryFn: async () => {
      if (!slug) return null;
      const { data } = await supabase.from("communities").select("*").eq("slug", slug).eq("is_active", true).maybeSingle();
      return data;
    },
    enabled: !!slug,
  });

  const { data: member } = useQuery({
    queryKey: ["circle-member", community?.id, user?.id],
    queryFn: async () => {
      if (!community || !user) return null;
      const { data } = await supabase.from("community_members").select("*").eq("community_id", community.id).eq("user_id", user.id).single();
      return data;
    },
    enabled: !!community && !!user,
  });

  const isStaff = member?.role === "OWNER" || member?.role === "ADMIN";

  // Members for assignment
  const { data: members = [] } = useQuery({
    queryKey: ["circle-members-list", community?.id],
    queryFn: async () => {
      if (!community) return [];
      const { data } = await supabase
        .from("community_members")
        .select("id, display_name, avatar_url, user_id")
        .eq("community_id", community.id)
        .eq("status", "ACTIVE")
        .order("display_name");
      return data || [];
    },
    enabled: !!community,
  });

  // Tasks
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["circle-tasks", community?.id],
    queryFn: async () => {
      if (!community) return [];
      const { data, error } = await supabase
        .from("community_tasks")
        .select("*, creator:created_by(id, display_name, avatar_url)")
        .eq("community_id", community.id)
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Fetch assignees
      const taskIds = (data || []).map((t: any) => t.id);
      const assigneesMap: Record<string, any[]> = {};
      if (taskIds.length > 0) {
        const { data: assignees } = await supabase
          .from("community_task_assignees")
          .select("task_id, member_id, member:member_id(id, display_name, avatar_url)")
          .in("task_id", taskIds);
        if (assignees) {
          for (const a of assignees) {
            if (!assigneesMap[a.task_id]) assigneesMap[a.task_id] = [];
            assigneesMap[a.task_id].push(a);
          }
        }
      }

      return (data || []).map((t: any) => ({
        ...t,
        assignees: assigneesMap[t.id] || [],
      })) as TaskRow[];
    },
    enabled: !!community && !!member,
  });

  // Filtered
  const filtered = useMemo(() => {
    return tasks.filter(t => {
      if (filterStatus !== "all" && t.status !== filterStatus) return false;
      if (search) {
        const q = search.toLowerCase();
        return t.title.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [tasks, filterStatus, search]);

  // Status update
  const updateStatus = useMutation({
    mutationFn: async ({ taskId, newStatus }: { taskId: string; newStatus: TaskStatus }) => {
      const update: any = { status: newStatus, updated_at: new Date().toISOString() };
      if (newStatus === "done") update.completed_at = new Date().toISOString();
      else update.completed_at = null;

      const { error } = await supabase.from("community_tasks").update(update).eq("id", taskId);
      if (error) throw error;

      // Log event
      if (member) {
        await supabase.from("community_task_events").insert({
          task_id: taskId, actor_id: member.id, action: "status_changed",
          metadata: { new_status: newStatus },
        });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["circle-tasks", community?.id] }),
  });

  // Delete
  const deleteTask = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase.from("community_tasks").delete().eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["circle-tasks", community?.id] });
      toast.success("Tarefa excluída");
    },
  });

  const tasksByStatus = useMemo(() => ({
    todo: filtered.filter(t => t.status === "todo"),
    doing: filtered.filter(t => t.status === "doing"),
    done: filtered.filter(t => t.status === "done"),
  }), [filtered]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-xl font-bold text-foreground">Tarefas</h1>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex border rounded-lg overflow-hidden">
            <button onClick={() => setViewMode("board")} className={cn("px-3 py-1.5 text-xs font-medium transition-colors", viewMode === "board" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground")}>
              Board
            </button>
            <button onClick={() => setViewMode("list")} className={cn("px-3 py-1.5 text-xs font-medium transition-colors", viewMode === "list" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground")}>
              Lista
            </button>
          </div>
          <Button size="sm" onClick={() => { setEditTask(null); setShowForm(true); }}>
            <Plus className="w-4 h-4 mr-1.5" /> Nova tarefa
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar tarefas..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterStatus} onValueChange={v => setFilterStatus(v as any)}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="todo">A fazer</SelectItem>
            <SelectItem value="doing">Em progresso</SelectItem>
            <SelectItem value="done">Concluído</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : viewMode === "board" ? (
        /* Board View */
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {(["todo", "doing", "done"] as TaskStatus[]).map(status => {
            const config = STATUS_CONFIG[status];
            const StatusIcon = config.icon;
            return (
              <div key={status} className={cn("rounded-xl border p-3 space-y-3 min-h-[200px]", config.bg)}>
                <div className="flex items-center gap-2">
                  <StatusIcon className={cn("w-4 h-4", config.color)} />
                  <h3 className="text-sm font-semibold text-foreground">{config.label}</h3>
                  <Badge variant="secondary" className="text-[10px] ml-auto">{tasksByStatus[status].length}</Badge>
                </div>
                <div className="space-y-2">
                  {tasksByStatus[status].map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      isStaff={isStaff}
                      currentMemberId={member?.id}
                      onEdit={() => { setEditTask(task); setShowForm(true); }}
                      onDelete={() => deleteTask.mutate(task.id)}
                      onStatusChange={(s) => updateStatus.mutate({ taskId: task.id, newStatus: s })}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List View */
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">Nenhuma tarefa encontrada.</div>
          ) : filtered.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              isStaff={isStaff}
              currentMemberId={member?.id}
              onEdit={() => { setEditTask(task); setShowForm(true); }}
              onDelete={() => deleteTask.mutate(task.id)}
              onStatusChange={(s) => updateStatus.mutate({ taskId: task.id, newStatus: s })}
              listMode
            />
          ))}
        </div>
      )}

      {/* Form Modal */}
      {showForm && community && member && (
        <TaskFormModal
          community={community}
          member={member}
          members={members}
          task={editTask}
          onClose={() => { setShowForm(false); setEditTask(null); }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["circle-tasks", community.id] });
            setShowForm(false);
            setEditTask(null);
          }}
        />
      )}
    </div>
  );
}

/* ─── Task Card ─── */

function TaskCard({ task, isStaff, currentMemberId, onEdit, onDelete, onStatusChange, listMode }: {
  task: TaskRow; isStaff: boolean; currentMemberId?: string;
  onEdit: () => void; onDelete: () => void; onStatusChange: (s: TaskStatus) => void;
  listMode?: boolean;
}) {
  const config = STATUS_CONFIG[task.status];
  const StatusIcon = config.icon;
  const priorityConfig = PRIORITY_CONFIG[task.priority];
  const canEdit = isStaff || task.created_by === currentMemberId || task.assignees?.some(a => a.member_id === currentMemberId);
  const isOverdue = task.due_date && task.status !== "done" && new Date(task.due_date) < new Date();

  const nextStatus: TaskStatus | null = task.status === "todo" ? "doing" : task.status === "doing" ? "done" : null;

  return (
    <div className={cn(
      "bg-card border rounded-xl p-3 space-y-2 transition-shadow hover:shadow-sm",
      listMode && "flex items-center gap-4 space-y-0"
    )}>
      <div className={cn("flex-1 min-w-0", listMode && "flex items-center gap-3")}>
        {/* Status icon for list mode */}
        {listMode && <StatusIcon className={cn("w-4 h-4 shrink-0", config.color)} />}

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <h4 className={cn("font-medium text-sm text-foreground", task.status === "done" && "line-through text-muted-foreground")}>{task.title}</h4>
            {task.priority === "high" && <Flag className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />}
          </div>
          {!listMode && task.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{task.description}</p>
          )}
        </div>
      </div>

      {/* Meta */}
      <div className={cn("flex items-center gap-2 flex-wrap", listMode ? "" : "justify-between")}>
        <div className="flex items-center gap-2">
          {task.due_date && (
            <span className={cn("text-[10px] flex items-center gap-1", isOverdue ? "text-red-500 font-medium" : "text-muted-foreground")}>
              <Calendar className="w-3 h-3" />
              {format(new Date(task.due_date), "dd MMM", { locale: ptBR })}
            </span>
          )}
          {/* Assignees */}
          {task.assignees && task.assignees.length > 0 && (
            <div className="flex -space-x-1.5">
              {task.assignees.slice(0, 3).map(a => (
                <Avatar key={a.member_id} className="w-5 h-5 border-2 border-card">
                  <AvatarImage src={a.member?.avatar_url || ""} />
                  <AvatarFallback className="text-[8px]">{(a.member?.display_name || "?")[0]}</AvatarFallback>
                </Avatar>
              ))}
              {task.assignees.length > 3 && <span className="text-[10px] text-muted-foreground ml-1">+{task.assignees.length - 3}</span>}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          {nextStatus && canEdit && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onStatusChange(nextStatus)}>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          )}
          {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="w-3.5 h-3.5" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEdit}>Editar</DropdownMenuItem>
                {task.status !== "todo" && <DropdownMenuItem onClick={() => onStatusChange("todo")}>Mover para A fazer</DropdownMenuItem>}
                {task.status !== "doing" && <DropdownMenuItem onClick={() => onStatusChange("doing")}>Mover para Em progresso</DropdownMenuItem>}
                {task.status !== "done" && <DropdownMenuItem onClick={() => onStatusChange("done")}>Marcar concluída</DropdownMenuItem>}
                {isStaff && (
                  <DropdownMenuItem onClick={onDelete} className="text-destructive">Excluir</DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Task Form Modal ─── */

function TaskFormModal({ community, member, members, task, onClose, onSaved }: {
  community: any; member: any; members: any[]; task: TaskRow | null;
  onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!task;
  const [title, setTitle] = useState(task?.title || "");
  const [description, setDescription] = useState(task?.description || "");
  const [status, setStatus] = useState<TaskStatus>(task?.status || "todo");
  const [priority, setPriority] = useState<TaskPriority>(task?.priority || "medium");
  const [dueDate, setDueDate] = useState(task?.due_date || "");
  const [assigneeIds, setAssigneeIds] = useState<string[]>(task?.assignees?.map(a => a.member_id) || []);
  const [saving, setSaving] = useState(false);

  const toggleAssignee = (id: string) => {
    setAssigneeIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSave = async () => {
    if (!title.trim()) { toast.error("Título obrigatório"); return; }
    setSaving(true);
    try {
      const payload: any = {
        community_id: community.id,
        title: title.trim(),
        description: description.trim() || null,
        status,
        priority,
        due_date: dueDate || null,
        created_by: task?.created_by || member.id,
        completed_at: status === "done" ? (task?.completed_at || new Date().toISOString()) : null,
        updated_at: new Date().toISOString(),
      };

      let taskId: string;

      if (isEdit && task) {
        const { error } = await supabase.from("community_tasks").update(payload).eq("id", task.id);
        if (error) throw error;
        taskId = task.id;

        // Log edit event
        await supabase.from("community_task_events").insert({
          task_id: taskId, actor_id: member.id, action: "updated",
          metadata: { fields: ["title", "description", "status", "priority", "due_date"] },
        });
      } else {
        const { data, error } = await supabase.from("community_tasks").insert(payload).select("id").single();
        if (error) throw error;
        taskId = data.id;

        await supabase.from("community_task_events").insert({
          task_id: taskId, actor_id: member.id, action: "created",
        });
      }

      // Sync assignees
      if (isEdit) {
        await supabase.from("community_task_assignees").delete().eq("task_id", taskId);
      }
      if (assigneeIds.length > 0) {
        await supabase.from("community_task_assignees").insert(
          assigneeIds.map(mid => ({ task_id: taskId, member_id: mid }))
        );
      }

      // Analytics
      supabase.from("analytics_events").insert({
        event_type: isEdit ? "task_updated" : "task_created",
        workspace_id: community.workspace_id,
        metadata: { community_id: community.id, task_id: taskId, status, priority },
      }).then(() => {});

      toast.success(isEdit ? "Tarefa atualizada" : "Tarefa criada");
      onSaved();
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Tarefa" : "Nova Tarefa"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground">Título *</label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="O que precisa ser feito?" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Descrição</label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Detalhes da tarefa..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-foreground">Status</label>
              <Select value={status} onValueChange={v => setStatus(v as TaskStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">A fazer</SelectItem>
                  <SelectItem value="doing">Em progresso</SelectItem>
                  <SelectItem value="done">Concluído</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Prioridade</label>
              <Select value={priority} onValueChange={v => setPriority(v as TaskPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baixa</SelectItem>
                  <SelectItem value="medium">Média</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Prazo</label>
            <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Responsáveis</label>
            <div className="mt-2 max-h-40 overflow-y-auto space-y-1 border rounded-lg p-2">
              {members.map(m => (
                <button
                  key={m.id}
                  onClick={() => toggleAssignee(m.id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors text-left",
                    assigneeIds.includes(m.id) ? "bg-primary/10 text-primary" : "hover:bg-muted text-foreground"
                  )}
                >
                  <Avatar className="w-6 h-6">
                    <AvatarImage src={m.avatar_url || ""} />
                    <AvatarFallback className="text-[10px]">{(m.display_name || "?")[0]}</AvatarFallback>
                  </Avatar>
                  <span className="truncate">{m.display_name || "Membro"}</span>
                  {assigneeIds.includes(m.id) && <CheckCircle2 className="w-4 h-4 ml-auto shrink-0" />}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              {isEdit ? "Salvar" : "Criar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
