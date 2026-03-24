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

const HOLD_DAYS = 14;

export default function Income() {
  const { currentWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const workspaceId = currentWorkspace?.id;

  const [showCashOut, setShowCashOut] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const fmt = (cents: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

  // Balance from ledger function
  const { data: balance, isLoading: loadingBalance } = useQuery({
    queryKey: ["wallet-balance", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase.rpc("get_wallet_balance", { p_workspace_id: workspaceId! });
      if (data && data.length > 0) return data[0];
      return { available_balance: 0, pending_balance: 0, total_balance: 0 };
    },
  });

  const availableBalance = Number(balance?.available_balance || 0);
  const pendingBalance = Number(balance?.pending_balance || 0);

  // Chart data from orders (last 30 days)
  const thirtyDaysAgo = useMemo(() => startOfDay(subDays(new Date(), 30)).toISOString(), []);
  const { data: orders = [], isLoading: loadingOrders } = useQuery({
    queryKey: ["income-orders-chart", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("created_at, total_amount, status")
        .eq("workspace_id", workspaceId!)
        .eq("status", "COMPLETED")
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
    orders.forEach((o: any) => {
      const d = format(new Date(o.created_at), "yyyy-MM-dd");
      if (map[d] !== undefined) map[d] += Number(o.total_amount || 0);
    });
    return Object.entries(map).map(([date, value]) => ({
      date,
      label: format(new Date(date), "dd MMM", { locale: ptBR }),
      value: value / 100,
    }));
  }, [orders]);

  const isLoading = loadingBalance || loadingOrders;

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

      <RevenueChart chartData={chartData} isLoading={isLoading} />

      <BalanceCards
        availableBalance={availableBalance}
        pendingBalance={pendingBalance}
        isLoading={isLoading}
        holdDays={HOLD_DAYS}
        onCashOut={() => setShowCashOut(true)}
        onBreakdown={() => setShowBreakdown(true)}
        fmt={fmt}
      />

      <FinancialHistory workspaceId={workspaceId} fmt={fmt} />

      <CashOutModal open={showCashOut} onOpenChange={setShowCashOut} availableBalance={availableBalance} fmt={fmt} />

      {/* Breakdown Modal */}
      <Dialog open={showBreakdown} onOpenChange={setShowBreakdown}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Breakdown do Saldo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Saldo total</span>
              <span className="font-medium">{fmt(availableBalance + pendingBalance)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Disponível para saque</span>
              <span className="font-medium text-foreground">{fmt(availableBalance)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Em hold ({HOLD_DAYS} dias)</span>
              <span className="font-medium">{fmt(pendingBalance)}</span>
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
