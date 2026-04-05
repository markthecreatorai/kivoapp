import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, RefreshCw, FileText, AlertCircle, CheckCircle2 } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { trackEvent } from "@/lib/tracking";

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pendente", variant: "secondary" },
  issued: { label: "Emitida", variant: "default" },
  failed: { label: "Falhou", variant: "destructive" },
  canceled: { label: "Cancelada", variant: "outline" },
};

export default function FiscalClosing() {
  const { currentWorkspace } = useWorkspace();
  const queryClient = useQueryClient();
  const workspaceId = currentWorkspace?.id;

  // Month selector
  const monthOptions = useMemo(() => {
    const opts = [];
    for (let i = 0; i < 12; i++) {
      const d = subMonths(new Date(), i);
      opts.push({ value: format(d, "yyyy-MM"), label: format(d, "MMMM yyyy", { locale: ptBR }) });
    }
    return opts;
  }, []);

  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0].value);

  const monthStart = startOfMonth(new Date(selectedMonth + "-01")).toISOString();
  const monthEnd = endOfMonth(new Date(selectedMonth + "-01")).toISOString();

  const fmt = (cents: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

  // Fiscal invoices for the month
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["fiscal-invoices", workspaceId, selectedMonth],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase
        .from("fiscal_invoices")
        .select("*, orders!inner(order_number, customer_name, customer_email, total_amount, paid_at)")
        .eq("workspace_id", workspaceId!)
        .gte("created_at", monthStart)
        .lte("created_at", monthEnd)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  // Fiscal settings for tax rate
  const { data: fiscalSettings } = useQuery({
    queryKey: ["fiscal-settings", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase
        .from("fiscal_settings")
        .select("default_tax_rate")
        .eq("workspace_id", workspaceId!)
        .maybeSingle();
      return data;
    },
  });

  // Orders paid this month (for full picture including those without invoices)
  const { data: paidOrders = [] } = useQuery({
    queryKey: ["fiscal-orders", workspaceId, selectedMonth],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, total_amount, paid_at, order_number, customer_name")
        .eq("workspace_id", workspaceId!)
        .eq("status", "COMPLETED")
        .gte("paid_at", monthStart)
        .lte("paid_at", monthEnd);
      return data || [];
    },
  });

  const taxRate = Number(fiscalSettings?.default_tax_rate || 5);
  const totalRevenue = paidOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
  const issuedCount = invoices.filter((i: any) => i.status === "issued").length;
  const pendingCount = invoices.filter((i: any) => i.status === "pending").length;
  const failedCount = invoices.filter((i: any) => i.status === "failed").length;
  const estimatedTax = Math.round(totalRevenue * (taxRate / 100));

  // Retry emission
  const retryMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const { error } = await supabase.functions.invoke("emit-nfse", {
        body: { invoice_id: invoiceId, retry: true },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Reemissão solicitada");
      queryClient.invalidateQueries({ queryKey: ["fiscal-invoices"] });
    },
    onError: (e: any) => toast.error(e.message || "Erro na reemissão"),
  });

  // CSV export
  const downloadCSV = () => {
    const header = "Pedido,Cliente,Valor,Status NFS-e,Nº Nota,Data Emissão\n";
    const rows = invoices.map((inv: any) =>
      [
        inv.orders?.order_number || inv.order_id?.slice(0, 8),
        inv.orders?.customer_name || "—",
        (Number(inv.service_amount) / 100).toFixed(2),
        STATUS_MAP[inv.status]?.label || inv.status,
        inv.invoice_number || "—",
        inv.issued_at ? format(new Date(inv.issued_at), "dd/MM/yyyy") : "—",
      ].join(",")
    );
    const blob = new Blob([header + rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fiscal-${selectedMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Fechamento Fiscal</h1>
          <p className="text-sm text-muted-foreground">NFS-e e resumo tributário mensal</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {monthOptions.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={downloadCSV}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Faturado", value: fmt(totalRevenue), icon: FileText },
          { label: "Notas Emitidas", value: String(issuedCount), icon: CheckCircle2 },
          { label: "Pendentes", value: String(pendingCount), icon: AlertCircle },
          { label: "Falhas", value: String(failedCount), icon: AlertCircle },
          { label: `Tributo Est. (${taxRate}%)`, value: fmt(estimatedTax), icon: FileText },
        ].map(item => (
          <Card key={item.label} className="bg-card border border-border/50 shadow-sm rounded-xl">
            <CardContent className="p-4 text-center">
              <item.icon className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="text-lg font-bold text-foreground">{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Invoice table */}
      <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
        <CardHeader>
          <CardTitle className="text-lg">Notas Fiscais — {monthOptions.find(m => m.value === selectedMonth)?.label}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma nota fiscal neste período.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Nº Nota</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv: any) => {
                  const s = STATUS_MAP[inv.status] || { label: inv.status, variant: "secondary" as const };
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="text-sm font-medium">{inv.orders?.order_number || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{inv.orders?.customer_name || "—"}</TableCell>
                      <TableCell className="text-sm text-right">{fmt(Number(inv.service_amount))}</TableCell>
                      <TableCell><Badge variant={s.variant} className="text-xs">{s.label}</Badge></TableCell>
                      <TableCell className="text-sm">{inv.invoice_number || "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {inv.pdf_url && (
                            <Button variant="ghost" size="sm" asChild>
                              <a href={inv.pdf_url} target="_blank" rel="noopener"><FileText className="h-3.5 w-3.5" /></a>
                            </Button>
                          )}
                          {(inv.status === "failed" || inv.status === "pending") && (
                            <Button variant="ghost" size="sm" onClick={() => retryMutation.mutate(inv.id)} disabled={retryMutation.isPending}>
                              <RefreshCw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
