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
import { AlertTriangle, ShieldCheck, ShieldAlert, CheckCircle, XCircle } from "lucide-react";
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

  const { data: reviewPayouts = [], isLoading } = useQuery({
    queryKey: ["admin-review-payouts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payout_requests")
        .select("*")
        .in("status", ["manual_review", "requested"])
        .order("created_at", { ascending: true })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: recentFailed = [] } = useQuery({
    queryKey: ["admin-failed-payouts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("payout_requests")
        .select("*")
        .eq("status", "failed")
        .order("processed_at", { ascending: false })
        .limit(20);
      return data || [];
    },
  });

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
        const { error } = await supabase.from("payout_requests").update({
          status: "requested",
          review_reason: reviewNote || null,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          risk_score: 0,
        }).eq("id", payoutId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("payout_requests").update({
          status: "failed",
          failed_reason: `Rejeitado por admin: ${reviewNote || "Risco elevado"}`,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          processed_at: new Date().toISOString(),
        }).eq("id", payoutId);
        if (error) throw error;
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
    onError: (e: any) => toast.error(e.message || "Erro ao processar revisão"),
  });

  const reviewCount = reviewPayouts.filter(p => p.status === "manual_review").length;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Revisão de Risco & Payouts</h1>
        <p className="text-sm text-muted-foreground">Aprovar, rejeitar ou monitorar repasses flagados</p>
      </div>

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
              ) : reviewPayouts.map((p) => {
                const s = statusConfig[p.status] || { label: p.status, variant: "outline" as const };
                const riskScore = (p as any).risk_score ?? 0;
                const flags = Array.isArray((p as any).risk_flags) ? (p as any).risk_flags : [];
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{p.workspace_id?.slice(0, 8)}</TableCell>
                    <TableCell className="text-right font-medium">{fmt(p.net_amount)}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={riskScore >= 50 ? "destructive" : riskScore >= 20 ? "secondary" : "outline"}>
                        {riskScore}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {flags.map((f: any, i: number) => (
                        <span key={i} className="inline-block bg-destructive/10 text-destructive rounded px-1.5 py-0.5 mr-1 text-xs">
                          {f.flag || f}
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
                {recentFailed.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm">{p.processed_at ? format(new Date(p.processed_at), "dd/MM HH:mm", { locale: ptBR }) : "-"}</TableCell>
                    <TableCell className="font-mono text-xs">{p.workspace_id?.slice(0, 8)}</TableCell>
                    <TableCell className="text-right">{fmt(p.net_amount)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{p.failed_reason || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!reviewAction} onOpenChange={() => { setReviewAction(null); setSelectedPayout(null); setReviewNote(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reviewAction === "approve" ? "Aprovar Payout" : "Rejeitar Payout"}</DialogTitle>
          </DialogHeader>
          {selectedPayout && (
            <div className="space-y-4">
              <div className="p-3 bg-muted/50 rounded-lg space-y-1">
                <p className="text-sm"><span className="text-muted-foreground">Valor:</span> <strong>{fmt(selectedPayout.net_amount)}</strong></p>
                <p className="text-sm"><span className="text-muted-foreground">Risk Score:</span> <strong>{(selectedPayout as any).risk_score ?? 0}</strong></p>
                {(selectedPayout as any).review_reason && (
                  <p className="text-xs text-muted-foreground">{(selectedPayout as any).review_reason}</p>
                )}
              </div>

              {fraudChecks.length > 0 && (
                <div className="space-y-1">
                  <p className="text-sm font-medium">Verificações</p>
                  {fraudChecks.map((c) => {
                    const meta = (c.metadata || {}) as Record<string, any>;
                    return (
                      <div key={c.id} className="flex items-center gap-2 text-xs">
                        {meta.passed ? (
                          <CheckCircle className="h-3 w-3 text-primary" />
                        ) : (
                          <XCircle className="h-3 w-3 text-destructive" />
                        )}
                        <span>{meta.check_type || c.action}</span>
                      </div>
                    );
                  })}
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