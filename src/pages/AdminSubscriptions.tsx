import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, AlertTriangle, CheckCircle, XCircle, Clock, Activity } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  past_due: "bg-yellow-100 text-yellow-800",
  canceled: "bg-red-100 text-red-800",
  pending: "bg-blue-100 text-blue-800",
};

const STATUS_ICONS: Record<string, any> = {
  active: CheckCircle,
  past_due: AlertTriangle,
  canceled: XCircle,
  pending: Clock,
};

export default function AdminSubscriptions() {
  const [reconciling, setReconciling] = useState(false);

  const { data: subs, isLoading, refetch } = useQuery({
    queryKey: ["admin-subscriptions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_subscriptions")
        .select("*, workspaces:workspace_id(name, slug)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: healthReport } = useQuery({
    queryKey: ["admin-subscription-health"],
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_logs")
        .select("metadata, created_at")
        .eq("action", "subscription_health_daily")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.metadata as any || null;
    },
  });

  const { data: recentEvents } = useQuery({
    queryKey: ["admin-subscription-events"],
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("entity_type", "subscription")
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
  });

  const handleReconcile = async () => {
    setReconciling(true);
    try {
      const { data, error } = await supabase.functions.invoke("reconcile-subscriptions");
      if (error) throw error;
      toast.success(`Reconciliação concluída: ${data?.fixes || 0} correções`);
      refetch();
    } catch (err: any) {
      toast.error("Erro na reconciliação: " + (err.message || "Tente novamente"));
    } finally {
      setReconciling(false);
    }
  };

  const allSubs = subs || [];
  const active = allSubs.filter(s => s.status === "active").length;
  const pastDue = allSubs.filter(s => s.status === "past_due").length;
  const canceled = allSubs.filter(s => s.status === "canceled").length;
  const pending = allSubs.filter(s => s.status === "pending").length;

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
  const churn7d = allSubs.filter(s =>
    s.status === "canceled" && s.canceled_at && new Date(s.canceled_at) >= sevenDaysAgo
  ).length;

  const criticalSubs = allSubs.filter(s => {
    if (s.status === "past_due") return true;
    if (s.status === "pending" && new Date(s.created_at) < new Date(Date.now() - 24 * 60 * 60 * 1000)) return true;
    return false;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Saúde de Assinaturas</h1>
          <p className="text-muted-foreground text-sm">Monitoramento e gestão do ciclo de vida</p>
        </div>
        <Button variant="outline" onClick={handleReconcile} disabled={reconciling}>
          <RefreshCw className={`h-4 w-4 mr-2 ${reconciling ? "animate-spin" : ""}`} />
          Reconciliar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Ativas", value: active, icon: CheckCircle, color: "text-green-600" },
          { label: "Inadimplentes", value: pastDue, icon: AlertTriangle, color: "text-yellow-600" },
          { label: "Canceladas", value: canceled, icon: XCircle, color: "text-red-600" },
          { label: "Pendentes", value: pending, icon: Clock, color: "text-blue-600" },
          { label: "Churn 7d", value: churn7d, icon: Activity, color: "text-orange-600" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2">
                <Icon className={`h-5 w-5 ${color}`} />
                <div>
                  <p className="text-2xl font-bold">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Critical cases */}
      {criticalSubs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              Casos Críticos ({criticalSubs.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Workspace</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Último Evento</TableHead>
                  <TableHead>Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {criticalSubs.map(sub => (
                  <TableRow key={sub.id}>
                    <TableCell className="font-medium text-sm">
                      {(sub as any).workspaces?.name || sub.workspace_id.slice(0, 8)}
                    </TableCell>
                    <TableCell>{sub.plan_code}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[sub.status] || ""}>{sub.status}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {sub.last_event_at ? format(new Date(sub.last_event_at), "dd/MM HH:mm") : "—"}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={handleReconcile} disabled={reconciling}>
                        <RefreshCw className="h-3 w-3 mr-1" /> Reconciliar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* All subscriptions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Todas as Assinaturas</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Workspace</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Próximo Plano</TableHead>
                  <TableHead>Ciclo</TableHead>
                  <TableHead>Período Atual</TableHead>
                  <TableHead>Criado em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allSubs.map(sub => {
                  const Icon = STATUS_ICONS[sub.status] || Clock;
                  return (
                    <TableRow key={sub.id}>
                      <TableCell className="font-medium text-sm">
                        {(sub as any).workspaces?.name || sub.workspace_id.slice(0, 8)}
                      </TableCell>
                      <TableCell>{sub.plan_code}</TableCell>
                      <TableCell>
                        <Badge className={`${STATUS_COLORS[sub.status] || ""} flex items-center gap-1 w-fit`}>
                          <Icon className="h-3 w-3" />
                          {sub.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {sub.next_plan_code ? (
                          <span className="text-orange-600">{sub.next_plan_code} em {sub.change_effective_at ? format(new Date(sub.change_effective_at), "dd/MM") : "—"}</span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-sm">{sub.billing_cycle || "monthly"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {sub.current_period_end ? format(new Date(sub.current_period_end), "dd/MM/yyyy") : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(sub.created_at), "dd/MM/yyyy")}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Recent events */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Eventos Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {(recentEvents || []).map((event: any) => (
              <div key={event.id} className="flex items-start justify-between border-b border-border pb-2 last:border-0">
                <div>
                  <p className="text-sm font-medium">{event.action}</p>
                  <p className="text-xs text-muted-foreground">
                    {event.metadata?.old_status && `${event.metadata.old_status} → ${event.metadata.new_status}`}
                    {event.metadata?.plan_code && ` (${event.metadata.plan_code})`}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {format(new Date(event.created_at), "dd/MM HH:mm")}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
