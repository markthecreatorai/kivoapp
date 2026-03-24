import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { usePlanLimits } from "@/hooks/usePlanLimits";
import { UpgradeModal } from "@/components/UpgradeModal";
import {
  Mail, ShoppingCart, UserPlus, Clock, CheckCircle, XCircle, AlertCircle,
  Crown, Eye, RefreshCw,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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
    icon: <CheckCircle className="h-5 w-5 text-green-600" />,
    event: "Pagamento confirmado (webhook)",
    hasDelay: false,
  },
  {
    key: "welcome_member",
    title: "Boas-vindas ao Membro",
    description: "Email de boas-vindas após primeira compra do cliente",
    icon: <UserPlus className="h-5 w-5 text-blue-600" />,
    event: "Primeira compra do cliente",
    hasDelay: false,
  },
  {
    key: "cart_abandoned_reminder",
    title: "Carrinho Abandonado",
    description: "Lembrete enviado quando o cliente não finaliza a compra",
    icon: <ShoppingCart className="h-5 w-5 text-orange-500" />,
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

const STATUS_BADGES: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  sent: { label: "Enviado", variant: "default" },
  queued: { label: "Na fila", variant: "secondary" },
  failed: { label: "Falhou", variant: "destructive" },
};

const TEMPLATE_LABELS: Record<string, string> = {
  purchase_confirmed: "Confirmação de Compra",
  welcome_member: "Boas-vindas",
  cart_abandoned_reminder: "Carrinho Abandonado",
};

// Preview templates
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

export default function EmailFlows() {
  const { currentWorkspace } = useWorkspace();
  const { toast } = useToast();
  const qc = useQueryClient();
  const workspaceId = currentWorkspace?.id;
  const planInfo = usePlanLimits();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [previewKey, setPreviewKey] = useState<string | null>(null);

  // Fetch flow settings
  const { data: settings = [] } = useQuery({
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

  // Fetch email logs
  const { data: logs = [], isLoading: logsLoading } = useQuery({
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

  // Upsert flow setting
  const upsertMutation = useMutation({
    mutationFn: async (params: { flow_key: string; is_enabled?: boolean; delay_minutes?: number; support_email?: string }) => {
      if (!workspaceId) throw new Error("No workspace");
      const existing = settings.find((s: any) => s.flow_key === params.flow_key);
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
      qc.invalidateQueries({ queryKey: ["email-flow-settings"] });
      toast({ title: "Configuração salva" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const getFlowSetting = (key: string) => settings.find((s: any) => s.flow_key === key);

  // Stats
  const stats = {
    total: logs.length,
    sent: logs.filter((l: any) => l.status === "sent").length,
    failed: logs.filter((l: any) => l.status === "failed").length,
    queued: logs.filter((l: any) => l.status === "queued").length,
  };

  if (!planInfo.loading && !planInfo.limits.hasEmailMarketing) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
        <div className="p-4 rounded-full bg-muted">
          <Crown className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Email Flows</h2>
        <p className="text-muted-foreground max-w-md">
          Automação de emails está disponível a partir do plano Creator.
        </p>
        <Button onClick={() => setUpgradeOpen(true)} className="gap-2">
          <Crown className="w-4 h-4" /> Fazer Upgrade
        </Button>
        <UpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} currentPlan={planInfo.plan} feature="usar email flows" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Email Flows</h1>
        <p className="text-muted-foreground">Emails transacionais automáticos para suas vendas</p>
      </div>

      <Tabs defaultValue="flows">
        <TabsList>
          <TabsTrigger value="flows"><Mail className="h-4 w-4 mr-2" />Fluxos</TabsTrigger>
          <TabsTrigger value="logs"><Clock className="h-4 w-4 mr-2" />Logs ({stats.total})</TabsTrigger>
        </TabsList>

        <TabsContent value="flows" className="mt-6 space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-foreground">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total enviados</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-green-600">{stats.sent}</p>
                <p className="text-xs text-muted-foreground">Sucesso</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-destructive">{stats.failed}</p>
                <p className="text-xs text-muted-foreground">Falhas</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-muted-foreground">{stats.queued}</p>
                <p className="text-xs text-muted-foreground">Na fila</p>
              </CardContent>
            </Card>
          </div>

          {/* Flow Cards */}
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
                          upsertMutation.mutate({ flow_key: flow.key, is_enabled: v })
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
                            upsertMutation.mutate({ flow_key: flow.key, delay_minutes: Number(v) })
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
                        value={supportEmail}
                        onChange={(e) => {
                          // Debounce: save on blur
                        }}
                        onBlur={(e) =>
                          upsertMutation.mutate({ flow_key: flow.key, support_email: e.target.value })
                        }
                        defaultValue={supportEmail}
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

                  {/* Preview */}
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

        <TabsContent value="logs" className="mt-6">
          {logsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : logs.length === 0 ? (
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
                  {logs.map((log: any) => {
                    const badge = STATUS_BADGES[log.status] || { label: log.status, variant: "outline" as const };
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
    </div>
  );
}
