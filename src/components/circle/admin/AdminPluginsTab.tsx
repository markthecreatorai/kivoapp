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
    label: "Membership questions",
    desc: "Ask members questions when they request access to your group.",
    isPro: false,
    icon: "❓",
    iconBg: "bg-blue-500",
  },
  {
    key: "unlock_chat_at_level",
    label: "Unlock chat at a level",
    desc: "Reduce DM spam by requiring members to be at a certain level to chat.",
    isPro: false,
    icon: "💬",
    iconBg: "bg-purple-500",
  },
  {
    key: "unlock_posting_at_level",
    label: "Unlock posting at Level 2 or 3",
    desc: "Reduce low quality posts by requiring members to be at Level 2 to post.",
    isPro: false,
    icon: "✏️",
    iconBg: "bg-red-700",
  },
  {
    key: "auto_dm_new_members",
    label: "Auto DM new members",
    desc: "Send an automated DM to new group members.",
    isPro: true,
    icon: "💌",
    iconBg: "bg-gray-800",
  },
  {
    key: "onboarding_video",
    label: "Onboarding video",
    desc: "Welcome new members with a custom onboarding video.",
    isPro: true,
    icon: "👋",
    iconBg: "bg-yellow-500",
  },
  {
    key: "zapier_integration",
    label: "Zapier integration",
    desc: "Invite members, unlock courses, and send membership questions to your CRM.",
    isPro: true,
    icon: "⚡",
    iconBg: "bg-orange-500",
  },
  {
    key: "meta_pixel",
    label: "Meta pixel tracking",
    desc: "Run FB/IG ads to your about page, retarget visitors, and track signups with precision.",
    isPro: true,
    icon: "∞",
    iconBg: "bg-blue-600",
  },
  {
    key: "cancellation_video",
    label: "Cancellation video",
    desc: "Retain members by showing them a video on the cancel page.",
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
                    ({isOn ? "On" : "Off"})
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
