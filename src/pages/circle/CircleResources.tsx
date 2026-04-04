import { useState, useMemo, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plus, Search, FileText, Link2, Download, ExternalLink, Trash2, Pencil,
  Loader2, FolderOpen, File, Image, FileArchive, Film, LayoutGrid, List,
  Archive, ArchiveRestore, Eye, TrendingUp,
} from "lucide-react";
import { ResourceFormModal } from "@/components/circle/ResourceFormModal";

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

export interface ResourceRow {
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
  archived_at: string | null;
  download_count: number;
  click_count: number;
}

type SortMode = "recent" | "popular";
type ViewMode = "list" | "grid";

export default function CircleResources() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [showArchived, setShowArchived] = useState(false);
  const [editResource, setEditResource] = useState<ResourceRow | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data: community } = useQuery({
    queryKey: ["community-slug", slug],
    queryFn: async () => {
      if (!slug) return null;
      const { data } = await supabase.from("communities").select("*").eq("slug", slug).eq("is_active", true).maybeSingle();
      return data;
    },
    enabled: !!slug,
  });

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

  // Derived: categories and tags
  const categories = useMemo(() => Array.from(new Set(resources.map(r => r.category))).sort(), [resources]);
  const allTags = useMemo(() => Array.from(new Set(resources.flatMap(r => r.tags))).sort(), [resources]);

  // Filtered + sorted
  const filtered = useMemo(() => {
    let list = resources.filter(r => {
      // Archive filter
      if (showArchived ? !r.archived_at : r.archived_at) return false;
      if (catFilter !== "all" && r.category !== catFilter) return false;
      if (tagFilter !== "all" && !r.tags.includes(tagFilter)) return false;
      if (search) {
        const q = search.toLowerCase();
        return r.title.toLowerCase().includes(q) ||
          r.description?.toLowerCase().includes(q) ||
          r.tags.some(t => t.toLowerCase().includes(q));
      }
      return true;
    });
    if (sortMode === "popular") {
      list = [...list].sort((a, b) => (b.download_count + b.click_count) - (a.download_count + a.click_count));
    }
    return list;
  }, [resources, catFilter, tagFilter, search, sortMode, showArchived]);

  // Mutations
  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("community_resources").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["circle-resources", community?.id] }); toast.success("Recurso excluído"); },
  });

  const archiveMut = useMutation({
    mutationFn: async ({ id, restore }: { id: string; restore: boolean }) => {
      const { error } = await supabase.from("community_resources").update({
        archived_at: restore ? null : new Date().toISOString(),
      } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { restore }) => {
      qc.invalidateQueries({ queryKey: ["circle-resources", community?.id] });
      toast.success(restore ? "Recurso restaurado" : "Recurso arquivado");
    },
  });

  const trackEvent = useCallback(async (resourceId: string, eventType: "view" | "download" | "click") => {
    if (!community || !member) return;
    await supabase.from("community_resource_events").insert({
      resource_id: resourceId,
      community_id: community.id,
      member_id: member.id,
      event_type: eventType,
    } as any);
  }, [community, member]);

  const handleDownload = useCallback(async (r: ResourceRow) => {
    if (r.resource_type === "link" && r.external_url) {
      trackEvent(r.id, "click");
      window.open(r.external_url, "_blank");
      return;
    }
    if (r.file_path) {
      trackEvent(r.id, "download");
      const { data, error } = await supabase.storage.from("community-resources").createSignedUrl(r.file_path, 300);
      if (error || !data?.signedUrl) { toast.error("Erro ao gerar link de download"); return; }
      window.open(data.signedUrl, "_blank");
    }
  }, [trackEvent]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-xl font-bold text-foreground">Recursos</h1>
        <div className="flex items-center gap-2">
          {isStaff && (
            <Button size="sm" variant="outline" onClick={() => setShowArchived(!showArchived)}>
              {showArchived ? <ArchiveRestore className="w-4 h-4 mr-1.5" /> : <Archive className="w-4 h-4 mr-1.5" />}
              {showArchived ? "Ativos" : "Arquivados"}
            </Button>
          )}
          {isStaff && (
            <Button size="sm" onClick={() => { setEditResource(null); setShowForm(true); }}>
              <Plus className="w-4 h-4 mr-1.5" /> Adicionar
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar recursos..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas categorias</SelectItem>
            {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        {allTags.length > 0 && (
          <Select value={tagFilter} onValueChange={setTagFilter}>
            <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Tag" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas tags</SelectItem>
              {allTags.map(t => <SelectItem key={t} value={t}>#{t}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <div className="flex items-center gap-1">
          <Button variant={sortMode === "recent" ? "secondary" : "ghost"} size="icon" className="h-9 w-9" onClick={() => setSortMode("recent")} title="Recentes">
            <List className="w-4 h-4" />
          </Button>
          <Button variant={sortMode === "popular" ? "secondary" : "ghost"} size="icon" className="h-9 w-9" onClick={() => setSortMode("popular")} title="Populares">
            <TrendingUp className="w-4 h-4" />
          </Button>
          <div className="w-px h-5 bg-border mx-1" />
          <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon" className="h-9 w-9" onClick={() => setViewMode("list")} title="Lista">
            <List className="w-4 h-4" />
          </Button>
          <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="icon" className="h-9 w-9" onClick={() => setViewMode("grid")} title="Grade">
            <LayoutGrid className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <FolderOpen className="w-12 h-12 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">{showArchived ? "Nenhum recurso arquivado." : "Nenhum recurso encontrado."}</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(r => <ResourceGridCard key={r.id} r={r} isStaff={isStaff} onDownload={handleDownload} onEdit={() => { setEditResource(r); setShowForm(true); }} onDelete={() => deleteMut.mutate(r.id)} onArchive={(restore) => archiveMut.mutate({ id: r.id, restore })} showArchived={showArchived} />)}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => <ResourceListCard key={r.id} r={r} isStaff={isStaff} onDownload={handleDownload} onEdit={() => { setEditResource(r); setShowForm(true); }} onDelete={() => deleteMut.mutate(r.id)} onArchive={(restore) => archiveMut.mutate({ id: r.id, restore })} showArchived={showArchived} />)}
        </div>
      )}

      {showForm && community && member && (
        <ResourceFormModal
          community={community}
          member={member}
          resource={editResource}
          onClose={() => { setShowForm(false); setEditResource(null); }}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["circle-resources", community.id] }); setShowForm(false); setEditResource(null); }}
        />
      )}
    </div>
  );
}

/* ─── Card Components ─── */

interface CardProps {
  r: ResourceRow;
  isStaff: boolean;
  onDownload: (r: ResourceRow) => void;
  onEdit: () => void;
  onDelete: () => void;
  onArchive: (restore: boolean) => void;
  showArchived: boolean;
}

function ResourceListCard({ r, isStaff, onDownload, onEdit, onDelete, onArchive, showArchived }: CardProps) {
  const FileIcon = r.resource_type === "link" ? Link2 : getFileIcon(r.mime_type);
  const popularity = r.download_count + r.click_count;

  return (
    <div className="bg-card border rounded-xl p-4 flex items-start gap-4 hover:shadow-sm transition-shadow">
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
        {r.description && <p className="text-xs text-muted-foreground line-clamp-2">{r.description}</p>}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-[10px]">{r.category}</Badge>
          {r.tags.map(t => <span key={t} className="text-[10px] text-muted-foreground">#{t}</span>)}
          {r.size_bytes ? <span className="text-[10px] text-muted-foreground">{formatSize(r.size_bytes)}</span> : null}
          {popularity > 0 && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              <Eye className="w-3 h-3" /> {popularity}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDownload(r)}>
          {r.resource_type === "link" ? <ExternalLink className="w-4 h-4" /> : <Download className="w-4 h-4" />}
        </Button>
        {isStaff && (
          <>
            {showArchived ? (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onArchive(true)} title="Restaurar">
                <ArchiveRestore className="w-4 h-4" />
              </Button>
            ) : (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onArchive(false)} title="Arquivar">
                <Archive className="w-4 h-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}><Pencil className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onDelete}><Trash2 className="w-4 h-4" /></Button>
          </>
        )}
      </div>
    </div>
  );
}

function ResourceGridCard({ r, isStaff, onDownload, onEdit, onDelete, onArchive, showArchived }: CardProps) {
  const FileIcon = r.resource_type === "link" ? Link2 : getFileIcon(r.mime_type);
  const popularity = r.download_count + r.click_count;

  return (
    <div className="bg-card border rounded-xl p-4 flex flex-col gap-3 hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <FileIcon className="w-5 h-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-foreground text-sm truncate">{r.title}</h3>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Badge variant="outline" className="text-[10px]">{r.category}</Badge>
            {!r.is_published && <Badge variant="outline" className="text-[10px]">Rascunho</Badge>}
          </div>
        </div>
      </div>
      {r.description && <p className="text-xs text-muted-foreground line-clamp-2">{r.description}</p>}
      <div className="flex items-center gap-2 flex-wrap">
        {r.tags.map(t => <span key={t} className="text-[10px] text-muted-foreground">#{t}</span>)}
        {r.size_bytes ? <span className="text-[10px] text-muted-foreground">{formatSize(r.size_bytes)}</span> : null}
        {popularity > 0 && (
          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
            <Eye className="w-3 h-3" /> {popularity}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 mt-auto pt-2 border-t">
        <Button variant="ghost" size="sm" className="flex-1 h-8 text-xs" onClick={() => onDownload(r)}>
          {r.resource_type === "link" ? <><ExternalLink className="w-3.5 h-3.5 mr-1" /> Abrir</> : <><Download className="w-3.5 h-3.5 mr-1" /> Baixar</>}
        </Button>
        {isStaff && (
          <>
            {showArchived ? (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onArchive(true)}><ArchiveRestore className="w-4 h-4" /></Button>
            ) : (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onArchive(false)}><Archive className="w-4 h-4" /></Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}><Pencil className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onDelete}><Trash2 className="w-4 h-4" /></Button>
          </>
        )}
      </div>
    </div>
  );
}
