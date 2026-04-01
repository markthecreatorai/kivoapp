import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CreditCard, Plus, MoreHorizontal, ArrowRightLeft, Trash2, Star,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  userId: string;
}

const BRAND_ICONS: Record<string, string> = {
  visa: "💳 Visa",
  mastercard: "💳 Mastercard",
  amex: "💳 Amex",
  elo: "💳 Elo",
  google_pay: "📱 Google Pay",
  apple_pay: "📱 Apple Pay",
  pix: "🏦 Pix",
};

function formatBrand(brand?: string | null, type?: string | null) {
  if (type && BRAND_ICONS[type]) return BRAND_ICONS[type];
  if (brand && BRAND_ICONS[brand.toLowerCase()]) return BRAND_ICONS[brand.toLowerCase()];
  return `💳 ${brand || "Card"}`;
}

export default function PaymentMethodsSection({ userId }: Props) {
  const queryClient = useQueryClient();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<any>(null);
  const [transferTarget, setTransferTarget] = useState<any>(null);

  const { data: methods = [], isLoading } = useQuery({
    queryKey: ["user-payment-methods", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_payment_methods" as any)
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      return (data as any[]) || [];
    },
    enabled: !!userId,
    staleTime: 30_000,
  });

  const removeMutation = useMutation({
    mutationFn: async (methodId: string) => {
      const { error } = await (supabase as any)
        .from("user_payment_methods")
        .delete()
        .eq("id", methodId)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-payment-methods", userId] });
      toast.success("Método de pagamento removido");
      setRemoveTarget(null);
    },
    onError: () => toast.error("Erro ao remover método"),
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (methodId: string) => {
      // Unset all defaults first
      await (supabase as any)
        .from("user_payment_methods")
        .update({ is_default: false })
        .eq("user_id", userId);
      // Set new default
      const { error } = await (supabase as any)
        .from("user_payment_methods")
        .update({ is_default: true })
        .eq("id", methodId)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-payment-methods", userId] });
      toast.success("Método padrão atualizado");
    },
    onError: () => toast.error("Erro ao definir padrão"),
  });

  const handleRemove = (method: any) => {
    if (method.linked_subscription_count > 0) {
      toast.error("Transfira as assinaturas antes de remover este método.");
      return;
    }
    setRemoveTarget(method);
  };

  if (isLoading) {
    return (
      <Card className="p-6 space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-56" />
        {[1, 2].map(i => <Skeleton key={i} className="h-20 w-full" />)}
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="font-semibold text-foreground">Métodos de pagamento</h3>
            <p className="text-sm text-muted-foreground mt-0.5">Gerencie seus métodos de pagamento salvos</p>
          </div>
          <Button size="sm" className="font-semibold" onClick={() => setAddModalOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            ADICIONAR MÉTODO
          </Button>
        </div>

        {methods.length === 0 ? (
          <div className="text-center py-12">
            <CreditCard className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-3">Nenhum método de pagamento cadastrado.</p>
            <Button variant="outline" size="sm" onClick={() => setAddModalOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Adicionar método
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {methods.map((m: any) => (
              <div
                key={m.id}
                className="flex items-center gap-4 p-4 rounded-xl border border-border/50 hover:border-border transition-colors"
              >
                {/* Icon / brand */}
                <div className="flex-shrink-0 w-12 h-8 rounded-md bg-muted/50 flex items-center justify-center text-lg">
                  {m.method_type === "google_pay" ? "📱" : "💳"}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {formatBrand(m.brand, m.method_type)}
                    </p>
                    {m.is_default && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        <Star className="h-3 w-3 mr-0.5" />
                        Padrão
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    {m.last_four && (
                      <span className="text-xs text-muted-foreground">•••• {m.last_four}</span>
                    )}
                    {m.exp_month && m.exp_year && (
                      <span className="text-xs text-muted-foreground">
                        {String(m.exp_month).padStart(2, "0")}/{m.exp_year}
                      </span>
                    )}
                    {m.linked_subscription_count > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {m.linked_subscription_count} {m.linked_subscription_count === 1 ? "assinatura" : "assinaturas"}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {!m.is_default && (
                      <DropdownMenuItem onClick={() => setDefaultMutation.mutate(m.id)}>
                        <Star className="h-4 w-4 mr-2" />
                        Definir como padrão
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => setTransferTarget(m)}
                      disabled={m.linked_subscription_count === 0}
                    >
                      <ArrowRightLeft className="h-4 w-4 mr-2" />
                      Transferir assinatura
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleRemove(m)}
                      className="text-destructive focus:text-destructive"
                      disabled={m.is_default && methods.length > 1}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Remover
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Add Payment Method Modal ── */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar método de pagamento</DialogTitle>
            <DialogDescription>
              A integração com gateway será configurada para tokenização segura.
            </DialogDescription>
          </DialogHeader>
          <div className="py-6 text-center">
            <CreditCard className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">
              A adição de métodos de pagamento será processada pelo gateway de pagamento integrado (Asaas/Stripe).
              Nenhum dado sensível é armazenado diretamente.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddModalOpen(false)}>Cancelar</Button>
            <Button onClick={() => { setAddModalOpen(false); toast.info("Integração com gateway pendente de configuração."); }}>
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Remove Confirmation ── */}
      <Dialog open={!!removeTarget} onOpenChange={() => setRemoveTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remover método de pagamento</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja remover{" "}
              {removeTarget?.brand} •••• {removeTarget?.last_four}? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => removeTarget && removeMutation.mutate(removeTarget.id)}
              disabled={removeMutation.isPending}
            >
              {removeMutation.isPending ? "Removendo..." : "Remover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Transfer Subscription Modal ── */}
      <Dialog open={!!transferTarget} onOpenChange={() => setTransferTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Transferir assinaturas</DialogTitle>
            <DialogDescription>
              Transfira as assinaturas de{" "}
              {transferTarget?.brand} •••• {transferTarget?.last_four} para outro método.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <Label>Método destino</Label>
            {methods.filter((m: any) => m.id !== transferTarget?.id).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum outro método disponível. Adicione um novo método primeiro.
              </p>
            ) : (
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um método" />
                </SelectTrigger>
                <SelectContent>
                  {methods
                    .filter((m: any) => m.id !== transferTarget?.id)
                    .map((m: any) => (
                      <SelectItem key={m.id} value={m.id}>
                        {formatBrand(m.brand, m.method_type)} •••• {m.last_four}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferTarget(null)}>Cancelar</Button>
            <Button
              onClick={() => { setTransferTarget(null); toast.info("Transferência será processada pelo gateway."); }}
              disabled={methods.filter((m: any) => m.id !== transferTarget?.id).length === 0}
            >
              Transferir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
