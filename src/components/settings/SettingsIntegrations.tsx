import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Calendar, Video, Zap, Instagram, ExternalLink, MessageCircle,
  QrCode, CheckCircle2, Loader2, Phone, RefreshCw, Settings2,
} from "lucide-react";

const DEFAULT_TEMPLATES: Record<string, { label: string; template: string }> = {
  purchase_confirmed: {
    label: "Confirmação de compra",
    template: "Olá {nome}! 🎉 Sua compra de *{produto}* foi confirmada. Acesse aqui: {link}",
  },
  cart_abandoned: {
    label: "Carrinho abandonado",
    template: "Oi {nome}, você deixou *{produto}* no carrinho 🛒. Complete sua compra: {link}",
  },
  lead_welcome: {
    label: "Boas-vindas lead",
    template: "Obrigado por se inscrever! 🙌 Aqui está seu material: {link}",
  },
};

const OTHER_INTEGRATIONS = [
  { id: "google-calendar", name: "Google Calendar", description: "Sincronize sessões de coaching com seu calendário", icon: Calendar, connected: false },
  { id: "zoom", name: "Zoom", description: "Crie links de reunião automaticamente para calls", icon: Video, connected: false },
  { id: "zapier", name: "Zapier", description: "Conecte com milhares de apps e automações", icon: Zap, connected: false },
  { id: "instagram", name: "Instagram", description: "AutoDM e integração com stories (em breve)", icon: Instagram, connected: false },
];

export function SettingsIntegrations() {
  const { currentWorkspace } = useWorkspace();
  const { toast } = useToast();
  const qc = useQueryClient();
  const workspaceId = currentWorkspace?.id;

  const [showConnect, setShowConnect] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [pollingQr, setPollingQr] = useState(false);

  // Fetch WhatsApp config
  const { data: waConfig, isLoading: waLoading } = useQuery({
    queryKey: ["whatsapp-config", workspaceId],
    queryFn: async () => {
      if (!workspaceId) return null;
      const { data } = await supabase
        .from("whatsapp_config")
        .select("*")
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      return data;
    },
    enabled: !!workspaceId,
  });

  // Fetch templates
  const { data: templates = [] } = useQuery({
    queryKey: ["whatsapp-templates", workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      const { data } = await supabase
        .from("whatsapp_templates")
        .select("*")
        .eq("workspace_id", workspaceId);
      return data || [];
    },
    enabled: !!workspaceId,
  });

  const isConnected = waConfig?.status === "connected";

  // Connect WhatsApp — creates instance via edge function
  const handleConnect = async () => {
    if (!workspaceId || !apiUrl.trim()) return;
    setConnecting(true);
    try {
      const instanceName = `kivo_${workspaceId.slice(0, 8)}`;

      // Save config
      const { error } = await supabase.from("whatsapp_config").upsert({
        workspace_id: workspaceId,
        instance_name: instanceName,
        api_url: apiUrl.replace(/\/$/, ""),
        status: "connecting",
      }, { onConflict: "workspace_id" });

      if (error) throw error;

      // Call Evolution API to create instance
      const res = await supabase.functions.invoke("whatsapp-send", {
        body: {
          action: "create_instance",
          workspace_id: workspaceId,
          api_url: apiUrl.replace(/\/$/, ""),
          api_key: apiKey,
          instance_name: instanceName,
        },
      });

      if (res.error) throw new Error(res.error.message);
      const data = res.data;

      if (data?.qrcode) {
        setQrCode(data.qrcode);
        setPollingQr(true);
      } else if (data?.instance_id) {
        await supabase.from("whatsapp_config").update({
          instance_id: data.instance_id,
          status: "connected",
        }).eq("workspace_id", workspaceId);
      }

      // Create default templates if none exist
      if (templates.length === 0) {
        const defaultInserts = Object.entries(DEFAULT_TEMPLATES).map(([key, val]) => ({
          workspace_id: workspaceId,
          trigger_type: key,
          message_template: val.template,
          is_active: true,
        }));
        await supabase.from("whatsapp_templates").insert(defaultInserts);
      }

      qc.invalidateQueries({ queryKey: ["whatsapp-config"] });
      qc.invalidateQueries({ queryKey: ["whatsapp-templates"] });
      toast({ title: "WhatsApp configurado!" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setConnecting(false);
    }
  };

  // Poll for QR code connection status
  useEffect(() => {
    if (!pollingQr || !workspaceId) return;
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("whatsapp_config")
        .select("status, phone_number")
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (data?.status === "connected") {
        setPollingQr(false);
        setQrCode(null);
        setShowConnect(false);
        qc.invalidateQueries({ queryKey: ["whatsapp-config"] });
        toast({ title: "WhatsApp conectado!", description: `Número: ${data.phone_number}` });
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [pollingQr, workspaceId]);

  // Disconnect
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error("No workspace");
      await supabase.from("whatsapp_config").update({ status: "disconnected", qr_code: null, phone_number: null }).eq("workspace_id", workspaceId);
    },
    onSuccess: () => {
      toast({ title: "WhatsApp desconectado" });
      qc.invalidateQueries({ queryKey: ["whatsapp-config"] });
    },
  });

  // Update template
  const updateTemplateMutation = useMutation({
    mutationFn: async ({ id, message_template, is_active }: { id: string; message_template?: string; is_active?: boolean }) => {
      const updates: any = {};
      if (message_template !== undefined) updates.message_template = message_template;
      if (is_active !== undefined) updates.is_active = is_active;
      const { error } = await supabase.from("whatsapp_templates").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whatsapp-templates"] }),
  });

  return (
    <div className="space-y-6">
      {/* WhatsApp Card — Featured */}
      <Card className="border-2 border-accent/30 bg-accent/5 rounded-xl overflow-hidden">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-lg bg-accent/20">
                <MessageCircle className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="font-medium text-sm text-foreground">WhatsApp (Evolution API)</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Envie mensagens automáticas para compradores e leads
                </p>
                {isConnected && waConfig?.phone_number && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <Phone className="h-3 w-3 text-accent" />
                    <span className="text-xs font-medium text-accent">{waConfig.phone_number}</span>
                  </div>
                )}
              </div>
            </div>
            <Badge variant={isConnected ? "default" : "secondary"} className="text-xs shrink-0">
              {isConnected ? "Conectado" : waConfig?.status === "connecting" ? "Conectando..." : "Não conectado"}
            </Badge>
          </div>

          <div className="mt-4 flex gap-2">
            {isConnected ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setShowTemplates(true)}>
                  <Settings2 className="h-3.5 w-3.5 mr-1.5" /> Templates
                </Button>
                <Button variant="outline" size="sm" className="text-destructive" onClick={() => disconnectMutation.mutate()}>
                  Desconectar
                </Button>
              </>
            ) : (
              <Button size="sm" className="w-full" onClick={() => setShowConnect(true)}>
                <QrCode className="h-3.5 w-3.5 mr-1.5" /> Conectar WhatsApp
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Other integrations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {OTHER_INTEGRATIONS.map((integration) => {
          const Icon = integration.icon;
          return (
            <Card key={integration.id} className="bg-card border border-border/50 shadow-sm rounded-xl">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-lg bg-muted">
                      <Icon className="h-5 w-5 text-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{integration.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{integration.description}</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-xs shrink-0">Não conectado</Badge>
                </div>
                <div className="mt-4">
                  <Button variant="outline" size="sm" className="w-full">+ Conectar</Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
        <CardContent className="p-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Não vê uma integração?</p>
            <p className="text-xs text-muted-foreground">Nos diga o que você precisa</p>
          </div>
          <Button variant="ghost" size="sm" className="text-primary">
            <ExternalLink className="h-4 w-4 mr-2" /> Solicitar Nova Integração
          </Button>
        </CardContent>
      </Card>

      {/* Connect Dialog */}
      <Dialog open={showConnect} onOpenChange={setShowConnect}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-accent" />
              Conectar WhatsApp
            </DialogTitle>
          </DialogHeader>

          {qrCode ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                Escaneie o QR code com seu WhatsApp para vincular o número
              </p>
              <div className="p-4 bg-card border rounded-xl inline-block mx-auto">
                <img src={qrCode} alt="QR Code WhatsApp" className="w-48 h-48" />
              </div>
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Aguardando conexão...</span>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Informe a URL e API Key da sua instância Evolution API para conectar o WhatsApp.
              </p>

              <div className="space-y-2">
                <Label>URL da Evolution API</Label>
                <Input
                  placeholder="https://sua-instancia.evolution-api.com"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>API Key</Label>
                <Input
                  type="password"
                  placeholder="Sua API Key da Evolution API"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  A API Key será armazenada de forma segura e usada apenas para enviar mensagens.
                </p>
              </div>
            </div>
          )}

          {!qrCode && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowConnect(false)}>Cancelar</Button>
              <Button onClick={handleConnect} disabled={connecting || !apiUrl.trim()}>
                {connecting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Conectando...</>
                ) : (
                  "Gerar QR Code"
                )}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Templates Dialog */}
      <Dialog open={showTemplates} onOpenChange={setShowTemplates}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Templates de Mensagem</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {Object.entries(DEFAULT_TEMPLATES).map(([key, def]) => {
              const saved = templates.find((t: any) => t.trigger_type === key);
              return (
                <div key={key} className="space-y-2 p-4 rounded-lg border bg-card">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">{def.label}</Label>
                    {saved && (
                      <Switch
                        checked={saved.is_active}
                        onCheckedChange={(v) => updateTemplateMutation.mutate({ id: saved.id, is_active: v })}
                      />
                    )}
                  </div>
                  <Textarea
                    rows={3}
                    defaultValue={saved?.message_template || def.template}
                    onBlur={(e) => {
                      if (saved && e.target.value !== saved.message_template) {
                        updateTemplateMutation.mutate({ id: saved.id, message_template: e.target.value });
                      }
                    }}
                    className="text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Variáveis: {"{{nome}}"}, {"{{produto}}"}, {"{{link}}"}
                  </p>
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button onClick={() => setShowTemplates(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
