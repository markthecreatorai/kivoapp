import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle, CheckCircle2, RefreshCw, Loader2, CreditCard,
  Clock, Zap, Activity, RotateCcw, ShieldAlert,
} from "lucide-react";
import { format, subDays, subHours } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

export default function FinancialHealth() {
  const { currentWorkspace } = useWorkspace();
  const queryClient = useQueryClient();
  const [reconciling, setReconciling] = useState(false);

  // Payment failures by method (last 24h)
  const { data: failuresByMethod } = useQuery({
    queryKey: ["fin-health-failures", currentWorkspace?.id],
    queryFn: async () => {
      const since = subDays(new Date(), 1).toISOString();
      const { data } = await supabase
        .from("orders")
        .select("payment_method, status")
        .gte("created_at", since);

      const methods: Record<string, { total: number; failed: number }> = {};
      (data || []).forEach((o: any) => {
        const m = o.payment_method || "unknown";
        if (!methods[m]) methods[m] = { total: 0, failed: 0 };
        methods[m].total++;
        if (o.status === "FAILED") methods[m].failed++;
      });
      return Object.entries(methods).map(([method, stats]) => ({
        method,
        ...stats,
        rate: stats.total > 0 ? ((stats.failed / stats.total) * 100).toFixed(1) : "0",
      }));
    },
    enabled: !!currentWorkspace?.id,
    refetchInterval: 60000,
  });

  // Stale pending payments (> 2h)
  const { data: stalePending } = useQuery({
    queryKey: ["fin-health-stale", currentWorkspace?.id],
    queryFn: async () => {
      const twoHoursAgo = subHours(new Date(), 2).toISOString();
      const { data, count } = await supabase
        .from("payments")
        .select("id, order_id, method, amount, gateway_payment_id, created_at", { count: "exact" })
        .eq("status", "PENDING")
        .lt("created_at", twoHoursAgo)
        .order("created_at", { ascending: false })
        .limit(20);
      return { items: data || [], total: count || 0 };
    },
    enabled: !!currentWorkspace?.id,
    refetchInterval: 60000,
  });

  // Dead letter webhook events
  const { data: deadLetters } = useQuery({
    queryKey: ["fin-health-deadletters", currentWorkspace?.id],
    queryFn: async () => {
      const { data, count } = await supabase
        .from("webhook_events")
        .select("id, event_type, provider, external_event_id, error_message, created_at, attempts", { count: "exact" })
        .eq("status", "DEAD_LETTER")
        .order("created_at", { ascending: false })
        .limit(20);
      return { items: data || [], total: count || 0 };
    },
    enabled: !!currentWorkspace?.id,
    refetchInterval: 60000,
  });

  // Last reconciliation result
  const { data: lastRecon } = useQuery({
    queryKey: ["fin-health-recon", currentWorkspace?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_logs")
        .select("metadata, created_at")
        .eq("action", "reconciliation_fix")
        .order("created_at", { ascending: false })
        .limit(1);
      return data?.[0] || null;
    },
    enabled: !!currentWorkspace?.id,
  });

  const handleReconcile = async () => {
    setReconciling(true);
    try {
      const { data, error } = await supabase.functions.invoke("reconcile-asaas");
      if (error) throw error;
      const s = data?.summary;
      toast.success(
        `Reconciliação: ${s?.reconciled || 0} OK, ${s?.divergences_fixed || 0} corrigidos, ${s?.manual_review || 0} pendentes`
      );
      queryClient.invalidateQueries({ queryKey: ["fin-health"] });
    } catch (err: any) {
      toast.error("Erro na reconciliação: " + (err.message || "Erro desconhecido"));
    } finally {
      setReconciling(false);
    }
  };

  const handleRetryWebhook = async (eventId: string) => {
    try {
      const { error } = await supabase.functions.invoke("retry-webhooks", {
        body: { event_id: eventId },
      });
      if (error) throw error;
      toast.success("Evento reprocessado");
      queryClient.invalidateQueries({ queryKey: ["fin-health-deadletters"] });
    } catch (err: any) {
      toast.error("Erro: " + (err.message || "Desconhecido"));
    }
  };

  const totalFailRate = failuresByMethod
    ? (() => {
        const t = failuresByMethod.reduce((a, m) => a + m.total, 0);
        const f = failuresByMethod.reduce((a, m) => a + m.failed, 0);
        return t > 0 ? ((f / t) * 100).toFixed(1) : "0";
      })()
    : "0";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-primary" />
            Saúde Financeira
          </h1>
          <p className="text-sm text-muted-foreground">Monitoramento de pagamentos, webhooks e reconciliação</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleReconcile} disabled={reconciling}>
            {reconciling ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Reconciliar Agora
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{totalFailRate}%</p>
                <p className="text-xs text-muted-foreground">Taxa de falha (24h)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stalePending?.total || 0}</p>
                <p className="text-xs text-muted-foreground">Pendentes &gt; 2h</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${(deadLetters?.total || 0) > 0 ? "bg-destructive/10" : "bg-accent/10"}`}>
                <Zap className={`h-5 w-5 ${(deadLetters?.total || 0) > 0 ? "text-destructive" : "text-accent"}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{deadLetters?.total || 0}</p>
                <p className="text-xs text-muted-foreground">Dead Letters</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-accent/10">
                <CheckCircle2 className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {lastRecon ? format(new Date(lastRecon.created_at), "HH:mm", { locale: ptBR }) : "—"}
                </p>
                <p className="text-xs text-muted-foreground">Última reconciliação</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="failures">
        <TabsList>
          <TabsTrigger value="failures">Falhas por Método</TabsTrigger>
          <TabsTrigger value="stale">Pendentes Antigos</TabsTrigger>
          <TabsTrigger value="deadletters" className="flex items-center gap-1">
            Dead Letters
            {(deadLetters?.total || 0) > 0 && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 ml-1">{deadLetters.total}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="failures" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Falhas por Método de Pagamento (24h)</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Método</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Falhas</TableHead>
                    <TableHead className="text-right">Taxa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(failuresByMethod || []).map((m) => (
                    <TableRow key={m.method}>
                      <TableCell className="font-medium capitalize">{m.method}</TableCell>
                      <TableCell className="text-right">{m.total}</TableCell>
                      <TableCell className="text-right">{m.failed}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={parseFloat(m.rate) > 10 ? "destructive" : "secondary"}>
                          {m.rate}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!failuresByMethod || failuresByMethod.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        Nenhum dado disponível
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stale" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pagamentos Pendentes &gt; 2 horas ({stalePending?.total || 0})</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Gateway ID</TableHead>
                    <TableHead>Criado em</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(stalePending?.items || []).map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.id.slice(0, 8)}</TableCell>
                      <TableCell className="capitalize">{p.method}</TableCell>
                      <TableCell>R$ {Number(p.amount).toFixed(2)}</TableCell>
                      <TableCell className="font-mono text-xs">{p.gateway_payment_id?.slice(0, 12) || "—"}</TableCell>
                      <TableCell className="text-xs">{format(new Date(p.created_at), "dd/MM HH:mm", { locale: ptBR })}</TableCell>
                    </TableRow>
                  ))}
                  {(!stalePending?.items || stalePending.items.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        Nenhum pagamento pendente antigo
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deadletters" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Webhooks Dead Letter ({deadLetters?.total || 0})</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead>Tentativas</TableHead>
                    <TableHead>Erro</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(deadLetters?.items || []).map((dl: any) => (
                    <TableRow key={dl.id}>
                      <TableCell>
                        <Badge variant="outline">{dl.provider}</Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono">{dl.event_type}</TableCell>
                      <TableCell>{dl.attempts}</TableCell>
                      <TableCell className="text-xs text-destructive max-w-[200px] truncate">{dl.error_message || "—"}</TableCell>
                      <TableCell className="text-xs">{format(new Date(dl.created_at), "dd/MM HH:mm", { locale: ptBR })}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleRetryWebhook(dl.id)}>
                          <RotateCcw className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!deadLetters?.items || deadLetters.items.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        <CheckCircle2 className="w-5 h-5 text-accent mx-auto mb-2" />
                        Nenhum dead letter — tudo saudável
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
