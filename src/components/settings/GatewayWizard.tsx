import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CheckCircle2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { toast } from "sonner";

interface GatewayWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gateway: "asaas" | "pagarme";
}

export function GatewayWizard({ open, onOpenChange, gateway }: GatewayWizardProps) {
  const { currentWorkspace } = useWorkspace();
  const [step, setStep] = useState(1);
  const [apiKey, setApiKey] = useState("");
  const [environment, setEnvironment] = useState<"sandbox" | "production">("sandbox");
  const [showApiKey, setShowApiKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const [saving, setSaving] = useState(false);

  const isAsaas = gateway === "asaas";
  const label = isAsaas ? "Asaas" : "Pagar.me";

  useEffect(() => {
    if (open) {
      setStep(1);
      setTestResult(null);
      if (currentWorkspace) {
        const meta = (currentWorkspace as any).metadata || {};
        if (isAsaas) {
          if (meta.asaas_api_key) setApiKey(meta.asaas_api_key);
          if (meta.asaas_env) setEnvironment(meta.asaas_env);
        } else {
          if (meta.pagarme_api_key) setApiKey(meta.pagarme_api_key);
        }
      }
    }
  }, [open, currentWorkspace, isAsaas]);

  const handleTest = async () => {
    if (!apiKey.trim()) {
      toast.error("Preencha a chave de API");
      return;
    }
    setTesting(true);
    setTestResult(null);

    try {
      const fnName = isAsaas ? "test-asaas" : "test-pagarme";
      const body = isAsaas
        ? { api_key: apiKey.trim(), environment }
        : { api_key: apiKey.trim() };

      const { data, error } = await supabase.functions.invoke(fnName, { body });

      if (error) throw error;
      if (data?.success) {
        setTestResult("success");
        setStep(3);
      } else {
        setTestResult("error");
      }
    } catch {
      setTestResult("error");
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!currentWorkspace) return;
    setSaving(true);
    try {
      const existing = (currentWorkspace as any).metadata || {};
      const updatedMeta = isAsaas
        ? { ...existing, asaas_api_key: apiKey.trim(), asaas_env: environment, active_gateway: "asaas" }
        : { ...existing, pagarme_api_key: apiKey.trim(), active_gateway: "pagarme" };

      const { error } = await supabase
        .from("workspaces")
        .update({ metadata: updatedMeta })
        .eq("id", currentWorkspace.id);

      if (error) throw error;
      toast.success(`${label} conectado com sucesso!`);
      onOpenChange(false);
    } catch {
      toast.error("Erro ao salvar as chaves");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Conectar {label}</DialogTitle>
          <DialogDescription>
            {step === 1 && `Insira sua chave de API do ${label}`}
            {step === 2 && "Testando conexão com o gateway"}
            {step === 3 && "Conexão verificada com sucesso!"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 justify-center py-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-2 w-8 rounded-full transition-colors ${
                s <= step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>API Key</Label>
              <div className="relative">
                <Input
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={isAsaas ? "$aact_..." : "sk_live_..."}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {isAsaas
                  ? "Encontre em: Asaas → Integrações → Chave de API"
                  : "Encontre em: Pagar.me Dashboard → Configurações → Chaves de API"}
              </p>
            </div>

            {isAsaas && (
              <div className="space-y-2">
                <Label>Ambiente</Label>
                <Select value={environment} onValueChange={(v: any) => setEnvironment(v)}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sandbox">Sandbox (testes)</SelectItem>
                    <SelectItem value="production">Produção</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col items-center py-8 gap-4">
            {testing && (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Testando conexão...</p>
              </>
            )}
            {testResult === "error" && (
              <>
                <AlertCircle className="h-8 w-8 text-destructive" />
                <p className="text-sm text-destructive">Falha na conexão. Verifique sua chave.</p>
                <Button variant="outline" size="sm" onClick={() => setStep(1)}>
                  Voltar e corrigir
                </Button>
              </>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col items-center py-8 gap-4">
            <CheckCircle2 className="h-12 w-12 text-primary" />
            <p className="text-sm font-medium text-foreground">Conexão verificada!</p>
            <p className="text-xs text-muted-foreground text-center">
              A chave está válida e pronta para uso. Clique em salvar para finalizar.
            </p>
          </div>
        )}

        <DialogFooter>
          {step === 1 && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  setStep(2);
                  setTimeout(handleTest, 300);
                }}
                disabled={!apiKey.trim()}
              >
                Testar Conexão
              </Button>
            </>
          )}
          {step === 3 && (
            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Salvar e Conectar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GatewayStatusBadge({ gateway }: { gateway: "asaas" | "pagarme" }) {
  const { currentWorkspace } = useWorkspace();
  const meta = (currentWorkspace as any)?.metadata || {};
  const isConnected = gateway === "asaas"
    ? !!meta.asaas_api_key
    : !!meta.pagarme_api_key;
  const isActive = meta.active_gateway === gateway;

  return (
    <div className="flex items-center gap-1.5">
      <Badge variant={isConnected ? "default" : "secondary"} className={isConnected ? "bg-green-600 hover:bg-green-700" : ""}>
        {isConnected ? "Conectado" : "Não conectado"}
      </Badge>
      {isActive && (
        <Badge variant="outline" className="text-xs border-primary text-primary">
          Ativo
        </Badge>
      )}
    </div>
  );
}
