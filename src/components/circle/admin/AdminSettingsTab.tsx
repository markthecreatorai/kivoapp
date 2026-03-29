import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, AlertTriangle, Upload, Link2, Copy, Trash2, Plus, Clock } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { useInviteLinks } from "@/hooks/useInviteLinks";

interface Props {
  community: any;
  member?: any;
}

export default function AdminSettingsTab({ community, member }: Props) {
  const queryClient = useQueryClient();
  const { currentWorkspace } = useWorkspace();
  const { inviteLinks, createLink, deactivateLink, copyLink } = useInviteLinks(
    community.id,
    member?.id || ""
  );

  const [settings, setSettings] = useState({
    name: community.name,
    description: community.description || "",
    long_description: community.long_description || "",
    about_video_url: community.about_video_url || "",
    price_cents: community.price_cents ?? 0,
    billing_period: community.billing_period || "monthly",
    access_type: community.access_type,
    linked_product_id: community.linked_product_id || "",
    require_approval: community.require_approval,
    allow_member_posts: community.allow_member_posts,
    allow_member_events: community.allow_member_events,
    points_per_post: community.points_per_post,
    points_per_comment: community.points_per_comment,
    points_per_like_received: community.points_per_like_received,
    points_per_course_completed: community.points_per_course_completed,
    points_per_daily_login: community.points_per_daily_login,
  });

  // Fetch workspace products for linking
  const { data: products } = useQuery({
    queryKey: ["workspace-products", currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace) return [] as Array<{id: string; name: string; type: string}>;
      const { data } = await (supabase as any).from("products").select("id, name, type")
        .eq("workspace_id", currentWorkspace.id).eq("is_active", true).order("name");
      return (data || []) as Array<{id: string; name: string; type: string}>;
    },
    enabled: !!currentWorkspace && (settings.access_type === "FREE_WITH_PRODUCT" || settings.access_type === "PAID_SUBSCRIPTION"),
  });

  const updateSettings = useMutation({
    mutationFn: async () => {
      const payload: any = { ...settings };
      if (!payload.linked_product_id) payload.linked_product_id = null;
      const { error } = await supabase.from("communities").update(payload).eq("id", community.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community"] });
      toast.success("Configurações salvas!");
    },
    onError: () => toast.error("Erro ao salvar"),
  });

  const uploadImage = async (file: File, type: "cover" | "icon") => {
    const ext = file.name.split(".").pop();
    const path = `${community.id}/${type}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("community").upload(path, file, { upsert: true });
    if (uploadError) { toast.error("Erro no upload"); return; }
    const { data: urlData } = supabase.storage.from("community").getPublicUrl(path);
    const field = type === "cover" ? "cover_image_url" : "icon_url";
    await supabase.from("communities").update({ [field]: urlData.publicUrl }).eq("id", community.id);
    queryClient.invalidateQueries({ queryKey: ["community"] });
    toast.success(`${type === "cover" ? "Capa" : "Ícone"} atualizado!`);
  };

  const deactivateCommunity = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("communities").update({ is_active: false }).eq("id", community.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community"] });
      toast.success("Comunidade desativada.");
    },
  });

  const set = (key: string, value: any) => setSettings((s) => ({ ...s, [key]: value }));

  return (
    <div className="space-y-6">
      {/* General settings */}
      <Card className="p-6 space-y-4">
        <h3 className="font-semibold text-foreground">Geral</h3>
        <div>
          <Label>Nome da comunidade</Label>
          <Input value={settings.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div>
          <Label>Descrição curta</Label>
          <Input value={settings.description} onChange={(e) => set("description", e.target.value)} maxLength={200} />
        </div>
        <div>
          <Label>Descrição longa</Label>
          <Textarea value={settings.long_description} onChange={(e) => set("long_description", e.target.value)} rows={4} />
        </div>
        <div>
          <Label>Vídeo de apresentação (URL)</Label>
          <Input value={settings.about_video_url} onChange={(e) => set("about_video_url", e.target.value)} placeholder="https://youtube.com/..." />
          <p className="text-xs text-muted-foreground mt-1">Cole o link do YouTube ou Vimeo para exibir na landing page</p>
        </div>

        {/* Image uploads */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Imagem de capa</Label>
            <div className="mt-1.5">
              {community.cover_image_url && (
                <img src={community.cover_image_url} alt="" className="h-20 w-full object-cover rounded-lg mb-2 border border-border" />
              )}
              <label className="flex items-center gap-2 text-sm text-primary cursor-pointer hover:underline">
                <Upload className="h-4 w-4" />Enviar capa
                <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0], "cover")} />
              </label>
            </div>
          </div>
          <div>
            <Label>Ícone / Logo</Label>
            <div className="mt-1.5">
              {community.icon_url && (
                <img src={community.icon_url} alt="" className="h-16 w-16 object-cover rounded-xl mb-2 border border-border" />
              )}
              <label className="flex items-center gap-2 text-sm text-primary cursor-pointer hover:underline">
                <Upload className="h-4 w-4" />Enviar ícone
                <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0], "icon")} />
              </label>
            </div>
          </div>
        </div>

        {/* Access type */}
        <div>
          <Label>Tipo de acesso</Label>
          <Select value={settings.access_type} onValueChange={(v) => set("access_type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="OPEN">Aberta (qualquer um entra)</SelectItem>
              <SelectItem value="FREE_WITH_PRODUCT">Inclusa na compra de produto</SelectItem>
              <SelectItem value="PAID_SUBSCRIPTION">Assinatura paga</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Pricing */}
        {settings.access_type === "PAID_SUBSCRIPTION" && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Preço (centavos)</Label>
              <Input type="number" value={settings.price_cents} onChange={(e) => set("price_cents", +e.target.value || 0)} placeholder="4990" />
              <p className="text-xs text-muted-foreground mt-1">Ex: 4990 = R$ 49,90</p>
            </div>
            <div>
              <Label>Período de cobrança</Label>
              <Select value={settings.billing_period} onValueChange={(v) => set("billing_period", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Mensal</SelectItem>
                  <SelectItem value="quarterly">Trimestral</SelectItem>
                  <SelectItem value="yearly">Anual</SelectItem>
                  <SelectItem value="one_time">Pagamento único</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {(settings.access_type === "FREE_WITH_PRODUCT" || settings.access_type === "PAID_SUBSCRIPTION") && (
          <div>
            <Label>Produto vinculado</Label>
            <Select value={settings.linked_product_id} onValueChange={(v) => set("linked_product_id", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione um produto" /></SelectTrigger>
              <SelectContent>
                {products?.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.name} ({p.type})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Toggles */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <Label>Requer aprovação para novos membros</Label>
            <Switch checked={settings.require_approval} onCheckedChange={(v) => set("require_approval", v)} />
          </div>
          <div className="flex items-center justify-between">
            <Label>Membros podem criar posts</Label>
            <Switch checked={settings.allow_member_posts} onCheckedChange={(v) => set("allow_member_posts", v)} />
          </div>
          <div className="flex items-center justify-between">
            <Label>Membros podem criar eventos</Label>
            <Switch checked={settings.allow_member_events} onCheckedChange={(v) => set("allow_member_events", v)} />
          </div>
        </div>
      </Card>

      {/* Points config */}
      <Card className="p-6 space-y-4">
        <h3 className="font-semibold text-foreground">Pontuação</h3>
        <div className="grid grid-cols-2 gap-4">
          <div><Label className="text-xs">Pontos por post</Label><Input type="number" value={settings.points_per_post} onChange={(e) => set("points_per_post", +e.target.value || 0)} /></div>
          <div><Label className="text-xs">Pontos por comentário</Label><Input type="number" value={settings.points_per_comment} onChange={(e) => set("points_per_comment", +e.target.value || 0)} /></div>
          <div><Label className="text-xs">Pontos por like recebido</Label><Input type="number" value={settings.points_per_like_received} onChange={(e) => set("points_per_like_received", +e.target.value || 0)} /></div>
          <div><Label className="text-xs">Pontos por curso completo</Label><Input type="number" value={settings.points_per_course_completed} onChange={(e) => set("points_per_course_completed", +e.target.value || 0)} /></div>
          <div><Label className="text-xs">Pontos por login diário</Label><Input type="number" value={settings.points_per_daily_login} onChange={(e) => set("points_per_daily_login", +e.target.value || 0)} /></div>
        </div>
      </Card>

      {/* Save */}
      <Button onClick={() => updateSettings.mutate()} disabled={updateSettings.isPending} className="w-full md:w-auto">
        <Save className="h-4 w-4 mr-2" />Salvar configurações
      </Button>

      {/* ─── Invite Links ─── */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Link2 className="h-4 w-4" /> Links de Convite
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">Compartilhe links para que novos membros entrem sem precisar de aprovação</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => createLink.mutate({})}
            disabled={createLink.isPending}
            id="create-invite-link"
          >
            <Plus className="h-4 w-4 mr-1.5" /> Criar link
          </Button>
        </div>

        {inviteLinks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhum link de convite criado ainda.</p>
        ) : (
          <div className="space-y-2">
            {inviteLinks.map((link: any) => (
              <div
                key={link.id}
                className={`flex items-center gap-3 p-3 rounded-lg border ${
                  link.is_active ? "bg-muted/30 border-border" : "bg-muted/10 border-border/50 opacity-60"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono text-foreground bg-muted px-2 py-0.5 rounded">
                      {`/join/${community.slug}?invite=${link.code}`}
                    </code>
                    {!link.is_active && (
                      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 rounded">Desativado</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {link.uses_count || 0}{link.max_uses ? `/${link.max_uses}` : ""} usos
                    </span>
                    {link.expires_at && (
                      <span>Expira: {new Date(link.expires_at).toLocaleDateString("pt-BR")}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {link.is_active && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => copyLink(link.code, community.slug)}
                      title="Copiar link"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {link.is_active && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => deactivateLink.mutate(link.id)}
                      title="Desativar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Danger zone */}
      <Card className="p-6 border-destructive/30">
        <h3 className="font-semibold text-destructive flex items-center gap-2 mb-3">
          <AlertTriangle className="h-4 w-4" />Zona de perigo
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Desativar a comunidade impedirá o acesso de todos os membros. Os dados não serão excluídos.
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={!community.is_active}>
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
              <AlertDialogAction onClick={() => deactivateCommunity.mutate()}>Desativar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Card>
    </div>
  );
}
