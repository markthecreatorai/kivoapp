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
  { id: "whatsapp", name: "WhatsApp", description: "Envie mensagens automáticas para compradores e leads", icon: MessageCircle },
  { id: "google-calendar", name: "Google Calendar", description: "Sincronize sessões de coaching com seu calendário", icon: Calendar },
  { id: "zoom", name: "Zoom", description: "Crie links de reunião automaticamente para calls", icon: Video },
  { id: "zapier", name: "Zapier", description: "Conecte com milhares de apps e automações", icon: Zap },
  { id: "instagram", name: "Instagram", description: "AutoDM e integração com stories", icon: Instagram },
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
      {/* All integrations — coming soon */}
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
                </div>
                <div className="mt-4">
                  <Button variant="outline" size="sm" className="w-full" disabled>
                    Em breve
                  </Button>
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
    </div>
  );
}
