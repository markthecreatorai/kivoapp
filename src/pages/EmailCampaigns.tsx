import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { usePlanLimits } from "@/hooks/usePlanLimits";
import { UpgradeModal } from "@/components/UpgradeModal";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Plus, Send, Mail, Clock, CheckCircle, XCircle, AlertTriangle, AlertCircle,
  Eye, BarChart3, Users, FileText, Trash2, Crown, ShoppingCart, UserPlus, RefreshCw,
} from "lucide-react";

/* ─── Campaign status labels ─── */
const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Rascunho", variant: "secondary" },
  scheduled: { label: "Agendada", variant: "outline" },
  sending: { label: "Enviando", variant: "default" },
  sent: { label: "Enviada", variant: "default" },
  failed: { label: "Falhou", variant: "destructive" },
  canceled: { label: "Cancelada", variant: "secondary" },
};

/* ─── Email Flows config ─── */
interface FlowConfig {
  key: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  event: string;
  defaultDelay?: number;
  hasDelay: boolean;
}

const FLOWS: FlowConfig[] = [
  {
    key: "purchase_confirmed",
    title: "Confirmação de Compra",
    description: "Enviado automaticamente quando o pagamento é confirmado",
    icon: <CheckCircle className="h-5 w-5 text-primary" />,
    event: "Pagamento confirmado (webhook)",
    hasDelay: false,
  },
  {
    key: "welcome_member",
    title: "Boas-vindas ao Membro",
    description: "Email de boas-vindas após primeira compra do cliente",
    icon: <UserPlus className="h-5 w-5 text-accent-foreground" />,
    event: "Primeira compra do cliente",
    hasDelay: false,
  },
  {
    key: "cart_abandoned_reminder",
    title: "Carrinho Abandonado",
    description: "Lembrete enviado quando o cliente não finaliza a compra",
    icon: <ShoppingCart className="h-5 w-5 text-accent-foreground" />,
    event: "Checkout abandonado",
    hasDelay: true,
    defaultDelay: 60,
  },
];

const DELAY_OPTIONS = [
  { label: "30 minutos", value: 30 },
  { label: "1 hora", value: 60 },
  { label: "2 horas", value: 120 },
  { label: "6 horas", value: 360 },
  { label: "24 horas", value: 1440 },
];

const FLOW_STATUS_BADGES: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  sent: { label: "Enviado", variant: "default" },
  queued: { label: "Na fila", variant: "secondary" },
  failed: { label: "Falhou", variant: "destructive" },
};

const TEMPLATE_LABELS: Record<string, string> = {
  purchase_confirmed: "Confirmação de Compra",
  welcome_member: "Boas-vindas",
  cart_abandoned_reminder: "Carrinho Abandonado",
};

const PREVIEWS: Record<string, { subject: string; body: string }> = {
  purchase_confirmed: {
    subject: "Compra confirmada — Curso de Marketing Digital",
    body: `Olá, João!\n\nSua compra de Curso de Marketing Digital no valor de R$ 197,00 foi confirmada com sucesso.\n\nVocê já pode acessar seu conteúdo na área de membros.`,
  },
  welcome_member: {
    subject: "Bem-vindo(a) à Kivo! 🎉",
    body: `Olá, João!\n\nEstamos muito felizes em ter você conosco. Seu acesso ao Curso de Marketing Digital já está liberado.\n\nAcesse agora e comece sua jornada.`,
  },
  cart_abandoned_reminder: {
    subject: "Você esqueceu algo no carrinho 🛒",
    body: `Olá, João!\n\nNotamos que você estava prestes a adquirir Curso de Marketing Digital por R$ 197,00, mas não finalizou sua compra.\n\nSeu carrinho ainda está reservado.`,
  },
};

/* ─── Campaign form ─── */
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
  const { toast: toastLegacy } = useToast();
  const [searchParams] = useSearchParams();
  const planInfo = usePlanLimits();
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  /* Campaign state */
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [viewingCampaign, setViewingCampaign] = useState<any | null>(null);
  const [form, setForm] = useState<CampaignForm>({
    name: "", subject: "", body_html: "", segment_id: "", scheduled_at: "",
  });

  /* Flow state */
  const [previewKey, setPreviewKey] = useState<string | null>(null);

  const preSelectedSegment = searchParams.get("segment");
  useEffect(() => {
    if (preSelectedSegment) {
      setForm((f) => ({ ...f, segment_id: preSelectedSegment }));
      setIsDialogOpen(true);
    }
  }, [preSelectedSegment]);

  const workspaceId = currentWorkspace?.id;

  /* ─── Campaign queries ─── */
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

  /* ─── Flow queries ─── */
  const { data: flowSettings = [] } = useQuery({
    queryKey: ["email-flow-settings", workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      const { data, error } = await supabase
        .from("email_flow_settings")
        .select("*")
        .eq("workspace_id", workspaceId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!workspaceId,
  });

  const { data: flowLogs = [], isLoading: flowLogsLoading } = useQuery({
    queryKey: ["email-logs", workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      const { data, error } = await supabase
        .from("email_logs")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: !!workspaceId,
  });

  /* ─── Campaign mutations ─── */
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

  /* ─── Flow mutation ─── */
  const upsertFlowSetting = useMutation({
    mutationFn: async (params: { flow_key: string; is_enabled?: boolean; delay_minutes?: number; support_email?: string }) => {
      if (!workspaceId) throw new Error("No workspace");
      const existing = flowSettings.find((s: any) => s.flow_key === params.flow_key);
      if (existing) {
        const { error } = await supabase
          .from("email_flow_settings")
          .update({
            is_enabled: params.is_enabled ?? existing.is_enabled,
            delay_minutes: params.delay_minutes ?? existing.delay_minutes,
            support_email: params.support_email !== undefined ? params.support_email : existing.support_email,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("email_flow_settings")
          .insert({
            workspace_id: workspaceId,
            flow_key: params.flow_key,
            is_enabled: params.is_enabled ?? true,
            delay_minutes: params.delay_minutes ?? 60,
            support_email: params.support_email || null,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-flow-settings"] });
      toastLegacy({ title: "Configuração salva" });
    },
    onError: (e: any) => toastLegacy({ title: "Erro", description: e.message, variant: "destructive" }),
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

  const getFlowSetting = (key: string) => flowSettings.find((s: any) => s.flow_key === key);

  /* Campaign detail recipients */
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

  const campaignStats = viewingCampaign ? {
    total: viewingCampaign.total_recipients || 0,
    sent: viewingCampaign.sent_count || 0,
    failed: viewingCampaign.failed_count || 0,
    pending: (viewingCampaign.total_recipients || 0) - (viewingCampaign.sent_count || 0) - (viewingCampaign.failed_count || 0),
  } : null;

  const flowStats = {
    total: flowLogs.length,
    sent: flowLogs.filter((l: any) => l.status === "sent").length,
    failed: flowLogs.filter((l: any) => l.status === "failed").length,
    queued: flowLogs.filter((l: any) => l.status === "queued").length,
  };

  if (!planInfo.loading && !planInfo.limits.hasEmailMarketing) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
        <div className="p-4 rounded-full bg-muted">
          <Crown className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Emails</h2>
        <p className="text-muted-foreground max-w-md">
          Automação e campanhas de email estão disponíveis a partir do plano Creator.
        </p>
        <Button onClick={() => setUpgradeOpen(true)} className="gap-2">
          <Crown className="w-4 h-4" /> Fazer Upgrade
        </Button>
        <UpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} currentPlan={planInfo.plan} feature="usar emails" />
      </div>
    );
  }

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
          <h1 className="text-2xl font-bold text-foreground">Emails</h1>
          <p className="text-muted-foreground">Campanhas e automações de email em um só lugar</p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />Nova Campanha
        </Button>
      </div>

      <Tabs defaultValue="campaigns">
        <TabsList>
          <TabsTrigger value="campaigns"><Send className="h-4 w-4 mr-2" />Campanhas</TabsTrigger>
          <TabsTrigger value="automations"><RefreshCw className="h-4 w-4 mr-2" />Automações</TabsTrigger>
          <TabsTrigger value="logs"><Clock className="h-4 w-4 mr-2" />Logs ({flowStats.total})</TabsTrigger>
        </TabsList>

        {/* ─── CAMPANHAS TAB ─── */}
        <TabsContent value="campaigns" className="mt-6">
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
        </TabsContent>

        {/* ─── AUTOMAÇÕES TAB ─── */}
        <TabsContent value="automations" className="mt-6 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-foreground">{flowStats.total}</p>
                <p className="text-xs text-muted-foreground">Total enviados</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-primary">{flowStats.sent}</p>
                <p className="text-xs text-muted-foreground">Sucesso</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-destructive">{flowStats.failed}</p>
                <p className="text-xs text-muted-foreground">Falhas</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-muted-foreground">{flowStats.queued}</p>
                <p className="text-xs text-muted-foreground">Na fila</p>
              </CardContent>
            </Card>
          </div>

          {FLOWS.map((flow) => {
            const setting = getFlowSetting(flow.key);
            const isEnabled = setting?.is_enabled ?? true;
            const delayMinutes = setting?.delay_minutes ?? flow.defaultDelay ?? 60;
            const supportEmail = setting?.support_email || "";

            return (
              <Card key={flow.key}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {flow.icon}
                      <div>
                        <CardTitle className="text-base">{flow.title}</CardTitle>
                        <CardDescription className="text-sm">{flow.description}</CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={isEnabled ? "default" : "secondary"}>
                        {isEnabled ? "Ativo" : "Inativo"}
                      </Badge>
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={(v) =>
                          upsertFlowSetting.mutate({ flow_key: flow.key, is_enabled: v })
                        }
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <AlertCircle className="h-4 w-4" />
                    <span>Disparo: {flow.event}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {flow.hasDelay && (
                      <div className="space-y-1">
                        <Label className="text-xs">Delay do envio</Label>
                        <Select
                          value={String(delayMinutes)}
                          onValueChange={(v) =>
                            upsertFlowSetting.mutate({ flow_key: flow.key, delay_minutes: Number(v) })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DELAY_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={String(opt.value)}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="space-y-1">
                      <Label className="text-xs">Email de suporte</Label>
                      <Input
                        placeholder="suporte@seusite.com"
                        defaultValue={supportEmail}
                        onBlur={(e) =>
                          upsertFlowSetting.mutate({ flow_key: flow.key, support_email: e.target.value })
                        }
                      />
                    </div>

                    <div className="flex items-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPreviewKey(previewKey === flow.key ? null : flow.key)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        {previewKey === flow.key ? "Fechar Preview" : "Preview"}
                      </Button>
                    </div>
                  </div>

                  {previewKey === flow.key && PREVIEWS[flow.key] && (
                    <div className="mt-4 border rounded-lg overflow-hidden">
                      <div className="bg-muted/50 px-4 py-2 border-b">
                        <p className="text-xs text-muted-foreground">Assunto</p>
                        <p className="text-sm font-medium text-foreground">{PREVIEWS[flow.key].subject}</p>
                      </div>
                      <div className="p-4 text-sm text-foreground whitespace-pre-line bg-card">
                        {PREVIEWS[flow.key].body}
                      </div>
                      <div className="bg-muted/50 px-4 py-2 border-t text-center">
                        <span className="inline-block bg-primary text-primary-foreground px-6 py-2 rounded-md text-sm font-medium">
                          Botão de Ação
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* ─── LOGS TAB ─── */}
        <TabsContent value="logs" className="mt-6">
          {flowLogsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : flowLogs.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Mail className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold text-foreground">Nenhum email enviado ainda</h3>
                <p className="text-muted-foreground mt-1">Os emails aparecerão aqui conforme forem disparados</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Template</TableHead>
                    <TableHead>Destinatário</TableHead>
                    <TableHead>Assunto</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flowLogs.map((log: any) => {
                    const badge = FLOW_STATUS_BADGES[log.status] || { label: log.status, variant: "outline" as const };
                    return (
                      <TableRow key={log.id}>
                        <TableCell className="text-sm font-medium">
                          {TEMPLATE_LABELS[log.template_key] || log.template_key}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {log.recipient_email}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                          {log.subject}
                        </TableCell>
                        <TableCell>
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(log.created_at), "dd/MM HH:mm", { locale: ptBR })}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Campaign Dialog */}
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

          {campaignStats && (
            <div className="grid grid-cols-4 gap-3">
              <Card>
                <CardContent className="p-3 text-center">
                  <Users className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                  <p className="text-xl font-bold">{campaignStats.total}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <CheckCircle className="h-4 w-4 mx-auto text-primary mb-1" />
                  <p className="text-xl font-bold text-primary">{campaignStats.sent}</p>
                  <p className="text-xs text-muted-foreground">Enviados</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <XCircle className="h-4 w-4 mx-auto text-destructive mb-1" />
                  <p className="text-xl font-bold text-destructive">{campaignStats.failed}</p>
                  <p className="text-xs text-muted-foreground">Falhas</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <Clock className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                  <p className="text-xl font-bold">{campaignStats.pending}</p>
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
