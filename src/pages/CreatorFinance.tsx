import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, TrendingUp, Clock, Wallet, ArrowDownToLine, Settings } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const fmt = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  requested: { label: "Solicitado", variant: "secondary" },
  processing: { label: "Processando", variant: "default" },
  paid: { label: "Pago", variant: "default" },
  failed: { label: "Falhou", variant: "destructive" },
};

export default function CreatorFinance() {
  const { currentWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspaceId = currentWorkspace?.id;
  const [showPayout, setShowPayout] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState("");

  // Balance from split_entries
  const { data: balance, isLoading: loadingBalance } = useQuery({
    queryKey: ["creator-balance", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase.rpc("get_creator_balance", { p_workspace_id: workspaceId! });
      if (data && data.length > 0) return data[0];
      return { total_gross: 0, total_fees: 0, total_net: 0, available_balance: 0, pending_balance: 0, total_payouts: 0 };
    },
  });

  // Recent split entries
  const { data: entries = [], isLoading: loadingEntries } = useQuery({
    queryKey: ["split-entries", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase
        .from("split_entries")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
  });

  // Payout history
  const { data: payouts = [] } = useQuery({
    queryKey: ["payout-requests", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase
        .from("payout_requests")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
  });

  // Bank accounts for payout
  const { data: accounts = [] } = useQuery({
    queryKey: ["bank-accounts-payout", workspaceId],
    enabled: !!workspaceId && showPayout,
    queryFn: async () => {
      const { data } = await supabase
        .from("bank_accounts")
        .select("id, bank_name, agency, account_number, is_default, holder_name")
        .eq("workspace_id", workspaceId!)
        .order("is_default", { ascending: false });
      return data || [];
    },
  });

  const defaultAcc = accounts.find((a: any) => a.is_default);
  const effectiveAccount = selectedAccount || defaultAcc?.id || "";
  const availableBalance = Number(balance?.available_balance || 0);

  const payoutMutation = useMutation({
    mutationFn: async () => {
      if (availableBalance <= 0) throw new Error("Saldo insuficiente");
      if (!effectiveAccount) throw new Error("Selecione uma conta bancária");

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const idempotencyKey = `payout-${workspaceId}-${Date.now()}`;

      const { error } = await supabase.from("payout_requests").insert({
        workspace_id: workspaceId!,
        bank_account_id: effectiveAccount,
        requested_by: user.id,
        amount: availableBalance,
        fee: 0,
        net_amount: availableBalance,
        status: "requested",
        idempotency_key: idempotencyKey,
      });

      if (error) throw error;

      await supabase.from("audit_logs").insert({
        workspace_id: workspaceId!,
        entity_type: "payout_request",
        entity_id: idempotencyKey,
        action: "payout_requested",
        user_id: user.id,
        metadata: { amount: availableBalance, bank_account_id: effectiveAccount },
      });
    },
    onSuccess: () => {
      toast.success("Saque solicitado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["creator-balance"] });
      queryClient.invalidateQueries({ queryKey: ["payout-requests"] });
      setShowPayout(false);
    },
    onError: (e: any) => toast.error(e.message || "Erro ao solicitar saque"),
  });

  const isLoading = loadingBalance || loadingEntries;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Financeiro Creator</h1>
          <p className="text-sm text-muted-foreground">Acompanhe receita, splits e repasses</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/settings?tab=payments")} className="text-muted-foreground">
          <Settings className="h-4 w-4 mr-1" /> Configurações
        </Button>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border/50">
          <CardContent className="p-5 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
              <TrendingUp className="h-4 w-4" /> Vendido Bruto
            </div>
            {isLoading ? <Skeleton className="h-8 w-24" /> : (
              <p className="text-2xl font-bold text-foreground">{fmt(Number(balance?.total_gross || 0))}</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="p-5 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
              <DollarSign className="h-4 w-4" /> Taxas (GW + Plataforma)
            </div>
            {isLoading ? <Skeleton className="h-8 w-24" /> : (
              <p className="text-2xl font-bold text-destructive">{fmt(Number(balance?.total_fees || 0))}</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="p-5 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
              <Wallet className="h-4 w-4" /> Disponível para Saque
            </div>
            {isLoading ? <Skeleton className="h-8 w-24" /> : (
              <p className="text-2xl font-bold text-foreground">{fmt(availableBalance)}</p>
            )}
            <Button size="sm" className="mt-2" onClick={() => setShowPayout(true)} disabled={availableBalance <= 0}>
              <ArrowDownToLine className="h-3 w-3 mr-1" /> Solicitar Saque
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="p-5 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
              <Clock className="h-4 w-4" /> Em Hold
            </div>
            {isLoading ? <Skeleton className="h-8 w-24" /> : (
              <p className="text-2xl font-bold text-foreground">{fmt(Number(balance?.pending_balance || 0))}</p>
            )}
            <p className="text-xs text-muted-foreground">Aguardando janela de segurança</p>
          </CardContent>
        </Card>
      </div>

      {/* Split History */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">Histórico de Splits</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Bruto</TableHead>
                <TableHead className="text-right">Taxa GW</TableHead>
                <TableHead className="text-right">Fee Plataforma</TableHead>
                <TableHead className="text-right">Fee Afiliado</TableHead>
                <TableHead className="text-right">Líquido Creator</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Nenhuma venda registrada
                  </TableCell>
                </TableRow>
              ) : entries.map((e: any) => (
                <TableRow key={e.id}>
                  <TableCell className="text-sm">{format(new Date(e.created_at), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                  <TableCell className="text-right text-sm">{fmt(e.gross_amount)}</TableCell>
                  <TableCell className="text-right text-sm text-destructive">{fmt(e.gateway_fee)}</TableCell>
                  <TableCell className="text-right text-sm text-destructive">{fmt(e.platform_fee)}</TableCell>
                  <TableCell className="text-right text-sm text-destructive">{fmt(e.affiliate_fee)}</TableCell>
                  <TableCell className="text-right text-sm font-medium">{fmt(e.creator_net)}</TableCell>
                  <TableCell>
                    <Badge variant={e.status === "available" ? "default" : "secondary"}>
                      {e.status === "pending" ? "Em hold" : e.status === "available" ? "Disponível" : e.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Payout History */}
      {payouts.length > 0 && (
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-lg">Histórico de Repasses</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.map((p: any) => {
                  const s = statusMap[p.status] || { label: p.status, variant: "outline" as const };
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm">{format(new Date(p.created_at), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{fmt(p.net_amount)}</TableCell>
                      <TableCell><Badge variant={s.variant}>{s.label}</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Payout Modal */}
      <Dialog open={showPayout} onOpenChange={setShowPayout}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar Repasse</DialogTitle>
            <DialogDescription>Valor disponível: <strong>{fmt(availableBalance)}</strong></DialogDescription>
          </DialogHeader>
          {availableBalance <= 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum saldo disponível.</p>
          ) : accounts.length === 0 ? (
            <div className="text-center py-4 space-y-2">
              <p className="text-sm text-muted-foreground">Cadastre uma conta bancária primeiro.</p>
              <Button variant="outline" onClick={() => { setShowPayout(false); navigate("/settings?tab=payments"); }}>
                Configurar Conta
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Conta de destino</label>
                <Select value={effectiveAccount} onValueChange={setSelectedAccount}>
                  <SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
                  <SelectContent>
                    {accounts.map((a: any) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.bank_name} — Ag {a.agency} / CC {a.account_number} {a.is_default ? "(Padrão)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-sm font-medium">Valor do repasse</p>
                <p className="text-xl font-bold text-foreground">{fmt(availableBalance)}</p>
                <p className="text-xs text-muted-foreground mt-1">Transferência em até 2 dias úteis</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPayout(false)}>Cancelar</Button>
            {availableBalance > 0 && accounts.length > 0 && (
              <Button onClick={() => payoutMutation.mutate()} disabled={payoutMutation.isPending || !effectiveAccount}>
                {payoutMutation.isPending ? "Processando..." : "Confirmar Repasse"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
