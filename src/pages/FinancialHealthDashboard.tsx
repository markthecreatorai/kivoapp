import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  DollarSign, TrendingUp, AlertTriangle, Shield, Clock,
  RefreshCw, CreditCard, QrCode, BarChart3, ArrowUpRight
} from "lucide-react";
import { toast } from "sonner";

const fmt = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

export default function FinancialHealthDashboard() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["financial-health-consolidated"],
    queryFn: async () => {
      const [ordersRes, splitsRes, payoutsRes, cbRes, reservesRes, webhooksRes, reconcRes] = await Promise.all([
        (supabase as any).from("orders").select("total_amount, payment_method, status, created_at"),
        (supabase as any).from("split_entries").select("gross_amount, gateway_fee, platform_fee, creator_net, status"),
        (supabase as any).from("payout_requests").select("amount, net_amount, status"),
        (supabase as any).from("chargeback_cases").select("amount, status, sla_deadline_at"),
        (supabase as any).from("reserve_entries").select("amount, status, release_at"),
        (supabase as any).from("webhook_events").select("status, provider, created_at").order("created_at", { ascending: false }).limit(200),
        (supabase as any).from("reconciliation_log").select("status, created_at").order("created_at", { ascending: false }).limit(50),
      ]);

      const orders = ordersRes.data || [];
      const splits = splitsRes.data || [];
      const payouts = payoutsRes.data || [];
      const cbs = cbRes.data || [];
      const reserves = reservesRes.data || [];
      const webhooks = webhooksRes.data || [];
      const reconciliation = reconcRes.data || [];

      // GMV
      const gmv = orders.filter((o: any) => o.status === "paid").reduce((s: number, o: any) => s + (o.total_amount || 0), 0);
      const totalOrders = orders.length;
      const paidOrders = orders.filter((o: any) => o.status === "paid").length;
      const approvalRate = totalOrders > 0 ? Math.round((paidOrders / totalOrders) * 100) : 0;

      // By method
      const pixOrders = orders.filter((o: any) => o.payment_method === "PIX");
      const cardOrders = orders.filter((o: any) => o.payment_method === "CREDIT_CARD");
      const boletoOrders = orders.filter((o: any) => o.payment_method === "BOLETO");
      const pixApproval = pixOrders.length > 0 ? Math.round((pixOrders.filter((o: any) => o.status === "paid").length / pixOrders.length) * 100) : 0;
      const cardApproval = cardOrders.length > 0 ? Math.round((cardOrders.filter((o: any) => o.status === "paid").length / cardOrders.length) * 100) : 0;
      const boletoApproval = boletoOrders.length > 0 ? Math.round((boletoOrders.filter((o: any) => o.status === "paid").length / boletoOrders.length) * 100) : 0;

      // Platform revenue
      const platformRevenue = splits.reduce((s: number, e: any) => s + (e.platform_fee || 0), 0);
      const gatewayFees = splits.reduce((s: number, e: any) => s + (e.gateway_fee || 0), 0);
      const creatorNet = splits.filter((e: any) => e.status !== "refunded").reduce((s: number, e: any) => s + (e.creator_net || 0), 0);

      // Payouts
      const payoutsPaid = payouts.filter((p: any) => p.status === "paid").reduce((s: number, p: any) => s + (p.net_amount || 0), 0);
      const payoutsFailed = payouts.filter((p: any) => p.status === "failed").length;
      const payoutsReview = payouts.filter((p: any) => p.status === "manual_review").length;
      const payoutsPending = payouts.filter((p: any) => p.status === "requested" || p.status === "processing").length;

      // Chargebacks
      const cbOpen = cbs.filter((c: any) => !["won", "lost"].includes(c.status));
      const cbOverSla = cbOpen.filter((c: any) => c.sla_deadline_at && new Date(c.sla_deadline_at) < new Date()).length;
      const cbTotalAmount = cbs.reduce((s: number, c: any) => s + (c.amount || 0), 0);

      // Reserves
      const reserveHeld = reserves.filter((r: any) => r.status === "held").reduce((s: number, r: any) => s + (r.amount || 0), 0);
      const reserveReleased = reserves.filter((r: any) => r.status === "released").reduce((s: number, r: any) => s + (r.amount || 0), 0);

      // Webhooks
      const webhookFailed = webhooks.filter((w: any) => w.status === "failed" || w.status === "dead_letter").length;
      const webhookDlq = webhooks.filter((w: any) => w.status === "dead_letter").length;

      // Reconciliation
      const lastReconc = reconciliation.length > 0 ? reconciliation[0] : null;
      const reconcDivergences = reconciliation.filter((r: any) => r.status === "divergent").length;

      return {
        gmv, approvalRate, pixApproval, cardApproval, boletoApproval,
        platformRevenue, gatewayFees, creatorNet,
        payoutsPaid, payoutsFailed, payoutsReview, payoutsPending,
        cbOpen: cbOpen.length, cbOverSla, cbTotalAmount,
        reserveHeld, reserveReleased,
        webhookFailed, webhookDlq,
        lastReconc, reconcDivergences,
      };
    },
  });

  const handleRunReconciliation = async () => {
    toast.info("Iniciando reconciliação manual...");
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/reconcile-asaas`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cron-secret": "manual-trigger" },
        body: JSON.stringify({ manual: true }),
      });
      if (res.ok) toast.success("Reconciliação executada");
      else toast.error("Falha na reconciliação");
    } catch { toast.error("Erro de conexão"); }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-72" />
        <div className="grid gap-4 md:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
      </div>
    );
  }

  const d = data!;
  const riskLevel = d.cbOpen > 3 || d.webhookDlq > 0 || d.reconcDivergences > 2 ? "critical" : d.cbOpen > 0 || d.payoutsFailed > 0 ? "warning" : "healthy";

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Saúde Financeira</h1>
          <p className="text-muted-foreground text-sm">Visão consolidada de produção</p>
        </div>
        <div className="flex gap-2">
          <Badge variant={riskLevel === "healthy" ? "default" : riskLevel === "warning" ? "secondary" : "destructive"}>
            {riskLevel === "healthy" ? "✅ Saudável" : riskLevel === "warning" ? "⚠️ Atenção" : "🔴 Crítico"}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
          </Button>
        </div>
      </div>

      {/* GMV & Revenue */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><DollarSign className="h-4 w-4" /> GMV Total</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{fmt(d.gmv)}</p><p className="text-xs text-muted-foreground">Aprovação: {d.approvalRate}%</p></CardContent></Card>

        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><TrendingUp className="h-4 w-4" /> Receita Plataforma</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{fmt(d.platformRevenue)}</p><p className="text-xs text-muted-foreground">Gateway: {fmt(d.gatewayFees)}</p></CardContent></Card>

        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><ArrowUpRight className="h-4 w-4" /> Líquido Creators</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{fmt(d.creatorNet)}</p></CardContent></Card>

        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><BarChart3 className="h-4 w-4" /> Aprovação por Método</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            <div className="flex items-center gap-2 text-sm"><QrCode className="h-3 w-3" /> PIX: {d.pixApproval}%</div>
            <div className="flex items-center gap-2 text-sm"><CreditCard className="h-3 w-3" /> Cartão: {d.cardApproval}%</div>
            <div className="flex items-center gap-2 text-sm">Boleto: {d.boletoApproval}%</div>
          </CardContent></Card>
      </div>

      {/* Payouts & Chargebacks */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Payouts Pagos</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-emerald-600">{fmt(d.payoutsPaid)}</p></CardContent></Card>

        <Card className={d.payoutsFailed > 0 ? "border-destructive" : ""}>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Payouts Falhos / Em Revisão</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{d.payoutsFailed} <span className="text-base text-muted-foreground">/ {d.payoutsReview}</span></p>
            <p className="text-xs text-muted-foreground">Pendentes: {d.payoutsPending}</p></CardContent></Card>

        <Card className={d.cbOpen > 0 ? "border-amber-500" : ""}>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-4 w-4" /> Chargebacks Abertos</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{d.cbOpen}</p>
            <p className="text-xs text-destructive">{d.cbOverSla > 0 ? `${d.cbOverSla} fora do SLA!` : "Dentro do SLA"}</p>
            <p className="text-xs text-muted-foreground">Total: {fmt(d.cbTotalAmount)}</p></CardContent></Card>

        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><Shield className="h-4 w-4" /> Reserva Financeira</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{fmt(d.reserveHeld)}</p>
            <p className="text-xs text-muted-foreground">Liberado: {fmt(d.reserveReleased)}</p></CardContent></Card>
      </div>

      {/* Infra health */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className={d.webhookDlq > 0 ? "border-destructive" : ""}>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Webhooks</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm">Falhas recentes: <span className="font-bold">{d.webhookFailed}</span></p>
            <p className="text-sm">Dead-letter: <span className={`font-bold ${d.webhookDlq > 0 ? "text-destructive" : ""}`}>{d.webhookDlq}</span></p>
          </CardContent></Card>

        <Card className={d.reconcDivergences > 0 ? "border-amber-500" : ""}>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Reconciliação</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm">Última: {d.lastReconc ? new Date(d.lastReconc.created_at).toLocaleString("pt-BR") : "N/A"}</p>
            <p className="text-sm">Divergências: <span className="font-bold">{d.reconcDivergences}</span></p>
            <Button variant="outline" size="sm" className="mt-2" onClick={handleRunReconciliation}>
              <RefreshCw className="h-3 w-3 mr-1" /> Rodar Agora
            </Button>
          </CardContent></Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><Clock className="h-4 w-4" /> Jobs Ativos</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex items-center gap-2"><Badge variant="default" className="text-[10px]">06:00</Badge> reconcile-asaas</div>
            <div className="flex items-center gap-2"><Badge variant="default" className="text-[10px]">07:00</Badge> process-payouts</div>
            <div className="flex items-center gap-2"><Badge variant="default" className="text-[10px]">08:00</Badge> release-reserves</div>
          </CardContent></Card>
      </div>
    </div>
  );
}
