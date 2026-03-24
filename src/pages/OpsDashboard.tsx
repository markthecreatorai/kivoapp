import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle, CheckCircle2, XCircle, Activity, CreditCard,
  Mail, Webhook, RefreshCw, Clock, Shield,
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
  if (status === "degraded") return <Badge variant="outline" className="text-yellow-600 border-yellow-300"><AlertTriangle className="w-3 h-3 mr-1" />Degraded</Badge>;
  return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Down</Badge>;
}

export default function OpsDashboard() {
  const { currentWorkspace } = useWorkspace();
  const [period, setPeriod] = useState("24h");
  const since = useMemo(() => {
    if (period === "1h") return subHours(new Date(), 1).toISOString();
    if (period === "6h") return subHours(new Date(), 6).toISOString();
    return subDays(new Date(), 1).toISOString();
  }, [period]);

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
    refetchInterval: 60000,
  });

  // Payment failures
  const { data: paymentStats } = useQuery({
    queryKey: ["ops-payments", since],
    queryFn: async () => {
      const [failedRes, totalRes] = await Promise.all([
        supabase.from("orders").select("id, created_at", { count: "exact", head: true }).eq("status", "FAILED").gte("created_at", since),
        supabase.from("orders").select("id", { count: "exact", head: true }).gte("created_at", since),
      ]);
      const failed = failedRes.count || 0;
      const total = totalRes.count || 0;
      const rate = total > 0 ? ((failed / total) * 100).toFixed(1) : "0";
      return { failed, total, rate, alert: total > 10 && parseFloat(rate) > 8 };
    },
  });

  // Payment method breakdown
  const { data: methodStats } = useQuery({
    queryKey: ["ops-methods", since],
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("payment_method, status").gte("created_at", since);
      const methods: Record<string, { total: number; failed: number }> = {};
      (data || []).forEach((o: any) => {
        const m = o.payment_method || "unknown";
        if (!methods[m]) methods[m] = { total: 0, failed: 0 };
        methods[m].total++;
        if (o.status === "FAILED") methods[m].failed++;
      });
      return methods;
    },
  });

  // Webhook delivery stats
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

  // Checkout → Payment timing
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
        if (s.start && s.end) {
          totalMs += new Date(s.end).getTime() - new Date(s.start).getTime();
          count++;
        }
      });

      return { avgSeconds: count > 0 ? Math.round(totalMs / count / 1000) : 0, count };
    },
  });

  // Top errors from analytics
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

      return Object.entries(errorCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([reason, count]) => ({ reason, count }));
    },
  });

  const ALERT_THRESHOLD = 8;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            Ops Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">Monitoramento operacional em tempo real</p>
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
          <Button variant="outline" size="sm" onClick={() => refetchHealth()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Health Status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4" />
            System Health
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
                  {c.latency_ms !== undefined && (
                    <p className="text-[10px] text-muted-foreground">{c.latency_ms}ms</p>
                  )}
                  {c.error && <p className="text-[10px] text-destructive truncate">{c.error}</p>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sem dados de saúde disponíveis</p>
          )}
        </CardContent>
      </Card>

      {/* Alert Banner */}
      {paymentStats?.alert && (
        <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
          <div>
            <p className="text-sm font-medium text-destructive">⚠️ Taxa de falha alta: {paymentStats.rate}%</p>
            <p className="text-xs text-muted-foreground">{paymentStats.failed} falhas em {paymentStats.total} pagamentos (limiar: {ALERT_THRESHOLD}%)</p>
          </div>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <CreditCard className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">Pagamentos falhos</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{paymentStats?.failed ?? 0}</p>
            <p className="text-xs text-muted-foreground">de {paymentStats?.total ?? 0} ({paymentStats?.rate ?? 0}%)</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Webhook className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">Webhooks pendentes</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{(webhookStats?.pending ?? 0) + (webhookStats?.retrying ?? 0)}</p>
            <p className="text-xs text-muted-foreground">{webhookStats?.failed ?? 0} dead-letter</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">Tempo checkout→pago</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {conversionTiming?.avgSeconds ? `${Math.floor(conversionTiming.avgSeconds / 60)}m ${conversionTiming.avgSeconds % 60}s` : "–"}
            </p>
            <p className="text-xs text-muted-foreground">{conversionTiming?.count ?? 0} conversões</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Mail className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">Emails failed</span>
            </div>
            <p className="text-2xl font-bold text-foreground">–</p>
            <p className="text-xs text-muted-foreground">Sem email_send_log</p>
          </CardContent>
        </Card>
      </div>

      {/* Payment by Method */}
      {methodStats && Object.keys(methodStats).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Falhas por Método de Pagamento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              {Object.entries(methodStats).map(([method, stats]) => {
                const failRate = stats.total > 0 ? ((stats.failed / stats.total) * 100).toFixed(1) : "0";
                const isHigh = parseFloat(failRate) > ALERT_THRESHOLD;
                return (
                  <div key={method} className="p-3 rounded-lg border bg-muted/30">
                    <p className="text-sm font-medium text-foreground capitalize">{method}</p>
                    <p className="text-lg font-bold text-foreground">{stats.total} <span className="text-xs text-muted-foreground font-normal">total</span></p>
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
              <AlertTriangle className="w-4 h-4" />
              Top Erros ({period})
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
    </div>
  );
}
