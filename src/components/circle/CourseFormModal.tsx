import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Upload, X, Loader2, Globe, TrendingUp, ShoppingCart, Clock, Lock, Users } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";

interface CourseFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communityId: string;
  workspaceId?: string;
  course?: {
    id: string;
    name: string;
    description: string | null;
    access_type: string;
    cover_url: string | null;
    is_published: boolean;
    position: number;
    access_mode?: string;
    min_level?: number | null;
    unlock_after_days?: number | null;
    course_price_cents?: number | null;
    buy_now_product_id?: string | null;
    private_mode?: string | null;
    allowed_tier_ids?: string[] | null;
    allowed_member_ids?: string[] | null;
  } | null;
  nextPosition: number;
}

const ACCESS_MODE_OPTIONS = [
  { value: "OPEN", label: "Aberto", icon: Globe, helper: "Todos os membros ativos podem acessar." },
  { value: "LEVEL_UNLOCK", label: "Desbloquear por nível", icon: TrendingUp, helper: "Somente membros no nível mínimo definido podem acessar." },
  { value: "BUY_NOW", label: "Compra avulsa", icon: ShoppingCart, helper: "O membro precisa comprar um produto vinculado para acessar." },
  { value: "TIME_UNLOCK", label: "Liberar por tempo", icon: Clock, helper: "Libera automaticamente após X dias do ingresso do membro." },
  { value: "PRIVATE", label: "Privado", icon: Lock, helper: "Acesso restrito por tier ou membros específicos." },
];

export default function CourseFormModal({
  open, onOpenChange, communityId, workspaceId, course, nextPosition,
}: CourseFormModalProps) {
  const queryClient = useQueryClient();
  const isEdit = !!course;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublished, setIsPublished] = useState(true);
  const [coverUrl, setCoverUrl] = useState("");
  const [accessMode, setAccessMode] = useState("OPEN");
  const [minLevel, setMinLevel] = useState<number>(2);
  const [unlockDays, setUnlockDays] = useState<number>(7);
  const [coursePriceCents, setCoursePriceCents] = useState<number>(0);
  const [buyNowProductId, setBuyNowProductId] = useState<string>("");
  const [privateMode, setPrivateMode] = useState<string>("SPECIFIC_MEMBERS");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [selectedTierIds, setSelectedTierIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (open) {
      setName(course?.name || "");
      setDescription(course?.description || "");
      setIsPublished(course?.is_published ?? true);
      setCoverUrl(course?.cover_url || "");
      setAccessMode(course?.access_mode || "OPEN");
      setMinLevel(course?.min_level || 2);
      setUnlockDays(course?.unlock_after_days || 7);
      setCoursePriceCents(course?.course_price_cents || 0);
      setBuyNowProductId(course?.buy_now_product_id || "");
      setPrivateMode(course?.private_mode || "SPECIFIC_MEMBERS");
      setSelectedMemberIds(course?.allowed_member_ids || []);
      setSelectedTierIds(course?.allowed_tier_ids || []);
    }
  }, [open, course]);

  const { data: products = [] } = useQuery({
    queryKey: ["workspace-products", workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      const { data } = await supabase
        .from("products")
        .select("id, name, prices(amount)")
        .eq("workspace_id", workspaceId)
        .eq("status", "PUBLISHED")
        .order("name");
      return (data || []).map((p: any) => ({
        id: p.id as string,
        name: p.name as string,
        price: (p.prices?.[0]?.amount ?? 0) as number,
      }));
    },
    enabled: !!workspaceId && accessMode === "BUY_NOW",
  });

  const { data: members = [] } = useQuery({
    queryKey: ["community-members-list", communityId],
    queryFn: async () => {
      const { data } = await supabase
        .from("community_members")
        .select("id, display_name, username, role")
        .eq("community_id", communityId)
        .eq("status", "ACTIVE")
        .order("display_name");
      return data || [];
    },
    enabled: !!communityId && accessMode === "PRIVATE" && (privateMode === "SPECIFIC_MEMBERS" || privateMode === "BOTH"),
  });

  const { data: tiers = [] } = useQuery({
    queryKey: ["community-tiers", communityId],
    queryFn: async () => {
      const { data } = await supabase
        .from("community_tiers")
        .select("id, name, price_cents, billing_period, is_free")
        .eq("community_id", communityId)
        .eq("is_active", true)
        .order("sort_order");
      return data || [];
    },
    enabled: !!communityId && accessMode === "PRIVATE" && (privateMode === "TIERS" || privateMode === "BOTH"),
  });

  const handleUploadCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `courses/${communityId}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("community").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("community").getPublicUrl(path);
      setCoverUrl(urlData.publicUrl);
    } catch (err: any) {
      toast.error("Erro ao fazer upload: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const toggleMemberId = (id: string) => {
    setSelectedMemberIds(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const toggleTierId = (id: string) => {
    setSelectedTierIds(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Nome é obrigatório");
      if (accessMode === "BUY_NOW" && !buyNowProductId) throw new Error("Selecione um produto para compra avulsa");
      if (accessMode === "PRIVATE") {
        if (privateMode === "SPECIFIC_MEMBERS" && selectedMemberIds.length === 0) throw new Error("Selecione ao menos um membro");
        if (privateMode === "TIERS" && selectedTierIds.length === 0) throw new Error("Selecione ao menos um plano/tier");
        if (privateMode === "BOTH" && selectedMemberIds.length === 0 && selectedTierIds.length === 0) throw new Error("Selecione ao menos um membro ou tier");
      }

      const payload = {
        community_id: communityId,
        name: name.trim(),
        description: description.trim() || null,
        access_type: accessMode === "OPEN" ? "free" : "premium",
        cover_url: coverUrl || null,
        is_published: isPublished,
        position: course?.position ?? nextPosition,
        access_mode: accessMode,
        min_level: accessMode === "LEVEL_UNLOCK" ? minLevel : null,
        unlock_after_days: accessMode === "TIME_UNLOCK" ? unlockDays : null,
        course_price_cents: accessMode === "BUY_NOW" ? coursePriceCents : 0,
        buy_now_product_id: accessMode === "BUY_NOW" ? buyNowProductId : null,
        private_mode: accessMode === "PRIVATE" ? privateMode : null,
        allowed_tier_ids: accessMode === "PRIVATE" && (privateMode === "TIERS" || privateMode === "BOTH") ? selectedTierIds : null,
        allowed_member_ids: accessMode === "PRIVATE" && (privateMode === "SPECIFIC_MEMBERS" || privateMode === "BOTH") ? selectedMemberIds : null,
      };

      if (isEdit && course) {
        const { error } = await supabase.from("circle_courses").update(payload as any).eq("id", course.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("circle_courses").insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circle-courses"] });
      toast.success(isEdit ? "Curso atualizado!" : "Curso criado!");
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao salvar curso");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Curso" : "Novo Curso"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Edite as informações do curso." : "Preencha as informações para criar um novo curso."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="course-name">Nome do curso</Label>
            <Input
              id="course-name"
              placeholder="Ex: Fundamentos de Growth"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="course-desc">Descrição</Label>
            <Textarea
              id="course-desc"
              placeholder="Breve descrição do curso..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          {/* Cover upload */}
          <div className="space-y-1.5">
            <Label>Capa do curso (1460×752px)</Label>
            {coverUrl ? (
              <div className="relative rounded-lg overflow-hidden border border-border">
                <img src={coverUrl} alt="Cover" className="w-full aspect-[1460/752] object-cover" />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2 h-7 w-7"
                  onClick={() => setCoverUrl("")}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg p-6 cursor-pointer hover:bg-muted/30 transition-colors">
                {uploading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                ) : (
                  <>
                    <Upload className="h-6 w-6 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Clique para enviar imagem</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleUploadCover}
                  disabled={uploading}
                />
              </label>
            )}
          </div>

          {/* Access mode - card selector */}
          <div className="space-y-3">
            <Label>Tipo de acesso ao curso</Label>
            <div className="grid grid-cols-1 gap-1.5">
              {ACCESS_MODE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isSelected = accessMode === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAccessMode(opt.value)}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                      isSelected
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                        : "border-border hover:border-muted-foreground/30 hover:bg-muted/30"
                    }`}
                  >
                    <div className={`flex items-center justify-center h-8 w-8 rounded-lg shrink-0 ${
                      isSelected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    }`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium ${isSelected ? "text-foreground" : "text-muted-foreground"}`}>
                        {opt.label}
                      </p>
                      <p className="text-xs text-muted-foreground leading-snug">{opt.helper}</p>
                    </div>
                    <div className={`h-4 w-4 rounded-full border-2 shrink-0 transition-all ${
                      isSelected ? "border-primary bg-primary" : "border-muted-foreground/30"
                    }`}>
                      {isSelected && (
                        <div className="h-full w-full flex items-center justify-center">
                          <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Conditional fields per mode */}
          {accessMode === "LEVEL_UNLOCK" && (
            <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-4">
              <Label>Nível mínimo</Label>
              <Input
                type="number"
                min={1}
                max={9}
                value={minLevel}
                onChange={(e) => setMinLevel(Math.max(1, Math.min(9, parseInt(e.target.value) || 1)))}
              />
              <p className="text-xs text-muted-foreground">
                Membros precisam alcançar o nível {minLevel} para desbloquear.
              </p>
            </div>
          )}

          {accessMode === "BUY_NOW" && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
              <div className="space-y-1.5">
                <Label>Produto vinculado</Label>
                <Select value={buyNowProductId} onValueChange={setBuyNowProductId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um produto..." />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} — R$ {(p.price / 100).toFixed(2).replace(".", ",")}
                      </SelectItem>
                    ))}
                    {products.length === 0 && (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        Nenhum produto ativo encontrado.
                      </div>
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Ao comprar este produto, o membro recebe acesso ao curso.
                </p>
              </div>
            </div>
          )}

          {accessMode === "TIME_UNLOCK" && (
            <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-4">
              <Label>Dias após ingresso</Label>
              <Input
                type="number"
                min={1}
                max={365}
                value={unlockDays}
                onChange={(e) => setUnlockDays(Math.max(1, Math.min(365, parseInt(e.target.value) || 1)))}
              />
              <p className="text-xs text-muted-foreground">
                O curso será liberado automaticamente {unlockDays} {unlockDays === 1 ? "dia" : "dias"} após o membro ingressar na comunidade.
              </p>
            </div>
          )}

          {accessMode === "PRIVATE" && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
              <div className="space-y-1.5">
                <Label>Restringir por</Label>
                <Select value={privateMode} onValueChange={setPrivateMode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SPECIFIC_MEMBERS">
                      <div className="flex items-center gap-2"><Users className="h-3.5 w-3.5" /> Membros específicos</div>
                    </SelectItem>
                    <SelectItem value="TIERS">
                      <div className="flex items-center gap-2"><TrendingUp className="h-3.5 w-3.5" /> Por plano/tier</div>
                    </SelectItem>
                    <SelectItem value="BOTH">
                      <div className="flex items-center gap-2"><Lock className="h-3.5 w-3.5" /> Ambos (tier + membros)</div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(privateMode === "TIERS" || privateMode === "BOTH") && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Planos permitidos</Label>
                  {tiers.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Nenhum plano ativo. Crie planos na aba Preços.</p>
                  ) : (
                    <div className="space-y-1 max-h-32 overflow-y-auto rounded-lg border border-border bg-background p-2">
                      {tiers.map((tier: any) => (
                        <label key={tier.id} className="flex items-center gap-2 text-sm cursor-pointer py-1.5 hover:bg-muted/50 px-2 rounded-md">
                          <Checkbox
                            checked={selectedTierIds.includes(tier.id)}
                            onCheckedChange={() => toggleTierId(tier.id)}
                          />
                           <span className="text-foreground flex-1">{tier.name}</span>
                           <span className="text-xs text-muted-foreground">
                             {tier.is_free ? "Grátis" : `R$ ${(tier.price_cents / 100).toFixed(2).replace(".", ",")} / ${tier.billing_period === "monthly" ? "mês" : tier.billing_period === "yearly" ? "ano" : tier.billing_period || ""}`}
                           </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {(privateMode === "SPECIFIC_MEMBERS" || privateMode === "BOTH") && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Membros permitidos</Label>
                  {members.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Nenhum membro ativo encontrado.</p>
                  ) : (
                    <div className="space-y-1 max-h-40 overflow-y-auto rounded-lg border border-border bg-background p-2">
                      {members.filter((m: any) => m.role === "MEMBER").map((m: any) => (
                        <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer py-1.5 hover:bg-muted/50 px-2 rounded-md">
                          <Checkbox
                            checked={selectedMemberIds.includes(m.id)}
                            onCheckedChange={() => toggleMemberId(m.id)}
                          />
                          <span className="text-foreground">{m.display_name || m.username || "Sem nome"}</span>
                          {m.username && <span className="text-xs text-muted-foreground">@{m.username}</span>}
                        </label>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {selectedMemberIds.length} membro{selectedMemberIds.length !== 1 ? "s" : ""} selecionado{selectedMemberIds.length !== 1 ? "s" : ""}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Access preview */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <p className="text-xs font-medium text-foreground mb-1">Quem poderá acessar este curso?</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {accessMode === "OPEN" && "Todos os membros ativos da comunidade."}
              {accessMode === "LEVEL_UNLOCK" && `Membros que alcançaram o nível ${minLevel} ou superior.`}
              {accessMode === "BUY_NOW" && (
                buyNowProductId
                  ? `Membros que compraram o produto "${products.find((p: any) => p.id === buyNowProductId)?.name || "selecionado"}".`
                  : "Selecione o produto vinculado acima."
              )}
              {accessMode === "TIME_UNLOCK" && `Membros com ${unlockDays} ${unlockDays === 1 ? "dia" : "dias"} ou mais de comunidade.`}
              {accessMode === "PRIVATE" && (
                privateMode === "TIERS"
                  ? selectedTierIds.length > 0
                    ? `Assinantes dos planos: ${tiers.filter((t: any) => selectedTierIds.includes(t.id)).map((t: any) => t.name).join(", ")}.`
                    : "Selecione ao menos um plano acima."
                  : privateMode === "SPECIFIC_MEMBERS"
                    ? `${selectedMemberIds.length} membro${selectedMemberIds.length !== 1 ? "s" : ""} específico${selectedMemberIds.length !== 1 ? "s" : ""}.`
                    : `${selectedTierIds.length} plano${selectedTierIds.length !== 1 ? "s" : ""} + ${selectedMemberIds.length} membro${selectedMemberIds.length !== 1 ? "s" : ""}.`
              )}
            </p>
          </div>

          {/* Published toggle */}
          <div className="flex items-center justify-between">
            <Label htmlFor="course-published">Publicado</Label>
            <Switch
              id="course-published"
              checked={isPublished}
              onCheckedChange={setIsPublished}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !name.trim()}>
            {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            {isEdit ? "Salvar" : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
