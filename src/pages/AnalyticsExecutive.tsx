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
import {
  DollarSign, TrendingUp, TrendingDown, Users, CreditCard, AlertTriangle,
  Mail, Download, ArrowUpRight, ArrowDownRight, Activity, BarChart3,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, CartesianGrid, Legend,
} from "recharts";
import { format, subDays, startOfDay, subMonths, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

const PERIODS = [
  { label: "7D", value: 7 },
  { label: "30D", value: 30 },
  { label: "90D", value: 90 },
] as const;

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v / 100);

const formatCurrencyRaw = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function StatCard({
  title, value, previousValue, icon: Icon, format: fmt = "number",
}: {
  title: string; value: number; previousValue?: number; icon: React.ElementType; format?: "currency" | "number" | "percent";
}) {
  const formatted = fmt === "currency" ? formatCurrency(value)
    : fmt === "percent" ? `${value.toFixed(1)}%`
    : value.toLocaleString("pt-BR");

  const change = previousValue && previousValue > 0
    ? ((value - previousValue) / previousValue) * 100
    : undefined;

  return (
    <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
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
        .select("id, total_amount, status, payment_method, created_at, product_id")
        .eq("workspace_id", workspaceId!)
        .gte("created_at", prevFromISO)
        .lte("created_at", toISO);
      return data ?? [];
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

  // Products query removed - RLS permission issues

  // ── Computed metrics ──
  const currentOrders = useMemo(() => orders.filter(o => new Date(o.created_at) >= from), [orders, from]);
  const previousOrders = useMemo(() => orders.filter(o => new Date(o.created_at) < from), [orders, from]);

  const paidCurrent = currentOrders.filter(o => o.status === "PAID");
  const paidPrevious = previousOrders.filter(o => o.status === "PAID");

  const gmvCurrent = paidCurrent.reduce((s, o) => s + Number(o.total_amount || 0), 0);
  const gmvPrevious = paidPrevious.reduce((s, o) => s + Number(o.total_amount || 0), 0);

  const netRevenueCurrent = paidCurrent.reduce((s, o) => s + Number(o.total_amount || 0), 0);
  const netRevenuePrevious = paidPrevious.reduce((s, o) => s + Number(o.total_amount || 0), 0);

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
        total,
        paid,
        failed,
        refunded,
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
    return Array.from({ length: Math.min(periodDays, 90) }, (_, i) => {
      const d = format(subDays(now, periodDays - 1 - i), "dd/MM");
      return { date: d, revenue: (map[d] || 0) / 100 };
    });
  }, [paidCurrent, periodDays, now]);

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

  const loading = loadingOrders;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard Executivo</h1>
          <p className="text-sm text-muted-foreground">Métricas de decisão do seu negócio</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 p-1 bg-card border border-border/50 rounded-lg shadow-sm">
            {PERIODS.map(p => (
              <Button
                key={p.value}
                variant="ghost"
                size="sm"
                className={cn(
                  "px-4 py-1.5 text-sm font-medium rounded-md transition-all",
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
        </div>
      </div>

      {/* KPI Cards */}
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
          <StatCard title="GMV" value={gmvCurrent} previousValue={gmvPrevious} icon={DollarSign} format="currency" />
          <StatCard title="Receita Líquida" value={netRevenueCurrent} previousValue={netRevenuePrevious} icon={TrendingUp} format="currency" />
          <StatCard title="Vendas" value={paidCurrent.length} previousValue={paidPrevious.length} icon={CreditCard} />
          <StatCard title="Leads Capturados" value={currentLeads.length} previousValue={previousLeads.length} icon={Users} />
        </div>
      )}

      {/* Revenue Chart */}
      <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold">Receita Diária</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => exportCSV(revenueChart, "receita-diaria")}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={v => `R$${v}`} />
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
                  {funnelData.map((step, i) => (
                    <div key={step.name} className="flex items-center gap-4">
                      <div className="w-28 text-sm font-medium text-foreground">{step.name}</div>
                      <div className="flex-1 h-10 bg-muted/30 rounded-lg overflow-hidden relative">
                        <div
                          className="h-full rounded-lg transition-all duration-500"
                          style={{
                            width: `${Math.max(parseFloat(step.rate), 2)}%`,
                            backgroundColor: step.color,
                          }}
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
                        <Badge variant={Number(row.approvalRate) >= 90 ? "default" : "destructive"}>
                          {row.approvalRate}%
                        </Badge>
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
              <CardHeader>
                <CardTitle className="text-lg font-semibold">CRM</CardTitle>
              </CardHeader>
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
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Campanhas de Email</CardTitle>
              </CardHeader>
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
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Métricas de Ativação</CardTitle>
        </CardHeader>
        <CardContent>
          <ActivationMetrics workspaceId={workspaceId} periodDays={periodDays} />
        </CardContent>
      </Card>

      {/* Cohort section */}
      <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold">Coorte Mensal — Retenção de Atividade</CardTitle>
          <Badge variant="secondary">MVP</Badge>
        </CardHeader>
        <CardContent>
          <CohortTable workspaceId={workspaceId} />
        </CardContent>
      </Card>
    </div>
  );
}

function CohortTable({ workspaceId }: { workspaceId?: string }) {
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

    // Group customers by first purchase month
    const customerFirstMonth: Record<string, string> = {};
    const customerMonths: Record<string, Set<string>> = {};

    allOrders.forEach(o => {
      const email = o.customer_email;
      const month = format(new Date(o.created_at), "yyyy-MM");
      if (!customerFirstMonth[email] || month < customerFirstMonth[email]) {
        customerFirstMonth[email] = month;
      }
      if (!customerMonths[email]) customerMonths[email] = new Set();
      customerMonths[email].add(month);
    });

    // Build cohort rows
    const months = [...new Set(Object.values(customerFirstMonth))].sort();
    const now = new Date();

    return months.slice(-4).map(cohortMonth => {
      const cohortCustomers = Object.entries(customerFirstMonth)
        .filter(([_, m]) => m === cohortMonth)
        .map(([email]) => email);

      const total = cohortCustomers.length;
      const periods = [1, 2, 3].map(offset => {
        const targetMonth = format(subMonths(new Date(cohortMonth + "-15"), -offset), "yyyy-MM");
        if (new Date(targetMonth + "-01") > now) return null;
        const active = cohortCustomers.filter(email => customerMonths[email]?.has(targetMonth)).length;
        return total > 0 ? ((active / total) * 100).toFixed(0) : "0";
      });

      return {
        month: format(new Date(cohortMonth + "-01"), "MMM yyyy", { locale: ptBR }),
        total,
        m1: periods[0],
        m2: periods[1],
        m3: periods[2],
      };
    });
  }, [allOrders]);

  if (!cohort.length) {
    return <p className="text-sm text-muted-foreground text-center py-6">Sem dados de coorte disponíveis</p>;
  }

  return (
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
  );
}
