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
import { Upload, X, Loader2 } from "lucide-react";
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
  } | null;
  nextPosition: number;
}

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
  const [accessMode, setAccessMode] = useState((course as any)?.access_mode || "OPEN");
  const [minLevel, setMinLevel] = useState<number>((course as any)?.min_level || 2);
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

      const payload = {
        community_id: communityId,
        name: name.trim(),
        description: description.trim() || null,
        access_type: accessType,
        cover_url: coverUrl || null,
        is_published: isPublished,
        position: course?.position ?? nextPosition,
        access_mode: accessMode,
        min_level: accessMode === "LEVEL_GATED" ? minLevel : null,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
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

          {/* Access type */}
          <div className="space-y-1.5">
            <Label>Tipo de acesso</Label>
            <Select value={accessType} onValueChange={setAccessType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="free">Gratuito</SelectItem>
                <SelectItem value="premium">Premium (pago)</SelectItem>
                <SelectItem value="members_only">Somente membros</SelectItem>
              </SelectContent>
            </Select>
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
