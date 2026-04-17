// =============================================================
// CoverSourceField — Switch entre Upload e URL para a capa.
// Mantém valores de ambos os modos preservados na store.
// =============================================================

import { useRef, useState } from "react";
import { ImagePlus, Link2, Loader2, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useProductEditor } from "./store";
import {
  type UploadAdapter,
  validateImageFile,
  validateImageUrl,
} from "./uploadAdapter";

interface Props {
  uploadAdapter: UploadAdapter;
  folder?: string;
}

export function CoverSourceField({ uploadAdapter, folder = "product-covers" }: Props) {
  const { state, patch } = useProductEditor();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);

  const mode = state.coverSource;
  const uploadUrl = state.thumbnailUploadUrl;
  const externalUrl = state.thumbnailExternalUrl;
  const previewUrl = mode === "upload" ? uploadUrl : externalUrl;

  const switchTo = (next: "upload" | "url") => {
    if (next === mode) return;
    // Atualiza a thumbnail efetiva para o valor do modo recém-ativado
    const effective = next === "upload" ? uploadUrl : externalUrl;
    patch({ coverSource: next, thumbnailUrl: effective });
    setUploadError(null);
    setUrlError(null);
  };

  const handleFile = async (file: File) => {
    setUploadError(null);
    const check = validateImageFile(file);
    if (check.ok === false) {
      setUploadError(check.reason);
      return;
    }
    setUploading(true);
    try {
      const { url } = await uploadAdapter.uploadImage(file, { folder });
      patch({ thumbnailUploadUrl: url, thumbnailUrl: url, coverSource: "upload" });
    } catch (err) {
      setUploadError((err as Error).message || "Erro ao enviar imagem");
    } finally {
      setUploading(false);
    }
  };

  const handleUrlChange = (value: string) => {
    patch({ thumbnailExternalUrl: value, thumbnailUrl: value });
    if (!value.trim()) {
      setUrlError(null);
      return;
    }
    const check = validateImageUrl(value);
    setUrlError(check.ok === false ? check.reason : null);
  };

  const removeUpload = () => {
    patch({ thumbnailUploadUrl: "", thumbnailUrl: "" });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Imagem de capa</Label>
        <p className="text-xs text-muted-foreground">
          Recomendado: <strong>1200×630</strong> (proporção 16:9), até 5MB. JPG, PNG, WEBP ou GIF.
        </p>
      </div>

      {/* Switch */}
      <div
        role="tablist"
        aria-label="Origem da imagem de capa"
        className="inline-flex p-1 bg-muted rounded-lg"
      >
        <button
          role="tab"
          aria-selected={mode === "upload"}
          type="button"
          onClick={() => switchTo("upload")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
            mode === "upload"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <UploadCloud className="h-3.5 w-3.5" /> Upload
        </button>
        <button
          role="tab"
          aria-selected={mode === "url"}
          type="button"
          onClick={() => switchTo("url")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
            mode === "url"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Link2 className="h-3.5 w-3.5" /> URL
        </button>
      </div>

      {/* Upload mode */}
      {mode === "upload" && (
        <div className="space-y-2">
          {uploadUrl ? (
            <div className="relative rounded-xl overflow-hidden border border-border/40">
              <img
                src={uploadUrl}
                alt="Capa enviada"
                className="w-full aspect-video object-cover bg-muted"
              />
              <div className="absolute top-2 right-2 flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => inputRef.current?.click()}
                  disabled={uploading}
                >
                  Trocar
                </Button>
                <Button variant="destructive" size="sm" onClick={removeUpload} disabled={uploading}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="w-full aspect-video rounded-xl border-2 border-dashed border-border/60 bg-muted/20 hover:bg-muted/30 transition-colors flex flex-col items-center justify-center gap-2 text-muted-foreground"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="text-xs">Enviando…</span>
                </>
              ) : (
                <>
                  <ImagePlus className="h-7 w-7" />
                  <span className="text-xs font-medium">Clique para enviar uma imagem</span>
                  <span className="text-[10px]">JPG, PNG, WEBP ou GIF · até 5MB</span>
                </>
              )}
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
          {uploadError && (
            <p role="alert" className="text-xs text-destructive">
              {uploadError}
            </p>
          )}
        </div>
      )}

      {/* URL mode */}
      {mode === "url" && (
        <div className="space-y-2">
          <Input
            placeholder="https://…/minha-capa.jpg"
            value={externalUrl}
            onChange={(e) => handleUrlChange(e.target.value)}
            aria-invalid={!!urlError}
            aria-describedby={urlError ? "cover-url-error" : undefined}
          />
          {urlError && (
            <p id="cover-url-error" role="alert" className="text-xs text-destructive">
              {urlError}
            </p>
          )}
          {previewUrl && !urlError && (
            <div className="rounded-xl overflow-hidden border border-border/40">
              <img
                src={previewUrl}
                alt="Preview da URL"
                className="w-full aspect-video object-cover bg-muted"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
