import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Save, Upload, AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface Props {
  community: any;
}

export default function AdminGeneralTab({ community }: Props) {
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    name: community.name || "",
    slug: community.slug || "",
    is_listed: community.is_listed ?? true,
    description: community.description || "",
    long_description: community.long_description || "",
    about_video_url: community.about_video_url || "",
    allow_member_posts: community.allow_member_posts ?? true,
    allow_member_events: community.allow_member_events ?? true,
  });

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const saveSettings = useMutation({
    mutationFn: async () => {
      const payload: any = { ...form };
      if (payload.slug && payload.slug !== community.slug) {
        const { data: conflict } = await supabase
          .from("communities")
          .select("id")
          .eq("slug", payload.slug)
          .neq("id", community.id)
          .maybeSingle();
        if (conflict) throw new Error("Slug já está em uso");
      }

      const { error } = await supabase
        .from("communities")
        .update(payload)
        .eq("id", community.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community"] });
      toast.success("Configurações gerais salvas!");
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao salvar"),
  });

  const uploadImage = async (file: File, type: "cover" | "icon") => {
    const ext = file.name.split(".").pop();
    const path = `${community.id}/${type}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("community")
      .upload(path, file, { upsert: true });
    if (uploadError) { toast.error("Erro no upload"); return; }
    const { data: urlData } = supabase.storage.from("community").getPublicUrl(path);
    const field = type === "cover" ? "cover_image_url" : "icon_url";
    await supabase.from("communities").update({ [field]: urlData.publicUrl }).eq("id", community.id);
    queryClient.invalidateQueries({ queryKey: ["community"] });
    toast.success(`${type === "cover" ? "Capa" : "Ícone"} atualizado!`);
  };

  const deactivateCommunity = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("communities")
        .update({ is_active: false })
        .eq("id", community.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community"] });
      toast.success("Comunidade desativada.");
    },
  });

  return (
    <div className="space-y-8">
      {/* Header with Save */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Geral</h2>
          <p className="text-sm text-gray-500 mt-0.5">Informações básicas da comunidade.</p>
        </div>
        <Button
          onClick={() => saveSettings.mutate()}
          disabled={saveSettings.isPending}
          className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold tracking-wide text-sm"
          size="sm"
        >
          SALVAR
        </Button>
      </div>

      {/* Name */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium text-gray-700">Nome da comunidade</Label>
        <Input
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          className="border-gray-200 focus:border-gray-400"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm font-medium text-gray-700">URL (slug)</Label>
        <Input
          value={form.slug}
          onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
          className="border-gray-200 focus:border-gray-400"
        />
        <p className="text-xs text-gray-400">URL pública: /c/{form.slug}</p>
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium text-gray-700">Descrição curta</Label>
        <Input
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          maxLength={200}
          className="border-gray-200 focus:border-gray-400"
        />
        <p className="text-xs text-gray-400">{form.description.length}/200 caracteres</p>
      </div>

      {/* Long Description */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium text-gray-700">Descrição completa</Label>
        <Textarea
          value={form.long_description}
          onChange={(e) => set("long_description", e.target.value)}
          rows={5}
          className="border-gray-200 focus:border-gray-400 resize-none"
          placeholder="Descreva sua comunidade com mais detalhes..."
        />
      </div>

      {/* Video URL */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium text-gray-700">Vídeo de apresentação</Label>
        <Input
          value={form.about_video_url}
          onChange={(e) => set("about_video_url", e.target.value)}
          placeholder="https://youtube.com/..."
          className="border-gray-200 focus:border-gray-400"
        />
        <p className="text-xs text-gray-400">
          Cole o link do YouTube ou Vimeo para exibir na landing page
        </p>
      </div>

      {/* Images */}
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label className="text-sm font-medium text-gray-700">Imagem de capa</Label>
          {community.cover_image_url && (
            <img
              src={community.cover_image_url}
              alt="Capa"
              className="h-24 w-full object-cover rounded-xl border border-gray-100"
            />
          )}
          <label className="flex items-center gap-2 text-sm text-blue-600 cursor-pointer hover:text-blue-700 font-medium">
            <Upload className="h-4 w-4" />
            Enviar capa
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0], "cover")}
            />
          </label>
          <p className="text-[11px] text-gray-400">Recomendado: 1280x720</p>
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium text-gray-700">Ícone / Logo</Label>
          {community.icon_url && (
            <img
              src={community.icon_url}
              alt="Ícone"
              className="h-16 w-16 object-cover rounded-2xl border border-gray-100"
            />
          )}
          <label className="flex items-center gap-2 text-sm text-blue-600 cursor-pointer hover:text-blue-700 font-medium">
            <Upload className="h-4 w-4" />
            Enviar ícone
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0], "icon")}
            />
          </label>
          <p className="text-[11px] text-gray-400">Recomendado: 256x256</p>
        </div>
      </div>

      {/* Toggles */}
      <div className="space-y-0 divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3.5 bg-white">
          <div>
            <p className="text-sm font-medium text-gray-900">Visível no discovery</p>
            <p className="text-xs text-gray-400">Desative para manter acesso só por link/convite</p>
          </div>
          <Switch
            checked={form.is_listed}
            onCheckedChange={(v) => set("is_listed", v)}
          />
        </div>
        <div className="flex items-center justify-between px-4 py-3.5 bg-white">
          <div>
            <p className="text-sm font-medium text-gray-900">Membros podem criar posts</p>
            <p className="text-xs text-gray-400">Permitir que membros publiquem no feed</p>
          </div>
          <Switch
            checked={form.allow_member_posts}
            onCheckedChange={(v) => set("allow_member_posts", v)}
          />
        </div>
        <div className="flex items-center justify-between px-4 py-3.5 bg-white">
          <div>
            <p className="text-sm font-medium text-gray-900">Membros podem criar eventos</p>
            <p className="text-xs text-gray-400">Permitir que membros organizem eventos</p>
          </div>
          <Switch
            checked={form.allow_member_events}
            onCheckedChange={(v) => set("allow_member_events", v)}
          />
        </div>
      </div>

      {/* Danger Zone */}
      <div className="border border-red-100 rounded-xl p-5 bg-red-50/30">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <h3 className="text-sm font-semibold text-red-600">Zona de perigo</h3>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Desativar a comunidade impedirá o acesso de todos os membros. Os dados não serão excluídos.
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" disabled={!community.is_active}>
              {community.is_active ? "Desativar comunidade" : "Comunidade já desativada"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Desativar comunidade?</AlertDialogTitle>
              <AlertDialogDescription>
                Todos os membros perderão acesso. Você poderá reativar depois.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => deactivateCommunity.mutate()}>
                Desativar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
