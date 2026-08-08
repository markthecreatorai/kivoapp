import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface CashOutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableBalance: number;
  fmt: (cents: number) => string;
}

export function CashOutModal({ open, onOpenChange, availableBalance, fmt }: CashOutModalProps) {
  const { currentWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspaceId = currentWorkspace?.id;
  const [selectedAccount, setSelectedAccount] = useState("");

  const { data: accounts = [] } = useQuery({
    queryKey: ["bank-accounts", workspaceId],
    enabled: !!workspaceId && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("bank_accounts")
        .select("id, bank_name, agency, account_number, is_default, holder_name")
        .eq("workspace_id", workspaceId!)
        .order("is_default", { ascending: false });
      return data || [];
    },
  });

  // Auto-select default
  const defaultAcc = accounts.find((a: any) => a.is_default);
  const effectiveAccount = selectedAccount || defaultAcc?.id || "";

  const withdrawMutation = useMutation({
    mutationFn: async () => {
      const MIN_WITHDRAWAL = 2000; // R$20.00 in cents
      if (availableBalance < MIN_WITHDRAWAL) throw new Error(`Saldo mínimo para saque é de ${fmt(MIN_WITHDRAWAL)}`);
      if (!effectiveAccount) throw new Error("Selecione uma conta bancária");

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const idempotencyKey = `${workspaceId}-${Date.now()}`;

      // 1. Create withdrawal
      const { data: withdrawal, error: wErr } = await supabase.from("withdrawals").insert({
        workspace_id: workspaceId!,
        bank_account_id: effectiveAccount,
        amount: availableBalance,
        fee: 0,
        net_amount: availableBalance,
        status: "pending",
        idempotency_key: idempotencyKey,
        requested_by: user.id,
      }).select("id").single();

      if (wErr) throw wErr;

      // 2. Reserve balance in ledger (status must be 'available' to be counted by get_wallet_balance)
      const { error: lErr } = await supabase.from("wallet_ledger").insert({
        workspace_id: workspaceId!,
        withdrawal_id: withdrawal.id,
        type: "withdrawal",
        amount: -availableBalance,
        status: "available",
        description: `Saque #${withdrawal.id.slice(0, 8)}`,
      });

      if (lErr) throw lErr;

      // 3. Audit log
      await supabase.from("audit_logs").insert({
        workspace_id: workspaceId!,
        entity_type: "withdrawal",
        entity_id: withdrawal.id,
        action: "withdrawal_requested",
        user_id: user.id,
        metadata: { amount: availableBalance, bank_account_id: effectiveAccount },
      });

      return withdrawal;
    },
    onSuccess: () => {
      toast.success("Saque solicitado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["wallet-balance"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-summary"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message || "Erro ao solicitar saque"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Solicitar Saque</DialogTitle>
          <DialogDescription>Valor disponível: <strong>{fmt(availableBalance)}</strong></DialogDescription>
        </DialogHeader>

        {availableBalance < 2000 ? (
          <div className="text-center py-4 space-y-2">
            <p className="text-sm text-muted-foreground">Saldo mínimo para saque: <strong>{fmt(2000)}</strong></p>
            <p className="text-xs text-muted-foreground">Seu saldo disponível: {fmt(availableBalance)}</p>
          </div>
        ) : accounts.length === 0 ? (
          <div className="text-center py-4 space-y-2">
            <p className="text-sm text-muted-foreground">Cadastre uma conta bancária antes de solicitar saque.</p>
            <Button variant="outline" onClick={() => { onOpenChange(false); navigate("/settings?tab=payments"); }}>
              Configurar Conta Bancária
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
              <p className="text-sm font-medium">Valor do saque</p>
              <p className="text-xl font-bold text-foreground">{fmt(availableBalance)}</p>
              <p className="text-xs text-muted-foreground mt-1">O valor será transferido em até 2 dias úteis</p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          {availableBalance >= 2000 && accounts.length > 0 && (
            <Button onClick={() => withdrawMutation.mutate()} disabled={withdrawMutation.isPending || !effectiveAccount}>
              {withdrawMutation.isPending ? "Processando..." : "Confirmar Saque"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
