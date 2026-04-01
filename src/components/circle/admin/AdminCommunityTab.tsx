import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Layout, Grid3x3, BookOpen, Plus, Trash2, GripVertical } from "lucide-react";
import { toast } from "sonner";
import SpaceFormModal from "@/components/circle/SpaceFormModal";
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Props {
  community: any;
}

const DEFAULT_TAB_ORDER = ["feed", "classroom", "members", "leaderboard", "events", "about"];

const TAB_LABELS: Record<string, string> = {
  feed: "Feed",
  classroom: "Sala de aula",
  members: "Membros",
  leaderboard: "Ranking",
  events: "Eventos",
  about: "Sobre",
};

/* ── Sortable row for tabs ── */
function SortableTabRow({
  tabKey,
  checked,
  onToggle,
}: {
  tabKey: string;
  checked: boolean;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tabKey,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between px-4 py-3.5 bg-white"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing touch-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4 text-gray-300" />
        </button>
        <span className="text-sm font-medium text-gray-700">{TAB_LABELS[tabKey]}</span>
      </div>
      <Switch checked={checked} onCheckedChange={onToggle} />
    </div>
  );
}

/* ── Sortable row for categories ── */
function SortableCategoryRow({
  category,
  index,
  onUpdatePatch,
}: {
  category: any;
  index: number;
  onUpdatePatch: (id: string, patch: any) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-xl border bg-white p-3 space-y-2"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing touch-none"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4 text-gray-300" />
          </button>
          <p className="text-sm font-medium text-gray-900">{category.emoji || "📁"} {category.name}</p>
        </div>
        <p className="text-[11px] text-gray-400 w-7 text-right shrink-0">#{index + 1}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
        <div className="flex items-center justify-between rounded-lg border p-2">
          <span>Categoria visível</span>
          <Switch
            checked={!!category.is_visible}
            onCheckedChange={(v) => onUpdatePatch(category.id, { is_visible: v })}
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border p-2">
          <span>Apenas admin pode postar</span>
          <Switch
            checked={!!category.only_admins_can_post}
            onCheckedChange={(v) => onUpdatePatch(category.id, { only_admins_can_post: v })}
          />
        </div>
      </div>
    </div>
  );
}

export default function AdminCommunityTab({ community }: Props) {
  const queryClient = useQueryClient();

  const savedTabs = (community.tabs_config as Record<string, boolean>) || Object.fromEntries(DEFAULT_TAB_ORDER.map((k) => [k, true]));
  const savedTabOrder: string[] = (community.tabs_order as string[]) || DEFAULT_TAB_ORDER;

  const [tabs, setTabs] = useState<Record<string, boolean>>(savedTabs);
  const [tabOrder, setTabOrder] = useState<string[]>(savedTabOrder);
  const [rules, setRules] = useState<string[]>((community.community_rules as string[]) || []);
  const [newRule, setNewRule] = useState("");
  const [activeSection, setActiveSection] = useState<"tabs" | "categories" | "rules">("tabs");
  const [showCreateCategory, setShowCreateCategory] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const { data: categories = [] } = useQuery({
    queryKey: ["community-categories-admin", community.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_spaces")
        .select("id,name,emoji,position,is_visible,only_admins_can_post")
        .eq("community_id", community.id)
        .order("position", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const updateCategory = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) => {
      const { error } = await (supabase as any)
        .from("community_spaces")
        .update(patch)
        .eq("id", id)
        .eq("community_id", community.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community-categories-admin", community.id] });
      queryClient.invalidateQueries({ queryKey: ["circle-spaces"] });
    },
  });

  const saveCommunity = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("communities")
        .update({ tabs_config: tabs, tabs_order: tabOrder, community_rules: rules } as any)
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

  /* ── DnD handlers ── */
  const handleTabDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setTabOrder((prev) => {
      const oldIdx = prev.indexOf(String(active.id));
      const newIdx = prev.indexOf(String(over.id));
      return arrayMove(prev, oldIdx, newIdx);
    });
  };

  const handleCategoryDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !categories.length) return;

    const oldIdx = categories.findIndex((c: any) => c.id === active.id);
    const newIdx = categories.findIndex((c: any) => c.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;

    const reordered = arrayMove([...categories], oldIdx, newIdx);
    reordered.forEach((c: any, i: number) => {
      updateCategory.mutate({ id: c.id, patch: { position: i } });
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Comunidade</h2>
        <Button
          onClick={() => saveCommunity.mutate()}
          disabled={saveCommunity.isPending}
          className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold tracking-wide text-sm"
          size="sm"
        >
          {saveCommunity.isPending ? "Salvando..." : "Salvar"}
        </Button>
      </div>

      {/* Section selector */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          onClick={() => setActiveSection("tabs")}
          className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-colors ${
            activeSection === "tabs"
              ? "border-gray-300 bg-gray-50"
              : "border-transparent hover:bg-gray-50"
          }`}
        >
          <div className="w-10 h-10 rounded-xl bg-blue-800/20 flex items-center justify-center shrink-0">
            <Layout className="h-5 w-5 text-blue-800" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Abas</p>
            <p className="text-xs text-gray-500">Mostrar/ocultar abas de navegação.</p>
          </div>
        </button>

        <button
          onClick={() => setActiveSection("categories")}
          className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-colors ${
            activeSection === "categories"
              ? "border-gray-300 bg-gray-50"
              : "border-transparent hover:bg-gray-50"
          }`}
        >
          <div className="w-10 h-10 rounded-xl bg-green-800/20 flex items-center justify-center shrink-0">
            <Grid3x3 className="h-5 w-5 text-green-800" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Categorias</p>
            <p className="text-xs text-gray-500">Gerenciar categorias do feed.</p>
          </div>
        </button>

        <button
          onClick={() => setActiveSection("rules")}
          className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-colors ${
            activeSection === "rules"
              ? "border-gray-300 bg-gray-50"
              : "border-transparent hover:bg-gray-50"
          }`}
        >
          <div className="w-10 h-10 rounded-xl bg-amber-800/20 flex items-center justify-center shrink-0">
            <BookOpen className="h-5 w-5 text-amber-800" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Regras</p>
            <p className="text-xs text-gray-500">Definir diretrizes de discussão.</p>
          </div>
        </button>
      </div>

      {/* Section content */}
      {activeSection === "tabs" && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleTabDragEnd}>
          <SortableContext items={tabOrder} strategy={verticalListSortingStrategy}>
            <div className="space-y-0 divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
              {tabOrder.map((key) => (
                <SortableTabRow
                  key={key}
                  tabKey={key}
                  checked={tabs[key] ?? true}
                  onToggle={() => toggleTab(key)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {activeSection === "categories" && (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-muted-foreground">
              {categories.length} categoria{categories.length !== 1 ? "s" : ""}
            </p>
            <Button
              size="sm"
              onClick={() => setShowCreateCategory(true)}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Nova categoria
            </Button>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleCategoryDragEnd}>
            <SortableContext
              items={categories.map((c: any) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {categories.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                    <Grid3x3 className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-400 mb-1">Nenhuma categoria ainda.</p>
                    <p className="text-xs text-gray-400 mb-4">Categorias organizam os posts no feed para seus membros.</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowCreateCategory(true)}
                      className="gap-1.5"
                    >
                      <Plus className="h-4 w-4" />
                      Criar primeira categoria
                    </Button>
                  </div>
                ) : (
                  categories.map((c: any, idx: number) => (
                    <SortableCategoryRow
                      key={c.id}
                      category={c}
                      index={idx}
                      onUpdatePatch={(id, patch) => updateCategory.mutate({ id, patch })}
                    />
                  ))
                )}
              </div>
            </SortableContext>
          </DndContext>

          {showCreateCategory && (
            <SpaceFormModal
              communityId={community.id}
              spacesCount={categories.length}
              onClose={() => {
                setShowCreateCategory(false);
                queryClient.invalidateQueries({ queryKey: ["community-categories-admin", community.id] });
                queryClient.invalidateQueries({ queryKey: ["circle-spaces"] });
              }}
            />
          )}
        </>
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
