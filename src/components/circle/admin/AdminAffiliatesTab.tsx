import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  community: any;
}

const COMMISSION_OPTIONS = [
  { value: 0, label: "OFF", desc: null },
  { value: 10, label: "10%", desc: null },
  { value: 20, label: "20%", desc: null },
  { value: 30, label: "30%", desc: null },
  { value: 40, label: "40%", desc: "most effective" },
  { value: 50, label: "50%", desc: null },
] as const;

export default function AdminAffiliatesTab({ community }: Props) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<number>(
    community.affiliate_commission_pct ?? 0
  );

  const saveAffiliates = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("communities")
        .update({ affiliate_commission_pct: selected })
        .eq("id", community.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community"] });
      toast.success("Configuração de afiliados salva!");
    },
    onError: () => toast.error("Erro ao salvar"),
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Affiliates</h2>
        <Button
          onClick={() => saveAffiliates.mutate()}
          disabled={saveAffiliates.isPending}
          className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold tracking-wide text-sm"
          size="sm"
        >
          SAVE
        </Button>
      </div>

      <p className="text-sm text-gray-600">
        Reward your members for referring their friends by offering recurring commissions.
      </p>

      {/* Radio options */}
      <div className="space-y-3">
        {COMMISSION_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className="flex items-center gap-3 cursor-pointer group"
            onClick={() => setSelected(opt.value)}
          >
            <div
              className={cn(
                "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors shrink-0",
                selected === opt.value ? "border-blue-500" : "border-gray-300 group-hover:border-gray-400"
              )}
            >
              {selected === opt.value && (
                <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              )}
            </div>
            <span className="text-sm text-gray-800">
              {opt.label}
              {opt.desc && (
                <span className="text-gray-400 ml-1">({opt.desc})</span>
              )}
            </span>
          </label>
        ))}
      </div>

      {selected > 0 && (
        <div className="p-4 bg-green-50 rounded-xl border border-green-100">
          <p className="text-sm text-green-700">
            <strong>{selected}% de comissão recorrente</strong> será pago a cada membro que 
            indicar um novo assinante, enquanto a assinatura estiver ativa.
          </p>
        </div>
      )}
    </div>
  );
}
