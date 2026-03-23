import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Upload, X, Image as ImageIcon, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthProvider";
import type { ProductFormData } from "@/pages/CreateProduct";
import { AICopyModal } from "./AICopyModal";

interface Props {
  form: ProductFormData;
  updateForm: (updates: Partial<ProductFormData>) => void;
}

export function ProductDetailsStep({ form, updateForm }: Props) {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [aiField, setAiField] = useState<"name" | "shortDescription" | "description" | null>(null);

  const uploadFile = useCallback(
    async (file: File, bucket: string) => {
      if (!user) throw new Error("Usuário não autenticado");
      const ext = file.name.split(".").pop();
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
      const { error } = await supabase.storage.from(bucket).upload(path, file);
      if (error) throw error;
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      return data.publicUrl;
    },
    [user]
  );

  const handleThumbnailUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadFile(file, "assets");
      updateForm({ thumbnailUrl: url });
    } catch (err: any) {
      toast.error("Erro ao enviar imagem: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (form.galleryUrls.length + files.length > 5) {
      toast.error("Máximo de 5 imagens na galeria");
      return;
    }
    setUploading(true);
    try {
      const urls = await Promise.all(files.map((f) => uploadFile(f, "assets")));
      updateForm({ galleryUrls: [...form.galleryUrls, ...urls] });
    } catch (err: any) {
      toast.error("Erro ao enviar imagens: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const removeGalleryImage = (index: number) => {
    updateForm({ galleryUrls: form.galleryUrls.filter((_, i) => i !== index) });
  };

  const AIButton = ({ field }: { field: "name" | "shortDescription" | "description" }) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="gap-1 h-7 text-xs text-primary hover:text-primary"
      onClick={() => setAiField(field)}
    >
      <Sparkles className="h-3 w-3" />
      Gerar com IA
    </Button>
  );

  return (
    <div className="space-y-6">
      {/* Name */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="name">Nome do produto *</Label>
          <AIButton field="name" />
        </div>
        <Input
          id="name"
          placeholder="Ex: Guia Completo de Marketing Digital"
          value={form.name}
          onChange={(e) => updateForm({ name: e.target.value })}
        />
      </div>

      {/* Short description */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="short-desc">Descrição curta</Label>
          <AIButton field="shortDescription" />
        </div>
        <Textarea
          id="short-desc"
          placeholder="Descreva seu produto em poucas palavras..."
          maxLength={300}
          rows={2}
          value={form.shortDescription}
          onChange={(e) => updateForm({ shortDescription: e.target.value })}
        />
        <p className="text-xs text-muted-foreground text-right">
          {form.shortDescription.length}/300
        </p>
      </div>

      {/* Full description */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="description">Descrição completa</Label>
          <AIButton field="description" />
        </div>
        <Textarea
          id="description"
          placeholder="Descreva detalhadamente o que o cliente vai receber..."
          rows={6}
          value={form.description}
          onChange={(e) => updateForm({ description: e.target.value })}
        />
      </div>

      {/* Thumbnail */}
      <div className="space-y-2">
        <Label>Imagem de capa</Label>
        {form.thumbnailUrl ? (
          <div className="relative w-full h-48 rounded-xl overflow-hidden border border-border">
            <img src={form.thumbnailUrl} alt="Capa" className="w-full h-full object-cover" />
            <Button
              variant="destructive"
              size="icon"
              className="absolute top-2 right-2 h-7 w-7"
              onClick={() => updateForm({ thumbnailUrl: "" })}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <label className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary/50 transition-colors bg-muted/30">
            <Upload className="h-8 w-8 text-muted-foreground mb-2" />
            <span className="text-sm text-muted-foreground">
              {uploading ? "Enviando..." : "Arraste ou clique para enviar"}
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleThumbnailUpload}
              disabled={uploading}
            />
          </label>
        )}
      </div>

      {/* Gallery */}
      <div className="space-y-2">
        <Label>Galeria de imagens (até 5)</Label>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {form.galleryUrls.map((url, i) => (
            <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-border">
              <img src={url} alt="" className="w-full h-full object-cover" />
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-1 right-1 h-5 w-5"
                onClick={() => removeGalleryImage(i)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
          {form.galleryUrls.length < 5 && (
            <label className="aspect-square rounded-lg border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors bg-muted/30">
              <ImageIcon className="h-6 w-6 text-muted-foreground" />
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleGalleryUpload}
                disabled={uploading}
              />
            </label>
          )}
        </div>
      </div>

      {/* AI Copy Modal */}
      {aiField && (
        <AICopyModal
          open={!!aiField}
          onOpenChange={(open) => !open && setAiField(null)}
          field={aiField}
          productName={form.name}
          onSelect={(text) => {
            if (aiField === "name") updateForm({ name: text });
            else if (aiField === "shortDescription") updateForm({ shortDescription: text });
            else if (aiField === "description") updateForm({ description: text });
          }}
        />
      )}
    </div>
  );
}
