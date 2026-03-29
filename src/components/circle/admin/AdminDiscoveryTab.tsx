import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Compass, Tag, X } from "lucide-react";
import { toast } from "sonner";

interface Props {
  community: any;
}

const CATEGORIES = [
  "Business",
  "Technology",
  "Health & Fitness",
  "Education",
  "Arts & Creativity",
  "Sports",
  "Spirituality",
  "Finance",
  "Marketing",
  "Personal Development",
  "Entertainment",
  "Other",
];

export default function AdminDiscoveryTab({ community }: Props) {
  const queryClient = useQueryClient();

  const [discoveryEnabled, setDiscoveryEnabled] = useState(
    community.discovery_enabled ?? true
  );
  const [category, setCategory] = useState(community.discovery_category || "");
  const [tags, setTags] = useState<string[]>(community.discovery_tags || []);
  const [tagInput, setTagInput] = useState("");

  const saveDiscovery = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("communities")
        .update({
          discovery_enabled: discoveryEnabled,
          discovery_category: category || null,
          discovery_tags: tags,
        })
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
          <h2 className="text-xl font-semibold text-gray-900">Discovery</h2>
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
          SAVE
        </Button>
      </div>

      {/* Discovery toggle */}
      <div className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center">
            <Compass className="h-4.5 w-4.5 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Aparecer no Discovery</p>
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
                  <SelectItem key={c} value={c}>
                    {c}
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
              Preview no Discovery
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
