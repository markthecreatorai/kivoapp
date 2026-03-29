import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Layout, Grid3x3, BookOpen, Plus, Trash2, GripVertical } from "lucide-react";
import { toast } from "sonner";

interface Props {
  community: any;
}

const DEFAULT_TABS = {
  feed: true,
  classroom: true,
  members: true,
  leaderboard: true,
  events: true,
  about: true,
};

const TAB_LABELS: Record<string, string> = {
  feed: "Feed",
  classroom: "Classroom",
  members: "Members",
  leaderboard: "Leaderboard",
  events: "Events",
  about: "About",
};

export default function AdminCommunityTab({ community }: Props) {
  const queryClient = useQueryClient();

  const savedTabs = (community.tabs_config as Record<string, boolean>) || DEFAULT_TABS;
  const savedRules = (community.community_rules as string[]) || [];

  const [tabs, setTabs] = useState<Record<string, boolean>>(savedTabs);
  const [rules, setRules] = useState<string[]>(savedRules);
  const [newRule, setNewRule] = useState("");
  const [activeSection, setActiveSection] = useState<"tabs" | "categories" | "rules">("tabs");

  const saveCommunity = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("communities")
        .update({ tabs_config: tabs, community_rules: rules } as any)
        .eq("id", community.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community"] });
      toast.success("Configuração da comunidade salva!");
    },
    onError: () => toast.error("Erro ao salvar"),
  });

  const toggleTab = (key: string) => {
    setTabs((t) => ({ ...t, [key]: !t[key] }));
  };

  const addRule = () => {
    if (!newRule.trim()) return;
    setRules((r) => [...r, newRule.trim()]);
    setNewRule("");
  };

  const removeRule = (i: number) => {
    setRules((r) => r.filter((_, idx) => idx !== i));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Community</h2>
        <Button
          onClick={() => saveCommunity.mutate()}
          disabled={saveCommunity.isPending}
          className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold tracking-wide text-sm"
          size="sm"
        >
          SAVE
        </Button>
      </div>

      {/* Sub-navigation */}
      <div className="space-y-2">
        {/* Tabs */}
        <button
          onClick={() => setActiveSection("tabs")}
          className={`flex items-center gap-4 w-full p-4 rounded-xl border text-left transition-all ${
            activeSection === "tabs"
              ? "border-gray-300 bg-gray-50"
              : "border-transparent hover:bg-gray-50"
          }`}
        >
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
            <Layout className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Tabs</p>
            <p className="text-xs text-gray-500">Show/hide tabs in your community.</p>
          </div>
        </button>

        {/* Categories */}
        <button
          onClick={() => setActiveSection("categories")}
          className={`flex items-center gap-4 w-full p-4 rounded-xl border text-left transition-all ${
            activeSection === "categories"
              ? "border-gray-300 bg-gray-50"
              : "border-transparent hover:bg-gray-50"
          }`}
        >
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
            <Grid3x3 className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Categories</p>
            <p className="text-xs text-gray-500">
              Organize posts with categories, permissions, and sort methods.
            </p>
          </div>
        </button>

        {/* Rules */}
        <button
          onClick={() => setActiveSection("rules")}
          className={`flex items-center gap-4 w-full p-4 rounded-xl border text-left transition-all ${
            activeSection === "rules"
              ? "border-gray-300 bg-gray-50"
              : "border-transparent hover:bg-gray-50"
          }`}
        >
          <div className="w-10 h-10 rounded-xl bg-amber-800/20 flex items-center justify-center shrink-0">
            <BookOpen className="h-5 w-5 text-amber-800" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Rules</p>
            <p className="text-xs text-gray-500">Set guidelines for discussion.</p>
          </div>
        </button>
      </div>

      {/* Section content */}
      {activeSection === "tabs" && (
        <div className="space-y-0 divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
          {Object.entries(TAB_LABELS).map(([key, label]) => (
            <div
              key={key}
              className="flex items-center justify-between px-4 py-3.5 bg-white"
            >
              <div className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-gray-300" />
                <span className="text-sm font-medium text-gray-700">{label}</span>
              </div>
              <Switch
                checked={tabs[key] ?? true}
                onCheckedChange={() => toggleTab(key)}
              />
            </div>
          ))}
        </div>
      )}

      {activeSection === "categories" && (
        <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
          <Grid3x3 className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400 mb-1">Categorias ainda não implementadas.</p>
          <p className="text-xs text-gray-400">Em breve você poderá organizar posts em categorias.</p>
        </div>
      )}

      {activeSection === "rules" && (
        <div className="space-y-4">
          {/* Add rule */}
          <div className="flex gap-2">
            <Input
              value={newRule}
              onChange={(e) => setNewRule(e.target.value)}
              placeholder="Adicionar regra..."
              onKeyDown={(e) => e.key === "Enter" && addRule()}
              className="border-gray-200 focus:border-gray-400"
            />
            <Button onClick={addRule} variant="outline" size="sm" className="gap-1.5 shrink-0">
              <Plus className="h-4 w-4" />
              Adicionar
            </Button>
          </div>

          {rules.length === 0 ? (
            <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-200">
              <BookOpen className="h-7 w-7 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Nenhuma regra definida ainda.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rules.map((rule, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3.5 bg-white border border-gray-100 rounded-xl"
                >
                  <span className="text-xs font-bold text-gray-400 mt-0.5 w-5 shrink-0">
                    {i + 1}.
                  </span>
                  <span className="text-sm text-gray-800 flex-1">{rule}</span>
                  <button
                    onClick={() => removeRule(i)}
                    className="text-gray-300 hover:text-red-400 transition-colors shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
