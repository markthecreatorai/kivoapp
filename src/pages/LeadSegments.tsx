import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, Users, Send, Trash2, Edit, Layers } from "lucide-react";

interface FilterRule {
  field: "tags" | "status" | "source" | "created_after" | "has_purchased" | "cart_abandoned";
  operator: "contains" | "equals" | "after" | "is";
  value: string;
}

interface SegmentForm {
  name: string;
  description: string;
  filter_rules: FilterRule[];
  is_dynamic: boolean;
}

const STATUS_OPTIONS = [
  { value: "NEW", label: "Novo" },
  { value: "CONTACTED", label: "Contactado" },
  { value: "CONVERTED", label: "Convertido" },
  { value: "UNSUBSCRIBED", label: "Desvinculado" },
];

const SOURCE_OPTIONS = [
  { value: "STOREFRONT", label: "Storefront" },
  { value: "CHECKOUT", label: "Checkout" },
  { value: "LEAD_FORM", label: "Formulário" },
  { value: "IMPORT", label: "Importação" },
];

const FILTER_FIELDS = [
  { value: "tags", label: "Tag contém" },
  { value: "status", label: "Status é" },
  { value: "source", label: "Origem é" },
  { value: "created_after", label: "Criado após" },
  { value: "has_purchased", label: "Comprou produto" },
  { value: "cart_abandoned", label: "Carrinho abandonado" },
];

export default function LeadSegments() {
  const { currentWorkspace } = useWorkspace();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSegment, setEditingSegment] = useState<any | null>(null);
  const [form, setForm] = useState<SegmentForm>({
    name: "", description: "", filter_rules: [], is_dynamic: true,
  });

  const { data: segments = [], isLoading } = useQuery({
    queryKey: ["email_segments", currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return [];
      const { data, error } = await supabase
        .from("email_segments")
        .select("*")
        .eq("workspace_id", currentWorkspace.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentWorkspace?.id,
  });

  const { data: leads = [] } = useQuery({
    queryKey: ["leads", currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return [];
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("workspace_id", currentWorkspace.id)
        .is("unsubscribed_at", null);
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentWorkspace?.id,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers-emails", currentWorkspace?.id],
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

  const { data: abandonedSessions = [] } = useQuery({
    queryKey: ["abandoned-sessions", currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return [];
      const { data, error } = await supabase
        .from("checkout_sessions")
        .select("email")
        .eq("workspace_id", currentWorkspace.id)
        .eq("status", "ABANDONED")
        .not("email", "is", null);
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentWorkspace?.id,
  });

  const allTags = Array.from(new Set(leads.flatMap((lead) => lead.tags || [])));
  const customerEmails = new Set(customers.map((c: any) => c.email?.toLowerCase()));
  const abandonedEmails = new Set(abandonedSessions.map((s: any) => s.email?.toLowerCase()));

  const countMatchingLeads = (rules: FilterRule[]) => {
    if (rules.length === 0) return leads.length;
    return leads.filter((lead) => {
      return rules.every((rule) => {
        switch (rule.field) {
          case "tags":
            return lead.tags && lead.tags.includes(rule.value);
          case "status":
            return lead.status === rule.value;
          case "source":
            return lead.source === rule.value;
          case "created_after":
            return new Date(lead.created_at) > new Date(rule.value);
          case "has_purchased":
            return rule.value === "yes"
              ? customerEmails.has(lead.email?.toLowerCase())
              : !customerEmails.has(lead.email?.toLowerCase());
          case "cart_abandoned":
            return rule.value === "yes"
              ? abandonedEmails.has(lead.email?.toLowerCase())
              : !abandonedEmails.has(lead.email?.toLowerCase());
          default:
            return true;
        }
      });
    }).length;
  };

  const createSegment = useMutation({
    mutationFn: async (segment: SegmentForm) => {
      const memberCount = countMatchingLeads(segment.filter_rules);
      const { error } = await supabase.from("email_segments").insert({
        workspace_id: currentWorkspace?.id,
        name: segment.name,
        description: segment.description,
        filter_rules: segment.filter_rules as any,
        member_count: memberCount,
        is_dynamic: segment.is_dynamic,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email_segments"] });
      toast.success("Segmento criado!");
      resetForm();
    },
    onError: () => toast.error("Erro ao criar segmento"),
  });

  const updateSegment = useMutation({
    mutationFn: async ({ id, segment }: { id: string; segment: SegmentForm }) => {
      const memberCount = countMatchingLeads(segment.filter_rules);
      const { error } = await supabase.from("email_segments").update({
        name: segment.name,
        description: segment.description,
        filter_rules: segment.filter_rules as any,
        member_count: memberCount,
        is_dynamic: segment.is_dynamic,
      } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email_segments"] });
      toast.success("Segmento atualizado!");
      resetForm();
    },
    onError: () => toast.error("Erro ao atualizar segmento"),
  });

  const deleteSegment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("email_segments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email_segments"] });
      toast.success("Segmento excluído!");
    },
    onError: () => toast.error("Erro ao excluir segmento"),
  });

  const resetForm = () => {
    setForm({ name: "", description: "", filter_rules: [], is_dynamic: true });
    setEditingSegment(null);
    setIsDialogOpen(false);
  };

  const openEditDialog = (segment: any) => {
    setEditingSegment(segment);
    setForm({
      name: segment.name,
      description: segment.description || "",
      filter_rules: (segment.filter_rules as FilterRule[]) || [],
      is_dynamic: segment.is_dynamic ?? true,
    });
    setIsDialogOpen(true);
  };

  const addRule = () => {
    setForm({
      ...form,
      filter_rules: [...form.filter_rules, { field: "tags", operator: "contains", value: "" }],
    });
  };

  const updateRule = (index: number, updates: Partial<FilterRule>) => {
    const newRules = [...form.filter_rules];
    newRules[index] = { ...newRules[index], ...updates };
    setForm({ ...form, filter_rules: newRules });
  };

  const removeRule = (index: number) => {
    setForm({ ...form, filter_rules: form.filter_rules.filter((_, i) => i !== index) });
  };

  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error("Nome é obrigatório"); return; }
    if (editingSegment) {
      updateSegment.mutate({ id: editingSegment.id, segment: form });
    } else {
      createSegment.mutate(form);
    }
  };

  const previewCount = countMatchingLeads(form.filter_rules);

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Segmentos</h1>
          <p className="text-muted-foreground">Organize seus leads em grupos para campanhas direcionadas</p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />Novo Segmento
        </Button>
      </div>

      {segments.length === 0 ? (
        <Card className="p-12">
          <div className="text-center">
            <Layers className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhum segmento criado</h3>
            <p className="text-muted-foreground mb-4">Crie segmentos para organizar seus leads e enviar campanhas direcionadas</p>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />Criar Segmento
            </Button>
          </div>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Leads</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead className="w-[150px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {segments.map((segment) => (
                <TableRow key={segment.id}>
                  <TableCell>
                    <div>
                      <span className="font-medium">{segment.name}</span>
                      {segment.description && (
                        <p className="text-xs text-muted-foreground">{segment.description}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={(segment as any).is_dynamic ? "default" : "secondary"}>
                      {(segment as any).is_dynamic ? "Dinâmico" : "Estático"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      {segment.member_count || 0}
                    </div>
                  </TableCell>
                  <TableCell>
                    {format(new Date(segment.created_at), "dd/MM/yy", { locale: ptBR })}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => navigate(`/email-campaigns?segment=${segment.id}`)} title="Usar em campanha">
                        <Send className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEditDialog(segment)} title="Editar">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteSegment.mutate(segment.id)} title="Excluir">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={resetForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingSegment ? "Editar Segmento" : "Novo Segmento"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Nome</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Leads Quentes" />
            </div>
            <div>
              <Label htmlFor="description">Descrição</Label>
              <Textarea id="description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Descrição opcional" />
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={form.is_dynamic} onCheckedChange={(v) => setForm({ ...form, is_dynamic: v })} />
              <Label>Segmento dinâmico (atualiza automaticamente)</Label>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Regras de Filtro</Label>
                <Button variant="outline" size="sm" onClick={addRule}>
                  <Plus className="h-4 w-4 mr-1" />Adicionar
                </Button>
              </div>

              {form.filter_rules.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem filtros = todos os leads</p>
              ) : (
                <div className="space-y-3">
                  {form.filter_rules.map((rule, index) => (
                    <div key={index} className="flex gap-2 items-start">
                      <Select value={rule.field} onValueChange={(v) => updateRule(index, { field: v as FilterRule["field"], value: "" })}>
                        <SelectTrigger className="w-[160px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FILTER_FIELDS.map((f) => (
                            <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {rule.field === "tags" && (
                        <Select value={rule.value} onValueChange={(v) => updateRule(index, { value: v })}>
                          <SelectTrigger className="flex-1"><SelectValue placeholder="Selecione tag" /></SelectTrigger>
                          <SelectContent>
                            {allTags.map((tag) => (<SelectItem key={tag} value={tag}>{tag}</SelectItem>))}
                          </SelectContent>
                        </Select>
                      )}

                      {rule.field === "status" && (
                        <Select value={rule.value} onValueChange={(v) => updateRule(index, { value: v })}>
                          <SelectTrigger className="flex-1"><SelectValue placeholder="Selecione status" /></SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map((s) => (<SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>))}
                          </SelectContent>
                        </Select>
                      )}

                      {rule.field === "source" && (
                        <Select value={rule.value} onValueChange={(v) => updateRule(index, { value: v })}>
                          <SelectTrigger className="flex-1"><SelectValue placeholder="Selecione origem" /></SelectTrigger>
                          <SelectContent>
                            {SOURCE_OPTIONS.map((s) => (<SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>))}
                          </SelectContent>
                        </Select>
                      )}

                      {rule.field === "created_after" && (
                        <Input type="date" value={rule.value} onChange={(e) => updateRule(index, { value: e.target.value })} className="flex-1" />
                      )}

                      {(rule.field === "has_purchased" || rule.field === "cart_abandoned") && (
                        <Select value={rule.value} onValueChange={(v) => updateRule(index, { value: v })}>
                          <SelectTrigger className="flex-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="yes">Sim</SelectItem>
                            <SelectItem value="no">Não</SelectItem>
                          </SelectContent>
                        </Select>
                      )}

                      <Button variant="ghost" size="icon" onClick={() => removeRule(index)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Card className="bg-muted/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <span className="font-medium">{previewCount}</span>
                  <span className="text-muted-foreground">leads correspondem a este segmento</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={createSegment.isPending || updateSegment.isPending}>
              {editingSegment ? "Salvar" : "Criar Segmento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
