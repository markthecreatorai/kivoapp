import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings, HelpCircle, ChevronDown, ChevronUp, Building2, Landmark } from "lucide-react";
import { toast } from "sonner";

interface Props {
  community: any;
}

export default function AdminPayoutsTab({ community }: Props) {
  const queryClient = useQueryClient();
  const saved = community.payout_info || {};

  const [showBankForm, setShowBankForm] = useState(false);
  const [form, setForm] = useState({
    bank_name: saved.bank_name || "",
    account_type: saved.account_type || "checking",
    account_number: saved.account_number || "",
    routing_number: saved.routing_number || "",
    account_holder: saved.account_holder || "",
    pix_key: saved.pix_key || "",
    pix_key_type: saved.pix_key_type || "cpf",
  });

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const savePayouts = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("communities")
        .update({ payout_info: form } as any)
        .eq("id", community.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community"] });
      toast.success("Dados de recebimento salvos!");
    },
    onError: () => toast.error("Erro ao salvar"),
  });

  // Simulated balance data (would come from payment processor in production)
  const balance = 0;
  const nextPayoutDays = 3;
  const pending = 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Payouts</h2>
        <button
          className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          title="Configurações de payout"
          onClick={() => setShowBankForm((v) => !v)}
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>

      {/* Balance section */}
      <div className="flex items-start gap-8">
        {/* Balance card */}
        <div className="bg-gray-100 rounded-xl px-8 py-5 min-w-[180px] text-center">
          <p className="text-2xl font-bold text-gray-900">
            ${balance.toFixed(2)}
          </p>
          <p className="text-sm text-gray-500 mt-0.5">Account balance</p>
        </div>

        {/* Next payout info */}
        <div className="space-y-1.5 pt-1">
          <p className="text-sm text-gray-700 font-medium">
            Next payout will be ${balance.toFixed(0)} in {nextPayoutDays} days
          </p>
          <div className="flex items-center gap-1.5">
            <p className="text-sm text-gray-500">
              ${pending.toFixed(0)} is pending
            </p>
            <button title="O valor pendente é processado automaticamente no próximo ciclo de pagamento">
              <HelpCircle className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600 transition-colors" />
            </button>
          </div>
        </div>
      </div>

      {/* Divider + empty state */}
      <div className="border-t border-gray-100 pt-6">
        <p className="text-sm text-gray-400">No payouts yet</p>
      </div>

      {/* Bank details section — collapsible via settings icon */}
      {showBankForm && (
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowBankForm((v) => !v)}
            className="flex items-center justify-between w-full px-5 py-4 bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-semibold text-gray-700">
                Dados bancários / configurações
              </span>
            </div>
            {showBankForm ? (
              <ChevronUp className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            )}
          </button>

          <div className="p-5 space-y-6">
            {/* PIX */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Landmark className="h-4 w-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-900">
                  PIX (recomendado)
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-gray-700">
                    Tipo de chave
                  </Label>
                  <Select
                    value={form.pix_key_type}
                    onValueChange={(v) => set("pix_key_type", v)}
                  >
                    <SelectTrigger className="border-gray-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cpf">CPF</SelectItem>
                      <SelectItem value="cnpj">CNPJ</SelectItem>
                      <SelectItem value="email">E-mail</SelectItem>
                      <SelectItem value="phone">Telefone</SelectItem>
                      <SelectItem value="random">Chave aleatória</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-gray-700">
                    Chave PIX
                  </Label>
                  <Input
                    value={form.pix_key}
                    onChange={(e) => set("pix_key", e.target.value)}
                    placeholder="sua@chave.pix"
                    className="border-gray-200 focus:border-gray-400"
                  />
                </div>
              </div>
            </div>

            {/* Bank account */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-900">
                  Conta bancária
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-gray-700">
                    Nome do titular
                  </Label>
                  <Input
                    value={form.account_holder}
                    onChange={(e) => set("account_holder", e.target.value)}
                    placeholder="Nome completo"
                    className="border-gray-200 focus:border-gray-400"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-gray-700">
                    Banco
                  </Label>
                  <Input
                    value={form.bank_name}
                    onChange={(e) => set("bank_name", e.target.value)}
                    placeholder="Nubank, Itaú, etc."
                    className="border-gray-200 focus:border-gray-400"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-gray-700">
                    Tipo de conta
                  </Label>
                  <Select
                    value={form.account_type}
                    onValueChange={(v) => set("account_type", v)}
                  >
                    <SelectTrigger className="border-gray-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="checking">Corrente</SelectItem>
                      <SelectItem value="savings">Poupança</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-gray-700">
                    Agência
                  </Label>
                  <Input
                    value={form.routing_number}
                    onChange={(e) => set("routing_number", e.target.value)}
                    placeholder="0000"
                    className="border-gray-200 focus:border-gray-400"
                  />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label className="text-sm font-medium text-gray-700">
                    Número da conta
                  </Label>
                  <Input
                    value={form.account_number}
                    onChange={(e) => set("account_number", e.target.value)}
                    placeholder="00000-0"
                    className="border-gray-200 focus:border-gray-400"
                  />
                </div>
              </div>
            </div>

            <Button
              onClick={() => savePayouts.mutate()}
              disabled={savePayouts.isPending}
              className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold tracking-wide text-sm"
              size="sm"
            >
              SAVE
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
