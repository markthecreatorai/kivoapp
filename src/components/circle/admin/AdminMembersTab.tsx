import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search, MoreHorizontal, UserCheck, ShieldCheck, Shield, ShieldOff,
  VolumeX, Ban, UserMinus, Gift, Minus, X, Users, Crown, Lock,
  CheckCircle2, XCircle, Download, Info,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import LevelBadge from "@/components/circle/LevelBadge";
import { cn } from "@/lib/utils";

interface Props {
  community: any;
  currentMember: any;
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Dono",
  ADMIN: "Admin",
  MODERATOR: "Moderador",
  MEMBER: "Membro",
};

const ROLE_STYLES: Record<string, string> = {
  OWNER: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  ADMIN: "bg-primary/10 text-primary border-primary/30",
  MODERATOR: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
  MEMBER: "bg-muted text-muted-foreground border-border",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativo",
  MUTED: "Silenciado",
  BANNED: "Banido",
  PENDING: "Pendente",
  LEFT: "Saiu",
};

const MUTE_DURATIONS = [
  { label: "1 hora", ms: 3600000 },
  { label: "24 horas", ms: 86400000 },
  { label: "7 dias", ms: 604800000 },
  { label: "30 dias", ms: 2592000000 },
  { label: "Permanente", ms: 0 },
];

// Permission matrix data
const PERMISSIONS = [
  { action: "Criar posts e comentários", owner: true, admin: true, mod: true, member: true },
  { action: "Editar/excluir próprio conteúdo", owner: true, admin: true, mod: true, member: true },
  { action: "Moderar posts de terceiros", owner: true, admin: true, mod: true, member: false },
  { action: "Silenciar/banir membros", owner: true, admin: true, mod: true, member: false },
  { action: "Aprovar novos membros", owner: true, admin: true, mod: false, member: false },
  { action: "Gerenciar configurações", owner: true, admin: true, mod: false, member: false },
  { action: "Promover/rebaixar roles", owner: true, admin: false, mod: false, member: false },
  { action: "Acesso ao financeiro (Kivo)", owner: false, admin: false, mod: false, member: false, workspace: true },
];

export default function AdminMembersTab({ community, currentMember }: Props) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [lifecycleFilter, setLifecycleFilter] = useState<"ALL" | "ACTIVE" | "RISK" | "LEFT" | "BANNED">("ALL");
  const [sortBy, setSortBy] = useState<string>("joined_at");
  const [pendingSearch, setPendingSearch] = useState("");
  const [pendingSort, setPendingSort] = useState<"newest" | "oldest" | "with_answers">("newest");
  const [selectedPendingIds, setSelectedPendingIds] = useState<string[]>([]);
  const [bulkReason, setBulkReason] = useState("");
  const [bulkConfirm, setBulkConfirm] = useState<{ type: "approve" | "reject"; count: number } | null>(null);

  // Modals
  const [muteModal, setMuteModal] = useState<any>(null);
  const [muteReason, setMuteReason] = useState("");
  const [muteDuration, setMuteDuration] = useState(MUTE_DURATIONS[1].ms);
  const [banModal, setBanModal] = useState<any>(null);
  const [banReason, setBanReason] = useState("");
  const [pointsModal, setPointsModal] = useState<{ member: any; type: "bonus" | "penalty" } | null>(null);
  const [pointsAmount, setPointsAmount] = useState(10);
  const [pointsReason, setPointsReason] = useState("");

  const { data: members, isLoading } = useQuery({
    queryKey: ["circle-admin-members", community.id],
    queryFn: async () => {
      const { data } = await supabase.from("community_members").select("*")
        .eq("community_id", community.id).order("joined_at", { ascending: false });
      return data || [];
    },
  });

  const updateMember = useMutation({
    mutationFn: async ({ memberId, updates }: { memberId: string; updates: any }) => {
      const { error } = await supabase.from("community_members").update(updates).eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circle-admin-members"] });
      queryClient.invalidateQueries({ queryKey: ["community"] });
      queryClient.invalidateQueries({ queryKey: ["circle-pending-count"] });
      queryClient.invalidateQueries({ queryKey: ["circle-join-applications"] });
      toast.success("Membro atualizado!");
    },
    onError: () => toast.error("Erro ao atualizar"),
  });

  const bulkApprovePending = useMutation({
    mutationFn: async (memberIds: string[]) => {
      if (!memberIds.length) return;
      await supabase.from("community_members").update({ status: "ACTIVE" }).in("id", memberIds);
      await (supabase as any)
        .from("community_join_applications")
        .update({ status: "APPROVED", reviewed_at: new Date().toISOString(), reviewed_by: currentMember.user_id })
        .eq("community_id", community.id)
        .in("member_id", memberIds);
    },
    onSuccess: () => {
      setSelectedPendingIds([]);
      queryClient.invalidateQueries({ queryKey: ["circle-admin-members"] });
      queryClient.invalidateQueries({ queryKey: ["circle-pending-count"] });
      queryClient.invalidateQueries({ queryKey: ["circle-join-applications"] });
      toast.success("Pendências aprovadas em lote");
    },
  });

  const bulkRejectPending = useMutation({
    mutationFn: async (memberIds: string[]) => {
      if (!memberIds.length) return;
      await (supabase as any)
        .from("community_join_applications")
        .update({ status: "REJECTED", reviewed_at: new Date().toISOString(), reviewed_by: currentMember.user_id, review_reason: bulkReason || null })
        .eq("community_id", community.id)
        .in("member_id", memberIds);
      await supabase.from("community_members").delete().in("id", memberIds);
    },
    onSuccess: () => {
      setSelectedPendingIds([]);
      setBulkReason("");
      queryClient.invalidateQueries({ queryKey: ["circle-admin-members"] });
      queryClient.invalidateQueries({ queryKey: ["circle-pending-count"] });
      queryClient.invalidateQueries({ queryKey: ["circle-join-applications"] });
      toast.success("Pendências rejeitadas em lote");
    },
  });

  const givePoints = useMutation({
    mutationFn: async ({ memberId, points, reason, type }: { memberId: string; points: number; reason: string; type: "bonus" | "penalty" }) => {
      const actualPoints = type === "penalty" ? -points : points;
      const action = type === "bonus" ? "ADMIN_BONUS" : "ADMIN_PENALTY";
      
      await supabase.from("community_points_log").insert({
        community_id: community.id,
        member_id: memberId,
        action: action as any,
        points: actualPoints,
        description: reason || (type === "bonus" ? "Bônus do admin" : "Penalidade do admin"),
      });

      const member = members?.find((m: any) => m.id === memberId);
      if (member) {
        const newTotal = Math.max(0, (member.total_points || 0) + actualPoints);
        await supabase.from("community_members").update({ total_points: newTotal }).eq("id", memberId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circle-admin-members"] });
      setPointsModal(null);
      setPointsAmount(10);
      setPointsReason("");
      toast.success("Pontos atualizados!");
    },
  });

  const pendingMembers = members?.filter((m: any) => m.status === "PENDING") || [];

  const { data: applications = [] } = useQuery({
    queryKey: ["circle-join-applications", community.id, pendingMembers.map((m: any) => m.id).join(",")],
    queryFn: async () => {
      if (!pendingMembers.length) return [];
      const memberIds = pendingMembers.map((m: any) => m.id);
      const { data, error } = await (supabase as any)
        .from("community_join_applications")
        .select("id, member_id, answers, created_at")
        .eq("community_id", community.id)
        .in("member_id", memberIds)
        .order("created_at", { ascending: false });
      if (error) return [];
      return (data || []) as any[];
    },
    enabled: pendingMembers.length > 0,
  });

  const appByMemberId = new Map<string, any>(applications.map((a: any) => [a.member_id, a]));

  const { data: reviewedApplications = [] } = useQuery({
    queryKey: ["circle-reviewed-applications", community.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("community_join_applications")
        .select("id, status, reviewed_at, reviewed_by, user_id, answers")
        .eq("community_id", community.id)
        .in("status", ["APPROVED", "REJECTED"])
        .order("reviewed_at", { ascending: false })
        .limit(20);
      if (error) return [];
      return (data || []) as any[];
    },
  });

  const canBulkModerate = currentMember?.role === "OWNER" || currentMember?.role === "ADMIN";

  const lifecycleCounts = {
    ACTIVE: (members || []).filter((m: any) => m.status === "ACTIVE").length,
    RISK: (members || []).filter((m: any) => ["MUTED", "PENDING"].includes(m.status)).length,
    LEFT: (members || []).filter((m: any) => m.status === "LEFT").length,
    BANNED: (members || []).filter((m: any) => m.status === "BANNED").length,
  };

  const filteredPending = [...pendingMembers]
    .filter((m: any) => {
      if (!pendingSearch.trim()) return true;
      const q = pendingSearch.toLowerCase();
      return (m.display_name || "").toLowerCase().includes(q) || (m.bio || "").toLowerCase().includes(q);
    })
    .sort((a: any, b: any) => {
      const appA = appByMemberId.get(a.id);
      const appB = appByMemberId.get(b.id);
      if (pendingSort === "with_answers") {
        const aa = Array.isArray(appA?.answers) ? appA.answers.length : 0;
        const bb = Array.isArray(appB?.answers) ? appB.answers.length : 0;
        return bb - aa;
      }
      const da = new Date(a.joined_at || 0).getTime();
      const db = new Date(b.joined_at || 0).getTime();
      return pendingSort === "oldest" ? da - db : db - da;
    });
  
  let filtered = members?.filter((m: any) => m.status !== "PENDING") || [];
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter((m: any) =>
      (m.display_name || "").toLowerCase().includes(q) ||
      ((m as any).username || "").toLowerCase().includes(q) ||
      (m.bio || "").toLowerCase().includes(q)
    );
  }
  if (roleFilter !== "ALL") filtered = filtered.filter((m: any) => m.role === roleFilter);
  if (statusFilter !== "ALL") filtered = filtered.filter((m: any) => m.status === statusFilter);
  if (lifecycleFilter !== "ALL") {
    filtered = filtered.filter((m: any) => {
      if (lifecycleFilter === "ACTIVE") return m.status === "ACTIVE";
      if (lifecycleFilter === "RISK") return ["MUTED", "PENDING"].includes(m.status);
      if (lifecycleFilter === "LEFT") return m.status === "LEFT";
      if (lifecycleFilter === "BANNED") return m.status === "BANNED";
      return true;
    });
  }

  filtered.sort((a: any, b: any) => {
    if (sortBy === "points") return (b.total_points || 0) - (a.total_points || 0);
    if (sortBy === "name") return (a.display_name || "").localeCompare(b.display_name || "");
    return new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime();
  });

  const handleMute = () => {
    if (!muteModal) return;
    const mutedUntil = muteDuration > 0 ? new Date(Date.now() + muteDuration).toISOString() : null;
    updateMember.mutate({
      memberId: muteModal.id,
      updates: { status: "MUTED", muted_at: new Date().toISOString(), muted_until: mutedUntil },
    });
    setMuteModal(null);
    setMuteReason("");
  };

  const handleBan = () => {
    if (!banModal) return;
    updateMember.mutate({
      memberId: banModal.id,
      updates: { status: "BANNED", banned_at: new Date().toISOString(), ban_reason: banReason || "Banido pelo admin" },
    });
    setBanModal(null);
    setBanReason("");
  };

  const exportMembersCsv = () => {
    const rows = filtered.map((m: any) => ({
      Nome: m.display_name || "",
      Username: (m as any).username || "",
      Role: m.role || "",
      Status: m.status || "",
      Pontos: m.total_points || 0,
      Sequencia: m.current_streak || 0,
      Entrada: m.joined_at || "",
    }));
    const header = ["Nome", "Username", "Role", "Status", "Pontos", "Sequencia", "Entrada"];
    const csv = [
      header.join(","),
      ...rows.map((r: any) => header.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `members-${community.slug || community.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado");
  };

  const adminCount = (members || []).filter((m: any) => ["OWNER", "ADMIN"].includes(m.role)).length;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        {/* ── Header ── */}
        <div>
          <h2 className="text-lg font-bold text-foreground">Membros</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Gerencie membros e permissões locais da comunidade</p>
        </div>

        {/* ── Summary Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-4 space-y-1">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{(members || []).length}</p>
                <p className="text-[11px] text-muted-foreground">Total</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 space-y-1">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{lifecycleCounts.ACTIVE}</p>
                <p className="text-[11px] text-muted-foreground">Ativos</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 space-y-1">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Crown className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{adminCount}</p>
                <p className="text-[11px] text-muted-foreground">Admins</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 space-y-1">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                <UserCheck className="h-4 w-4 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{pendingMembers.length}</p>
                <p className="text-[11px] text-muted-foreground">Pendentes</p>
              </div>
            </div>
          </Card>
        </div>

        {/* ── Pending Approvals ── */}
        {pendingMembers.length > 0 && (
          <Card className="overflow-hidden border-yellow-400/30">
            <div className="px-5 py-4 bg-yellow-500/5 border-b border-yellow-400/20">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm text-foreground">Aguardando aprovação</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{pendingMembers.length} solicitação(ões) pendente(s)</p>
                </div>
                <Badge variant="outline" className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30">
                  {pendingMembers.length}
                </Badge>
              </div>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex flex-wrap gap-2 items-center">
                <div className="relative flex-1 min-w-[180px] max-w-xs">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar pendentes..."
                    value={pendingSearch}
                    onChange={(e) => setPendingSearch(e.target.value)}
                    className="pl-8 h-8 text-xs"
                  />
                </div>
                <Select value={pendingSort} onValueChange={(v: any) => setPendingSort(v)}>
                  <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Mais recentes</SelectItem>
                    <SelectItem value="oldest">Mais antigos</SelectItem>
                    <SelectItem value="with_answers">Mais respostas</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setSelectedPendingIds(filteredPending.map((m: any) => m.id))}>
                    Selecionar todos
                  </Button>
                  {selectedPendingIds.length > 0 && (
                    <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setSelectedPendingIds([])}>
                      Limpar
                    </Button>
                  )}
                </div>
                {selectedPendingIds.length > 0 && canBulkModerate && (
                  <div className="flex gap-1.5 items-center">
                    <Button size="sm" className="h-8 text-xs" onClick={() => setBulkConfirm({ type: "approve", count: selectedPendingIds.length })}>
                      Aprovar ({selectedPendingIds.length})
                    </Button>
                    <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={() => setBulkConfirm({ type: "reject", count: selectedPendingIds.length })}>
                      Rejeitar
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                {filteredPending.map((m: any) => {
                  const app = appByMemberId.get(m.id);
                  const answers = Array.isArray(app?.answers) ? app.answers : [];
                  return (
                    <div key={m.id} className="p-3 rounded-lg border bg-card/50 hover:bg-muted/30 transition-colors duration-150">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={selectedPendingIds.includes(m.id)}
                          onChange={(e) => {
                            setSelectedPendingIds((prev) =>
                              e.target.checked ? Array.from(new Set([...prev, m.id])) : prev.filter((id) => id !== m.id)
                            );
                          }}
                          className="mt-2.5 rounded"
                        />
                        <Avatar className="h-9 w-9 shrink-0">
                          <AvatarImage src={m.avatar_url || undefined} />
                          <AvatarFallback className="bg-primary/10 text-primary text-xs">{(m.display_name || "U")[0].toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm truncate">{m.display_name || "Sem nome"}</p>
                            {(m as any).username && <span className="text-xs text-muted-foreground">@{(m as any).username}</span>}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Solicitou em {m.joined_at && !isNaN(new Date(m.joined_at).getTime()) ? format(new Date(m.joined_at), "dd/MM/yyyy 'às' HH:mm") : "—"}
                          </p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button size="sm" className="h-7 text-xs px-2.5" onClick={async () => {
                            await updateMember.mutateAsync({ memberId: m.id, updates: { status: "ACTIVE" } });
                            await (supabase as any)
                              .from("community_join_applications")
                              .update({ status: "APPROVED", reviewed_at: new Date().toISOString(), reviewed_by: currentMember.user_id })
                              .eq("community_id", community.id)
                              .eq("member_id", m.id);
                            queryClient.invalidateQueries({ queryKey: ["circle-join-applications"] });
                          }}>
                            <UserCheck className="h-3 w-3 mr-1" />Aprovar
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs px-2 text-destructive hover:text-destructive" onClick={async () => {
                            await (supabase as any)
                              .from("community_join_applications")
                              .update({ status: "REJECTED", reviewed_at: new Date().toISOString(), reviewed_by: currentMember.user_id })
                              .eq("community_id", community.id)
                              .eq("member_id", m.id);
                            supabase.from("community_members").delete().eq("id", m.id).then(() => {
                              queryClient.invalidateQueries({ queryKey: ["circle-admin-members"] });
                              queryClient.invalidateQueries({ queryKey: ["circle-pending-count"] });
                              queryClient.invalidateQueries({ queryKey: ["circle-join-applications"] });
                              toast.success("Solicitação rejeitada");
                            });
                          }}>
                            <X className="h-3 w-3 mr-1" />Rejeitar
                          </Button>
                        </div>
                      </div>
                      {answers.length > 0 && (
                        <div className="ml-[52px] mt-2 space-y-1.5">
                          {answers.map((a: any, idx: number) => (
                            <div key={`${m.id}-a-${idx}`} className="text-xs rounded-md border p-2.5 bg-muted/20">
                              <p className="font-medium text-foreground">{a.question || `Pergunta ${idx + 1}`}</p>
                              <p className="text-muted-foreground mt-0.5 whitespace-pre-wrap">{a.answer || "—"}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        )}

        {/* ── Lifecycle Segments ── */}
        <Card className="overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h3 className="font-semibold text-sm text-foreground">Ciclo de vida dos membros</h3>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {[
                { key: "ALL", label: "Todos", count: (members || []).length, color: "bg-muted" },
                { key: "ACTIVE", label: "Ativos", count: lifecycleCounts.ACTIVE, color: "bg-green-500/10" },
                { key: "RISK", label: "Em risco", count: lifecycleCounts.RISK, color: "bg-yellow-500/10" },
                { key: "LEFT", label: "Saíram", count: lifecycleCounts.LEFT, color: "bg-muted" },
                { key: "BANNED", label: "Banidos", count: lifecycleCounts.BANNED, color: "bg-destructive/10" },
              ].map((item: any) => (
                <button
                  key={item.key}
                  onClick={() => setLifecycleFilter(item.key)}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-all duration-200",
                    lifecycleFilter === item.key
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border hover:border-primary/30 hover:bg-muted/30"
                  )}
                >
                  <p className="text-[11px] text-muted-foreground font-medium">{item.label}</p>
                  <p className="text-lg font-bold text-foreground mt-0.5">{item.count}</p>
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* ── Search & Filters ── */}
        <Card className="overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou @username..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-9"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="Função" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas funções</SelectItem>
                <SelectItem value="OWNER">Dono</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
                <SelectItem value="MODERATOR">Moderador</SelectItem>
                <SelectItem value="MEMBER">Membro</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos status</SelectItem>
                <SelectItem value="ACTIVE">Ativo</SelectItem>
                <SelectItem value="MUTED">Silenciado</SelectItem>
                <SelectItem value="BANNED">Banido</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Ordenar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="joined_at">Data de entrada</SelectItem>
                <SelectItem value="points">Pontos</SelectItem>
                <SelectItem value="name">Nome</SelectItem>
              </SelectContent>
            </Select>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="h-9" onClick={exportMembersCsv}>
                  <Download className="h-3.5 w-3.5 mr-1.5" />CSV
                </Button>
              </TooltipTrigger>
              <TooltipContent>Exportar lista filtrada como CSV</TooltipContent>
            </Tooltip>
          </div>

          {/* ── Loading skeleton ── */}
          {isLoading && (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-3 py-2">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          )}

          {/* ── Members List ── */}
          {!isLoading && (
            <div className="divide-y divide-border">
              {filtered.map((m: any) => {
                const isOwner = m.role === "OWNER";
                const isSelf = m.id === currentMember.id;
                const canManage = !isOwner && !isSelf;

                return (
                  <div key={m.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition-colors duration-150">
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarImage src={m.avatar_url || undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                        {(m.display_name || "U")[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-foreground truncate">{m.display_name || "Sem nome"}</span>
                        {(m as any).username && (
                          <span className="text-xs text-muted-foreground">@{(m as any).username}</span>
                        )}
                        <LevelBadge points={m.total_points || 0} size="sm" />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {m.total_points || 0} pts · 🔥 {m.current_streak || 0} · Desde {m.joined_at && !isNaN(new Date(m.joined_at).getTime()) ? format(new Date(m.joined_at), "dd/MM/yy") : "—"}
                      </p>
                    </div>
                    <Badge variant="outline" className={cn("text-[10px] font-semibold border", ROLE_STYLES[m.role] || ROLE_STYLES.MEMBER)}>
                      {m.role === "OWNER" && <Crown className="h-2.5 w-2.5 mr-1" />}
                      {ROLE_LABELS[m.role] || m.role}
                    </Badge>
                    {m.status !== "ACTIVE" && (
                      <Badge
                        variant={m.status === "BANNED" ? "destructive" : "secondary"}
                        className="text-[10px]"
                      >
                        {STATUS_LABELS[m.status] || m.status}
                      </Badge>
                    )}
                    {canManage ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          {m.role === "MEMBER" && (
                            <>
                              <DropdownMenuItem onClick={() => updateMember.mutate({ memberId: m.id, updates: { role: "MODERATOR" } })}>
                                <Shield className="h-3.5 w-3.5 mr-2" />Promover a Moderador
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => updateMember.mutate({ memberId: m.id, updates: { role: "ADMIN" } })}>
                                <ShieldCheck className="h-3.5 w-3.5 mr-2" />Promover a Admin
                              </DropdownMenuItem>
                            </>
                          )}
                          {m.role === "MODERATOR" && (
                            <>
                              <DropdownMenuItem onClick={() => updateMember.mutate({ memberId: m.id, updates: { role: "ADMIN" } })}>
                                <ShieldCheck className="h-3.5 w-3.5 mr-2" />Promover a Admin
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => updateMember.mutate({ memberId: m.id, updates: { role: "MEMBER" } })}>
                                <ShieldOff className="h-3.5 w-3.5 mr-2" />Rebaixar a Membro
                              </DropdownMenuItem>
                            </>
                          )}
                          {m.role === "ADMIN" && (
                            <DropdownMenuItem onClick={() => updateMember.mutate({ memberId: m.id, updates: { role: "MEMBER" } })}>
                              <ShieldOff className="h-3.5 w-3.5 mr-2" />Rebaixar a Membro
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          {m.status === "ACTIVE" && (
                            <DropdownMenuItem onClick={() => setMuteModal(m)}>
                              <VolumeX className="h-3.5 w-3.5 mr-2" />Silenciar
                            </DropdownMenuItem>
                          )}
                          {m.status === "MUTED" && (
                            <DropdownMenuItem onClick={() => updateMember.mutate({ memberId: m.id, updates: { status: "ACTIVE", muted_at: null, muted_until: null } })}>
                              <UserCheck className="h-3.5 w-3.5 mr-2" />Remover silêncio
                            </DropdownMenuItem>
                          )}
                          {m.status !== "BANNED" && (
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setBanModal(m)}>
                              <Ban className="h-3.5 w-3.5 mr-2" />Banir
                            </DropdownMenuItem>
                          )}
                          {m.status === "BANNED" && (
                            <DropdownMenuItem onClick={() => updateMember.mutate({ memberId: m.id, updates: { status: "ACTIVE", banned_at: null, ban_reason: null } })}>
                              <UserCheck className="h-3.5 w-3.5 mr-2" />Desbanir
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => updateMember.mutate({ memberId: m.id, updates: { status: "LEFT" } })}>
                            <UserMinus className="h-3.5 w-3.5 mr-2" />Remover da comunidade
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setPointsModal({ member: m, type: "bonus" })}>
                            <Gift className="h-3.5 w-3.5 mr-2" />Dar pontos bônus
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setPointsModal({ member: m, type: "penalty" })}>
                            <Minus className="h-3.5 w-3.5 mr-2" />Remover pontos
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="h-8 w-8 shrink-0 flex items-center justify-center">
                            {isSelf ? (
                              <span className="text-[10px] text-muted-foreground font-medium">Você</span>
                            ) : (
                              <Lock className="h-3.5 w-3.5 text-muted-foreground/50" />
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          {isSelf ? "Você não pode moderar a si mesmo" : "Sem permissão nesta comunidade"}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                );
              })}
              {filtered.length === 0 && !isLoading && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Users className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">Nenhum membro encontrado</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Tente ajustar os filtros de busca</p>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* ── Permissions Matrix ── */}
        <Card className="overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm text-foreground">Permissões por função</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Somente permissões da comunidade</p>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center cursor-help">
                  <Info className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-[260px]">
                Permissões da comunidade não concedem acesso ao financeiro global da Kivo. O acesso ao workspace é controlado separadamente.
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left py-2.5 px-5 font-medium text-muted-foreground text-xs">Ação</th>
                  <th className="text-center py-2.5 px-3 font-medium text-xs">
                    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border", ROLE_STYLES.OWNER)}>
                      <Crown className="h-2.5 w-2.5" />Dono
                    </span>
                  </th>
                  <th className="text-center py-2.5 px-3 font-medium text-xs">
                    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border", ROLE_STYLES.ADMIN)}>Admin</span>
                  </th>
                  <th className="text-center py-2.5 px-3 font-medium text-xs">
                    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border", ROLE_STYLES.MODERATOR)}>Mod</span>
                  </th>
                  <th className="text-center py-2.5 px-3 font-medium text-xs">
                    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border", ROLE_STYLES.MEMBER)}>Membro</span>
                  </th>
                  <th className="text-center py-2.5 px-3 font-medium text-xs">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground border border-border">
                      <Lock className="h-2.5 w-2.5" />Workspace
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {PERMISSIONS.map((p) => (
                  <tr key={p.action} className="hover:bg-muted/20 transition-colors duration-150">
                    <td className="py-2.5 px-5 text-xs text-foreground">{p.action}</td>
                    <td className="text-center py-2.5 px-3">
                      {p.owner ? <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" /> : <XCircle className="h-4 w-4 text-muted-foreground/30 mx-auto" />}
                    </td>
                    <td className="text-center py-2.5 px-3">
                      {p.admin ? <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" /> : <XCircle className="h-4 w-4 text-muted-foreground/30 mx-auto" />}
                    </td>
                    <td className="text-center py-2.5 px-3">
                      {p.mod ? <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" /> : <XCircle className="h-4 w-4 text-muted-foreground/30 mx-auto" />}
                    </td>
                    <td className="text-center py-2.5 px-3">
                      {p.member ? <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" /> : <XCircle className="h-4 w-4 text-muted-foreground/30 mx-auto" />}
                    </td>
                    <td className="text-center py-2.5 px-3">
                      {p.workspace ? (
                        <Tooltip>
                          <TooltipTrigger>
                            <Lock className="h-4 w-4 text-muted-foreground/50 mx-auto" />
                          </TooltipTrigger>
                          <TooltipContent>Disponível apenas no workspace</TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-muted-foreground/30 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: compact cards */}
          <div className="md:hidden p-4 space-y-2">
            {PERMISSIONS.map((p) => (
              <div key={p.action} className="rounded-lg border p-3 space-y-2">
                <p className="text-xs font-medium text-foreground">{p.action}</p>
                <div className="flex flex-wrap gap-1.5">
                  {p.owner && <Badge variant="outline" className={cn("text-[9px]", ROLE_STYLES.OWNER)}>Dono</Badge>}
                  {p.admin && <Badge variant="outline" className={cn("text-[9px]", ROLE_STYLES.ADMIN)}>Admin</Badge>}
                  {p.mod && <Badge variant="outline" className={cn("text-[9px]", ROLE_STYLES.MODERATOR)}>Mod</Badge>}
                  {p.member && <Badge variant="outline" className={cn("text-[9px]", ROLE_STYLES.MEMBER)}>Membro</Badge>}
                  {p.workspace && (
                    <Badge variant="outline" className="text-[9px] bg-muted text-muted-foreground">
                      <Lock className="h-2 w-2 mr-0.5" />Workspace
                    </Badge>
                  )}
                  {!p.owner && !p.admin && !p.mod && !p.member && !p.workspace && (
                    <span className="text-[10px] text-muted-foreground">Nenhuma função</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="px-5 py-3 border-t border-border bg-muted/20">
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <Lock className="h-3 w-3 shrink-0" />
              Permissões da comunidade não concedem acesso ao financeiro global da Kivo.
            </p>
          </div>
        </Card>

        {/* ── Recent Decisions ── */}
        {reviewedApplications.length > 0 && (
          <Card className="overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <h3 className="font-semibold text-sm text-foreground">Decisões recentes</h3>
            </div>
            <div className="divide-y divide-border">
              {reviewedApplications.map((a: any) => (
                <div key={a.id} className="flex items-center justify-between px-5 py-2.5">
                  <div>
                    <p className="text-xs font-medium text-foreground">{a.status === "APPROVED" ? "Aprovado" : "Rejeitado"}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {a.reviewed_at && !isNaN(new Date(a.reviewed_at).getTime())
                        ? format(new Date(a.reviewed_at), "dd/MM/yyyy 'às' HH:mm")
                        : "sem data"}
                    </p>
                  </div>
                  <Badge variant={a.status === "APPROVED" ? "default" : "destructive"} className="text-[10px]">
                    {a.status === "APPROVED" ? "Aprovado" : "Rejeitado"}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ── Modals ── */}
        {muteModal && (
          <Dialog open onOpenChange={() => setMuteModal(null)}>
            <DialogContent>
              <DialogHeader><DialogTitle>Silenciar {muteModal.display_name}?</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label>Motivo</Label>
                  <Input value={muteReason} onChange={(e) => setMuteReason(e.target.value)} placeholder="Motivo do silenciamento" />
                </div>
                <div className="space-y-1.5">
                  <Label>Duração</Label>
                  <Select value={String(muteDuration)} onValueChange={(v) => setMuteDuration(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MUTE_DURATIONS.map((d) => (
                        <SelectItem key={d.ms} value={String(d.ms)}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setMuteModal(null)}>Cancelar</Button>
                <Button onClick={handleMute}>Silenciar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {banModal && (
          <AlertDialog open onOpenChange={() => setBanModal(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Banir {banModal.display_name}?</AlertDialogTitle>
                <AlertDialogDescription>O membro perderá acesso à comunidade permanentemente.</AlertDialogDescription>
              </AlertDialogHeader>
              <div className="py-2 space-y-1.5">
                <Label>Motivo</Label>
                <Input value={banReason} onChange={(e) => setBanReason(e.target.value)} placeholder="Motivo do banimento" />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleBan}>Banir</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {bulkConfirm && (
          <AlertDialog open onOpenChange={() => setBulkConfirm(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {bulkConfirm.type === "approve" ? "Aprovar em lote" : "Rejeitar em lote"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Você está prestes a {bulkConfirm.type === "approve" ? "aprovar" : "rejeitar"} {bulkConfirm.count} solicitação(ões).
                </AlertDialogDescription>
              </AlertDialogHeader>
              {bulkConfirm.type === "reject" && (
                <div className="py-2 space-y-1.5">
                  <Label>Motivo (opcional)</Label>
                  <Input value={bulkReason} onChange={(e) => setBulkReason(e.target.value)} placeholder="Motivo da rejeição" />
                </div>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    if (bulkConfirm.type === "approve") bulkApprovePending.mutate(selectedPendingIds);
                    else bulkRejectPending.mutate(selectedPendingIds);
                    setBulkConfirm(null);
                  }}
                >
                  Confirmar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {pointsModal && (
          <Dialog open onOpenChange={() => setPointsModal(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {pointsModal.type === "bonus" ? "Dar pontos bônus" : "Remover pontos"} — {pointsModal.member.display_name}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label>Quantidade</Label>
                  <Input type="number" min={1} value={pointsAmount} onChange={(e) => setPointsAmount(Math.max(1, +e.target.value || 1))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Motivo</Label>
                  <Input value={pointsReason} onChange={(e) => setPointsReason(e.target.value)} placeholder="Motivo..." />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPointsModal(null)}>Cancelar</Button>
                <Button onClick={() => givePoints.mutate({
                  memberId: pointsModal.member.id,
                  points: pointsAmount,
                  reason: pointsReason,
                  type: pointsModal.type,
                })}>
                  {pointsModal.type === "bonus" ? "Dar pontos" : "Remover pontos"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </TooltipProvider>
  );
}