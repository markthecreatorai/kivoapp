import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { PeriodFilter } from "@/components/dashboard/PeriodFilter";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DollarSign, Eye, UserCheck, TrendingUp, MousePointerClick, ShoppingCart, CreditCard, RefreshCw,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { format, subDays, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

const FUNNEL_COLORS = [
  "hsl(6, 95%, 60%)",
  "hsl(25, 95%, 53%)",
  "hsl(45, 93%, 47%)",
  "hsl(160, 84%, 39%)",
];

const SOURCE_LABELS: Record<string, string> = {
  instagram: "Instagram",
  google: "Google",
  tiktok: "TikTok",
  whatsapp: "WhatsApp",
  facebook: "Facebook",
  twitter: "Twitter",
};

export default function Analytics() {
  const { currentWorkspace } = useWorkspace();
  const [period, setPeriod] = useState<number | "custom">(30);
  const workspaceId = currentWorkspace?.id;

  const dateRange = useMemo(() => {
    if (period === "custom") return { from: subDays(new Date(), 30), to: new Date() };
    return { from: startOfDay(subDays(new Date(), period as number)), to: new Date() };
  }, [period]);

  const fromISO = dateRange.from.toISOString();
  const toISO = dateRange.to.toISOString();

  // ── Paid orders ──
  const { data: orders = [], isLoading: loadingOrders } = useQuery({
    queryKey: ["analytics-orders", workspaceId, fromISO, toISO],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("total_amount, created_at, product_id")
        .eq("workspace_id", workspaceId!)
        .eq("status", "PAID")
        .gte("created_at", fromISO)
        .lte("created_at", toISO);
      return data ?? [];
    },
  });

  // ── Analytics events ──
  const { data: events = [], isLoading: loadingEvents } = useQuery({
    queryKey: ["analytics-events", workspaceId, fromISO, toISO],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase
        .from("analytics_events")
        .select("event_type, created_at, metadata, page_path")
        .eq("workspace_id", workspaceId!)
        .gte("created_at", fromISO)
        .lte("created_at", toISO);
      return data ?? [];
    },
  });

  // ── Checkout sessions ──
  const { data: checkoutSessions = [] } = useQuery({
    queryKey: ["analytics-checkouts", workspaceId, fromISO, toISO],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase
        .from("checkout_sessions")
        .select("id, utm_source, created_at")
        .eq("workspace_id", workspaceId!)
        .gte("created_at", fromISO)
        .lte("created_at", toISO);
      return data ?? [];
    },
  });

  // ── Leads count ──
  const { data: leadsCount = 0 } = useQuery({
    queryKey: ["analytics-leads", workspaceId, fromISO, toISO],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { count } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId!)
        .gte("created_at", fromISO)
        .lte("created_at", toISO);
      return count ?? 0;
    },
  });

  // ── Products for table ──
  const { data: products = [] } = useQuery({
    queryKey: ["analytics-products", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name")
        .eq("workspace_id", workspaceId!)
        .is("deleted_at", null);
      return data ?? [];
    },
  });

  // ── Abandoned cart recovery metrics ──
  const { data: abandonedSessions = [] } = useQuery({
    queryKey: ["analytics-abandoned", workspaceId, fromISO, toISO],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase
        .from("checkout_sessions")
        .select("id, total_amount, status, abandoned_at, completed_at")
        .eq("workspace_id", workspaceId!)
        .eq("status", "ABANDONED")
        .gte("abandoned_at", fromISO)
        .lte("abandoned_at", toISO);
      return data ?? [];
    },
  });

  const { data: recoveryEmails = [] } = useQuery({
    queryKey: ["analytics-recovery-emails", workspaceId, fromISO, toISO],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase
        .from("recovery_emails")
        .select("id, checkout_session_id, converted_at, sent_at")
        .eq("workspace_id", workspaceId!)
        .gte("created_at", fromISO)
        .lte("created_at", toISO);
      return data ?? [];
    },
  });

  const recoveredSessions = useMemo(() => {
    const convertedIds = new Set(
      recoveryEmails.filter((e) => e.converted_at).map((e) => e.checkout_session_id)
    );
    return abandonedSessions.filter((s) => convertedIds.has(s.id));
  }, [abandonedSessions, recoveryEmails]);

  const recoveredRevenue = recoveredSessions.reduce(
    (sum, s) => sum + Number(s.total_amount || 0), 0
  );
  const recoveryRate = abandonedSessions.length > 0
    ? ((recoveredSessions.length / abandonedSessions.length) * 100).toFixed(1)
    : "0";

  // ── Computed metrics ──
  const totalRevenue = orders.reduce((s, o) => s + Number(o.total_amount), 0);
  const pageViews = events.filter((e) => e.event_type === "PAGE_VIEW").length;
  const conversionRate = pageViews > 0 ? (orders.length / pageViews) * 100 : 0;

  // ── Revenue chart data ──
  const revenueChartData = useMemo(() => {
    const map: Record<string, number> = {};
    orders.forEach((o) => {
      const day = format(new Date(o.created_at), "yyyy-MM-dd");
      map[day] = (map[day] || 0) + Number(o.total_amount);
    });
    const days = period === "custom" ? 30 : (period as number);
    return Array.from({ length: days }, (_, i) => {
      const d = format(subDays(new Date(), days - 1 - i), "yyyy-MM-dd");
      return { date: d, revenue: map[d] || 0 };
    });
  }, [orders, period]);

  // ── Funnel data ──
  const funnelData = useMemo(() => {
    const views = events.filter((e) => e.event_type === "PAGE_VIEW").length;
    const productClicks = events.filter((e) => e.event_type === "PRODUCT_VIEW").length;
    const checkoutsStarted = checkoutSessions.length;
    const purchases = orders.length;
    const steps = [
      { name: "Visitas", value: views },
      { name: "Cliques Produto", value: productClicks },
      { name: "Checkouts", value: checkoutsStarted },
      { name: "Compras", value: purchases },
    ];
    return steps.map((s, i) => ({
      ...s,
      rate: i === 0 ? 100 : steps[i - 1].value > 0 ? ((s.value / steps[i - 1].value) * 100).toFixed(1) : "0",
    }));
  }, [events, checkoutSessions, orders]);

  // ── Traffic sources ──
  const trafficSources = useMemo(() => {
    const map: Record<string, number> = {};
    checkoutSessions.forEach((s) => {
      const raw = (s.utm_source || "direto").toLowerCase();
      const label = SOURCE_LABELS[raw] || (raw === "direto" ? "Direto" : "Outros");
      map[label] = (map[label] || 0) + 1;
    });
    // Also count page views with referrer info from events metadata
    events
      .filter((e) => e.event_type === "PAGE_VIEW")
      .forEach((e) => {
        // count all page views into traffic
      });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [checkoutSessions, events]);

  // ── Top clicked blocks ──
  const topClicked = useMemo(() => {
    const map: Record<string, number> = {};
    events
      .filter((e) => ["LINK_CLICKED", "PRODUCT_VIEW"].includes(e.event_type))
      .forEach((e) => {
        const label = (e.metadata as any)?.product_name || (e.metadata as any)?.block_name || e.page_path || "Desconhecido";
        map[label] = (map[label] || 0) + 1;
      });
    return Object.entries(map)
      .map(([name, clicks]) => ({ name, clicks }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 10);
  }, [events]);

  // ── Product table ──
  const productTable = useMemo(() => {
    const map: Record<string, { orders: number; revenue: number }> = {};
    orders.forEach((o) => {
      const pid = o.product_id || "unknown";
      if (!map[pid]) map[pid] = { orders: 0, revenue: 0 };
      map[pid].orders++;
      map[pid].revenue += Number(o.total_amount);
    });
    return Object.entries(map)
      .map(([productId, stats]) => ({
        productId,
        name: products.find((p) => p.id === productId)?.name || "Produto removido",
        ...stats,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [orders, products]);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const loading = loadingOrders || loadingEvents;

  return (
    <div className="p-4 md:p-5 space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-foreground">Analytics</h1>
          <p className="text-sm text-muted-foreground">Visão completa do seu negócio</p>
        </div>
        <PeriodFilter selectedPeriod={period} onPeriodChange={setPeriod} />
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="bg-card border border-border/50 shadow-sm rounded-xl">
              <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
              <CardContent><Skeleton className="h-8 w-20" /></CardContent>
            </Card>
          ))
        ) : (
          <>
            <MetricCard title="Receita Total" value={formatCurrency(totalRevenue)} icon={DollarSign} />
            <MetricCard title="Visitas na Loja" value={pageViews} icon={Eye} />
            <MetricCard title="Leads Capturados" value={leadsCount} icon={UserCheck} />
            <MetricCard title="Taxa de Conversão" value={`${conversionRate.toFixed(1)}%`} icon={TrendingUp} />
          </>
        )}
      </div>

      {/* Revenue Chart */}
      <RevenueChart data={revenueChartData} period={period} />

      {/* Funnel + Traffic side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Funnel */}
        <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Funil de Conversão</CardTitle>
          </CardHeader>
          <CardContent>
            {funnelData.every((f) => f.value === 0) ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sem dados no período selecionado</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={funnelData} layout="vertical" margin={{ left: 20, right: 30 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                      formatter={(value: number, _: any, entry: any) => [
                        `${value} (${entry.payload.rate}%)`,
                        "",
                      ]}
                    />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={28}>
                      {funnelData.map((_, i) => (
                        <Cell key={i} fill={FUNNEL_COLORS[i]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Traffic Sources */}
        <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">De Onde Vêm Meus Clientes</CardTitle>
          </CardHeader>
          <CardContent>
            {trafficSources.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sem dados de tráfego no período</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trafficSources} layout="vertical" margin={{ left: 10, right: 30 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                    />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} barSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Clicked */}
      <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Para Onde Meus Clientes Vão</CardTitle>
        </CardHeader>
        <CardContent>
          {topClicked.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Sem cliques registrados no período</p>
          ) : (
            <div className="space-y-3">
              {topClicked.map((item, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <MousePointerClick className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">{item.name}</span>
                  </div>
                  <span className="text-sm font-semibold text-foreground">{item.clicks}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Products Table */}
      <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Produtos</CardTitle>
        </CardHeader>
        <CardContent>
          {productTable.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhuma venda no período selecionado</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Pedidos</TableHead>
                  <TableHead className="text-right">Receita</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productTable.map((row) => (
                  <TableRow key={row.productId}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-right">{row.orders}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(row.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Cart Recovery */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <MetricCard
          title="Carrinhos Recuperados"
          value={`${recoveredSessions.length} (${formatCurrency(recoveredRevenue)})`}
          icon={RefreshCw}
        />
        <MetricCard
          title="Taxa de Recuperação"
          value={`${recoveryRate}%`}
          icon={ShoppingCart}
        />
      </div>
    </div>
  );
}
