import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Upload, X, Loader2, Globe, TrendingUp, ShoppingCart, Clock, Lock } from "lucide-react";
import { toast } from "sonner";

interface CourseFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communityId: string;
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
  } | null;
  nextPosition: number;
}

const ACCESS_MODE_OPTIONS = [
  { value: "OPEN", label: "Aberto", icon: Globe, helper: "Todos os membros ativos podem acessar." },
  { value: "LEVEL_UNLOCK", label: "Desbloquear por nível", icon: TrendingUp, helper: "Somente membros no nível mínimo definido podem acessar." },
  { value: "BUY_NOW", label: "Compra avulsa", icon: ShoppingCart, helper: "O membro precisa comprar este curso para acessar." },
  { value: "TIME_UNLOCK", label: "Liberar por tempo", icon: Clock, helper: "Libera automaticamente após X dias do ingresso do membro." },
  { value: "PRIVATE", label: "Privado", icon: Lock, helper: "Acesso restrito por tier ou membros específicos." },
];

export default function CourseFormModal({
  open, onOpenChange, communityId, course, nextPosition,
}: CourseFormModalProps) {
  const queryClient = useQueryClient();
  const isEdit = !!course;

  const [name, setName] = useState(course?.name || "");
  const [description, setDescription] = useState(course?.description || "");
  const [accessType, setAccessType] = useState(course?.access_type || "free");
  const [isPublished, setIsPublished] = useState(course?.is_published ?? true);
  const [coverUrl, setCoverUrl] = useState(course?.cover_url || "");
  const [accessMode, setAccessMode] = useState(course?.access_mode || "OPEN");
  const [minLevel, setMinLevel] = useState<number>(course?.min_level || 2);
  const [unlockDays, setUnlockDays] = useState<number>(course?.unlock_after_days || 7);
  const [coursePriceCents, setCoursePriceCents] = useState<number>(course?.course_price_cents || 0);
  const [uploading, setUploading] = useState(false);

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

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Nome é obrigatório");

      const payload: Record<string, any> = {
        community_id: communityId,
        name: name.trim(),
        description: description.trim() || null,
        access_type: accessType,
        cover_url: coverUrl || null,
        is_published: isPublished,
        position: course?.position ?? nextPosition,
        access_mode: accessMode,
        min_level: accessMode === "LEVEL_UNLOCK" ? minLevel : null,
        unlock_after_days: accessMode === "TIME_UNLOCK" ? unlockDays : null,
        course_price_cents: accessMode === "BUY_NOW" ? coursePriceCents : 0,
      };

      if (isEdit && course) {
        const { error } = await supabase.from("circle_courses").update(payload).eq("id", course.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("circle_courses").insert(payload);
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

  const currentModeInfo = ACCESS_MODE_OPTIONS.find(o => o.value === accessMode) || ACCESS_MODE_OPTIONS[0];

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
          <div className="space-y-2">
            <Label>Tipo de acesso ao curso</Label>
            <div className="grid grid-cols-1 gap-2">
              {ACCESS_MODE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isSelected = accessMode === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAccessMode(opt.value)}
                    className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
                      isSelected
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                        : "border-border hover:border-muted-foreground/30 hover:bg-muted/30"
                    }`}
                  >
                    <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                    <div className="min-w-0">
                      <p className={`text-sm font-medium ${isSelected ? "text-foreground" : "text-muted-foreground"}`}>
                        {opt.label}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{opt.helper}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Conditional fields per mode */}
          {accessMode === "LEVEL_UNLOCK" && (
            <div className="space-y-1.5 pl-1 border-l-2 border-primary/30 ml-2">
              <Label className="pl-3">Nível mínimo</Label>
              <div className="pl-3">
                <Input
                  type="number"
                  min={1}
                  max={9}
                  value={minLevel}
                  onChange={(e) => setMinLevel(Math.max(1, Math.min(9, parseInt(e.target.value) || 1)))}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Membros precisam estar no nível {minLevel} ou acima para acessar.
                </p>
              </div>
            </div>
          )}

          {accessMode === "BUY_NOW" && (
            <div className="space-y-1.5 pl-1 border-l-2 border-primary/30 ml-2">
              <Label className="pl-3">Preço do curso (R$)</Label>
              <div className="pl-3">
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={(coursePriceCents / 100).toFixed(2)}
                  onChange={(e) => setCoursePriceCents(Math.max(0, Math.round(parseFloat(e.target.value || "0") * 100)))}
                  placeholder="49.90"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  O membro paga uma vez para desbloquear este curso.
                </p>
              </div>
            </div>
          )}

          {accessMode === "TIME_UNLOCK" && (
            <div className="space-y-1.5 pl-1 border-l-2 border-primary/30 ml-2">
              <Label className="pl-3">Dias após ingresso</Label>
              <div className="pl-3">
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={unlockDays}
                  onChange={(e) => setUnlockDays(Math.max(1, Math.min(365, parseInt(e.target.value) || 1)))}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Libera automaticamente {unlockDays} {unlockDays === 1 ? "dia" : "dias"} após o membro entrar na comunidade.
                </p>
              </div>
            </div>
          )}

          {accessMode === "PRIVATE" && (
            <div className="space-y-1.5 pl-1 border-l-2 border-primary/30 ml-2">
              <div className="pl-3">
                <p className="text-xs text-muted-foreground">
                  Apenas membros autorizados manualmente ou por tier terão acesso. A gestão de permissões individuais estará disponível em breve.
                </p>
              </div>
            </div>
          )}

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
