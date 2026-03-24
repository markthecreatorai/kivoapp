import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Flag, Eye, EyeOff, Trash2, AlertTriangle, Ban, CheckCircle, Clock, Shield,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Props {
  community: any;
  currentMember: any;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  REVIEWED: "bg-blue-100 text-blue-800",
  RESOLVED: "bg-green-100 text-green-800",
  DISMISSED: "bg-muted text-muted-foreground",
};

const REASON_LABELS: Record<string, string> = {
  spam: "Spam",
  harassment: "Assédio",
  inappropriate: "Impróprio",
  misinformation: "Desinformação",
  other: "Outro",
};

export default function AdminModerationTab({ community, currentMember }: Props) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [resolveModal, setResolveModal] = useState<any>(null);
  const [resolveNote, setResolveNote] = useState("");
  const [resolveAction, setResolveAction] = useState<string>("dismiss");

  // Reports
  const { data: reports, isLoading } = useQuery({
    queryKey: ["circle-reports", community.id, statusFilter],
    queryFn: async () => {
      let q = supabase
        .from("community_reports" as any)
        .select("*")
        .eq("community_id", community.id)
        .order("created_at", { ascending: false });

      if (statusFilter !== "ALL") {
        q = q.eq("status", statusFilter);
      }

      const { data } = await q.limit(50);
      if (!data?.length) return [];

      // Get reporter and target member info
      const memberIds = [...new Set([
        ...(data as any[]).map((r: any) => r.reporter_id),
        ...(data as any[]).filter((r: any) => r.target_member_id).map((r: any) => r.target_member_id),
      ])];

      const { data: members } = await supabase
        .from("community_members")
        .select("id, display_name, avatar_url")
        .in("id", memberIds);

      const memberMap: Record<string, any> = {};
      members?.forEach((m: any) => { memberMap[m.id] = m; });

      return (data as any[]).map((r: any) => ({
        ...r,
        reporter: memberMap[r.reporter_id],
        targetMember: r.target_member_id ? memberMap[r.target_member_id] : null,
      }));
    },
  });

  // Moderation logs
  const { data: modLogs } = useQuery({
    queryKey: ["circle-mod-logs", community.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("community_moderation_logs" as any)
        .select("*")
        .eq("community_id", community.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (!data?.length) return [];

      const memberIds = [...new Set([
        ...(data as any[]).map((l: any) => l.moderator_id),
        ...(data as any[]).filter((l: any) => l.target_member_id).map((l: any) => l.target_member_id),
      ])];

      const { data: members } = await supabase
        .from("community_members")
        .select("id, display_name, avatar_url")
        .in("id", memberIds);

      const memberMap: Record<string, any> = {};
      members?.forEach((m: any) => { memberMap[m.id] = m; });

      return (data as any[]).map((l: any) => ({
        ...l,
        moderator: memberMap[l.moderator_id],
        target: l.target_member_id ? memberMap[l.target_member_id] : null,
      }));
    },
  });

  const resolveReport = useMutation({
    mutationFn: async () => {
      if (!resolveModal) return;

      // Update report status
      await supabase.from("community_reports" as any)
        .update({
          status: resolveAction === "dismiss" ? "DISMISSED" : "RESOLVED",
          resolved_at: new Date().toISOString(),
          resolved_by: currentMember.id,
          resolution_note: resolveNote || null,
        } as any)
        .eq("id", resolveModal.id);

      // Log moderation action
      await supabase.from("community_moderation_logs" as any).insert({
        community_id: community.id,
        moderator_id: currentMember.id,
        target_member_id: resolveModal.target_member_id,
        action: resolveAction,
        reason: resolveNote || resolveModal.reason,
        post_id: resolveModal.post_id,
        comment_id: resolveModal.comment_id,
      } as any);

      // Execute action
      if (resolveAction === "hide_post" && resolveModal.post_id) {
        await supabase.from("community_posts")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", resolveModal.post_id);
      }
      if (resolveAction === "hide_comment" && resolveModal.comment_id) {
        await supabase.from("community_comments")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", resolveModal.comment_id);
      }
      if (resolveAction === "warn" && resolveModal.target_member_id) {
        // Just log it — warning is the log entry itself
      }
      if (resolveAction === "ban" && resolveModal.target_member_id) {
        await supabase.from("community_members")
          .update({
            status: "BANNED",
            banned_at: new Date().toISOString(),
            ban_reason: resolveNote || "Banido após denúncia",
          })
          .eq("id", resolveModal.target_member_id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circle-reports"] });
      queryClient.invalidateQueries({ queryKey: ["circle-mod-logs"] });
      queryClient.invalidateQueries({ queryKey: ["circle-admin-members"] });
      setResolveModal(null);
      setResolveNote("");
      setResolveAction("dismiss");
      toast.success("Denúncia processada!");
    },
    onError: () => toast.error("Erro ao processar"),
  });

  const pendingCount = reports?.filter((r: any) => r.status === "PENDING").length || 0;

  return (
    <div className="space-y-6">
      <Tabs defaultValue="reports">
        <TabsList>
          <TabsTrigger value="reports">
            <Flag className="h-4 w-4 mr-1.5" />Denúncias
            {pendingCount > 0 && <Badge className="ml-1.5 h-5 px-1.5 text-[10px]">{pendingCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="logs">
            <Shield className="h-4 w-4 mr-1.5" />Auditoria
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="mt-4 space-y-4">
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos</SelectItem>
                <SelectItem value="PENDING">Pendentes</SelectItem>
                <SelectItem value="RESOLVED">Resolvidos</SelectItem>
                <SelectItem value="DISMISSED">Descartados</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(!reports || reports.length === 0) && (
            <div className="text-center py-12">
              <CheckCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Nenhuma denúncia {statusFilter === "PENDING" ? "pendente" : ""}</p>
            </div>
          )}

          {reports?.map((report: any) => (
            <Card key={report.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Flag className="h-4 w-4 text-destructive" />
                  <Badge className={STATUS_COLORS[report.status] || ""}>{report.status}</Badge>
                  <Badge variant="outline">{REASON_LABELS[report.reason] || report.reason}</Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(report.created_at), "dd/MM/yy HH:mm")}
                </span>
              </div>

              <div className="text-sm space-y-1">
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">Denunciado por:</span>{" "}
                  {report.reporter?.display_name || "Membro"}
                </p>
                {report.target_member_id && (
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">Alvo:</span>{" "}
                    {report.targetMember?.display_name || "Membro"}
                  </p>
                )}
                {report.post_id && (
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">Post:</span> {report.post_id.slice(0, 8)}...
                  </p>
                )}
                {report.details && (
                  <p className="text-muted-foreground italic">"{report.details}"</p>
                )}
              </div>

              {report.status === "PENDING" && (
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => {
                    setResolveModal(report);
                    setResolveAction("dismiss");
                  }}>
                    <EyeOff className="h-3.5 w-3.5 mr-1" />Descartar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => {
                    setResolveModal(report);
                    setResolveAction(report.post_id ? "hide_post" : report.comment_id ? "hide_comment" : "warn");
                  }}>
                    <Eye className="h-3.5 w-3.5 mr-1" />Ocultar conteúdo
                  </Button>
                  {report.target_member_id && (
                    <Button size="sm" variant="destructive" onClick={() => {
                      setResolveModal(report);
                      setResolveAction("ban");
                    }}>
                      <Ban className="h-3.5 w-3.5 mr-1" />Banir
                    </Button>
                  )}
                </div>
              )}

              {report.resolution_note && (
                <p className="text-xs text-muted-foreground border-t border-border pt-2">
                  Resolução: {report.resolution_note}
                </p>
              )}
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="logs" className="mt-4 space-y-2">
          {(!modLogs || modLogs.length === 0) && (
            <p className="text-center text-sm text-muted-foreground py-8">Nenhuma ação registrada.</p>
          )}
          {modLogs?.map((log: any) => (
            <Card key={log.id} className="p-3 flex items-center gap-3 text-sm">
              <Shield className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p>
                  <span className="font-medium">{log.moderator?.display_name || "Mod"}</span>
                  {" → "}
                  <Badge variant="outline" className="text-[10px]">{log.action}</Badge>
                  {log.target && (
                    <span className="text-muted-foreground"> sobre {log.target.display_name}</span>
                  )}
                </p>
                {log.reason && <p className="text-xs text-muted-foreground truncate">{log.reason}</p>}
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {format(new Date(log.created_at), "dd/MM HH:mm")}
              </span>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      {/* Resolve Modal */}
      {resolveModal && (
        <Dialog open onOpenChange={() => setResolveModal(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {resolveAction === "dismiss" ? "Descartar denúncia" :
                 resolveAction === "ban" ? "Banir membro" :
                 resolveAction === "warn" ? "Advertir membro" :
                 "Ocultar conteúdo"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <Label>Nota de resolução</Label>
                <Textarea
                  value={resolveNote}
                  onChange={(e) => setResolveNote(e.target.value)}
                  placeholder="Motivo da ação..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setResolveModal(null)}>Cancelar</Button>
              <Button
                variant={resolveAction === "ban" ? "destructive" : "default"}
                onClick={() => resolveReport.mutate()}
                disabled={resolveReport.isPending}
              >
                Confirmar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
