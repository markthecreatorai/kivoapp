import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CreditCard, CheckCircle, Clock, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  community: any;
}

const PLAN_LABELS: Record<string, { label: string; color: string }> = {
  free: { label: "Free", color: "bg-gray-100 text-gray-600" },
  pro: { label: "Pro", color: "bg-blue-100 text-blue-700" },
  enterprise: { label: "Enterprise", color: "bg-purple-100 text-purple-700" },
};

export default function AdminBillingTab({ community }: Props) {
  const { data: subscriptions } = useQuery({
    queryKey: ["circle-billing-subscriptions", community.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("circle_subscriptions")
        .select("*, plan:circle_plans(*)")
        .eq("community_id", community.id)
        .order("created_at", { ascending: false })
        .limit(20);
      return (data || []) as any[];
    },
  });

  const activeCount =
    subscriptions?.filter(
      (s: any) => s.status === "active" || s.status === "trialing"
    ).length ?? 0;

  const mrr =
    subscriptions
      ?.filter((s: any) => s.status === "active")
      .reduce((sum: number, s: any) => {
        const price = s.plan?.price_cents || 0;
        return (
          sum + (s.plan?.interval === "yearly" ? Math.round(price / 12) : price)
        );
      }, 0) ?? 0;

  const formatCurrency = (cents: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(cents / 100);

  const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
    active: { label: "Ativo", color: "text-green-600", icon: CheckCircle },
    trialing: { label: "Trial", color: "text-blue-600", icon: Clock },
    past_due: { label: "Inadimplente", color: "text-yellow-600", icon: Clock },
    canceled: { label: "Cancelado", color: "text-gray-400", icon: Clock },
    expired: { label: "Expirado", color: "text-red-400", icon: Clock },
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Cobrança</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Visão geral de assinaturas e receita da comunidade.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 bg-white border border-gray-100 rounded-xl text-center">
          <p className="text-2xl font-bold text-gray-900">{activeCount}</p>
          <p className="text-xs text-gray-500 mt-1">Assinantes ativos</p>
        </div>
        <div className="p-4 bg-white border border-gray-100 rounded-xl text-center">
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(mrr)}</p>
          <p className="text-xs text-gray-500 mt-1">MRR</p>
        </div>
        <div className="p-4 bg-white border border-gray-100 rounded-xl text-center">
          <p className="text-2xl font-bold text-gray-900">
            {formatCurrency(mrr * 12)}
          </p>
          <p className="text-xs text-gray-500 mt-1">ARR projetado</p>
        </div>
      </div>

      {/* Current plan */}
      <div className="p-5 bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl border border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gray-800 flex items-center justify-center">
              <CreditCard className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">Plano da Plataforma</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Gerenciado no painel do criador
              </p>
            </div>
          </div>
          <a
            href="/pricing"
            className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            Ver planos
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* Subscriptions list */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Assinantes recentes
        </h3>

        {!subscriptions || subscriptions.length === 0 ? (
          <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <CreditCard className="h-7 w-7 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Nenhuma assinatura ainda.</p>
            <p className="text-xs text-gray-400 mt-1">
              Configure o modelo de preço para começar a receber assinantes.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
            {subscriptions.map((sub: any) => {
              const status = STATUS_MAP[sub.status] || STATUS_MAP["expired"];
              const StatusIcon = status.icon;
              return (
                <div
                  key={sub.id}
                  className="flex items-center gap-4 px-4 py-3.5 bg-white hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 font-mono">
                      {sub.user_id?.substring(0, 12)}...
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {sub.plan?.name || "Plano"} ·{" "}
                      {formatCurrency(sub.plan?.price_cents || 0)}
                      {sub.next_billing_at && (
                        <>
                          {" · "}
                          Próx:{" "}
                          {format(new Date(sub.next_billing_at), "dd/MM/yy")}
                        </>
                      )}
                    </p>
                  </div>
                  <div className={`flex items-center gap-1 text-xs font-medium ${status.color}`}>
                    <StatusIcon className="h-3.5 w-3.5" />
                    {status.label}
                  </div>
                  <p className="text-xs text-gray-400">
                    {format(
                      new Date(sub.created_at),
                      "dd MMM yy",
                      { locale: ptBR }
                    )}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
