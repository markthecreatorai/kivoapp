import { useEffect, useState } from "react";
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
import {
  Search, MoreHorizontal, UserCheck, ShieldCheck, Shield, ShieldOff,
  VolumeX, Ban, UserMinus, Gift, Minus, X,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import LevelBadge from "@/components/circle/LevelBadge";

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

  const FILTERS_KEY = `kivo-admin-members-filters-${community.id}`;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FILTERS_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.roleFilter) setRoleFilter(saved.roleFilter);
      if (saved.statusFilter) setStatusFilter(saved.statusFilter);
      if (saved.lifecycleFilter) setLifecycleFilter(saved.lifecycleFilter);
      if (saved.sortBy) setSortBy(saved.sortBy);
    } catch {}
  }, [FILTERS_KEY]);

  useEffect(() => {
    localStorage.setItem(
      FILTERS_KEY,
      JSON.stringify({ roleFilter, statusFilter, lifecycleFilter, sortBy })
    );
  }, [FILTERS_KEY, roleFilter, statusFilter, lifecycleFilter, sortBy]);

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

  const isInactive = (m: any) => {
    const last = m.last_active_at ? new Date(m.last_active_at).getTime() : 0;
    if (!last) return false;
    const days = (Date.now() - last) / (1000 * 60 * 60 * 24);
    return days >= 14;
  };

  const lifecycleCounts = {
    ACTIVE: (members || []).filter((m: any) => m.status === "ACTIVE").length,
    RISK: (members || []).filter((m: any) => ["MUTED", "PENDING"].includes(m.status) || isInactive(m)).length,
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
      (m.display_name || "").toLowerCase().includes(q) || (m.bio || "").toLowerCase().includes(q)
    );
  }
  if (roleFilter !== "ALL") filtered = filtered.filter((m: any) => m.role === roleFilter);
  if (statusFilter !== "ALL") filtered = filtered.filter((m: any) => m.status === statusFilter);
  if (lifecycleFilter !== "ALL") {
    filtered = filtered.filter((m: any) => {
      if (lifecycleFilter === "ACTIVE") return m.status === "ACTIVE";
      if (lifecycleFilter === "RISK") return ["MUTED", "PENDING"].includes(m.status) || isInactive(m);
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
      Role: m.role || "",
      Status: m.status || "",
      Pontos: m.total_points || 0,
      Sequencia: m.current_streak || 0,
      Entrada: m.joined_at || "",
    }));

    const header = ["Nome", "Role", "Status", "Pontos", "Sequencia", "Entrada"];
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

  return (
    <div className="space-y-6">
      {/* Pending approvals */}
      {pendingMembers.length > 0 && (
        <Card className="p-4 border-yellow-300/50 bg-yellow-50/10">
          <h3 className="font-semibold text-sm text-foreground mb-3">Aguardando aprovação ({pendingMembers.length})</h3>
          <div className="flex flex-wrap gap-2 mb-3 items-center">
            <Input
              placeholder="Buscar pendentes..."
              value={pendingSearch}
              onChange={(e) => setPendingSearch(e.target.value)}
              className="max-w-xs"
            />
            <Select value={pendingSort} onValueChange={(v: any) => setPendingSort(v)}>
              <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Mais recentes</SelectItem>
                <SelectItem value="oldest">Mais antigos</SelectItem>
                <SelectItem value="with_answers">Mais respostas</SelectItem>
              </SelectContent>
            </Select>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setSelectedPendingIds(filteredPending.map((m: any) => m.id))}
            >
              Selecionar todos
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSelectedPendingIds([])}
            >
              Limpar seleção
            </Button>

            {selectedPendingIds.length > 0 && canBulkModerate && (
              <>
                <Button size="sm" onClick={() => setBulkConfirm({ type: "approve", count: selectedPendingIds.length })}>
                  Aprovar selecionados ({selectedPendingIds.length})
                </Button>
                <Input
                  placeholder="Motivo (opcional)"
                  value={bulkReason}
                  onChange={(e) => setBulkReason(e.target.value)}
                  className="max-w-[180px] h-8"
                />
                <Button size="sm" variant="destructive" onClick={() => setBulkConfirm({ type: "reject", count: selectedPendingIds.length })}>
                  Rejeitar selecionados
                </Button>
              </>
            )}
            {selectedPendingIds.length > 0 && !canBulkModerate && (
              <Badge variant="outline">Sem permissão para moderação em lote</Badge>
            )}
          </div>
          <div className="space-y-2">
            {filteredPending.map((m: any) => {
              const app = appByMemberId.get(m.id);
              const answers = Array.isArray(app?.answers) ? app.answers : [];

              return (
                <div key={m.id} className="p-3 rounded-lg border bg-card space-y-3">
                  <div className="flex items-center justify-end">
                    <input
                      type="checkbox"
                      checked={selectedPendingIds.includes(m.id)}
                      onChange={(e) => {
                        setSelectedPendingIds((prev) =>
                          e.target.checked ? Array.from(new Set([...prev, m.id])) : prev.filter((id) => id !== m.id)
                        );
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={m.avatar_url || ""} />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">{(m.display_name || "U")[0].toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{m.display_name || "Sem nome"}</p>
                      <p className="text-xs text-muted-foreground">{m.joined_at && !isNaN(new Date(m.joined_at).getTime()) ? format(new Date(m.joined_at), "dd/MM/yyyy") : "—"}</p>
                    </div>
                  </div>

                  {answers.length > 0 ? (
                    <div className="space-y-2">
                      {answers.map((a: any, idx: number) => (
                        <div key={`${m.id}-a-${idx}`} className="text-xs rounded-md border p-2 bg-muted/30">
                          <p className="font-medium text-foreground">{a.question || `Pergunta ${idx + 1}`}</p>
                          <p className="text-muted-foreground mt-1 whitespace-pre-wrap">{a.answer || "—"}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="flex gap-1">
                    <Button size="sm" onClick={async () => {
                      await updateMember.mutateAsync({ memberId: m.id, updates: { status: "ACTIVE" } });
                      await (supabase as any)
                        .from("community_join_applications")
                        .update({ status: "APPROVED", reviewed_at: new Date().toISOString(), reviewed_by: currentMember.user_id })
                        .eq("community_id", community.id)
                        .eq("member_id", m.id);
                      queryClient.invalidateQueries({ queryKey: ["circle-join-applications"] });
                    }}>
                      <UserCheck className="h-3.5 w-3.5 mr-1" />Aprovar
                    </Button>
                    <Button size="sm" variant="outline" onClick={async () => {
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
                      <X className="h-3.5 w-3.5 mr-1" />Rejeitar
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Permissions matrix */}
      <Card className="p-4">
        <h3 className="font-semibold text-sm text-foreground mb-3">Permissões por função</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
          <div className="rounded-lg border p-2">
            <p className="font-medium text-foreground mb-1">Owner</p>
            <p className="text-muted-foreground">Controle total da comunidade, billing e permissões.</p>
          </div>
          <div className="rounded-lg border p-2">
            <p className="font-medium text-foreground mb-1">Admin</p>
            <p className="text-muted-foreground">Gerencia membros, conteúdo, aprovações e configurações operacionais.</p>
          </div>
          <div className="rounded-lg border p-2">
            <p className="font-medium text-foreground mb-1">Moderador</p>
            <p className="text-muted-foreground">Moderação de membros/posts sem acesso a billing ou ownership.</p>
          </div>
        </div>
      </Card>

      {/* Recent decisions */}
      {reviewedApplications.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold text-sm text-foreground mb-3">Decisões recentes ({reviewedApplications.length})</h3>
          <div className="space-y-2">
            {reviewedApplications.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg border p-2 text-xs">
                <div>
                  <p className="font-medium text-foreground">{a.status === "APPROVED" ? "Aprovado" : "Rejeitado"}</p>
                  <p className="text-muted-foreground">
                    {a.reviewed_at && !isNaN(new Date(a.reviewed_at).getTime())
                      ? `em ${format(new Date(a.reviewed_at), "dd/MM/yyyy HH:mm")}`
                      : "sem data"}
                  </p>
                </div>
                <Badge variant={a.status === "APPROVED" ? "default" : "destructive"}>
                  {a.status === "APPROVED" ? "APPROVED" : "REJECTED"}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Lifecycle segmentation */}
      <Card className="p-4">
        <h3 className="font-semibold text-sm text-foreground mb-3">Ciclo de membros</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {[
            { key: "ALL", label: "Todos", count: (members || []).length },
            { key: "ACTIVE", label: "Ativos", count: lifecycleCounts.ACTIVE },
            { key: "RISK", label: "Risco", count: lifecycleCounts.RISK },
            { key: "LEFT", label: "Saíram", count: lifecycleCounts.LEFT },
            { key: "BANNED", label: "Banidos", count: lifecycleCounts.BANNED },
          ].map((item: any) => (
            <button
              key={item.key}
              onClick={() => setLifecycleFilter(item.key)}
              className={`rounded-lg border p-2 text-left transition-colors ${lifecycleFilter === item.key ? "border-primary bg-primary/5" : ""}`}
            >
              <p className="text-[11px] text-muted-foreground">{item.label}</p>
              <p className="text-sm font-semibold text-foreground">{item.count}</p>
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={exportMembersCsv}>Exportar segmento atual</Button>
          {lifecycleFilter === "RISK" && canBulkModerate && (
            <Button size="sm" variant="outline" onClick={() => setSelectedPendingIds(filtered.filter((m: any) => ["MUTED", "PENDING"].includes(m.status) || isInactive(m)).map((m: any) => m.id))}>
              Selecionar membros em risco
            </Button>
          )}
        </div>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="Role" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas roles</SelectItem>
            <SelectItem value="OWNER">Owner</SelectItem>
            <SelectItem value="ADMIN">Admin</SelectItem>
            <SelectItem value="MODERATOR">Moderador</SelectItem>
            <SelectItem value="MEMBER">Membro</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos status</SelectItem>
            <SelectItem value="ACTIVE">Ativo</SelectItem>
            <SelectItem value="MUTED">Silenciado</SelectItem>
            <SelectItem value="BANNED">Banido</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="Ordenar" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="joined_at">Data de entrada</SelectItem>
            <SelectItem value="points">Pontos</SelectItem>
            <SelectItem value="name">Nome</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={exportMembersCsv}>Exportar CSV</Button>
      </div>

      {/* Members list */}
      <div className="space-y-2">
        {filtered.map((m: any) => {
          const isOwner = m.role === "OWNER";
          const isSelf = m.id === currentMember.id;
          const canManage = !isOwner && !isSelf;

          return (
            <Card key={m.id} className="p-3 flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={m.avatar_url || ""} />
                <AvatarFallback className="bg-primary/10 text-primary text-xs">{(m.display_name || "U")[0].toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm truncate">{m.display_name || "Sem nome"}</span>
                  <LevelBadge points={m.total_points || 0} size="sm" />
                </div>
                <p className="text-xs text-muted-foreground">
                  {m.total_points || 0} pts · Desde {m.joined_at && !isNaN(new Date(m.joined_at).getTime()) ? format(new Date(m.joined_at), "dd/MM/yy") : "—"}
                  {isInactive(m) ? " · inativo 14d+" : ""}
                </p>
              </div>
              <Badge variant={m.role === "OWNER" || m.role === "ADMIN" ? "default" : "secondary"} className="text-[10px]">
                {ROLE_LABELS[m.role] || m.role}
              </Badge>
              <Badge
                variant={m.status === "ACTIVE" ? "outline" : m.status === "BANNED" ? "destructive" : "secondary"}
                className="text-[10px]"
              >
                {STATUS_LABELS[m.status] || m.status}
              </Badge>

              {canManage && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {/* Role changes */}
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
                    {/* Status actions */}
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
                      <DropdownMenuItem className="text-destructive" onClick={() => setBanModal(m)}>
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
              )}
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">Nenhum membro encontrado.</p>
        )}
      </div>

      {/* Mute Modal */}
      {muteModal && (
        <Dialog open onOpenChange={() => setMuteModal(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Silenciar {muteModal.display_name}?</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label>Motivo</Label>
                <Input value={muteReason} onChange={(e) => setMuteReason(e.target.value)} placeholder="Motivo do silenciamento" />
              </div>
              <div>
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

      {/* Ban Confirmation */}
      {banModal && (
        <AlertDialog open onOpenChange={() => setBanModal(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Banir {banModal.display_name}?</AlertDialogTitle>
              <AlertDialogDescription>O membro perderá acesso à comunidade permanentemente.</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-2">
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

      {/* Bulk confirm */}
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

      {/* Points Modal */}
      {pointsModal && (
        <Dialog open onOpenChange={() => setPointsModal(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {pointsModal.type === "bonus" ? "Dar pontos bônus" : "Remover pontos"} — {pointsModal.member.display_name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label>Quantidade</Label>
                <Input type="number" min={1} value={pointsAmount} onChange={(e) => setPointsAmount(Math.max(1, +e.target.value || 1))} />
              </div>
              <div>
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
  );
}
