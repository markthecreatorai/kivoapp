import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Loader2, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { supabase } from "@/integrations/supabase/client";
import { useCancelSubscription } from "@/hooks/useCancelSubscription";

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  creator: "Creator",
  "creator-pro": "Creator Pro",
};

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Ativo", variant: "default" },
  trialing: { label: "Trial", variant: "secondary" },
  past_due: { label: "Pagamento Pendente", variant: "destructive" },
  canceled: { label: "Cancelado", variant: "outline" },
  pending: { label: "Pendente", variant: "secondary" },
};

interface SubData {
  plan_code: string;
  status: string;
  billing_cycle: string | null;
  current_period_end: string | null;
  canceled_at: string | null;
}

export function SettingsBilling() {
  const { currentWorkspace } = useWorkspace();
  const { cancelSubscription, loading: canceling } = useCancelSubscription();
  const [sub, setSub] = useState<SubData | null>(null);
  const [loadingSub, setLoadingSub] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!currentWorkspace) return;
    setLoadingSub(true);
    supabase
      .from("workspace_subscriptions")
      .select("plan_code, status, billing_cycle, current_period_end, canceled_at")
      .eq("workspace_id", currentWorkspace.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setSub(data || { plan_code: "free", status: "active", billing_cycle: null, current_period_end: null, canceled_at: null });
        setLoadingSub(false);
      });
  }, [currentWorkspace]);

  const handleCancel = async () => {
    const ok = await cancelSubscription();
    if (ok) {
      setSub((prev) => prev ? { ...prev, status: "canceled", canceled_at: new Date().toISOString() } : prev);
    }
    setConfirmOpen(false);
  };

  const planCode = sub?.plan_code || "free";
  const planLabel = PLAN_LABELS[planCode] || planCode;
  const statusInfo = STATUS_LABELS[sub?.status || "active"] || STATUS_LABELS.active;
  const isActive = ["active", "trialing", "past_due"].includes(sub?.status || "");
  const isFree = planCode === "free";

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
        <CardHeader>
          <CardTitle className="text-lg">Seu Plano</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingSub ? (
            <div className="flex items-center gap-2 py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm text-muted-foreground">Carregando...</span>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xl font-bold">{planLabel}</p>
                  <p className="text-sm text-muted-foreground">
                    {isFree
                      ? "Gratuito para sempre"
                      : sub?.billing_cycle === "annual"
                      ? "Cobrado anualmente"
                      : "Cobrado mensalmente"}
                  </p>
                  {sub?.current_period_end && isActive && !isFree && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Próxima cobrança: {new Date(sub.current_period_end).toLocaleDateString("pt-BR")}
                    </p>
                  )}
                  {sub?.canceled_at && (
                    <p className="text-xs text-destructive mt-1">
                      Cancelado em {new Date(sub.canceled_at).toLocaleDateString("pt-BR")}
                    </p>
                  )}
                </div>
                <Badge variant={statusInfo.variant} className="text-sm">{statusInfo.label}</Badge>
              </div>
              <div className="flex gap-3">
                {isActive && !isFree && (
                  <Button
                    variant="outline"
                    className="text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={() => setConfirmOpen(true)}
                    disabled={canceling}
                  >
                    {canceling && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Cancelar Assinatura
                  </Button>
                )}
                <Button asChild>
                  <Link to="/billing/upgrade-flow?source_ui=settings_billing">
                    {isFree || sub?.status === "canceled" ? "Assinar Plano" : "Trocar Plano"}
                  </Link>
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Cancel confirmation */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Cancelar Assinatura
            </DialogTitle>
            <DialogDescription>
              Tem certeza que deseja cancelar seu plano <strong>{planLabel}</strong>?
              Sua assinatura será encerrada imediatamente e você perderá acesso aos recursos do plano.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={canceling}>
              Manter Plano
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={canceling}>
              {canceling && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirmar Cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
