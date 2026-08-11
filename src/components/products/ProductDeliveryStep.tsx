import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Upload, FileText, X, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  MAX_UPLOAD_LABEL,
  safeObjectName,
  validateUploadFile,
} from "@/lib/upload-validation";
import type { ProductFormData } from "@/pages/CreateProduct";

interface Props {
  form: ProductFormData;
  updateForm: (updates: Partial<ProductFormData>) => void;
}

/** Remove o prefixo canônico `private-files/` para obter o path do objeto. */
export function toStorageObjectPath(url: string): string {
  const marker = "private-files/";
  const i = url.indexOf(marker);
  return i >= 0 ? url.slice(i + marker.length) : url;
}


export function ProductDeliveryStep({ form, updateForm }: Props) {
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    // Validação client-side alinhada aos limites reais do bucket/projeto.
    const rejected = files
      .map((f) => ({ f, v: validateUploadFile({ name: f.name, size: f.size, type: f.type }) }))
      .filter((x) => !x.v.ok);
    if (rejected.length) {
      rejected.forEach((x) => toast.error((x.v as { reason: string }).reason));
      e.target.value = "";
      return;
    }

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Sessão expirada. Entre novamente para enviar arquivos.");
        return;
      }
      const uploaded = await Promise.all(
        files.map(async (file) => {
          // O bucket privado exige o prefixo `auth.uid()` na primeira pasta (RLS).
          // O nome do objeto é sanitizado e único (nunca `file.name` cru).
          const path = `${user.id}/deliveries/${safeObjectName(file.name)}`;
          const { error } = await supabase.storage.from("private-files").upload(path, file);
          if (error) throw error;
          // Guardamos o caminho canônico com o bucket para que os consumidores
          // detectem o arquivo como privado e solicitem URL assinada.
          return { name: file.name, url: `private-files/${path}`, size: file.size };
        })
      );
      updateForm({ deliveryFiles: [...form.deliveryFiles, ...uploaded] });
      toast.success(`${uploaded.length} arquivo(s) enviado(s)`);
    } catch (err: any) {
      toast.error("Erro ao enviar: " + err.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  /**
   * Remoção antes de salvar deixaria órfão no bucket. Apagamos o objeto que o
   * próprio usuário acabou de enviar (o prefixo é `auth.uid()`, então a RLS
   * garante que ninguém apaga arquivo de terceiro).
   */
  const removeFile = async (index: number) => {
    const target = form.deliveryFiles[index];
    updateForm({ deliveryFiles: form.deliveryFiles.filter((_, i) => i !== index) });
    if (!target?.url) return;
    const path = toStorageObjectPath(target.url);
    const { error } = await supabase.storage.from("private-files").remove([path]);
    if (error) {
      toast.error("Arquivo removido da lista, mas não do armazenamento.");
    }
  };


  // SERVICE — scheduling URL
  if (form.type === "SERVICE") {
    return (
      <div className="space-y-4">
        <Label>URL de agendamento</Label>
        <p className="text-sm text-muted-foreground">
          Cole o link do Calendly, Cal.com ou outro sistema de agendamento
        </p>
        <Input
          placeholder="https://calendly.com/..."
          value={form.deliveryUrl}
          onChange={(e) => updateForm({ deliveryUrl: e.target.value })}
        />
      </div>
    );
  }

  // COURSE — redirect to course builder
  if (form.type === "COURSE") {
    return (
      <div className="space-y-4 text-center py-10">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
          <ExternalLink className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">Course Builder</h3>
        <p className="text-muted-foreground max-w-sm mx-auto">
          Após criar o produto, você poderá montar os módulos e aulas no Course Builder.
        </p>
      </div>
    );
  }

  // DIGITAL, LEAD_MAGNET, PHYSICAL — file upload + optional URL
  return (
    <div className="space-y-4">
      {/* Optional external URL for DIGITAL */}
      {form.type === "DIGITAL" && (
        <div className="space-y-2 mb-4">
          <Label>URL externa (opcional)</Label>
          <p className="text-sm text-muted-foreground">Cole um link que será entregue ao comprador</p>
          <Input
            placeholder="https://..."
            value={form.deliveryUrl}
            onChange={(e) => updateForm({ deliveryUrl: e.target.value })}
          />
        </div>
      )}

      <Label>
        {form.type === "LEAD_MAGNET" ? "Arquivo de recompensa" : "Arquivos do produto"}
      </Label>
      <p className="text-sm text-muted-foreground">
        Faça upload dos arquivos que serão entregues ao comprador
      </p>

      {/* Uploaded files */}
      {form.deliveryFiles.length > 0 && (
        <div className="space-y-2">
          {form.deliveryFiles.map((file, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card"
            >
              <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </p>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeFile(i)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Upload area */}
      <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary/50 transition-colors bg-muted/30">
        <Upload className="h-8 w-8 text-muted-foreground mb-2" />
        <span className="text-sm text-muted-foreground">
          {uploading ? "Enviando..." : "Arraste ou clique para enviar arquivos"}
        </span>
        <span className="text-xs text-muted-foreground mt-1">Até {MAX_UPLOAD_LABEL} por arquivo</span>
        <input
          type="file"
          multiple
          className="hidden"
          onChange={handleFileUpload}
          disabled={uploading}
        />
      </label>
    </div>
  );
}
