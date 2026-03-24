import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, AlertTriangle, TrendingUp, Clock } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const fmt = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

export default function AdminPayouts() {
  // Global split entries summary
  const { data: globalStats, isLoading } = useQuery({
    queryKey: ["admin-payout-stats"],
    queryFn: async () => {
      const [entriesRes, payoutsRes, refundsRes] = await Promise.all([
        (supabase as any).from("split_entries").select("gross_amount, platform_fee, creator_net, status", { count: "exact" }),
        (supabase as any).from("payout_requests").select("amount, net_amount, status"),
        (supabase as any).from("split_entries").select("creator_net").eq("status", "refunded"),
      ]);

      const entries = entriesRes.data || [];
      const payouts = payoutsRes.data || [];
      const refunds = refundsRes.data || [];

      const totalPlatformRevenue = entries.reduce((s: number, e: any) => s + (e.platform_fee || 0), 0);
      const totalCreatorLiability = entries
        .filter((e: any) => e.status !== "refunded")
        .reduce((s: number, e: any) => s + (e.creator_net || 0), 0);
      const totalPaid = payouts
        .filter((p: any) => p.status === "paid")
        .reduce((s: number, p: any) => s + (p.net_amount || 0), 0);
      const totalPending = payouts
        .filter((p: any) => p.status === "requested" || p.status === "processing")
        .reduce((s: number, p: any) => s + (p.amount || 0), 0);
      const totalRefunded = refunds.reduce((s: number, r: any) => s + (r.creator_net || 0), 0);

      return {
        totalPlatformRevenue,
        totalCreatorLiability,
        totalPaid,
        totalPending,
        totalRefunded,
        outstandingLiability: totalCreatorLiability - totalPaid - totalPending,
      };
    },
  });

  // Recent payout requests
  const { data: recentPayouts = [] } = useQuery({
    queryKey: ["admin-recent-payouts"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("payout_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
  });

  // Recent split entries with refunds
  const { data: recentRefunds = [] } = useQuery({
    queryKey: ["admin-recent-refunds"],
    queryFn: async () => {
      const { data } = await supabase
        .from("split_entries")
        .select("*")
        .eq("status", "refunded")
        .order("refunded_at", { ascending: false })
        .limit(20);
      return data || [];
    },
  });

  const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    requested: "secondary",
    processing: "default",
    paid: "default",
    failed: "destructive",
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Admin — Repasses & Splits</h1>
        <p className="text-sm text-muted-foreground">Visão global de passivo, repasses e risco</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border/50">
          <CardContent className="p-5 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
              <TrendingUp className="h-4 w-4" /> Receita Plataforma
            </div>
            {isLoading ? <Skeleton className="h-8 w-24" /> : (
              <p className="text-2xl font-bold text-foreground">{fmt(globalStats?.totalPlatformRevenue || 0)}</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="p-5 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
              <DollarSign className="h-4 w-4" /> Passivo Total Creators
            </div>
            {isLoading ? <Skeleton className="h-8 w-24" /> : (
              <p className="text-2xl font-bold text-foreground">{fmt(globalStats?.outstandingLiability || 0)}</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="p-5 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
              <Clock className="h-4 w-4" /> Repasses Pendentes
            </div>
            {isLoading ? <Skeleton className="h-8 w-24" /> : (
              <p className="text-2xl font-bold text-foreground">{fmt(globalStats?.totalPending || 0)}</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="p-5 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
              <AlertTriangle className="h-4 w-4" /> Total Estornado
            </div>
            {isLoading ? <Skeleton className="h-8 w-24" /> : (
              <p className="text-2xl font-bold text-destructive">{fmt(globalStats?.totalRefunded || 0)}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Payout Requests */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">Solicitações de Repasse</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentPayouts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    Nenhuma solicitação
                  </TableCell>
                </TableRow>
              ) : recentPayouts.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell className="text-sm">{format(new Date(p.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</TableCell>
                  <TableCell className="text-sm font-mono text-muted-foreground">{p.workspace_id?.slice(0, 8)}</TableCell>
                  <TableCell className="text-right text-sm font-medium">{fmt(p.net_amount)}</TableCell>
                  <TableCell>
                    <Badge variant={statusColors[p.status] || "outline"}>
                      {p.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Recent Refunds */}
      {recentRefunds.length > 0 && (
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-lg">Estornos Recentes</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Valor Bruto</TableHead>
                  <TableHead className="text-right">Líquido Estornado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentRefunds.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">{format(new Date(r.refunded_at || r.created_at), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                    <TableCell className="text-right text-sm">{fmt(r.gross_amount)}</TableCell>
                    <TableCell className="text-right text-sm text-destructive">{fmt(r.creator_net)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
