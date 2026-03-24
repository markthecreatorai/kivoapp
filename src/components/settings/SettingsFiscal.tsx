import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Save, Receipt } from "lucide-react";

function maskCpfCnpj(val: string) {
  const d = val.replace(/\D/g, "");
  if (d.length <= 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, "$1.$2.$3-$4").replace(/[.-]$/, "");
  return d.slice(0, 14).replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, "$1.$2.$3/$4-$5").replace(/[./-]$/, "");
}

function maskCep(val: string) {
  return val.replace(/\D/g, "").slice(0, 8).replace(/(\d{5})(\d{0,3})/, "$1-$2").replace(/-$/, "");
}

export function SettingsFiscal() {
  const { currentWorkspace } = useWorkspace();
  const queryClient = useQueryClient();
  const workspaceId = currentWorkspace?.id;

  const { data: settings, isLoading } = useQuery({
    queryKey: ["fiscal-settings", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase
        .from("fiscal_settings")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .maybeSingle();
      return data;
    },
  });

  const [form, setForm] = useState<Record<string, any>>({});

  // Populate form when data loads
  const effectiveForm = {
    company_name: form.company_name ?? settings?.company_name ?? "",
    document: form.document ?? settings?.document ?? "",
    municipal_registration: form.municipal_registration ?? settings?.municipal_registration ?? "",
    tax_regime: form.tax_regime ?? settings?.tax_regime ?? "simples_nacional",
    address_street: form.address_street ?? settings?.address_street ?? "",
    address_number: form.address_number ?? settings?.address_number ?? "",
    address_city: form.address_city ?? settings?.address_city ?? "",
    address_state: form.address_state ?? settings?.address_state ?? "",
    address_zip: form.address_zip ?? settings?.address_zip ?? "",
    default_tax_rate: form.default_tax_rate ?? settings?.default_tax_rate ?? 5,
    nfse_provider: form.nfse_provider ?? settings?.nfse_provider ?? "",
    is_auto_emission: form.is_auto_emission ?? settings?.is_auto_emission ?? false,
  };

  const set = (key: string, val: any) => setForm(p => ({ ...p, [key]: val }));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        workspace_id: workspaceId!,
        company_name: effectiveForm.company_name || null,
        document: (effectiveForm.document || "").replace(/\D/g, "") || null,
        municipal_registration: effectiveForm.municipal_registration || null,
        tax_regime: effectiveForm.tax_regime,
        address_street: effectiveForm.address_street || null,
        address_number: effectiveForm.address_number || null,
        address_city: effectiveForm.address_city || null,
        address_state: effectiveForm.address_state || null,
        address_zip: (effectiveForm.address_zip || "").replace(/\D/g, "") || null,
        default_tax_rate: Number(effectiveForm.default_tax_rate) || 5,
        nfse_provider: effectiveForm.nfse_provider || null,
        is_auto_emission: effectiveForm.is_auto_emission,
      };

      if (settings?.id) {
        const { error } = await supabase
          .from("fiscal_settings")
          .update(payload)
          .eq("id", settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("fiscal_settings")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Configurações fiscais salvas!");
      queryClient.invalidateQueries({ queryKey: ["fiscal-settings"] });
    },
    onError: (e: any) => toast.error(e.message || "Erro ao salvar"),
  });

  if (isLoading) return <div className="p-6 text-muted-foreground text-sm">Carregando...</div>;

  return (
    <div className="space-y-6">
      {/* Company Info */}
      <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Receipt className="h-5 w-5" /> Dados Fiscais
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Razão Social / Nome</Label>
              <Input value={effectiveForm.company_name} onChange={e => set("company_name", e.target.value)} placeholder="Nome ou razão social" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">CPF / CNPJ</Label>
              <Input value={maskCpfCnpj(effectiveForm.document)} onChange={e => set("document", e.target.value)} placeholder="000.000.000-00" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Inscrição Municipal</Label>
              <Input value={effectiveForm.municipal_registration} onChange={e => set("municipal_registration", e.target.value)} placeholder="Opcional" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Regime Tributário</Label>
              <Select value={effectiveForm.tax_regime} onValueChange={v => set("tax_regime", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="simples_nacional">Simples Nacional</SelectItem>
                  <SelectItem value="lucro_presumido">Lucro Presumido</SelectItem>
                  <SelectItem value="lucro_real">Lucro Real</SelectItem>
                  <SelectItem value="mei">MEI</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Address */}
      <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
        <CardHeader>
          <CardTitle className="text-lg">Endereço Fiscal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-1.5">
              <Label className="text-xs">Rua / Logradouro</Label>
              <Input value={effectiveForm.address_street} onChange={e => set("address_street", e.target.value)} placeholder="Rua, Av..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Número</Label>
              <Input value={effectiveForm.address_number} onChange={e => set("address_number", e.target.value)} placeholder="123" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Cidade</Label>
              <Input value={effectiveForm.address_city} onChange={e => set("address_city", e.target.value)} placeholder="São Paulo" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Estado</Label>
              <Input value={effectiveForm.address_state} onChange={e => set("address_state", e.target.value.toUpperCase().slice(0, 2))} placeholder="SP" maxLength={2} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">CEP</Label>
              <Input value={maskCep(effectiveForm.address_zip)} onChange={e => set("address_zip", e.target.value)} placeholder="00000-000" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* NFS-e Config */}
      <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
        <CardHeader>
          <CardTitle className="text-lg">Emissão de NFS-e</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Alíquota Padrão ISS (%)</Label>
              <Input type="number" step="0.01" min="0" max="10" value={effectiveForm.default_tax_rate} onChange={e => set("default_tax_rate", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Provedor NFS-e</Label>
              <Select value={effectiveForm.nfse_provider} onValueChange={v => set("nfse_provider", v)}>
                <SelectTrigger><SelectValue placeholder="Selecionar provedor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="enotas">eNotas</SelectItem>
                  <SelectItem value="focusnfe">Focus NFe</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            O token API do provedor deve ser configurado como secret no Supabase (ENOTAS_API_KEY ou FOCUSNFE_API_KEY).
          </p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Emissão automática</p>
              <p className="text-xs text-muted-foreground">Emitir NFS-e automaticamente quando um pagamento for confirmado</p>
            </div>
            <Switch checked={effectiveForm.is_auto_emission} onCheckedChange={v => set("is_auto_emission", v)} />
          </div>
        </CardContent>
      </Card>

      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full md:w-auto">
        <Save className="h-4 w-4 mr-2" />
        {saveMutation.isPending ? "Salvando..." : "Salvar Configurações Fiscais"}
      </Button>
    </div>
  );
}
