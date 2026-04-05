import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DollarSign, TrendingUp, TrendingDown, Users, CreditCard, AlertTriangle,
  Mail, Download, ArrowUpRight, ArrowDownRight, Activity, BarChart3, UserCheck,
  Info, RefreshCw, ShoppingBag, Percent,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, CartesianGrid, Legend, AreaChart, Area,
} from "recharts";
import { format, subDays, startOfDay, subMonths, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

const PERIODS = [
  { label: "7D", value: 7 },
  { label: "30D", value: 30 },
  { label: "90D", value: 90 },
  { label: "180D", value: 180 },
  { label: "1A", value: 365 },
] as const;

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v / 100);

const formatCurrencyRaw = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

/* ── Metric definitions tooltip ── */
const METRIC_DEFS: Record<string, string> = {
  mrr: "MRR = soma do valor mensal das assinaturas ativas (community + workspace). Assinaturas yearly são divididas por 12.",
  arr: "ARR = MRR × 12.",
  churn: "Churn = assinaturas canceladas no período / total de assinaturas ativas no início do período × 100.",
  ltv: "LTV = receita total acumulada / número de clientes únicos com pelo menos 1 compra paga.",
  checkout_conversion: "Conversão de Checkout = pedidos pagos / sessões de checkout iniciadas × 100.",
  gmv: "GMV = soma do valor total de todos os pedidos pagos no período.",
};

function MetricTooltip({ metricKey }: { metricKey: string }) {
  const def = METRIC_DEFS[metricKey];
  if (!def) return null;
  return (
    <TooltipProvider>
      <UITooltip>
        <TooltipTrigger asChild>
          <Info className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">{def}</TooltipContent>
      </UITooltip>
    </TooltipProvider>
  );
}

function StatCard({
  title, value, previousValue, icon: Icon, format: fmt = "number", metricKey,
}: {
  title: string; value: number; previousValue?: number; icon: React.ElementType;
  format?: "currency" | "currency_raw" | "number" | "percent"; metricKey?: string;
}) {
  const formatted = fmt === "currency" ? formatCurrency(value)
    : fmt === "currency_raw" ? formatCurrencyRaw(value)
    : fmt === "percent" ? `${value.toFixed(1)}%`
    : value.toLocaleString("pt-BR");

  const change = previousValue && previousValue > 0
    ? ((value - previousValue) / previousValue) * 100
    : undefined;

  return (
    <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
          {metricKey && <MetricTooltip metricKey={metricKey} />}
        </div>
        <Icon className="h-5 w-5 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-foreground">{formatted}</span>
          {change !== undefined && (
            <span className={cn("text-xs font-medium flex items-center gap-0.5",
              change >= 0 ? "text-emerald-600" : "text-rose-600"
            )}>
              {change >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {Math.abs(change).toFixed(1)}%
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">vs período anterior</p>
      </CardContent>
    </Card>
  );
}

export default function AnalyticsExecutive() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id;
  const [periodDays, setPeriodDays] = useState(30);
  const [productFilter, setProductFilter] = useState<string>("all");

  const now = useMemo(() => new Date(), []);
  const from = useMemo(() => startOfDay(subDays(now, periodDays)), [periodDays, now]);
  const prevFrom = useMemo(() => startOfDay(subDays(from, periodDays)), [from, periodDays]);
  const fromISO = from.toISOString();
  const prevFromISO = prevFrom.toISOString();
  const toISO = now.toISOString();

  // ── Orders (current + previous) ──
  const { data: orders = [], isLoading: loadingOrders } = useQuery({
    queryKey: ["exec-orders", workspaceId, fromISO],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, total_amount, status, payment_method, created_at, product_id, customer_email")
        .eq("workspace_id", workspaceId!)
        .gte("created_at", prevFromISO)
        .lte("created_at", toISO);
      return data ?? [];
    },
  });

  // ── Products for filter ──
  const { data: products = [] } = useQuery({
    queryKey: ["exec-products", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name")
        .eq("workspace_id", workspaceId!)
        .order("name");
      return data ?? [];
    },
  });

  // ── Subscriptions (circle) for MRR ──
  const { data: circleSubscriptions = [] } = useQuery({
    queryKey: ["exec-circle-subs", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase
        .from("circle_subscriptions")
        .select("id, status, plan_id, created_at, canceled_at, community_id")
        .eq("community_id", workspaceId!); // community_id links to workspace indirectly
      // Fetch all subs for all communities in workspace
      const { data: communities } = await supabase
        .from("communities")
        .select("id")
        .eq("workspace_id", workspaceId!);
      if (!communities?.length) return [];
      const communityIds = communities.map(c => c.id);
      const { data: subs } = await supabase
        .from("circle_subscriptions")
        .select("id, status, plan_id, created_at, canceled_at")
        .in("community_id", communityIds);
      return subs ?? [];
    },
  });

  // ── Circle plans for pricing ──
  const { data: circlePlans = [] } = useQuery({
    queryKey: ["exec-circle-plans", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data: communities } = await supabase
        .from("communities")
        .select("id")
        .eq("workspace_id", workspaceId!);
      if (!communities?.length) return [];
      const { data: plans } = await supabase
        .from("circle_plans")
        .select("id, price_cents, interval, is_active")
        .in("community_id", communities.map(c => c.id));
      return plans ?? [];
    },
  });

  // ── Leads ──
  const { data: leads = [] } = useQuery({
    queryKey: ["exec-leads", workspaceId, prevFromISO],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("id, created_at, status")
        .eq("workspace_id", workspaceId!)
        .gte("created_at", prevFromISO);
      return data ?? [];
    },
  });

  // ── Email campaigns ──
  const { data: campaigns = [] } = useQuery({
    queryKey: ["exec-campaigns", workspaceId, fromISO],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase
        .from("email_campaigns")
        .select("id, sent_count, failed_count, total_recipients, status, created_at")
        .eq("workspace_id", workspaceId!)
        .gte("created_at", fromISO);
      return data ?? [];
    },
  });

  // ── Checkout sessions for funnel ──
  const { data: checkouts = [] } = useQuery({
    queryKey: ["exec-checkouts", workspaceId, fromISO],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase
        .from("checkout_sessions")
        .select("id, status, created_at")
        .eq("workspace_id", workspaceId!)
        .gte("created_at", fromISO);
      return data ?? [];
    },
  });

  // ── Analytics events ──
  const { data: analyticsEvents = [] } = useQuery({
    queryKey: ["exec-events", workspaceId, fromISO],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase
        .from("analytics_events")
        .select("event_type, created_at")
        .eq("workspace_id", workspaceId!)
        .gte("created_at", fromISO);
      return data ?? [];
    },
  });

  // ── Retention data (platform-wide for admin) ──
  const { data: retentionData } = useQuery({
    queryKey: ["exec-retention", periodDays],
    queryFn: async () => {
      const now = new Date();
      const { data: allWorkspaces } = await supabase
        .from("workspaces")
        .select("id, created_at")
        .lte("created_at", subDays(now, 1).toISOString());

      if (!allWorkspaces?.length) return null;

      const checkRetention = async (daysAgo: number) => {
        const windowStart = subDays(now, daysAgo + periodDays).toISOString();
        const windowEnd = subDays(now, daysAgo).toISOString();
        const eligibleWs = allWorkspaces.filter(ws => new Date(ws.created_at) <= new Date(windowEnd));
        if (eligibleWs.length === 0) return { rate: 0, eligible: 0, active: 0 };
        const eligibleIds = eligibleWs.map(ws => ws.id);
        const { data: activeOrders } = await supabase
          .from("orders").select("workspace_id")
          .in("workspace_id", eligibleIds.slice(0, 100))
          .gte("created_at", windowStart).lte("created_at", windowEnd);
        const { data: activeProducts } = await supabase
          .from("products").select("workspace_id")
          .in("workspace_id", eligibleIds.slice(0, 100))
          .gte("created_at", windowStart).lte("created_at", windowEnd);
        const activeSet = new Set([
          ...(activeOrders || []).map((o: any) => o.workspace_id),
          ...(activeProducts || []).map((p: any) => p.workspace_id),
        ]);
        return { rate: eligibleWs.length > 0 ? (activeSet.size / eligibleWs.length) * 100 : 0, eligible: eligibleWs.length, active: activeSet.size };
      };

      const [d1, d7, d30] = await Promise.all([checkRetention(1), checkRetention(7), checkRetention(30)]);
      const [prevD1, prevD7, prevD30] = await Promise.all([checkRetention(1 + periodDays), checkRetention(7 + periodDays), checkRetention(30 + periodDays)]);
      return { d1, d7, d30, prevD1, prevD7, prevD30 };
    },
  });

  // ── Filtered orders by product ──
  const filteredOrders = useMemo(() => {
    if (productFilter === "all") return orders;
    return orders.filter(o => o.product_id === productFilter);
  }, [orders, productFilter]);

  // ── Computed metrics ──
  const currentOrders = useMemo(() => filteredOrders.filter(o => new Date(o.created_at) >= from), [filteredOrders, from]);
  const previousOrders = useMemo(() => filteredOrders.filter(o => new Date(o.created_at) < from), [filteredOrders, from]);

  const paidCurrent = currentOrders.filter(o => o.status === "PAID");
  const paidPrevious = previousOrders.filter(o => o.status === "PAID");

  const gmvCurrent = paidCurrent.reduce((s, o) => s + Number(o.total_amount || 0), 0);
  const gmvPrevious = paidPrevious.reduce((s, o) => s + Number(o.total_amount || 0), 0);

  // ── MRR / ARR ──
  const { mrr, arr } = useMemo(() => {
    const planMap = new Map(circlePlans.map(p => [p.id, p]));
    let monthlyRevenue = 0;

    circleSubscriptions
      .filter(s => s.status === "active" || s.status === "trialing")
      .forEach(sub => {
        const plan = planMap.get(sub.plan_id);
        if (!plan) return;
        const cents = plan.price_cents || 0;
        if (plan.interval === "monthly") monthlyRevenue += cents;
        else if (plan.interval === "yearly") monthlyRevenue += Math.round(cents / 12);
        else if (plan.interval === "quarterly") monthlyRevenue += Math.round(cents / 3);
      });

    return { mrr: monthlyRevenue, arr: monthlyRevenue * 12 };
  }, [circleSubscriptions, circlePlans]);

  // ── Churn rate ──
  const churnRate = useMemo(() => {
    const activeSubs = circleSubscriptions.filter(s => s.status === "active" || s.status === "trialing");
    const canceledInPeriod = circleSubscriptions.filter(s =>
      s.canceled_at && new Date(s.canceled_at) >= from && new Date(s.canceled_at) <= now
    );
    const startBase = activeSubs.length + canceledInPeriod.length;
    return startBase > 0 ? (canceledInPeriod.length / startBase) * 100 : 0;
  }, [circleSubscriptions, from, now]);

  const prevChurnRate = useMemo(() => {
    const canceledPrev = circleSubscriptions.filter(s =>
      s.canceled_at && new Date(s.canceled_at) >= prevFrom && new Date(s.canceled_at) < from
    );
    const activeSubs = circleSubscriptions.filter(s => s.status === "active" || s.status === "trialing");
    const startBase = activeSubs.length + canceledPrev.length;
    return startBase > 0 ? (canceledPrev.length / startBase) * 100 : 0;
  }, [circleSubscriptions, prevFrom, from]);

  // ── LTV ──
  const ltv = useMemo(() => {
    const allPaidOrders = filteredOrders.filter(o => o.status === "PAID");
    const totalRevenue = allPaidOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
    const uniqueCustomers = new Set(allPaidOrders.map(o => o.customer_email).filter(Boolean)).size;
    return uniqueCustomers > 0 ? totalRevenue / uniqueCustomers : 0;
  }, [filteredOrders]);

  // ── Checkout conversion ──
  const checkoutConversion = useMemo(() => {
    const started = checkouts.length;
    return started > 0 ? (paidCurrent.length / started) * 100 : 0;
  }, [checkouts, paidCurrent]);

  const currentLeads = leads.filter(l => new Date(l.created_at) >= from);
  const previousLeads = leads.filter(l => new Date(l.created_at) < from);
  const leadsWithPurchase = currentLeads.filter(l => l.status === "CUSTOMER" || l.status === "customer");
  const leadConversion = currentLeads.length > 0 ? (leadsWithPurchase.length / currentLeads.length) * 100 : 0;

  // ── Payment method breakdown ──
  const paymentBreakdown = useMemo(() => {
    const methods = ["pix", "credit_card", "boleto"];
    return methods.map(method => {
      const methodOrders = currentOrders.filter(o => (o.payment_method || "").toLowerCase() === method);
      const paid = methodOrders.filter(o => o.status === "PAID").length;
      const failed = methodOrders.filter(o => o.status === "FAILED").length;
      const total = paid + failed;
      const refunded = methodOrders.filter(o => o.status === "REFUNDED").length;
      return {
        method: method === "credit_card" ? "Cartão" : method === "pix" ? "PIX" : "Boleto",
        total, paid, failed, refunded,
        approvalRate: total > 0 ? ((paid / total) * 100).toFixed(1) : "0",
      };
    });
  }, [currentOrders]);

  // ── Revenue chart ──
  const revenueChart = useMemo(() => {
    const map: Record<string, number> = {};
    paidCurrent.forEach(o => {
      const day = format(new Date(o.created_at), "dd/MM");
      map[day] = (map[day] || 0) + Number(o.total_amount || 0);
    });
    return Array.from({ length: Math.min(periodDays, 180) }, (_, i) => {
      const d = format(subDays(now, periodDays - 1 - i), "dd/MM");
      return { date: d, revenue: (map[d] || 0) / 100 };
    });
  }, [paidCurrent, periodDays, now]);

  // ── MRR trend chart (monthly) ──
  const mrrTrend = useMemo(() => {
    const planMap = new Map(circlePlans.map(p => [p.id, p]));
    const months: { month: string; mrr: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(now, i);
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      let monthlyRev = 0;
      circleSubscriptions
        .filter(s => {
          const created = new Date(s.created_at);
          const canceled = s.canceled_at ? new Date(s.canceled_at) : null;
          return created <= monthEnd && (!canceled || canceled > monthEnd);
        })
        .forEach(sub => {
          const plan = planMap.get(sub.plan_id);
          if (!plan) return;
          const cents = plan.price_cents || 0;
          if (plan.interval === "monthly") monthlyRev += cents;
          else if (plan.interval === "yearly") monthlyRev += Math.round(cents / 12);
          else if (plan.interval === "quarterly") monthlyRev += Math.round(cents / 3);
        });
      months.push({ month: format(d, "MMM", { locale: ptBR }), mrr: monthlyRev / 100 });
    }
    return months;
  }, [circleSubscriptions, circlePlans, now]);

  // ── Funnel ──
  const funnelData = useMemo(() => {
    const pageViews = analyticsEvents.filter(e => e.event_type === "PAGE_VIEW").length;
    const checkoutStarted = checkouts.length;
    const purchases = paidCurrent.length;
    return [
      { name: "Visitas", value: pageViews, color: "hsl(var(--primary))" },
      { name: "Checkouts", value: checkoutStarted, color: "hsl(25, 95%, 53%)" },
      { name: "Compras", value: purchases, color: "hsl(160, 84%, 39%)" },
    ].map((s, i, arr) => ({
      ...s,
      rate: i === 0 ? "100" : arr[i - 1].value > 0 ? ((s.value / arr[i - 1].value) * 100).toFixed(1) : "0",
    }));
  }, [analyticsEvents, checkouts, paidCurrent]);

  // ── CRM email metrics ──
  const emailMetrics = useMemo(() => {
    const sent = campaigns.reduce((s, c) => s + (c.sent_count || 0), 0);
    const failed = campaigns.reduce((s, c) => s + (c.failed_count || 0), 0);
    return { sent, failed, campaigns: campaigns.length };
  }, [campaigns]);

  // ── CSV Export ──
  const exportCSV = (data: any[], filename: string) => {
    if (!data.length) return;
    const headers = Object.keys(data[0]);
    const csv = [headers.join(","), ...data.map(r => headers.map(h => `"${r[h] ?? ""}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportFullReport = () => {
    const reportData = paidCurrent.map(o => ({
      id: o.id,
      valor: Number(o.total_amount || 0) / 100,
      status: o.status,
      metodo: o.payment_method || "",
      email: o.customer_email || "",
      produto: o.product_id || "",
      data: o.created_at,
    }));
    exportCSV(reportData, `relatorio-executivo-${format(now, "yyyy-MM-dd")}`);
  };

  const loading = loadingOrders;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard Executivo BI</h1>
          <p className="text-sm text-muted-foreground">Métricas de decisão do seu negócio</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Product filter */}
          <Select value={productFilter} onValueChange={setProductFilter}>
            <SelectTrigger className="w-44 h-9 text-sm">
              <ShoppingBag className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="Todos os produtos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os produtos</SelectItem>
              {products.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Period selector */}
          <div className="flex gap-1 p-1 bg-card border border-border/50 rounded-lg shadow-sm">
            {PERIODS.map(p => (
              <Button
                key={p.value}
                variant="ghost"
                size="sm"
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-md transition-all",
                  periodDays === p.value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
                onClick={() => setPeriodDays(p.value)}
              >
                {p.label}
              </Button>
            ))}
          </div>

          <Button variant="outline" size="sm" onClick={exportFullReport} className="h-9">
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
        </div>
      </div>

      {/* Row 1: Revenue KPIs */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="bg-card border border-border/50 shadow-sm rounded-xl">
              <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
              <CardContent><Skeleton className="h-8 w-20" /></CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="GMV" value={gmvCurrent} previousValue={gmvPrevious} icon={DollarSign} format="currency" metricKey="gmv" />
          <StatCard title="MRR" value={mrr} icon={RefreshCw} format="currency" metricKey="mrr" />
          <StatCard title="ARR" value={arr} icon={TrendingUp} format="currency" metricKey="arr" />
          <StatCard title="Vendas" value={paidCurrent.length} previousValue={paidPrevious.length} icon={CreditCard} />
        </div>
      )}

      {/* Row 2: Subscription & Customer KPIs */}
      {!loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Churn Rate"
            value={churnRate}
            previousValue={prevChurnRate > 0 ? prevChurnRate : undefined}
            icon={TrendingDown}
            format="percent"
            metricKey="churn"
          />
          <StatCard title="LTV Médio" value={ltv} icon={Users} format="currency" metricKey="ltv" />
          <StatCard title="Conversão Checkout" value={checkoutConversion} icon={Percent} format="percent" metricKey="checkout_conversion" />
          <StatCard title="Leads Capturados" value={currentLeads.length} previousValue={previousLeads.length} icon={Users} />
        </div>
      )}

      {/* MRR Trend + Revenue Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* MRR Trend */}
        <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg font-semibold">Evolução MRR</CardTitle>
              <MetricTooltip metricKey="mrr" />
            </div>
            <Button variant="ghost" size="sm" onClick={() => exportCSV(mrrTrend, "mrr-trend")}>
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={mrrTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `R$${v}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                    formatter={(v: number) => [formatCurrencyRaw(v), "MRR"]}
                  />
                  <Area type="monotone" dataKey="mrr" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.15)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Revenue Chart */}
        <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-semibold">Receita Diária</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => exportCSV(revenueChart, "receita-diaria")}>
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `R$${v}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                    formatter={(v: number) => [formatCurrencyRaw(v), "Receita"]}
                  />
                  <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Retention Cards */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
          <UserCheck className="h-5 w-5 text-primary" />
          Retenção de Creators
          <Badge variant="secondary" className="text-[10px]">Ativo = publicou produto OU recebeu venda</Badge>
        </h2>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "D1", data: retentionData?.d1, prev: retentionData?.prevD1 },
            { label: "D7", data: retentionData?.d7, prev: retentionData?.prevD7 },
            { label: "D30", data: retentionData?.d30, prev: retentionData?.prevD30 },
          ].map(({ label, data, prev }) => {
            const rate = data?.rate ?? 0;
            const prevRate = prev?.rate ?? 0;
            const change = prevRate > 0 ? rate - prevRate : undefined;
            return (
              <Card key={label} className="bg-card border border-border/50 shadow-sm rounded-xl">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <h3 className="text-sm font-medium text-muted-foreground">Retenção {label}</h3>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-foreground">{rate.toFixed(1)}%</span>
                    {change !== undefined && Math.abs(change) > 0.1 && (
                      <span className={cn("text-xs font-medium flex items-center gap-0.5",
                        change >= 0 ? "text-emerald-600" : "text-rose-600"
                      )}>
                        {change >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {Math.abs(change).toFixed(1)}pp
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{data?.active ?? 0} ativos / {data?.eligible ?? 0} elegíveis</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <Tabs defaultValue="funnel" className="space-y-4">
        <TabsList className="bg-card border border-border/50">
          <TabsTrigger value="funnel">Funil</TabsTrigger>
          <TabsTrigger value="payments">Pagamentos</TabsTrigger>
          <TabsTrigger value="crm">CRM / Email</TabsTrigger>
        </TabsList>

        {/* Funnel Tab */}
        <TabsContent value="funnel">
          <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Funil de Conversão</CardTitle>
            </CardHeader>
            <CardContent>
              {funnelData.every(f => f.value === 0) ? (
                <p className="text-sm text-muted-foreground text-center py-8">Sem dados no período</p>
              ) : (
                <div className="space-y-4">
                  {funnelData.map((step) => (
                    <div key={step.name} className="flex items-center gap-4">
                      <div className="w-28 text-sm font-medium text-foreground">{step.name}</div>
                      <div className="flex-1 h-10 bg-muted/30 rounded-lg overflow-hidden relative">
                        <div
                          className="h-full rounded-lg transition-all duration-500"
                          style={{ width: `${Math.max(parseFloat(step.rate), 2)}%`, backgroundColor: step.color }}
                        />
                        <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-foreground">
                          {step.value.toLocaleString()} ({step.rate}%)
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payments Tab */}
        <TabsContent value="payments">
          <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-semibold">Saúde de Pagamentos</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => exportCSV(paymentBreakdown, "pagamentos")}>
                <Download className="h-4 w-4 mr-1" /> CSV
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Método</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Aprovados</TableHead>
                    <TableHead className="text-right">Falhas</TableHead>
                    <TableHead className="text-right">Reembolsos</TableHead>
                    <TableHead className="text-right">Taxa Aprovação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentBreakdown.map(row => (
                    <TableRow key={row.method}>
                      <TableCell className="font-medium">{row.method}</TableCell>
                      <TableCell className="text-right">{row.total}</TableCell>
                      <TableCell className="text-right text-emerald-600">{row.paid}</TableCell>
                      <TableCell className="text-right text-rose-600">{row.failed}</TableCell>
                      <TableCell className="text-right text-amber-600">{row.refunded}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={Number(row.approvalRate) >= 90 ? "default" : "destructive"}>{row.approvalRate}%</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {paymentBreakdown.every(p => p.total === 0) && (
                <p className="text-sm text-muted-foreground text-center py-6">Sem transações no período</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* CRM / Email Tab */}
        <TabsContent value="crm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
              <CardHeader><CardTitle className="text-lg font-semibold">CRM</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Leads capturados</span>
                  <span className="text-lg font-bold text-foreground">{currentLeads.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Leads com compra</span>
                  <span className="text-lg font-bold text-foreground">{leadsWithPurchase.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Conversão Lead → Cliente</span>
                  <span className="text-lg font-bold text-foreground">{leadConversion.toFixed(1)}%</span>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
              <CardHeader><CardTitle className="text-lg font-semibold">Campanhas de Email</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Campanhas enviadas</span>
                  <span className="text-lg font-bold text-foreground">{emailMetrics.campaigns}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Emails enviados</span>
                  <span className="text-lg font-bold text-emerald-600">{emailMetrics.sent}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Falhas de envio</span>
                  <span className="text-lg font-bold text-rose-600">{emailMetrics.failed}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Activation Metrics */}
      <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
        <CardHeader><CardTitle className="text-lg font-semibold">Métricas de Ativação</CardTitle></CardHeader>
        <CardContent>
          <ActivationMetrics workspaceId={workspaceId} periodDays={periodDays} />
        </CardContent>
      </Card>

      {/* Cohort section */}
      <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold">Coorte Mensal — Retenção de Atividade</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => {
            const { cohort } = { cohort: [] as any[] }; // placeholder
          }}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
        </CardHeader>
        <CardContent>
          <CohortTable workspaceId={workspaceId} onExport={exportCSV} />
        </CardContent>
      </Card>

      {/* Metric definitions */}
      <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
        <CardHeader><CardTitle className="text-sm font-semibold text-muted-foreground">📖 Definições de Métricas</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {Object.entries(METRIC_DEFS).map(([key, def]) => (
              <div key={key} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground uppercase">{key}</span>: {def}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Beta Cohort Onboarding Log */}
      <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Cohort Beta — Log de Onboarding
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BetaCohortLog />
        </CardContent>
      </Card>
    </div>
  );
}

function BetaCohortLog() {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["beta-cohort-log"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("beta_cohort_log")
        .select("*")
        .order("sent_at", { ascending: false })
        .limit(50);
      return (data ?? []) as Array<{
        id: string; workspace_id: string; user_email: string;
        step: string; status: string; sent_at: string;
        opened_at: string | null; actioned_at: string | null;
      }>;
    },
  });

  const stepLabels: Record<string, string> = {
    d0_welcome: "D0 Boas-vindas", d1_activate: "D1 Ativação",
    d3_publish: "D3 Publicação", d7_first_sale: "D7 1ª Venda",
  };
  const statusColor: Record<string, string> = {
    sent: "bg-blue-100 text-blue-700", opened: "bg-amber-100 text-amber-700", actioned: "bg-emerald-100 text-emerald-700",
  };

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (!logs.length) return <p className="text-sm text-muted-foreground text-center py-6">Nenhum nudge enviado ainda</p>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Email</TableHead>
          <TableHead>Etapa</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Enviado em</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {logs.map(log => (
          <TableRow key={log.id}>
            <TableCell className="font-medium text-foreground text-sm">{log.user_email}</TableCell>
            <TableCell><Badge variant="outline" className="text-xs">{stepLabels[log.step] || log.step}</Badge></TableCell>
            <TableCell>
              <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", statusColor[log.status] || "")}>{log.status}</span>
            </TableCell>
            <TableCell className="text-right text-sm text-muted-foreground">{format(new Date(log.sent_at), "dd/MM HH:mm")}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function CohortTable({ workspaceId, onExport }: { workspaceId?: string; onExport?: (data: any[], filename: string) => void }) {
  const { data: allOrders = [] } = useQuery({
    queryKey: ["cohort-orders", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const sixMonthsAgo = subMonths(new Date(), 6).toISOString();
      const { data } = await supabase
        .from("orders")
        .select("customer_email, created_at")
        .eq("workspace_id", workspaceId!)
        .eq("status", "PAID")
        .gte("created_at", sixMonthsAgo);
      return data ?? [];
    },
  });

  const cohort = useMemo(() => {
    if (!allOrders.length) return [];
    const customerFirstMonth: Record<string, string> = {};
    const customerMonths: Record<string, Set<string>> = {};

    allOrders.forEach(o => {
      const email = o.customer_email;
      const month = format(new Date(o.created_at), "yyyy-MM");
      if (!customerFirstMonth[email] || month < customerFirstMonth[email]) customerFirstMonth[email] = month;
      if (!customerMonths[email]) customerMonths[email] = new Set();
      customerMonths[email].add(month);
    });

    const months = [...new Set(Object.values(customerFirstMonth))].sort();
    const now = new Date();

    return months.slice(-4).map(cohortMonth => {
      const cohortCustomers = Object.entries(customerFirstMonth).filter(([_, m]) => m === cohortMonth).map(([email]) => email);
      const total = cohortCustomers.length;
      const periods = [1, 2, 3].map(offset => {
        const targetMonth = format(subMonths(new Date(cohortMonth + "-15"), -offset), "yyyy-MM");
        if (new Date(targetMonth + "-01") > now) return null;
        const active = cohortCustomers.filter(email => customerMonths[email]?.has(targetMonth)).length;
        return total > 0 ? ((active / total) * 100).toFixed(0) : "0";
      });
      return {
        month: format(new Date(cohortMonth + "-01"), "MMM yyyy", { locale: ptBR }),
        total, m1: periods[0], m2: periods[1], m3: periods[2],
      };
    });
  }, [allOrders]);

  if (!cohort.length) return <p className="text-sm text-muted-foreground text-center py-6">Sem dados de coorte disponíveis</p>;

  return (
    <div>
      {onExport && (
        <div className="flex justify-end mb-2">
          <Button variant="ghost" size="sm" onClick={() => onExport(cohort, "coorte-mensal")}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mês de Entrada</TableHead>
            <TableHead className="text-right">Clientes</TableHead>
            <TableHead className="text-right">+1 mês</TableHead>
            <TableHead className="text-right">+2 meses</TableHead>
            <TableHead className="text-right">+3 meses</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cohort.map(row => (
            <TableRow key={row.month}>
              <TableCell className="font-medium capitalize">{row.month}</TableCell>
              <TableCell className="text-right">{row.total}</TableCell>
              <TableCell className="text-right">{row.m1 !== null ? `${row.m1}%` : "—"}</TableCell>
              <TableCell className="text-right">{row.m2 !== null ? `${row.m2}%` : "—"}</TableCell>
              <TableCell className="text-right">{row.m3 !== null ? `${row.m3}%` : "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ActivationMetrics({ workspaceId, periodDays }: { workspaceId?: string; periodDays: number }) {
  const { data: progress = [] } = useQuery({
    queryKey: ["activation-progress", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("onboarding_progress")
        .select("step_key, completed_at, created_at")
        .eq("workspace_id", workspaceId!);
      return (data ?? []) as Array<{ step_key: string; completed_at: string | null; created_at: string }>;
    },
  });

  const { data: workspace } = useQuery({
    queryKey: ["activation-workspace", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase
        .from("workspaces")
        .select("created_at, activated_at")
        .eq("id", workspaceId!)
        .single();
      return data;
    },
  });

  const metrics = useMemo(() => {
    if (!workspace) return null;
    const wsCreated = new Date(workspace.created_at);
    const productStep = progress.find(p => p.step_key === "product_created" && p.completed_at);
    const saleStep = progress.find(p => p.step_key === "first_sale" && p.completed_at);
    const timeToProduct = productStep ? Math.round((new Date(productStep.completed_at!).getTime() - wsCreated.getTime()) / (1000 * 60 * 60)) : null;
    const timeToSale = saleStep ? Math.round((new Date(saleStep.completed_at!).getTime() - wsCreated.getTime()) / (1000 * 60 * 60 * 24)) : null;
    const completedSteps = progress.filter(p => p.completed_at).length;
    const activationRate = (completedSteps / 5) * 100;
    return { timeToProduct, timeToSale, activationRate, isActivated: !!workspace.activated_at };
  }, [progress, workspace]);

  if (!metrics) return <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="text-center p-4 rounded-lg bg-muted/30">
        <p className="text-2xl font-bold text-foreground">{metrics.timeToProduct !== null ? `${metrics.timeToProduct}h` : "—"}</p>
        <p className="text-xs text-muted-foreground mt-1">Signup → 1º Produto</p>
      </div>
      <div className="text-center p-4 rounded-lg bg-muted/30">
        <p className="text-2xl font-bold text-foreground">{metrics.timeToSale !== null ? `${metrics.timeToSale}d` : "—"}</p>
        <p className="text-xs text-muted-foreground mt-1">Signup → 1ª Venda</p>
      </div>
      <div className="text-center p-4 rounded-lg bg-muted/30">
        <p className="text-2xl font-bold text-foreground">{metrics.activationRate.toFixed(0)}%</p>
        <p className="text-xs text-muted-foreground mt-1">Progresso de Ativação</p>
      </div>
      <div className="text-center p-4 rounded-lg bg-muted/30">
        <p className={cn("text-2xl font-bold", metrics.isActivated ? "text-emerald-600" : "text-amber-600")}>
          {metrics.isActivated ? "Ativado ✓" : "Pendente"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">Status</p>
      </div>
    </div>
  );
}
