import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, FileText, Clock, CheckCircle, XCircle, Upload, Shield } from "lucide-react";
import { format, differenceInHours } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

const fmt = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; color: string }> = {
  new: { label: "Novo", variant: "destructive", color: "text-destructive" },
  evidence_pending: { label: "Aguardando Evidência", variant: "secondary", color: "text-amber-600" },
  submitted: { label: "Submetido", variant: "default", color: "text-primary" },
  won: { label: "Ganho", variant: "default", color: "text-emerald-600" },
  lost: { label: "Perdido", variant: "destructive", color: "text-destructive" },
};

export default function AdminChargebacks() {
  const queryClient = useQueryClient();
  const [selectedCase, setSelectedCase] = useState<any>(null);
  const [newStatus, setNewStatus] = useState("");
  const [note, setNote] = useState("");

  const { data: cases = [], isLoading } = useQuery({
    queryKey: ["admin-chargeback-cases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chargeback_cases")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: timeline = [] } = useQuery({
    queryKey: ["chargeback-timeline", selectedCase?.id],
    enabled: !!selectedCase,
    queryFn: async () => {
      const { data } = await supabase
        .from("chargeback_timeline")
        .select("*")
        .eq("case_id", selectedCase.id)
        .order("created_at", { ascending: true });
      return data || [];
    },
  });

  const { data: evidences = [] } = useQuery({
    queryKey: ["chargeback-evidences", selectedCase?.id],
    enabled: !!selectedCase,
    queryFn: async () => {
      const { data } = await supabase
        .from("chargeback_evidences")
        .select("*")
        .eq("case_id", selectedCase.id)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ caseId, status, noteText }: { caseId: string; status: string; noteText: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const updateData: Record<string, any> = { status };
      if (status === "won" || status === "lost") {
        updateData.resolved_at = new Date().toISOString();
      }

      const { error: updateErr } = await supabase.from("chargeback_cases").update(updateData as any).eq("id", caseId);
      if (updateErr) throw updateErr;

      const { error: tlErr } = await supabase.from("chargeback_timeline").insert({
        case_id: caseId,
        action: `status_changed_to_${status}`,
        actor_id: user.id,
        note: noteText || `Status alterado para ${statusConfig[status]?.label || status}`,
      });
      if (tlErr) throw tlErr;

      // If case won → reverse the chargeback impact
      if (status === "won" && selectedCase) {
        await supabase.from("split_entries").update({
          status: "available",
          refunded_at: null,
        }).eq("order_id", selectedCase.order_id).eq("status", "refunded");

        await supabase.from("wallet_ledger").update({ status: "canceled" })
          .eq("order_id", selectedCase.order_id).eq("type", "chargeback");

        await supabase.from("chargeback_timeline").insert({
          case_id: caseId,
          action: "financial_reversed",
          actor_id: user.id,
          note: "Chargeback ganho — split e ledger restaurados",
        });
      }

      await supabase.from("audit_logs").insert({
        workspace_id: selectedCase.workspace_id,
        entity_type: "chargeback_case",
        entity_id: caseId,
        action: `chargeback_${status}`,
        user_id: user.id,
        metadata: { note: noteText, previous_status: selectedCase.status },
      });
    },
    onSuccess: () => {
      toast.success("Status atualizado");
      queryClient.invalidateQueries({ queryKey: ["admin-chargeback-cases"] });
      queryClient.invalidateQueries({ queryKey: ["chargeback-timeline"] });
      setSelectedCase(null);
      setNewStatus("");
      setNote("");
    },
    onError: (e: any) => toast.error(e.message || "Erro ao atualizar status"),
  });

  const openCases = cases.filter(c => !["won", "lost"].includes(c.status));
  const slaExpiring = openCases.filter(c =>
    c.sla_deadline_at && differenceInHours(new Date(c.sla_deadline_at), new Date()) < 48
  );
  const totalImpact = cases
    .filter(c => c.status === "lost")
    .reduce((s, c) => s + (c.financial_impact || 0), 0);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Chargebacks & Disputas</h1>
        <p className="text-sm text-muted-foreground">Gestão operacional de disputas financeiras</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-border/50">
          <CardContent className="p-5 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
              <AlertTriangle className="h-4 w-4" /> Casos Abertos
            </div>
            {isLoading ? <Skeleton className="h-8 w-16" /> : (
              <p className="text-2xl font-bold text-foreground">{openCases.length}</p>
            )}
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-5 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
              <Clock className="h-4 w-4" /> SLA Expirando
            </div>
            {isLoading ? <Skeleton className="h-8 w-16" /> : (
              <p className="text-2xl font-bold text-destructive">{slaExpiring.length}</p>
            )}
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-5 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
              <Shield className="h-4 w-4" /> Total Casos
            </div>
            {isLoading ? <Skeleton className="h-8 w-16" /> : (
              <p className="text-2xl font-bold text-foreground">{cases.length}</p>
            )}
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-5 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
              <XCircle className="h-4 w-4" /> Impacto (Perdidos)
            </div>
            {isLoading ? <Skeleton className="h-8 w-16" /> : (
              <p className="text-2xl font-bold text-destructive">{fmt(totalImpact)}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">Casos de Chargeback</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead>Order</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>SLA</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cases.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Nenhum caso de chargeback
                  </TableCell>
                </TableRow>
              ) : cases.map((c) => {
                const s = statusConfig[c.status] || { label: c.status, variant: "outline" as const };
                const hoursLeft = c.sla_deadline_at
                  ? differenceInHours(new Date(c.sla_deadline_at), new Date())
                  : null;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="text-sm">{format(new Date(c.created_at), "dd/MM/yy", { locale: ptBR })}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{c.workspace_id?.slice(0, 8)}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{c.order_id?.slice(0, 8)}</TableCell>
                    <TableCell className="text-right font-medium">{fmt(c.amount)}</TableCell>
                    <TableCell className="text-xs max-w-[120px] truncate">{c.reason || "-"}</TableCell>
                    <TableCell>
                      {hoursLeft !== null && !["won", "lost"].includes(c.status) ? (
                        <span className={`text-xs font-medium ${hoursLeft < 48 ? "text-destructive" : "text-muted-foreground"}`}>
                          {hoursLeft > 0 ? `${hoursLeft}h` : "Expirado"}
                        </span>
                      ) : "-"}
                    </TableCell>
                    <TableCell><Badge variant={s.variant}>{s.label}</Badge></TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => { setSelectedCase(c); setNewStatus(c.status); }}>
                        <FileText className="h-3 w-3 mr-1" /> Detalhes
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!selectedCase} onOpenChange={() => { setSelectedCase(null); setNewStatus(""); setNote(""); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Caso #{selectedCase?.id?.slice(0, 8)}</DialogTitle>
            <DialogDescription>
              Order: {selectedCase?.order_id?.slice(0, 8)} — {fmt(selectedCase?.amount || 0)}
            </DialogDescription>
          </DialogHeader>
          {selectedCase && (
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Status:</span> <Badge variant={statusConfig[selectedCase.status]?.variant || "outline"}>{statusConfig[selectedCase.status]?.label || selectedCase.status}</Badge></div>
                <div><span className="text-muted-foreground">Motivo:</span> {selectedCase.reason || "-"}</div>
                <div><span className="text-muted-foreground">SLA:</span> {selectedCase.sla_deadline_at ? format(new Date(selectedCase.sla_deadline_at), "dd/MM HH:mm", { locale: ptBR }) : "-"}</div>
                <div><span className="text-muted-foreground">Gateway ID:</span> <span className="font-mono text-xs">{selectedCase.gateway_dispute_id || "-"}</span></div>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Timeline</p>
                {timeline.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem eventos</p>
                ) : (
                  <div className="space-y-2">
                    {timeline.map((t) => (
                      <div key={t.id} className="flex gap-2 text-xs border-l-2 border-border pl-3 py-1">
                        <span className="text-muted-foreground whitespace-nowrap">{format(new Date(t.created_at), "dd/MM HH:mm")}</span>
                        <div>
                          <span className="font-medium">{t.action}</span>
                          {t.note && <p className="text-muted-foreground">{t.note}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {evidences.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Evidências ({evidences.length})</p>
                  <div className="space-y-1">
                    {evidences.map((e) => (
                      <div key={e.id} className="flex items-center gap-2 text-xs p-2 bg-muted/30 rounded">
                        <Upload className="h-3 w-3 text-muted-foreground" />
                        <a href={e.file_url} target="_blank" rel="noopener noreferrer" className="text-primary underline">{e.file_name || "Arquivo"}</a>
                        {e.description && <span className="text-muted-foreground">— {e.description}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!["won", "lost"].includes(selectedCase.status) && (
                <div className="space-y-3 border-t border-border pt-3">
                  <p className="text-sm font-medium">Atualizar Status</p>
                  <Select value={newStatus} onValueChange={setNewStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="evidence_pending">Aguardando Evidência</SelectItem>
                      <SelectItem value="submitted">Submetido ao Gateway</SelectItem>
                      <SelectItem value="won">Ganho ✅</SelectItem>
                      <SelectItem value="lost">Perdido ❌</SelectItem>
                    </SelectContent>
                  </Select>
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota sobre a decisão..." rows={2} />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedCase(null)}>Fechar</Button>
            {selectedCase && !["won", "lost"].includes(selectedCase.status) && newStatus !== selectedCase.status && (
              <Button
                onClick={() => updateStatusMutation.mutate({ caseId: selectedCase.id, status: newStatus, noteText: note })}
                disabled={updateStatusMutation.isPending}
                variant={newStatus === "lost" ? "destructive" : "default"}
              >
                {updateStatusMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}