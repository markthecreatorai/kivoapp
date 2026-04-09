import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Settings } from "lucide-react";
import { format, subDays, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { BalanceCards } from "@/components/income/BalanceCards";
import { RevenueChart } from "@/components/income/RevenueChart";
import { FinancialHistory } from "@/components/income/FinancialHistory";
import { CashOutModal } from "@/components/income/CashOutModal";
import { SecurityReservesSection } from "@/components/income/SecurityReservesSection";

export default function Income() {
  const { currentWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const workspaceId = currentWorkspace?.id;

  const [showCashOut, setShowCashOut] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showReserves, setShowReserves] = useState(false);

  const fmt = (cents: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

  // Wallet balance (available for withdrawal)
  const { data: balance, isLoading: loadingBalance } = useQuery({
    queryKey: ["wallet-balance", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase.rpc("get_wallet_balance", { p_workspace_id: workspaceId! });
      if (data && data.length > 0) return data[0];
      return { available_balance: 0, pending_balance: 0, total_balance: 0 };
    },
  });

  // Revenue from transactions table
  const { data: txSummary, isLoading: loadingTx } = useQuery({
    queryKey: ["tx-summary", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("transactions")
        .select("gross_amount, net_amount, platform_fee, gateway_fee, status")
        .eq("workspace_id", workspaceId!)
        .in("status", ["paid", "available"]);

      const txRows = rows || [];
      const gross = txRows.reduce((s, r: any) => s + Number(r.gross_amount || 0), 0);
      const net = txRows.reduce((s, r: any) => s + Number(r.net_amount || 0), 0);
      return { gross, net };
    },
  });

  // Reserve balance from security_reserves
  const { data: reserveTotal = 0, isLoading: loadingReserves } = useQuery({
    queryKey: ["reserve-total", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("security_reserves")
        .select("amount")
        .eq("workspace_id", workspaceId!)
        .eq("status", "held");
      return (rows || []).reduce((s, r: any) => s + Number(r.amount || 0), 0);
    },
  });

  const availableBalance = Number(balance?.available_balance || 0);
  const grossRevenue = txSummary?.gross || 0;
  const netRevenue = txSummary?.net || 0;

  // Chart data from transactions (last 30 days)
  const thirtyDaysAgo = useMemo(() => startOfDay(subDays(new Date(), 30)).toISOString(), []);
  const { data: txChart = [], isLoading: loadingChart } = useQuery({
    queryKey: ["income-tx-chart", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("created_at, gross_amount, status")
        .eq("workspace_id", workspaceId!)
        .in("status", ["paid", "available"])
        .gte("created_at", thirtyDaysAgo)
        .order("created_at", { ascending: true });
      return data || [];
    },
  });

  const chartData = useMemo(() => {
    const now = new Date();
    const map: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      map[format(subDays(now, i), "yyyy-MM-dd")] = 0;
    }
    txChart.forEach((o: any) => {
      const d = format(new Date(o.created_at), "yyyy-MM-dd");
      if (map[d] !== undefined) map[d] += Number(o.gross_amount || 0);
    });
    return Object.entries(map).map(([date, value]) => ({
      date,
      label: format(new Date(date), "dd MMM", { locale: ptBR }),
      value: value / 100,
    }));
  }, [txChart]);

  const isLoading = loadingBalance || loadingTx || loadingReserves || loadingChart;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Minha Renda</h1>
          <p className="text-sm text-muted-foreground">Acompanhe seus ganhos e faça saques</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/settings?tab=payments")} className="text-muted-foreground">
          <Settings className="h-4 w-4 mr-1" /> Conta bancária
        </Button>
      </div>

      {/* 4 Balance Cards */}
      <BalanceCards
        grossRevenue={grossRevenue}
        netRevenue={netRevenue}
        availableBalance={availableBalance}
        reserveBalance={reserveTotal}
        isLoading={isLoading}
        onCashOut={() => setShowCashOut(true)}
        onBreakdown={() => setShowBreakdown(true)}
        onReserves={() => setShowReserves(true)}
        fmt={fmt}
      />

      <RevenueChart chartData={chartData} isLoading={isLoading} />

      <FinancialHistory workspaceId={workspaceId} fmt={fmt} />

      {/* Security Reserves - shown in modal or inline */}
      {showReserves && (
        <SecurityReservesSection workspaceId={workspaceId} fmt={fmt} />
      )}

      <CashOutModal open={showCashOut} onOpenChange={setShowCashOut} availableBalance={availableBalance} fmt={fmt} />

      {/* Breakdown Modal */}
      <Dialog open={showBreakdown} onOpenChange={setShowBreakdown}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detalhes da Receita</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Receita bruta</span>
              <span className="font-medium">{fmt(grossRevenue)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Taxas (gateway + plataforma)</span>
              <span className="font-medium text-destructive">−{fmt(grossRevenue - netRevenue)}</span>
            </div>
            <div className="border-t pt-2 flex justify-between text-sm">
              <span className="text-muted-foreground font-medium">Receita líquida</span>
              <span className="font-bold text-foreground">{fmt(netRevenue)}</span>
            </div>
            <div className="border-t pt-2 flex justify-between text-sm">
              <span className="text-muted-foreground">Disponível para saque</span>
              <span className="font-medium">{fmt(availableBalance)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Em reserva de segurança</span>
              <span className="font-medium">{fmt(reserveTotal)}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBreakdown(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
