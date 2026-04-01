import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Compass, Tag, X, CheckCircle2, Circle } from "lucide-react";
import { toast } from "sonner";

interface Props {
  community: any;
}

const CATEGORIES = [
  { value: "Business", label: "Negócios" },
  { value: "Technology", label: "Tecnologia" },
  { value: "Health & Fitness", label: "Saúde & Fitness" },
  { value: "Education", label: "Educação" },
  { value: "Arts & Creativity", label: "Artes & Criatividade" },
  { value: "Sports", label: "Esportes" },
  { value: "Spirituality", label: "Espiritualidade" },
  { value: "Finance", label: "Finanças" },
  { value: "Marketing", label: "Marketing" },
  { value: "Personal Development", label: "Desenvolvimento Pessoal" },
  { value: "Entertainment", label: "Entretenimento" },
  { value: "Other", label: "Outro" },
];

export default function AdminDiscoveryTab({ community }: Props) {
  const queryClient = useQueryClient();

  const [discoveryEnabled, setDiscoveryEnabled] = useState(
    community.discovery_enabled ?? true
  );
  const [category, setCategory] = useState(community.discovery_category || "");
  const [tags, setTags] = useState<string[]>(community.discovery_tags || []);
  const [tagInput, setTagInput] = useState("");

  const setupChecklist = [
    { label: "Descrição preenchida", done: !!community.description?.trim() },
    { label: "Imagem de capa adicionada", done: !!community.cover_image_url },
    { label: "Ícone da comunidade", done: !!community.icon_url },
    { label: "Categoria definida", done: !!category },
    { label: "Pelo menos 1 tag", done: tags.length > 0 },
    { label: "Modelo de acesso configurado", done: !!community.access_type },
  ];
  const checklistDone = setupChecklist.filter((i) => i.done).length;

  const discoverySignals = [
    { label: "Comunidade listada", done: discoveryEnabled, weight: 20 },
    { label: "Descrição", done: !!community.description?.trim(), weight: 15 },
    { label: "Capa", done: !!community.cover_image_url, weight: 10 },
    { label: "Ícone", done: !!community.icon_url, weight: 10 },
    { label: "Categoria", done: !!category, weight: 10 },
    { label: "Tags", done: tags.length > 0, weight: 10 },
    { label: "Membros (>=20)", done: (community.member_count || 0) >= 20, weight: 15 },
    { label: "Posts (>=10)", done: (community.post_count || 0) >= 10, weight: 10 },
  ];
  const discoveryScore = discoverySignals.reduce((sum, s) => sum + (s.done ? s.weight : 0), 0);
  const discoveryTier = discoveryScore >= 85 ? "Alto" : discoveryScore >= 60 ? "Médio" : "Baixo";
  const missingSignals = discoverySignals.filter((s) => !s.done).slice(0, 3);

  const saveDiscovery = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("communities")
        .update({
          discovery_enabled: discoveryEnabled,
          discovery_category: category || null,
          discovery_tags: tags,
        } as any)
        .eq("id", community.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community"] });
      toast.success("Configurações de descoberta salvas!");
    },
    onError: () => toast.error("Erro ao salvar"),
  });

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (!t || tags.includes(t) || tags.length >= 10) return;
    setTags((prev) => [...prev, t]);
    setTagInput("");
  };

  const removeTag = (tag: string) => setTags((prev) => prev.filter((t) => t !== tag));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Descoberta</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Configure como sua comunidade aparece para novos membros.
          </p>
        </div>
        <Button
          onClick={() => saveDiscovery.mutate()}
          disabled={saveDiscovery.isPending}
          className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold tracking-wide text-sm"
          size="sm"
        >
          SALVAR
        </Button>
      </div>

      {/* Setup checklist */}
      <div className="p-4 bg-white border border-gray-100 rounded-xl space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-900">Checklist de prontidão</p>
          <span className="text-xs text-gray-500">{checklistDone}/{setupChecklist.length}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {setupChecklist.map((item) => (
            <div key={item.label} className="flex items-center gap-2 text-xs text-gray-700">
              {item.done ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Circle className="h-3.5 w-3.5 text-gray-300" />}
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Discovery intelligence */}
      <div className="p-4 bg-white border border-gray-100 rounded-xl space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-900">Score de descoberta</p>
          <div className="text-right">
            <p className="text-sm font-bold text-gray-900">{discoveryScore}/100</p>
            <p className="text-[11px] text-gray-500">Nível: {discoveryTier}</p>
          </div>
        </div>
        <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full bg-primary" style={{ width: `${discoveryScore}%` }} />
        </div>
        {missingSignals.length > 0 ? (
          <div className="text-xs text-gray-500">
            <p className="mb-1">Para melhorar o rank no discovery, complete:</p>
            <ul className="space-y-0.5">
              {missingSignals.map((s) => <li key={s.label}>• {s.label}</li>)}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-emerald-600">Tudo certo. Comunidade pronta para máxima descoberta.</p>
        )}
      </div>

      {/* Discovery toggle */}
      <div className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center">
            <Compass className="h-4.5 w-4.5 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Aparecer na Descoberta</p>
            <p className="text-xs text-gray-500">
              Exibir sua comunidade na página de descoberta pública
            </p>
          </div>
        </div>
        <Switch
          checked={discoveryEnabled}
          onCheckedChange={setDiscoveryEnabled}
        />
      </div>

      {discoveryEnabled && (
        <>
          {/* Category */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">Categoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="border-gray-200">
                <SelectValue placeholder="Selecione uma categoria" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-400">
              Ajuda novas pessoas a encontrarem sua comunidade por interesse.
            </p>
          </div>

          {/* Tags */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-gray-400" />
              <Label className="text-sm font-medium text-gray-700">
                Tags ({tags.length}/10)
              </Label>
            </div>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="Ex: marketing, vendas, saude..."
                onKeyDown={(e) => e.key === "Enter" && addTag()}
                className="border-gray-200 focus:border-gray-400"
              />
              <Button
                onClick={addTag}
                variant="outline"
                size="sm"
                disabled={tags.length >= 10}
                className="shrink-0"
              >
                Adicionar
              </Button>
            </div>

            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 text-xs rounded-full font-medium"
                  >
                    #{tag}
                    <button
                      onClick={() => removeTag(tag)}
                      className="text-gray-400 hover:text-gray-700 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Preview box */}
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Prévia na Descoberta
            </p>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {community.cover_image_url ? (
                <img
                  src={community.cover_image_url}
                  alt=""
                  className="h-16 w-full object-cover"
                />
              ) : (
                <div className="h-16 bg-gradient-to-r from-blue-400 to-purple-500" />
              )}
              <div className="p-3 flex items-start gap-2.5">
                {community.icon_url ? (
                  <img
                    src={community.icon_url}
                    alt=""
                    className="w-10 h-10 rounded-xl object-cover shrink-0 -mt-5 border-2 border-white"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-gray-200 shrink-0 -mt-5 border-2 border-white" />
                )}
                <div>
                  <p className="text-sm font-bold text-gray-900">{community.name || "Sua Comunidade"}</p>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                    {community.description || "Descrição da comunidade aparece aqui"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
