import { useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Plus, Search, FileText, Link2, Download, ExternalLink, Trash2, Pencil,
  Loader2, FolderOpen, File, Image, FileArchive, Film,
} from "lucide-react";

const MIME_ICONS: Record<string, typeof FileText> = {
  "image/": Image,
  "video/": Film,
  "application/zip": FileArchive,
  "application/pdf": FileText,
};

function getFileIcon(mime?: string | null) {
  if (!mime) return File;
  for (const [prefix, Icon] of Object.entries(MIME_ICONS)) {
    if (mime.startsWith(prefix)) return Icon;
  }
  return File;
}

function formatSize(bytes?: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface ResourceRow {
  id: string;
  community_id: string;
  title: string;
  description: string | null;
  category: string;
  tags: string[];
  resource_type: string;
  file_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  external_url: string | null;
  access_rule: string;
  min_level: number | null;
  allowed_tier_ids: string[] | null;
  created_by: string;
  is_published: boolean;
  created_at: string;
}

export default function CircleResources() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [editResource, setEditResource] = useState<ResourceRow | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Community
  const { data: community } = useQuery({
    queryKey: ["community-slug", slug],
    queryFn: async () => {
      if (!slug) return null;
      const { data } = await supabase.from("communities").select("*").eq("slug", slug).eq("is_active", true).maybeSingle();
      return data;
    },
    enabled: !!slug,
  });

  // Member
  const { data: member } = useQuery({
    queryKey: ["circle-member", community?.id, user?.id],
    queryFn: async () => {
      if (!community || !user) return null;
      const { data } = await supabase.from("community_members").select("*").eq("community_id", community.id).eq("user_id", user.id).single();
      return data;
    },
    enabled: !!community && !!user,
  });

  const isStaff = member?.role === "OWNER" || member?.role === "ADMIN";

  // Resources
  const { data: resources = [], isLoading } = useQuery({
    queryKey: ["circle-resources", community?.id],
    queryFn: async () => {
      if (!community) return [];
      const { data, error } = await supabase
        .from("community_resources")
        .select("*")
        .eq("community_id", community.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as ResourceRow[];
    },
    enabled: !!community && !!member,
  });

  // Categories
  const categories = useMemo(() => {
    const set = new Set(resources.map(r => r.category));
    return Array.from(set).sort();
  }, [resources]);

  // Filtered
  const filtered = useMemo(() => {
    return resources.filter(r => {
      if (catFilter !== "all" && r.category !== catFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return r.title.toLowerCase().includes(q) ||
          r.description?.toLowerCase().includes(q) ||
          r.tags.some(t => t.toLowerCase().includes(q));
      }
      return true;
    });
  }, [resources, catFilter, search]);

  // Delete
  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("community_resources").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["circle-resources", community?.id] });
      toast.success("Recurso excluído");
    },
  });

  // Download
  const handleDownload = async (r: ResourceRow) => {
    if (r.resource_type === "link" && r.external_url) {
      window.open(r.external_url, "_blank");
      return;
    }
    if (r.file_path) {
      const { data, error } = await supabase.storage
        .from("community-resources")
        .createSignedUrl(r.file_path, 300);
      if (error || !data?.signedUrl) {
        toast.error("Erro ao gerar link de download");
        return;
      }
      window.open(data.signedUrl, "_blank");
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-xl font-bold text-foreground">Recursos</h1>
        {isStaff && (
          <Button size="sm" onClick={() => { setEditResource(null); setShowForm(true); }}>
            <Plus className="w-4 h-4 mr-1.5" /> Adicionar
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar recursos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas categorias</SelectItem>
            {categories.map(c => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <FolderOpen className="w-12 h-12 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">Nenhum recurso encontrado.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const FileIcon = r.resource_type === "link" ? Link2 : getFileIcon(r.mime_type);
            return (
              <div
                key={r.id}
                className="bg-card border rounded-xl p-4 flex items-start gap-4 hover:shadow-sm transition-shadow"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <FileIcon className="w-5 h-5 text-primary" />
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-foreground text-sm truncate">{r.title}</h3>
                    {!r.is_published && <Badge variant="outline" className="text-[10px]">Rascunho</Badge>}
                    {r.access_rule !== "all" && (
                      <Badge variant="secondary" className="text-[10px]">
                        {r.access_rule === "level" ? `Nível ${r.min_level}+` : "Plano"}
                      </Badge>
                    )}
                  </div>
                  {r.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{r.description}</p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">{r.category}</Badge>
                    {r.tags.map(t => (
                      <span key={t} className="text-[10px] text-muted-foreground">#{t}</span>
                    ))}
                    {r.size_bytes && (
                      <span className="text-[10px] text-muted-foreground">{formatSize(r.size_bytes)}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDownload(r)}>
                    {r.resource_type === "link" ? <ExternalLink className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                  </Button>
                  {isStaff && (
                    <>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditResource(r); setShowForm(true); }}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMut.mutate(r.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Form Modal */}
      {showForm && community && member && (
        <ResourceFormModal
          community={community}
          member={member}
          resource={editResource}
          onClose={() => { setShowForm(false); setEditResource(null); }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["circle-resources", community.id] });
            setShowForm(false);
            setEditResource(null);
          }}
        />
      )}
    </div>
  );
}

/* ─── Resource Form Modal ─── */

interface FormProps {
  community: any;
  member: any;
  resource: ResourceRow | null;
  onClose: () => void;
  onSaved: () => void;
}

function ResourceFormModal({ community, member, resource, onClose, onSaved }: FormProps) {
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

      // Upload file if new
      if (resourceType === "file" && file) {
        const ext = file.name.split(".").pop();
        const path = `${community.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("community-resources")
          .upload(path, file, { upsert: true });
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

      // Analytics
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
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
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
              <Input
                type="file"
                onChange={e => setFile(e.target.files?.[0] || null)}
                accept="*/*"
              />
              <p className="text-xs text-muted-foreground mt-1">Máx. 50 MB</p>
            </div>
          )}

          <div>
            <Label>Acesso</Label>
            <Select value={accessRule} onValueChange={setAccessRule}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
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
