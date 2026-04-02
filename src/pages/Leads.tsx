import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format, subDays, isAfter } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Users,
  UserPlus,
  TrendingUp,
  Search,
  MoreHorizontal,
  Download,
  Mail,
  Tag,
  CheckCircle,
  Eye,
  FileText,
} from "lucide-react";

const STATUS_OPTIONS = [
  { value: "all", label: "Todos os Status" },
  { value: "NEW", label: "Novo" },
  { value: "CONTACTED", label: "Contactado" },
  { value: "CONVERTED", label: "Convertido" },
  { value: "UNSUBSCRIBED", label: "Desvinculado" },
];

const STATUS_COLORS: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-800",
  CONTACTED: "bg-yellow-100 text-yellow-800",
  CONVERTED: "bg-green-100 text-green-800",
  UNSUBSCRIBED: "bg-gray-100 text-gray-800",
};

const STATUS_LABELS: Record<string, string> = {
  NEW: "Novo",
  CONTACTED: "Contactado",
  CONVERTED: "Convertido",
  UNSUBSCRIBED: "Desvinculado",
};

const SOURCE_COLORS: Record<string, string> = {
  STOREFRONT: "bg-purple-100 text-purple-800",
  CHECKOUT: "bg-indigo-100 text-indigo-800",
  LEAD_FORM: "bg-pink-100 text-pink-800",
  IMPORT: "bg-orange-100 text-orange-800",
};

const TAG_COLORS = [
  "bg-red-100 text-red-700",
  "bg-green-100 text-green-700",
  "bg-blue-100 text-blue-700",
  "bg-yellow-100 text-yellow-700",
  "bg-purple-100 text-purple-700",
  "bg-pink-100 text-pink-700",
  "bg-indigo-100 text-indigo-700",
  "bg-teal-100 text-teal-700",
];

export default function Leads() {
  const { currentWorkspace } = useWorkspace();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [productFilter, setProductFilter] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [editingTagsLead, setEditingTagsLead] = useState<any | null>(null);
  const [newTag, setNewTag] = useState("");
  const [viewingLead, setViewingLead] = useState<any | null>(null);

  // Fetch leads with product info
  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads", currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return [];
      const { data, error } = await supabase
        .from("leads")
        .select("*, products:product_id(id, name)")
        .eq("workspace_id", currentWorkspace.id)
        .is("unsubscribed_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!currentWorkspace?.id,
  });

  // Fetch products for filter
  const { data: products = [] } = useQuery({
    queryKey: ["products-filter", currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return [];
      const { data, error } = await supabase
        .from("products")
        .select("id, name")
        .eq("workspace_id", currentWorkspace.id)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentWorkspace?.id,
  });

  // Fetch customers for conversion rate
  const { data: customers = [] } = useQuery({
    queryKey: ["customers", currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return [];
      const { data, error } = await supabase
        .from("customers")
        .select("email")
        .eq("workspace_id", currentWorkspace.id);

      if (error) throw error;
      return data || [];
    },
    enabled: !!currentWorkspace?.id,
  });

  // Update lead mutation
  const updateLead = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const { error } = await supabase
        .from("leads")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Lead atualizado!");
    },
    onError: () => {
      toast.error("Erro ao atualizar lead");
    },
  });

  // Calculate metrics
  const metrics = useMemo(() => {
    const total = leads.length;
    const sevenDaysAgo = subDays(new Date(), 7);
    const newLeads = leads.filter((lead) =>
      isAfter(new Date(lead.created_at), sevenDaysAgo)
    ).length;

    const customerEmails = new Set(customers.map((c) => c.email.toLowerCase()));
    const convertedLeads = leads.filter((lead) =>
      customerEmails.has(lead.email.toLowerCase())
    ).length;
    const conversionRate = total > 0 ? ((convertedLeads / total) * 100).toFixed(1) : "0";

    return { total, newLeads, conversionRate };
  }, [leads, customers]);

  // Get unique tags
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    leads.forEach((lead) => {
      if (lead.tags) {
        lead.tags.forEach((tag: string) => tags.add(tag));
      }
    });
    return Array.from(tags);
  }, [leads]);

  // Filter leads
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const matchesSearch =
        !search ||
        lead.name?.toLowerCase().includes(search.toLowerCase()) ||
        lead.email.toLowerCase().includes(search.toLowerCase());

      const matchesStatus =
        statusFilter === "all" || lead.status === statusFilter;

      const matchesTag =
        !tagFilter || (lead.tags && lead.tags.includes(tagFilter));

      const matchesProduct =
        !productFilter || lead.product_id === productFilter;

      const leadDate = new Date(lead.created_at);
      const matchesDateFrom = !dateFrom || leadDate >= new Date(dateFrom);
      const matchesDateTo = !dateTo || leadDate <= new Date(dateTo + "T23:59:59");

      return matchesSearch && matchesStatus && matchesTag && matchesProduct && matchesDateFrom && matchesDateTo;
    });
  }, [leads, search, statusFilter, tagFilter, productFilter, dateFrom, dateTo]);

  // Export CSV
  const exportCSV = () => {
    const headers = ["Nome", "Email", "WhatsApp", "Tags", "Data"];
    const rows = filteredLeads.map((lead) => [
      `"${(lead.name || "").replace(/"/g, '""')}"`,
      `"${lead.email}"`,
      `"${lead.phone || ""}"`,
      `"${(lead.tags || []).join("; ")}"`,
      `"${format(new Date(lead.created_at), "dd/MM/yyyy HH:mm")}"`,
    ]);

    const bom = "\uFEFF";
    const csv = bom + [headers.map(h => `"${h}"`), ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `leads_export_${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado!");
  };

  // Handle tag operations
  const addTag = () => {
    if (!newTag.trim() || !editingTagsLead) return;
    const currentTags = editingTagsLead.tags || [];
    if (currentTags.includes(newTag.trim())) {
      toast.error("Tag já existe");
      return;
    }
    updateLead.mutate({
      id: editingTagsLead.id,
      updates: { tags: [...currentTags, newTag.trim()] },
    });
    setEditingTagsLead({
      ...editingTagsLead,
      tags: [...currentTags, newTag.trim()],
    });
    setNewTag("");
  };

  const removeTag = (tag: string) => {
    if (!editingTagsLead) return;
    const newTags = (editingTagsLead.tags || []).filter((t: string) => t !== tag);
    updateLead.mutate({
      id: editingTagsLead.id,
      updates: { tags: newTags },
    });
    setEditingTagsLead({ ...editingTagsLead, tags: newTags });
  };

  const markAsContacted = (lead: any) => {
    updateLead.mutate({
      id: lead.id,
      updates: { status: "CONTACTED" },
    });
  };

  const getTagColor = (tag: string) => {
    const index = tag.charCodeAt(0) % TAG_COLORS.length;
    return TAG_COLORS[index];
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="grid grid-cols-3 gap-4">
            <div className="h-24 bg-muted rounded"></div>
            <div className="h-24 bg-muted rounded"></div>
            <div className="h-24 bg-muted rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-5 space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">Leads</h1>
          <p className="text-muted-foreground">
            Gerencie seus leads e potenciais clientes
          </p>
        </div>
        <Button onClick={exportCSV} variant="outline" className="h-9 text-[13px]">
          <Download className="h-4 w-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Leads
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Novos (7 dias)
            </CardTitle>
            <UserPlus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.newLeads}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Taxa de Conversão
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.conversionRate}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((status) => (
                <SelectItem key={status.value} value={status.value}>
                  {status.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={tagFilter || "all"}
            onValueChange={(v) => setTagFilter(v === "all" ? null : v)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Tags" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as Tags</SelectItem>
              {allTags.map((tag) => (
                <SelectItem key={tag} value={tag}>
                  {tag}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col sm:flex-row gap-4">
          <Select
            value={productFilter || "all"}
            onValueChange={(v) => setProductFilter(v === "all" ? null : v)}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Produto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Produtos</SelectItem>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            placeholder="Data início"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-[160px]"
          />
          <Input
            type="date"
            placeholder="Data fim"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-[160px]"
          />
        </div>
      </div>

      {/* Leads Table */}
      {filteredLeads.length === 0 ? (
        <Card className="p-12">
          <div className="text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhum lead encontrado</h3>
            <p className="text-muted-foreground">
              {leads.length === 0
                ? "Adicione um formulário de captura na sua loja para começar a capturar leads"
                : "Tente ajustar os filtros de busca"}
            </p>
          </div>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="hidden md:table-cell">Telefone</TableHead>
                <TableHead className="hidden md:table-cell">Source</TableHead>
                <TableHead className="hidden lg:table-cell">Tags</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Data</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLeads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell className="font-medium">
                    {lead.name || "-"}
                  </TableCell>
                  <TableCell>{lead.email}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {lead.phone || "-"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge
                      variant="secondary"
                      className={SOURCE_COLORS[lead.source || ""] || ""}
                    >
                      {lead.source || "Direto"}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="flex gap-1 flex-wrap max-w-[200px]">
                      {(lead.tags || []).slice(0, 3).map((tag: string) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className={getTagColor(tag)}
                        >
                          {tag}
                        </Badge>
                      ))}
                      {(lead.tags || []).length > 3 && (
                        <Badge variant="outline">
                          +{lead.tags.length - 3}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={STATUS_COLORS[lead.status] || ""}
                    >
                      {STATUS_LABELS[lead.status] || lead.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {format(new Date(lead.created_at), "dd/MM/yy", {
                      locale: ptBR,
                    })}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setViewingLead(lead)}>
                          <Eye className="h-4 w-4 mr-2" />
                          Ver detalhes
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setEditingTagsLead(lead)}
                        >
                          <Tag className="h-4 w-4 mr-2" />
                          Editar tags
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            window.open(`mailto:${lead.email}`, "_blank")
                          }
                        >
                          <Mail className="h-4 w-4 mr-2" />
                          Enviar email
                        </DropdownMenuItem>
                        {lead.status === "NEW" && (
                          <DropdownMenuItem
                            onClick={() => markAsContacted(lead)}
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Marcar como contactado
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Edit Tags Dialog */}
      <Dialog
        open={!!editingTagsLead}
        onOpenChange={() => setEditingTagsLead(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Tags</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Nova tag..."
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTag()}
              />
              <Button onClick={addTag}>Adicionar</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {(editingTagsLead?.tags || []).map((tag: string) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className={`${getTagColor(tag)} cursor-pointer`}
                  onClick={() => removeTag(tag)}
                >
                  {tag} ×
                </Badge>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTagsLead(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Lead Dialog */}
      <Dialog open={!!viewingLead} onOpenChange={() => setViewingLead(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detalhes do Lead</DialogTitle>
          </DialogHeader>
          {viewingLead && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Nome</p>
                  <p className="font-medium">{viewingLead.name || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium">{viewingLead.email}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Telefone</p>
                  <p className="font-medium">{viewingLead.phone || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge
                    variant="secondary"
                    className={STATUS_COLORS[viewingLead.status]}
                  >
                    {STATUS_LABELS[viewingLead.status]}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Source</p>
                  <p className="font-medium">{viewingLead.source || "Direto"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Capturado em</p>
                  <p className="font-medium">
                    {format(new Date(viewingLead.created_at), "dd/MM/yyyy HH:mm", {
                      locale: ptBR,
                    })}
                  </p>
                </div>
              </div>
              {viewingLead.tags && viewingLead.tags.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Tags</p>
                  <div className="flex flex-wrap gap-2">
                    {viewingLead.tags.map((tag: string) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className={getTagColor(tag)}
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {viewingLead.opt_in_ip && (
                <div>
                  <p className="text-sm text-muted-foreground">IP do Opt-in</p>
                  <p className="font-medium">{viewingLead.opt_in_ip}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingLead(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
