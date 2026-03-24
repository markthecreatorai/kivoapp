import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertTriangle, CheckCircle2, XCircle, Activity, CreditCard,
  Mail, Webhook, RefreshCw, Clock, Shield, TrendingUp, Users,
  MessageSquare, BookOpen, Zap, Bell, Filter, ChevronLeft, ChevronRight,
  Send,
} from "lucide-react";
import { subDays, subHours, format } from "date-fns";

interface HealthCheck {
  service: string;
  status: "ok" | "degraded" | "down";
  latency_ms?: number;
  error?: string;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "ok") return <Badge className="bg-accent/20 text-accent border-accent/30"><CheckCircle2 className="w-3 h-3 mr-1" />OK</Badge>;
  if (status === "degraded") return <Badge variant="outline" className="text-primary border-primary/30"><AlertTriangle className="w-3 h-3 mr-1" />Degraded</Badge>;
  return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Down</Badge>;
}

const RUNBOOKS = [
  {
    title: "Pagamento falhando",
    icon: CreditCard,
    diagnosis: ["Verificar taxa de falha por método no painel acima", "Checar logs do Pagar.me no dashboard externo", "Confirmar que chaves API estão válidas"],
    actions: ["Se > 50% falhas: ativar kill switch checkout_enabled", "Se método específico: desabilitar temporariamente no checkout", "Contatar suporte Pagar.me com order_id de exemplo"],
    rollback: "Kill switch: Feature Flags → checkout_enabled → OFF",
    resolution: "Taxa de falha < 5% por 30 min consecutivos",
  },
  {
    title: "Webhook atrasado",
    icon: Webhook,
    diagnosis: ["Verificar webhooks pendentes/retry no painel", "Checar logs da edge function webhook-pagarme", "Confirmar URL do webhook no Pagar.me"],
    actions: ["Reprocessar webhooks pendentes manualmente", "Verificar se edge function está respondendo (health-check)", "Checar rate limiting no Supabase"],
    rollback: "Processar manualmente via SQL os pedidos afetados",
    resolution: "Zero webhooks em dead-letter e pendentes < 5",
  },
  {
    title: "Campanha de email quebrada",
    icon: Mail,
    diagnosis: ["Verificar status da campanha em /email-campaigns", "Checar logs da edge function send-campaign", "Confirmar domínio de email está ativo"],
    actions: ["Pausar campanha se bounce rate > 10%", "Corrigir template/segmento e reenviar", "Kill switch: campaigns_enabled → OFF se necessário"],
    rollback: "Pausar todas as campanhas ativas",
    resolution: "Bounce rate < 2% e delivery rate > 95%",
  },
  {
    title: "Emissão fiscal falhando",
    icon: BookOpen,
    diagnosis: ["Verificar logs da edge function emit-nfse", "Checar credenciais da prefeitura", "Confirmar dados fiscais do workspace"],
    actions: ["Kill switch: fiscal_enabled → OFF", "Acumular notas para emissão posterior", "Contatar prefeitura se API estiver fora"],
    rollback: "Desabilitar emissão automática e processar manualmente",
    resolution: "API da prefeitura respondendo e notas sendo emitidas",
  },
  {
    title: "Saque com erro",
    icon: CreditCard,
    diagnosis: ["Verificar wallet_ledger para o workspace", "Checar dados bancários configurados", "Confirmar saldo disponível vs pendente"],
    actions: ["Kill switch: withdrawals_enabled → OFF", "Verificar se recipient Pagar.me está ativo", "Reprocessar saque após correção"],
    rollback: "Bloquear novos saques via kill switch",
    resolution: "Saque processado com sucesso e saldo atualizado",
  },
];

const CHECKLIST_72H = [
  { window: "0-6h", tasks: [
    "Validar primeiras transações reais",
    "Confirmar webhooks sendo recebidos",
    "Verificar health-check OK em todos os serviços",
    "Monitorar taxa de erro < 5%",
  ]},
  { window: "6-24h", tasks: [
    "Revisar funil completo landing→venda",
    "Analisar erros por método de pagamento",
    "Verificar emails sendo entregues",
    "Checar entitlements concedidos corretamente",
  ]},
  { window: "24-48h", tasks: [
    "Ajustar mensagens de erro no checkout",
    "Otimizar UX baseado em feedback",
    "Revisar conversão de cada etapa do funil",
    "Verificar recovery de carrinho funcionando",
  ]},
  { window: "48-72h", tasks: [
    "Consolidar aprendizados do lançamento",
    "Priorizar top 5 bugs para correção",
    "Definir metas de conversão semana 1",
    "Publicar plano de ação semana 1",
  ]},
];

const ALERT_TYPE_LABELS: Record<string, string> = {
  payment_failure_rate: "Falha de Pagamento",
  webhook_dead_letter: "Dead-Letter Webhook",
  health_check: "Health Check",
  recurring_email_failures: "Falha de Email",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "destructive",
  warning: "outline",
};

const ITEMS_PER_PAGE = 15;

export default function OpsDashboard() {
  const { currentWorkspace } = useWorkspace();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState("24h");
  const [activeTab, setActiveTab] = useState("warroom");

  // Alert history filters
  const [alertPeriod, setAlertPeriod] = useState("7d");
  const [alertType, setAlertType] = useState("all");
  const [alertSeverity, setAlertSeverity] = useState("all");
  const [alertPage, setAlertPage] = useState(0);

  const since = useMemo(() => {
    if (period === "1h") return subHours(new Date(), 1).toISOString();
    if (period === "6h") return subHours(new Date(), 6).toISOString();
    return subDays(new Date(), 1).toISOString();
  }, [period]);

  const alertSince = useMemo(() => {
    if (alertPeriod === "24h") return subDays(new Date(), 1).toISOString();
    if (alertPeriod === "7d") return subDays(new Date(), 7).toISOString();
    if (alertPeriod === "30d") return subDays(new Date(), 30).toISOString();
    return subDays(new Date(), 90).toISOString();
  }, [alertPeriod]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["ops-"] });
    }, 30000);
    return () => clearInterval(interval);
  }, [queryClient]);

  // Health check
  const { data: health, isLoading: healthLoading, refetch: refetchHealth } = useQuery({
    queryKey: ["ops-health"],
    queryFn: async () => {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      try {
        const resp = await fetch(`https://${projectId}.supabase.co/functions/v1/health-check`, {
          headers: { Authorization: `Bearer ${anonKey}` },
        });
        return await resp.json() as { status: string; checks: HealthCheck[]; timestamp: string };
      } catch {
        return { status: "down", checks: [], timestamp: new Date().toISOString() };
      }
    },
    refetchInterval: 30000,
  });

  // Payment stats
  const { data: paymentStats } = useQuery({
    queryKey: ["ops-payments", since],
    queryFn: async () => {
      const [failedRes, totalRes, completedRes] = await Promise.all([
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "FAILED").gte("created_at", since),
        supabase.from("orders").select("id", { count: "exact", head: true }).gte("created_at", since),
        supabase.from("orders").select("total_amount").eq("status", "COMPLETED").gte("created_at", since),
      ]);
      const failed = failedRes.count || 0;
      const total = totalRes.count || 0;
      const gmv = (completedRes.data || []).reduce((a: number, o: any) => a + (o.total_amount || 0), 0);
      const rate = total > 0 ? ((failed / total) * 100).toFixed(1) : "0";
      return { failed, total, rate, gmv, alert: total > 10 && parseFloat(rate) > 8 };
    },
    refetchInterval: 30000,
  });

  // Payment method breakdown
  const { data: methodStats } = useQuery({
    queryKey: ["ops-methods", since],
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("payment_method, status").gte("created_at", since);
      const methods: Record<string, { total: number; failed: number; completed: number }> = {};
      (data || []).forEach((o: any) => {
        const m = o.payment_method || "unknown";
        if (!methods[m]) methods[m] = { total: 0, failed: 0, completed: 0 };
        methods[m].total++;
        if (o.status === "FAILED") methods[m].failed++;
        if (o.status === "COMPLETED") methods[m].completed++;
      });
      return methods;
    },
  });

  // Webhook stats
  const { data: webhookStats } = useQuery({
    queryKey: ["ops-webhooks", since],
    queryFn: async () => {
      const { data } = await supabase.from("webhook_delivery_log").select("status, attempt_count").gte("created_at", since);
      const stats = { pending: 0, completed: 0, failed: 0, retrying: 0 };
      (data || []).forEach((w: any) => {
        if (w.status === "completed") stats.completed++;
        else if (w.status === "failed") stats.failed++;
        else if (w.attempt_count > 1) stats.retrying++;
        else stats.pending++;
      });
      return stats;
    },
  });

  // Funnel conversion
  const { data: funnelStats } = useQuery({
    queryKey: ["ops-funnel", since],
    queryFn: async () => {
      const types = ["page_view", "cta_click", "signup_started", "signup_completed", "product_published", "payment_succeeded"];
      const { data } = await supabase
        .from("analytics_events")
        .select("event_type")
        .in("event_type", types)
        .gte("created_at", since);

      const counts: Record<string, number> = {};
      (data || []).forEach((e: any) => {
        counts[e.event_type] = (counts[e.event_type] || 0) + 1;
      });
      return counts;
    },
  });

  // Checkout timing
  const { data: conversionTiming } = useQuery({
    queryKey: ["ops-timing", since],
    queryFn: async () => {
      const { data: events } = await supabase
        .from("analytics_events")
        .select("event_type, visitor_id, created_at")
        .in("event_type", ["checkout_started", "payment_succeeded"])
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(500);

      if (!events || events.length === 0) return { avgSeconds: 0, count: 0 };
      const sessions: Record<string, { start?: string; end?: string }> = {};
      events.forEach((e: any) => {
        const sid = e.visitor_id;
        if (!sid) return;
        if (!sessions[sid]) sessions[sid] = {};
        if (e.event_type === "checkout_started" && !sessions[sid].start) sessions[sid].start = e.created_at;
        if (e.event_type === "payment_succeeded") sessions[sid].end = e.created_at;
      });
      let totalMs = 0, count = 0;
      Object.values(sessions).forEach(s => {
        if (s.start && s.end) { totalMs += new Date(s.end).getTime() - new Date(s.start).getTime(); count++; }
      });
      return { avgSeconds: count > 0 ? Math.round(totalMs / count / 1000) : 0, count };
    },
  });

  // Top errors
  const { data: topErrors } = useQuery({
    queryKey: ["ops-errors", since],
    queryFn: async () => {
      const { data } = await supabase
        .from("analytics_events")
        .select("metadata, created_at")
        .eq("event_type", "payment_failed")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(20);
      const errorCounts: Record<string, number> = {};
      (data || []).forEach((e: any) => {
        const reason = (e.metadata as any)?.reason || "Erro desconhecido";
        errorCounts[reason] = (errorCounts[reason] || 0) + 1;
      });
      return Object.entries(errorCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([reason, count]) => ({ reason, count }));
    },
  });

  // Alert history with filters + pagination
  const { data: alertHistory, isLoading: alertsLoading } = useQuery({
    queryKey: ["ops-alert-history", alertSince, alertType, alertSeverity, alertPage],
    queryFn: async () => {
      let query = (supabase.from as any)("ops_alert_log")
        .select("*", { count: "exact" })
        .gte("created_at", alertSince)
        .order("created_at", { ascending: false })
        .range(alertPage * ITEMS_PER_PAGE, (alertPage + 1) * ITEMS_PER_PAGE - 1);

      if (alertType !== "all") query = query.eq("alert_type", alertType);
      if (alertSeverity !== "all") query = query.eq("severity", alertSeverity);

      const { data, count } = await query;
      return { items: data || [], total: count || 0 };
    },
    refetchInterval: 30000,
  });

  // Alert summary stats
  const { data: alertSummary } = useQuery({
    queryKey: ["ops-alert-summary", alertSince],
    queryFn: async () => {
      const { data } = await (supabase.from as any)("ops_alert_log")
        .select("severity, notified_externally")
        .gte("created_at", alertSince);
      const items = data || [];
      return {
        total: items.length,
        critical: items.filter((a: any) => a.severity === "critical").length,
        warning: items.filter((a: any) => a.severity === "warning").length,
        notified: items.filter((a: any) => a.notified_externally).length,
      };
    },
  });

  // 72h checklist
  const { data: checklistItems, refetch: refetchChecklist } = useQuery({
    queryKey: ["ops-checklist", currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return [];
      const { data } = await (supabase.from as any)("ops_checklist")
        .select("*")
        .eq("workspace_id", currentWorkspace.id)
        .order("created_at");
      return data || [];
    },
  });

  const initChecklist = async () => {
    if (!currentWorkspace?.id || (checklistItems && checklistItems.length > 0)) return;
    const rows = CHECKLIST_72H.flatMap(w =>
      w.tasks.map(task => ({ workspace_id: currentWorkspace.id, time_window: w.window, task }))
    );
    await (supabase.from as any)("ops_checklist").insert(rows);
    refetchChecklist();
  };

  const toggleChecklistItem = async (id: string, isDone: boolean) => {
    await (supabase.from as any)("ops_checklist").update({
      is_done: !isDone,
      completed_at: !isDone ? new Date().toISOString() : null,
    }).eq("id", id);
    refetchChecklist();
  };

  const ALERT_THRESHOLD = 8;
  const gmvFormatted = paymentStats?.gmv ? `R$ ${(paymentStats.gmv / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "R$ 0,00";
  const totalAlertPages = Math.ceil((alertHistory?.total || 0) / ITEMS_PER_PAGE);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            War Room
          </h1>
          <p className="text-sm text-muted-foreground">Centro de operações pós-lançamento • Auto-refresh 30s</p>
        </div>
        <div className="flex gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">1 hora</SelectItem>
              <SelectItem value="6h">6 horas</SelectItem>
              <SelectItem value="24h">24 horas</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => { refetchHealth(); queryClient.invalidateQueries(); }}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="warroom">War Room</TabsTrigger>
          <TabsTrigger value="runbooks">Runbooks</TabsTrigger>
          <TabsTrigger value="checklist72h">72h Checklist</TabsTrigger>
          <TabsTrigger value="alerts" className="flex items-center gap-1.5">
            <Bell className="w-3.5 h-3.5" />
            Histórico de Alertas
            {alertSummary && alertSummary.total > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">{alertSummary.total}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ===== WAR ROOM TAB ===== */}
        <TabsContent value="warroom" className="space-y-4 mt-4">
          {/* Health */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="w-4 h-4" /> System Health
                {health && <StatusBadge status={health.status} />}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {healthLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[1,2,3,4].map(i => <Skeleton key={i} className="h-16" />)}
                </div>
              ) : health?.checks ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {health.checks.map((c) => (
                    <div key={c.service} className="p-3 rounded-lg border bg-muted/30 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-foreground">{c.service}</span>
                        <StatusBadge status={c.status} />
                      </div>
                      {c.latency_ms !== undefined && <p className="text-[10px] text-muted-foreground">{c.latency_ms}ms</p>}
                      {c.error && <p className="text-[10px] text-destructive truncate">{c.error}</p>}
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-muted-foreground">Sem dados</p>}
            </CardContent>
          </Card>

          {/* Alert Banner */}
          {paymentStats?.alert && (
            <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
              <div>
                <p className="text-sm font-medium text-destructive">⚠️ Taxa de falha alta: {paymentStats.rate}%</p>
                <p className="text-xs text-muted-foreground">{paymentStats.failed} falhas em {paymentStats.total} ({ALERT_THRESHOLD}% limiar)</p>
              </div>
            </div>
          )}

          {/* KPI Row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <span className="text-xs text-muted-foreground">GMV Hoje</span>
                </div>
                <p className="text-xl font-bold text-foreground">{gmvFormatted}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CreditCard className="w-4 h-4 text-primary" />
                  <span className="text-xs text-muted-foreground">Pagamentos</span>
                </div>
                <p className="text-xl font-bold text-foreground">{paymentStats?.total ?? 0}</p>
                <p className="text-xs text-muted-foreground">{paymentStats?.failed ?? 0} falhos ({paymentStats?.rate ?? 0}%)</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Webhook className="w-4 h-4 text-primary" />
                  <span className="text-xs text-muted-foreground">Webhooks</span>
                </div>
                <p className="text-xl font-bold text-foreground">{webhookStats?.completed ?? 0}</p>
                <p className="text-xs text-muted-foreground">{webhookStats?.failed ?? 0} dead-letter</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-4 h-4 text-primary" />
                  <span className="text-xs text-muted-foreground">Checkout→Pago</span>
                </div>
                <p className="text-xl font-bold text-foreground">
                  {conversionTiming?.avgSeconds ? `${Math.floor(conversionTiming.avgSeconds / 60)}m${conversionTiming.avgSeconds % 60}s` : "–"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4 text-primary" />
                  <span className="text-xs text-muted-foreground">Signups</span>
                </div>
                <p className="text-xl font-bold text-foreground">{funnelStats?.signup_completed ?? 0}</p>
              </CardContent>
            </Card>
          </div>

          {/* Funnel */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Funil de Conversão ({period})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 overflow-x-auto">
                {[
                  { label: "Visitas", key: "page_view" },
                  { label: "CTA Click", key: "cta_click" },
                  { label: "Signup", key: "signup_completed" },
                  { label: "Produto", key: "product_published" },
                  { label: "Venda", key: "payment_succeeded" },
                ].map((step, i, arr) => {
                  const count = funnelStats?.[step.key] ?? 0;
                  const prev = i > 0 ? (funnelStats?.[arr[i - 1].key] ?? 0) : count;
                  const rate = prev > 0 ? ((count / prev) * 100).toFixed(0) : "–";
                  return (
                    <div key={step.key} className="flex items-center gap-2">
                      <div className="p-3 rounded-lg border bg-muted/30 text-center min-w-[100px]">
                        <p className="text-lg font-bold text-foreground">{count}</p>
                        <p className="text-xs text-muted-foreground">{step.label}</p>
                      </div>
                      {i < arr.length - 1 && (
                        <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">{rate}% →</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Payment by Method */}
          {methodStats && Object.keys(methodStats).length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Por Método de Pagamento</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  {Object.entries(methodStats).map(([method, stats]) => {
                    const failRate = stats.total > 0 ? ((stats.failed / stats.total) * 100).toFixed(1) : "0";
                    const isHigh = parseFloat(failRate) > ALERT_THRESHOLD;
                    return (
                      <div key={method} className="p-3 rounded-lg border bg-muted/30">
                        <p className="text-sm font-medium text-foreground capitalize">{method}</p>
                        <p className="text-lg font-bold text-foreground">{stats.completed} <span className="text-xs text-muted-foreground">✓</span></p>
                        <p className={`text-xs ${isHigh ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                          {stats.failed} falhas ({failRate}%)
                        </p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Top Errors */}
          {topErrors && topErrors.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> Top Erros ({period})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {topErrors.map((e, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded border bg-muted/20">
                      <p className="text-sm text-foreground truncate flex-1">{e.reason}</p>
                      <Badge variant="secondary" className="ml-2 shrink-0">{e.count}x</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ===== RUNBOOKS TAB ===== */}
        <TabsContent value="runbooks" className="space-y-4 mt-4">
          <p className="text-sm text-muted-foreground">Playbooks de resposta rápida para incidentes comuns.</p>
          {RUNBOOKS.map((rb, i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <rb.icon className="w-4 h-4 text-primary" />
                  {rb.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Diagnóstico</p>
                  <ol className="list-decimal list-inside space-y-1">
                    {rb.diagnosis.map((d, j) => <li key={j} className="text-sm text-foreground">{d}</li>)}
                  </ol>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Ações Imediatas</p>
                  <ol className="list-decimal list-inside space-y-1">
                    {rb.actions.map((a, j) => <li key={j} className="text-sm text-foreground">{a}</li>)}
                  </ol>
                </div>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Rollback</p>
                    <p className="text-sm text-foreground">{rb.rollback}</p>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Critério de Resolução</p>
                    <p className="text-sm text-foreground">{rb.resolution}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ===== 72H CHECKLIST TAB ===== */}
        <TabsContent value="checklist72h" className="space-y-4 mt-4">
          {(!checklistItems || checklistItems.length === 0) ? (
            <Card>
              <CardContent className="p-6 text-center">
                <Zap className="w-8 h-8 text-primary mx-auto mb-3" />
                <p className="text-sm text-muted-foreground mb-3">Inicie o checklist operacional de 72h para acompanhar as ações pós-lançamento.</p>
                <Button onClick={initChecklist}>Iniciar Checklist 72h</Button>
              </CardContent>
            </Card>
          ) : (
            CHECKLIST_72H.map(w => {
              const items = (checklistItems || []).filter((c: any) => c.time_window === w.window);
              const done = items.filter((c: any) => c.is_done).length;
              return (
                <Card key={w.window}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center justify-between">
                      <span>Janela {w.window}</span>
                      <Badge variant={done === items.length ? "default" : "secondary"}>{done}/{items.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {items.map((item: any) => (
                        <label key={item.id} className="flex items-center gap-3 p-2 rounded hover:bg-muted/30 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={item.is_done}
                            onChange={() => toggleChecklistItem(item.id, item.is_done)}
                            className="rounded border-border"
                          />
                          <span className={`text-sm ${item.is_done ? "text-muted-foreground line-through" : "text-foreground"}`}>
                            {item.task}
                          </span>
                          {item.completed_at && (
                            <span className="text-[10px] text-muted-foreground ml-auto">
                              {new Date(item.completed_at).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* ===== ALERT HISTORY TAB ===== */}
        <TabsContent value="alerts" className="space-y-4 mt-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-foreground">{alertSummary?.total ?? 0}</p>
                <p className="text-xs text-muted-foreground">Total Alertas</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-destructive">{alertSummary?.critical ?? 0}</p>
                <p className="text-xs text-muted-foreground">Críticos</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-primary">{alertSummary?.warning ?? 0}</p>
                <p className="text-xs text-muted-foreground">Warnings</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-accent">{alertSummary?.notified ?? 0}</p>
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><Send className="w-3 h-3" /> Telegram</p>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <Select value={alertPeriod} onValueChange={(v) => { setAlertPeriod(v); setAlertPage(0); }}>
              <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Últimas 24h</SelectItem>
                <SelectItem value="7d">7 dias</SelectItem>
                <SelectItem value="30d">30 dias</SelectItem>
                <SelectItem value="90d">90 dias</SelectItem>
              </SelectContent>
            </Select>
            <Select value={alertType} onValueChange={(v) => { setAlertType(v); setAlertPage(0); }}>
              <SelectTrigger className="w-44 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="payment_failure_rate">Falha de Pagamento</SelectItem>
                <SelectItem value="webhook_dead_letter">Dead-Letter</SelectItem>
                <SelectItem value="health_check">Health Check</SelectItem>
                <SelectItem value="recurring_email_failures">Falha de Email</SelectItem>
              </SelectContent>
            </Select>
            <Select value={alertSeverity} onValueChange={(v) => { setAlertSeverity(v); setAlertPage(0); }}>
              <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="critical">Crítico</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              {alertsLoading ? (
                <div className="p-6 space-y-3">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : (alertHistory?.items || []).length === 0 ? (
                <div className="p-8 text-center">
                  <CheckCircle2 className="w-8 h-8 text-accent mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhum alerta no período selecionado.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Mensagem</TableHead>
                      <TableHead>Severidade</TableHead>
                      <TableHead>Canal</TableHead>
                      <TableHead>Data/Hora</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(alertHistory?.items || []).map((alert: any) => (
                      <TableRow key={alert.id}>
                        <TableCell>
                          {alert.severity === "critical"
                            ? <XCircle className="w-4 h-4 text-destructive" />
                            : <AlertTriangle className="w-4 h-4 text-primary" />
                          }
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] font-normal">
                            {ALERT_TYPE_LABELS[alert.alert_type] || alert.alert_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[300px]">
                          <p className="text-sm text-foreground truncate">{alert.message}</p>
                        </TableCell>
                        <TableCell>
                          <Badge variant={SEVERITY_COLORS[alert.severity] as any || "secondary"} className="text-[10px]">
                            {alert.severity}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {alert.notified_externally ? (
                            <Badge className="bg-accent/20 text-accent border-accent/30 text-[10px]">
                              <Send className="w-2.5 h-2.5 mr-1" />
                              {alert.external_channel || "telegram"}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(alert.created_at), "dd/MM HH:mm")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Pagination */}
          {totalAlertPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {alertHistory?.total ?? 0} alertas • Página {alertPage + 1} de {totalAlertPages}
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={alertPage === 0} onClick={() => setAlertPage(p => p - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={alertPage >= totalAlertPages - 1} onClick={() => setAlertPage(p => p + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
