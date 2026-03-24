import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { DollarSign, AlertTriangle, ShieldCheck, ShieldAlert, CheckCircle, XCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

const fmt = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  requested: { label: "Solicitado", variant: "secondary" },
  processing: { label: "Processando", variant: "default" },
  paid: { label: "Pago", variant: "default" },
  failed: { label: "Falhou", variant: "destructive" },
  manual_review: { label: "Revisão", variant: "outline" },
};

export default function AdminRiskReview() {
  const queryClient = useQueryClient();
  const [selectedPayout, setSelectedPayout] = useState<any>(null);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject" | null>(null);
  const [reviewNote, setReviewNote] = useState("");

  // Payouts needing review
  const { data: reviewPayouts = [], isLoading } = useQuery({
    queryKey: ["admin-review-payouts"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("payout_requests")
        .select("*")
        .in("status", ["manual_review", "requested"])
        .order("risk_score", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(100);
      return data || [];
    },
  });

  // High risk workspaces
  const { data: recentFailed = [] } = useQuery({
    queryKey: ["admin-failed-payouts"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("payout_requests")
        .select("*")
        .eq("status", "failed")
        .order("processed_at", { ascending: false })
        .limit(20);
      return data || [];
    },
  });

  // Fraud checks for selected payout (use raw fetch since table not in generated types)
  const { data: fraudChecks = [] } = useQuery({
    queryKey: ["fraud-checks", selectedPayout?.id],
    enabled: !!selectedPayout,
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("entity_type", "fraud_check")
        .eq("entity_id", selectedPayout.id)
        .order("created_at", { ascending: true });
      return data || [];
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ payoutId, action }: { payoutId: string; action: "approve" | "reject" }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (action === "approve") {
        await (supabase as any).from("payout_requests").update({
          status: "requested",
          review_reason: reviewNote || null,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          risk_score: 0,
        }).eq("id", payoutId);
      } else {
        await (supabase as any).from("payout_requests").update({
          status: "failed",
          failed_reason: `Rejeitado por admin: ${reviewNote || "Risco elevado"}`,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          processed_at: new Date().toISOString(),
        }).eq("id", payoutId);
      }

      await supabase.from("audit_logs").insert({
        workspace_id: selectedPayout.workspace_id,
        entity_type: "payout_request",
        entity_id: payoutId,
        action: action === "approve" ? "payout_approved" : "payout_rejected",
        user_id: user.id,
        metadata: { note: reviewNote },
      });
    },
    onSuccess: (_, { action }) => {
      toast.success(action === "approve" ? "Payout aprovado e re-enviado para processamento" : "Payout rejeitado");
      queryClient.invalidateQueries({ queryKey: ["admin-review-payouts"] });
      queryClient.invalidateQueries({ queryKey: ["admin-failed-payouts"] });
      setSelectedPayout(null);
      setReviewAction(null);
      setReviewNote("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const reviewCount = reviewPayouts.filter((p: any) => p.status === "manual_review").length;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Revisão de Risco & Payouts</h1>
        <p className="text-sm text-muted-foreground">Aprovar, rejeitar ou monitorar repasses flagados</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-border/50">
          <CardContent className="p-5 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
              <ShieldAlert className="h-4 w-4" /> Aguardando Revisão
            </div>
            {isLoading ? <Skeleton className="h-8 w-16" /> : (
              <p className="text-2xl font-bold text-foreground">{reviewCount}</p>
            )}
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-5 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
              <AlertTriangle className="h-4 w-4" /> Falhos Recentes
            </div>
            {isLoading ? <Skeleton className="h-8 w-16" /> : (
              <p className="text-2xl font-bold text-destructive">{recentFailed.length}</p>
            )}
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-5 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
              <ShieldCheck className="h-4 w-4" /> Solicitações Pendentes
            </div>
            {isLoading ? <Skeleton className="h-8 w-16" /> : (
              <p className="text-2xl font-bold text-foreground">{reviewPayouts.length}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Review Queue */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">Fila de Revisão</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workspace</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-center">Risk Score</TableHead>
                <TableHead>Flags</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reviewPayouts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhum payout pendente
                  </TableCell>
                </TableRow>
              ) : reviewPayouts.map((p: any) => {
                const s = statusConfig[p.status] || { label: p.status, variant: "outline" as const };
                const flags = Array.isArray(p.risk_flags) ? p.risk_flags : [];
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{p.workspace_id?.slice(0, 8)}</TableCell>
                    <TableCell className="text-right font-medium">{fmt(p.net_amount)}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={p.risk_score >= 50 ? "destructive" : p.risk_score >= 20 ? "secondary" : "outline"}>
                        {p.risk_score}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {flags.map((f: any, i: number) => (
                        <span key={i} className="inline-block bg-destructive/10 text-destructive rounded px-1.5 py-0.5 mr-1 text-xs">
                          {f.flag}
                        </span>
                      ))}
                    </TableCell>
                    <TableCell><Badge variant={s.variant}>{s.label}</Badge></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => { setSelectedPayout(p); setReviewAction("approve"); }}>
                          <CheckCircle className="h-3 w-3 mr-1" /> Aprovar
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => { setSelectedPayout(p); setReviewAction("reject"); }}>
                          <XCircle className="h-3 w-3 mr-1" /> Rejeitar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Failed payouts */}
      {recentFailed.length > 0 && (
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-lg">Payouts Falhos Recentes</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Workspace</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentFailed.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm">{p.processed_at ? format(new Date(p.processed_at), "dd/MM HH:mm", { locale: ptBR }) : "-"}</TableCell>
                    <TableCell className="font-mono text-xs">{p.workspace_id?.slice(0, 8)}</TableCell>
                    <TableCell className="text-right">{fmt(p.net_amount)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{p.failed_reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Review Dialog */}
      <Dialog open={!!reviewAction} onOpenChange={() => { setReviewAction(null); setSelectedPayout(null); setReviewNote(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reviewAction === "approve" ? "Aprovar Payout" : "Rejeitar Payout"}</DialogTitle>
          </DialogHeader>
          {selectedPayout && (
            <div className="space-y-4">
              <div className="p-3 bg-muted/50 rounded-lg space-y-1">
                <p className="text-sm"><span className="text-muted-foreground">Valor:</span> <strong>{fmt(selectedPayout.net_amount)}</strong></p>
                <p className="text-sm"><span className="text-muted-foreground">Risk Score:</span> <strong>{selectedPayout.risk_score}</strong></p>
                {selectedPayout.review_reason && (
                  <p className="text-xs text-muted-foreground">{selectedPayout.review_reason}</p>
                )}
              </div>

              {/* Fraud checks */}
              {fraudChecks.length > 0 && (
                <div className="space-y-1">
                  <p className="text-sm font-medium">Verificações</p>
                  {fraudChecks.map((c: any) => (
                    <div key={c.id} className="flex items-center gap-2 text-xs">
                      {c.passed ? (
                        <CheckCircle className="h-3 w-3 text-primary" />
                      ) : (
                        <XCircle className="h-3 w-3 text-destructive" />
                      )}
                      <span>{c.check_type}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">Nota (opcional)</label>
                <Textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="Motivo da decisão..." />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReviewAction(null); setSelectedPayout(null); }}>Cancelar</Button>
            {reviewAction && selectedPayout && (
              <Button
                variant={reviewAction === "approve" ? "default" : "destructive"}
                onClick={() => reviewMutation.mutate({ payoutId: selectedPayout.id, action: reviewAction })}
                disabled={reviewMutation.isPending}
              >
                {reviewMutation.isPending ? "Processando..." : reviewAction === "approve" ? "Confirmar Aprovação" : "Confirmar Rejeição"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
