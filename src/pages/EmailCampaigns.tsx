import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Plus, Send, Mail, Clock, CheckCircle, XCircle, AlertTriangle,
  Eye, BarChart3, Users, FileText, Trash2,
} from "lucide-react";

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Rascunho", variant: "secondary" },
  scheduled: { label: "Agendada", variant: "outline" },
  sending: { label: "Enviando", variant: "default" },
  sent: { label: "Enviada", variant: "default" },
  failed: { label: "Falhou", variant: "destructive" },
  canceled: { label: "Cancelada", variant: "secondary" },
};

interface CampaignForm {
  name: string;
  subject: string;
  body_html: string;
  segment_id: string;
  scheduled_at: string;
}

export default function EmailCampaigns() {
  const { currentWorkspace } = useWorkspace();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [viewingCampaign, setViewingCampaign] = useState<any | null>(null);
  const [form, setForm] = useState<CampaignForm>({
    name: "", subject: "", body_html: "", segment_id: "", scheduled_at: "",
  });

  const preSelectedSegment = searchParams.get("segment");

  useEffect(() => {
    if (preSelectedSegment) {
      setForm((f) => ({ ...f, segment_id: preSelectedSegment }));
      setIsDialogOpen(true);
    }
  }, [preSelectedSegment]);

  const workspaceId = currentWorkspace?.id;

  // Fetch campaigns
  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["email_campaigns", workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      const { data, error } = await supabase
        .from("email_campaigns")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!workspaceId,
  });

  // Fetch segments for dropdown
  const { data: segments = [] } = useQuery({
    queryKey: ["email_segments", workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      const { data, error } = await supabase
        .from("email_segments")
        .select("id, name, member_count")
        .eq("workspace_id", workspaceId)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!workspaceId,
  });

  // Create campaign
  const createCampaign = useMutation({
    mutationFn: async (campaign: CampaignForm) => {
      const { error } = await supabase.from("email_campaigns").insert({
        workspace_id: workspaceId,
        name: campaign.name,
        subject: campaign.subject,
        body_html: campaign.body_html,
        segment_id: campaign.segment_id || null,
        status: campaign.scheduled_at ? "scheduled" : "draft",
        scheduled_at: campaign.scheduled_at || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email_campaigns"] });
      toast.success("Campanha criada!");
      resetForm();
    },
    onError: (e: any) => toast.error(e.message || "Erro ao criar campanha"),
  });

  // Send campaign
  const sendCampaign = useMutation({
    mutationFn: async (campaignId: string) => {
      const { data, error } = await supabase.functions.invoke("send-campaign", {
        body: { campaign_id: campaignId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["email_campaigns"] });
      toast.success(`Campanha enviada para ${data?.total_recipients || 0} destinatários`);
    },
    onError: (e: any) => toast.error(e.message || "Erro ao enviar campanha"),
  });

  // Delete campaign
  const deleteCampaign = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("email_campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email_campaigns"] });
      toast.success("Campanha excluída!");
    },
    onError: () => toast.error("Erro ao excluir campanha"),
  });

  const resetForm = () => {
    setForm({ name: "", subject: "", body_html: "", segment_id: "", scheduled_at: "" });
    setIsDialogOpen(false);
  };

  const getSegmentName = (segmentId: string | null) => {
    if (!segmentId) return "Todos os leads";
    const seg = segments.find((s) => s.id === segmentId);
    return seg?.name || "Segmento removido";
  };

  // Campaign detail: fetch recipients
  const { data: recipients = [] } = useQuery({
    queryKey: ["campaign_recipients", viewingCampaign?.id],
    queryFn: async () => {
      if (!viewingCampaign?.id) return [];
      const { data, error } = await supabase
        .from("campaign_recipients")
        .select("*")
        .eq("campaign_id", viewingCampaign.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
    enabled: !!viewingCampaign?.id,
  });

  const stats = viewingCampaign ? {
    total: viewingCampaign.total_recipients || 0,
    sent: viewingCampaign.sent_count || 0,
    failed: viewingCampaign.failed_count || 0,
    pending: (viewingCampaign.total_recipients || 0) - (viewingCampaign.sent_count || 0) - (viewingCampaign.failed_count || 0),
  } : null;

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
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Campanhas de Email</h1>
          <p className="text-muted-foreground">Envie campanhas para seus segmentos de leads</p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />Nova Campanha
        </Button>
      </div>

      {/* Campaigns List */}
      {campaigns.length === 0 ? (
        <Card className="p-12">
          <div className="text-center">
            <Mail className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhuma campanha criada</h3>
            <p className="text-muted-foreground mb-4">Crie sua primeira campanha de email para seus leads</p>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />Criar Campanha
            </Button>
          </div>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campanha</TableHead>
                <TableHead>Segmento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Enviados</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="w-[130px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((campaign: any) => {
                const statusInfo = STATUS_LABELS[campaign.status] || { label: campaign.status, variant: "outline" as const };
                return (
                  <TableRow key={campaign.id}>
                    <TableCell>
                      <div>
                        <span className="font-medium">{campaign.name}</span>
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">{campaign.subject}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {getSegmentName(campaign.segment_id)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {campaign.sent_count || 0}/{campaign.total_recipients || 0}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(campaign.created_at), "dd/MM/yy", { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {campaign.status === "draft" && (
                          <Button variant="ghost" size="icon" onClick={() => sendCampaign.mutate(campaign.id)} disabled={sendCampaign.isPending} title="Enviar agora">
                            <Send className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => setViewingCampaign(campaign)} title="Detalhes">
                          <Eye className="h-4 w-4" />
                        </Button>
                        {campaign.status === "draft" && (
                          <Button variant="ghost" size="icon" onClick={() => deleteCampaign.mutate(campaign.id)} title="Excluir">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Create Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={resetForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Campanha</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome da campanha</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Black Friday 2026" />
            </div>
            <div>
              <Label>Assunto do email</Label>
              <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Ex: 🔥 Oferta especial para você!" />
            </div>
            <div>
              <Label>Segmento alvo</Label>
              <Select value={form.segment_id || "all"} onValueChange={(v) => setForm({ ...form, segment_id: v === "all" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Selecione segmento" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os leads</SelectItem>
                  {segments.map((seg) => (
                    <SelectItem key={seg.id} value={seg.id}>
                      {seg.name} ({seg.member_count || 0} leads)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Conteúdo do email</Label>
              <Textarea
                value={form.body_html}
                onChange={(e) => setForm({ ...form, body_html: e.target.value })}
                placeholder="Escreva o corpo do email aqui... Suporta texto simples."
                className="min-h-[150px]"
              />
            </div>
            <div>
              <Label>Agendamento (opcional)</Label>
              <Input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} />
              <p className="text-xs text-muted-foreground mt-1">Deixe vazio para enviar manualmente</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>Cancelar</Button>
            <Button
              onClick={() => createCampaign.mutate(form)}
              disabled={!form.name.trim() || !form.subject.trim() || !form.body_html.trim() || createCampaign.isPending}
            >
              Criar Campanha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Campaign Detail Dialog */}
      <Dialog open={!!viewingCampaign} onOpenChange={() => setViewingCampaign(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewingCampaign?.name}</DialogTitle>
            <CardDescription>{viewingCampaign?.subject}</CardDescription>
          </DialogHeader>

          {stats && (
            <div className="grid grid-cols-4 gap-3">
              <Card>
                <CardContent className="p-3 text-center">
                  <Users className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                  <p className="text-xl font-bold">{stats.total}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <CheckCircle className="h-4 w-4 mx-auto text-primary mb-1" />
                  <p className="text-xl font-bold text-primary">{stats.sent}</p>
                  <p className="text-xs text-muted-foreground">Enviados</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <XCircle className="h-4 w-4 mx-auto text-destructive mb-1" />
                  <p className="text-xl font-bold text-destructive">{stats.failed}</p>
                  <p className="text-xs text-muted-foreground">Falhas</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <Clock className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                  <p className="text-xl font-bold">{stats.pending}</p>
                  <p className="text-xs text-muted-foreground">Pendentes</p>
                </CardContent>
              </Card>
            </div>
          )}

          {recipients.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium mb-2">Destinatários</h4>
              <div className="max-h-[300px] overflow-y-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Enviado em</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recipients.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-sm">{r.email}</TableCell>
                        <TableCell>
                          <Badge variant={r.status === "sent" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>
                            {r.status === "sent" ? "Enviado" : r.status === "failed" ? "Falhou" : "Pendente"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {r.sent_at ? format(new Date(r.sent_at), "dd/MM HH:mm", { locale: ptBR }) : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
