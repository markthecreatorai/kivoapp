import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Lock } from "lucide-react";
import { toast } from "sonner";

interface Props {
  community: any;
}

interface PluginDef {
  key: string;
  label: string;
  desc: string;
  isPro: boolean;
  icon: string;
  iconBg: string;
}

const PLUGINS: PluginDef[] = [
  {
    key: "membership_questions",
    label: "Perguntas de entrada",
    desc: "Faça perguntas aos membros quando solicitarem acesso ao grupo.",
    isPro: false,
    icon: "❓",
    iconBg: "bg-blue-500",
  },
  {
    key: "unlock_chat_at_level",
    label: "Desbloquear chat por nível",
    desc: "Reduza spam no chat exigindo que membros atinjam um nível mínimo para conversar.",
    isPro: false,
    icon: "💬",
    iconBg: "bg-purple-500",
  },
  {
    key: "unlock_posting_at_level",
    label: "Desbloquear posts no nível 2 ou 3",
    desc: "Reduza posts de baixa qualidade exigindo nível 2 para publicar.",
    isPro: false,
    icon: "✏️",
    iconBg: "bg-red-700",
  },
  {
    key: "auto_dm_new_members",
    label: "DM automática para novos membros",
    desc: "Envie uma mensagem automática para novos membros do grupo.",
    isPro: true,
    icon: "💌",
    iconBg: "bg-gray-800",
  },
  {
    key: "onboarding_video",
    label: "Vídeo de boas-vindas",
    desc: "Receba novos membros com um vídeo personalizado de onboarding.",
    isPro: true,
    icon: "👋",
    iconBg: "bg-yellow-500",
  },
  {
    key: "zapier_integration",
    label: "Integração Zapier",
    desc: "Convide membros, desbloqueie cursos e envie dados para seu CRM.",
    isPro: true,
    icon: "⚡",
    iconBg: "bg-orange-500",
  },
  {
    key: "meta_pixel",
    label: "Rastreamento Meta Pixel",
    desc: "Anuncie no FB/IG, faça retargeting de visitantes e rastreie inscrições com precisão.",
    isPro: true,
    icon: "∞",
    iconBg: "bg-blue-600",
  },
  {
    key: "cancellation_video",
    label: "Vídeo de cancelamento",
    desc: "Retenha membros mostrando um vídeo na página de cancelamento.",
    isPro: true,
    icon: "🎬",
    iconBg: "bg-red-500",
  },
];

export default function AdminPluginsTab({ community }: Props) {
  const queryClient = useQueryClient();

  const savedPlugins = (community.plugins_config as Record<string, boolean>) || {};
  const [plugins, setPlugins] = useState<Record<string, boolean>>(savedPlugins);

  const savePlugins = useMutation({
    mutationFn: async (newConfig: Record<string, boolean>) => {
      const { error } = await supabase
        .from("communities")
        .update({ plugins_config: newConfig } as any)
        .eq("id", community.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community"] });
    },
    onError: () => toast.error("Erro ao salvar plugin"),
  });

  const togglePlugin = (key: string, isPro: boolean) => {
    if (isPro) {
      toast.info("Este plugin requer um plano Pro. Faça upgrade para desbloquear.");
      return;
    }
    const newConfig = { ...plugins, [key]: !plugins[key] };
    setPlugins(newConfig);
    savePlugins.mutate(newConfig);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Plugins</h2>
      </div>

      {/* Plugin list */}
      <div className="space-y-1">
        {PLUGINS.map((plugin) => {
          const isOn = !!plugins[plugin.key];
          return (
            <div
              key={plugin.key}
              className="flex items-center gap-4 p-4 hover:bg-gray-50 rounded-xl transition-colors"
            >
              {/* Icon */}
              <div
                className={`w-11 h-11 rounded-2xl ${plugin.iconBg} flex items-center justify-center text-xl shrink-0`}
              >
                <span className="text-white text-lg">{plugin.icon}</span>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">{plugin.label}</span>
                  <span
                    className={`text-[11px] font-medium ${isOn ? "text-green-600" : "text-gray-400"}`}
                  >
                    ({isOn ? "Ativo" : "Inativo"})
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{plugin.desc}</p>
              </div>

              {/* Action */}
              <div className="flex items-center gap-2 shrink-0">
                {plugin.isPro ? (
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 bg-gray-100 px-2.5 py-1.5 rounded-lg">
                    <span className="font-medium">Pro</span>
                    <Lock className="h-3 w-3" />
                  </div>
                ) : (
                  <Switch
                    checked={isOn}
                    onCheckedChange={() => togglePlugin(plugin.key, plugin.isPro)}
                    disabled={savePlugins.isPending}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
