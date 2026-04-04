import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { ResourceRow } from "@/pages/circle/CircleResources";

interface Props {
  community: any;
  member: any;
  resource: ResourceRow | null;
  onClose: () => void;
  onSaved: () => void;
}

export function ResourceFormModal({ community, member, resource, onClose, onSaved }: Props) {
  const isEdit = !!resource;
  const [title, setTitle] = useState(resource?.title || "");
  const [description, setDescription] = useState(resource?.description || "");
  const [category, setCategory] = useState(resource?.category || "Geral");
  const [tagsStr, setTagsStr] = useState((resource?.tags || []).join(", "));
  const [resourceType, setResourceType] = useState<"file" | "link">(resource?.resource_type as any || "link");
  const [externalUrl, setExternalUrl] = useState(resource?.external_url || "");
  const [file, setFile] = useState<File | null>(null);
  const [accessRule, setAccessRule] = useState(resource?.access_rule || "all");
  const [minLevel, setMinLevel] = useState(resource?.min_level || 1);
  const [isPublished, setIsPublished] = useState(resource?.is_published ?? true);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) { toast.error("Título obrigatório"); return; }
    if (resourceType === "link" && !externalUrl.trim()) { toast.error("URL obrigatória"); return; }
    if (resourceType === "file" && !file && !isEdit) { toast.error("Selecione um arquivo"); return; }

    setSaving(true);
    try {
      let filePath = resource?.file_path || null;
      let fileName = resource?.file_name || null;
      let mimeType = resource?.mime_type || null;
      let sizeBytes = resource?.size_bytes || null;

      if (resourceType === "file" && file) {
        const ext = file.name.split(".").pop();
        const path = `${community.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("community-resources").upload(path, file, { upsert: true });
        if (upErr) throw upErr;
        filePath = path;
        fileName = file.name;
        mimeType = file.type;
        sizeBytes = file.size;
      }

      const tags = tagsStr.split(",").map(t => t.trim()).filter(Boolean);

      const payload = {
        community_id: community.id,
        title: title.trim(),
        description: description.trim() || null,
        category: category.trim() || "Geral",
        tags,
        resource_type: resourceType,
        file_path: resourceType === "file" ? filePath : null,
        file_name: resourceType === "file" ? fileName : null,
        mime_type: resourceType === "file" ? mimeType : null,
        size_bytes: resourceType === "file" ? sizeBytes : null,
        external_url: resourceType === "link" ? externalUrl.trim() : null,
        access_rule: accessRule,
        min_level: accessRule === "level" ? minLevel : null,
        is_published: isPublished,
        created_by: member.id,
      };

      if (isEdit && resource) {
        const { error } = await supabase.from("community_resources").update(payload).eq("id", resource.id);
        if (error) throw error;
        toast.success("Recurso atualizado");
      } else {
        const { error } = await supabase.from("community_resources").insert(payload);
        if (error) throw error;
        toast.success("Recurso criado");
      }

      supabase.from("analytics_events").insert({
        event_type: isEdit ? "resource_updated" : "resource_created",
        workspace_id: community.workspace_id,
        metadata: { community_id: community.id, resource_type: resourceType },
      }).then(() => {});

      onSaved();
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar recurso");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Recurso" : "Novo Recurso"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Título *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Nome do recurso" />
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Breve descrição" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Categoria</Label>
              <Input value={category} onChange={e => setCategory(e.target.value)} placeholder="Geral" />
            </div>
            <div>
              <Label>Tags (separadas por vírgula)</Label>
              <Input value={tagsStr} onChange={e => setTagsStr(e.target.value)} placeholder="pdf, aula, guia" />
            </div>
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={resourceType} onValueChange={v => setResourceType(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="link">Link externo</SelectItem>
                <SelectItem value="file">Arquivo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {resourceType === "link" ? (
            <div>
              <Label>URL *</Label>
              <Input value={externalUrl} onChange={e => setExternalUrl(e.target.value)} placeholder="https://..." />
            </div>
          ) : (
            <div>
              <Label>Arquivo * {isEdit && resource?.file_name && `(atual: ${resource.file_name})`}</Label>
              <Input type="file" onChange={e => setFile(e.target.files?.[0] || null)} accept="*/*" />
              <p className="text-xs text-muted-foreground mt-1">Máx. 50 MB</p>
            </div>
          )}
          <div>
            <Label>Acesso</Label>
            <Select value={accessRule} onValueChange={setAccessRule}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os membros</SelectItem>
                <SelectItem value="level">Por nível mínimo</SelectItem>
                <SelectItem value="tier">Por plano/tier</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {accessRule === "level" && (
            <div>
              <Label>Nível mínimo</Label>
              <Input type="number" min={1} max={9} value={minLevel} onChange={e => setMinLevel(Number(e.target.value))} />
            </div>
          )}
          <div className="flex items-center gap-2">
            <Switch checked={isPublished} onCheckedChange={setIsPublished} />
            <Label>Publicado</Label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              {isEdit ? "Salvar" : "Criar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
