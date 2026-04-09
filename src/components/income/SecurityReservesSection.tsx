import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

interface Props {
  workspaceId: string | undefined;
  fmt: (cents: number) => string;
}

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  held: { label: "Retido", variant: "secondary" },
  released: { label: "Liberado", variant: "default" },
  forfeited: { label: "Retido (chargeback)", variant: "destructive" },
};

export function SecurityReservesSection({ workspaceId, fmt }: Props) {
  const { data: reserves = [], isLoading } = useQuery({
    queryKey: ["security-reserves", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase
        .from("security_reserves")
        .select("id, amount, status, release_at, released_at, created_at, transaction_id")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
  });

  const held = reserves.filter((r: any) => r.status === "held");
  const released = reserves.filter((r: any) => r.status === "released");

  return (
    <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Reserva de Segurança</CardTitle>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span>Retidos: <strong className="text-foreground">{fmt(held.reduce((s: number, r: any) => s + Number(r.amount), 0))}</strong></span>
          <span>Liberados: <strong className="text-green-600">{fmt(released.reduce((s: number, r: any) => s + Number(r.amount), 0))}</strong></span>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : reserves.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhuma reserva registrada.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Liberação prevista</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reserves.map((r: any) => {
                const s = STATUS_MAP[r.status] || { label: r.status, variant: "secondary" as const };
                return (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">{format(new Date(r.created_at), "dd/MM/yy")}</TableCell>
                    <TableCell className="text-sm text-right font-medium">{fmt(Number(r.amount))}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.release_at ? format(new Date(r.release_at), "dd/MM/yy") : "—"}
                    </TableCell>
                    <TableCell><Badge variant={s.variant} className="text-xs">{s.label}</Badge></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        <p className="text-[10px] text-muted-foreground mt-3">
          10% de cada venda é retido como reserva de segurança e liberado automaticamente após o período de proteção.
        </p>
      </CardContent>
    </Card>
  );
}
