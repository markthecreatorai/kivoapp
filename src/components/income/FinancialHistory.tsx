import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Download } from "lucide-react";
import { format, subDays } from "date-fns";

const PAGE_SIZE = 15;

const TYPE_LABELS: Record<string, string> = {
  sale: "Venda",
  fee: "Taxa",
  refund: "Reembolso",
  withdrawal: "Saque",
  adjustment: "Ajuste",
};

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Em hold", variant: "secondary" },
  available: { label: "Disponível", variant: "default" },
  settled: { label: "Liquidado", variant: "outline" },
  canceled: { label: "Cancelado", variant: "destructive" },
};

interface Props {
  workspaceId: string | undefined;
  fmt: (cents: number) => string;
}

export function FinancialHistory({ workspaceId, fmt }: Props) {
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("30");

  const { data, isLoading } = useQuery({
    queryKey: ["wallet-ledger", workspaceId, typeFilter, periodFilter, page],
    enabled: !!workspaceId,
    queryFn: async () => {
      let query = supabase
        .from("wallet_ledger")
        .select("*", { count: "exact" })
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false });

      if (typeFilter !== "all") query = query.eq("type", typeFilter);

      const days = parseInt(periodFilter);
      if (days > 0) query = query.gte("created_at", subDays(new Date(), days).toISOString());

      query = query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

      const { data: rows, count } = await query;
      return { rows: rows || [], total: count || 0 };
    },
  });

  const entries = data?.rows || [];
  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / PAGE_SIZE));

  // Summary
  const { data: summary } = useQuery({
    queryKey: ["wallet-summary", workspaceId, periodFilter],
    enabled: !!workspaceId,
    queryFn: async () => {
      const days = parseInt(periodFilter);
      let query = supabase
        .from("wallet_ledger")
        .select("type, amount, status")
        .eq("workspace_id", workspaceId!);

      if (days > 0) query = query.gte("created_at", subDays(new Date(), days).toISOString());

      const { data: rows } = await query;
      const sales = (rows || []).filter(r => r.type === "sale").reduce((s, r) => s + Number(r.amount), 0);
      const fees = (rows || []).filter(r => r.type === "fee").reduce((s, r) => s + Math.abs(Number(r.amount)), 0);
      const refunds = (rows || []).filter(r => r.type === "refund").reduce((s, r) => s + Math.abs(Number(r.amount)), 0);
      return { sales, fees, refunds, net: sales - fees - refunds };
    },
  });

  const downloadCSV = () => {
    const header = "Data,Tipo,Descrição,Valor,Status\n";
    const rows = entries.map((e: any) =>
      [
        format(new Date(e.created_at), "dd/MM/yyyy HH:mm"),
        TYPE_LABELS[e.type] || e.type,
        e.description || "—",
        (Number(e.amount) / 100).toFixed(2),
        STATUS_LABELS[e.status]?.label || e.status,
      ].join(",")
    );
    const blob = new Blob([header + rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `extrato-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-lg">Extrato Financeiro</CardTitle>
        <div className="flex items-center gap-2">
          <Select value={periodFilter} onValueChange={v => { setPeriodFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 dias</SelectItem>
              <SelectItem value="30">30 dias</SelectItem>
              <SelectItem value="90">90 dias</SelectItem>
              <SelectItem value="0">Tudo</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="sale">Vendas</SelectItem>
              <SelectItem value="fee">Taxas</SelectItem>
              <SelectItem value="refund">Reembolsos</SelectItem>
              <SelectItem value="withdrawal">Saques</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={downloadCSV}><Download className="h-4 w-4 mr-1" /> CSV</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary strip */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Vendas", value: summary.sales, color: "text-green-600" },
              { label: "Taxas", value: -summary.fees, color: "text-muted-foreground" },
              { label: "Reembolsos", value: -summary.refunds, color: "text-destructive" },
              { label: "Líquido", value: summary.net, color: "text-foreground font-bold" },
            ].map(item => (
              <div key={item.label} className="p-3 bg-muted/30 rounded-lg text-center">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className={`text-sm font-semibold ${item.color}`}>{fmt(item.value)}</p>
              </div>
            ))}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhuma movimentação encontrada.</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry: any) => {
                  const s = STATUS_LABELS[entry.status] || { label: entry.status, variant: "secondary" as const };
                  const isNegative = Number(entry.amount) < 0;
                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="text-sm">{format(new Date(entry.created_at), "dd/MM/yy HH:mm")}</TableCell>
                      <TableCell className="text-sm">{TYPE_LABELS[entry.type] || entry.type}</TableCell>
                      <TableCell className="text-sm text-muted-foreground truncate max-w-[200px]">{entry.description || "—"}</TableCell>
                      <TableCell className={`text-sm text-right font-medium ${isNegative ? "text-destructive" : "text-green-600"}`}>
                        {isNegative ? "−" : "+"}{fmt(Math.abs(Number(entry.amount)))}
                      </TableCell>
                      <TableCell><Badge variant={s.variant} className="text-xs">{s.label}</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {totalPages > 1 && (
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious onClick={() => setPage(p => Math.max(1, p - 1))} className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                  </PaginationItem>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(p => (
                    <PaginationItem key={p}>
                      <PaginationLink isActive={p === page} onClick={() => setPage(p)} className="cursor-pointer">{p}</PaginationLink>
                    </PaginationItem>
                  ))}
                  <PaginationItem>
                    <PaginationNext onClick={() => setPage(p => Math.min(totalPages, p + 1))} className={page === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
