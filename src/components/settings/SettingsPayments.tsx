import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Info, ShieldCheck, CreditCard, QrCode, FileText } from "lucide-react";
import { BankAccountForm } from "./BankAccountForm";
import { useAuth } from "@/contexts/AuthProvider";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { isAdminUser } from "@/lib/admin";
import { usePlanLimits, PLAN_LABELS } from "@/hooks/usePlanLimits";
import { supabase } from "@/integrations/supabase/client";

export function SettingsPayments() {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const isAdmin = isAdminUser(user);
  const { plan } = usePlanLimits();
  const [gdprConsent, setGdprConsent] = useState(false);
  const [termsEnabled, setTermsEnabled] = useState(false);
  const [termsText, setTermsText] = useState("");
  const [checkoutLang, setCheckoutLang] = useState("pt-BR");

  // Fetch fee config for current plan
  const { data: feeConfig } = useQuery({
    queryKey: ["fee-config", plan],
    queryFn: async () => {
      const planKey = plan === "CREATOR_PRO" ? "creator_pro" : "creator";
      // fee_config não é legível pelo cliente (RLS); usamos RPC de resumo.
      const { data } = await (supabase as any).rpc("get_plan_fee_summary", { p_plan: planKey });
      return Array.isArray(data) ? data[0] : data;

    },
  });

  const fmt = (v: number) => `${v.toFixed(1)}%`;

  return (
    <div className="space-y-6">
      {/* Creator info banner */}
      {!isAdmin && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 flex items-start gap-3">
            <Info className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Como funcionam seus recebimentos</p>
              <p className="text-xs text-muted-foreground mt-1">
                Todas as vendas são processadas automaticamente pelo Asaas — instituição autorizada pelo Banco Central.
                Cadastre sua conta bancária abaixo para receber os valores das suas vendas.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Your Fees Card */}
      <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Suas Taxas</CardTitle>
            <Badge variant="secondary" className="text-xs">{PLAN_LABELS[plan]}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
              <CreditCard className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">Cartão de crédito</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {feeConfig ? fmt(feeConfig.credit_card_percent) : "3.5%"} gateway + {feeConfig ? fmt(feeConfig.platform_percent) : "5.0%"} plataforma
                </p>
                <p className="text-[10px] text-muted-foreground">Disponível em D+2</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
              <QrCode className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">PIX</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {feeConfig ? fmt(feeConfig.pix_percent) : "1.5%"} gateway + {feeConfig ? fmt(feeConfig.platform_percent) : "5.0%"} plataforma
                </p>
                <p className="text-[10px] text-muted-foreground">Disponível em D+0</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
              <FileText className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">Boleto</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  R${feeConfig ? (feeConfig.boleto_fixed_cents / 100).toFixed(2).replace('.', ',') : "3,49"} por boleto + {feeConfig ? fmt(feeConfig.platform_percent) : "5.0%"} plataforma
                </p>
                <p className="text-[10px] text-muted-foreground">Disponível em D+1</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            <span>Processado por Asaas — autorizado pelo Banco Central do Brasil</span>
          </div>

          {plan !== "CREATOR_PRO" && (
            <p className="text-xs text-muted-foreground">
              Faça upgrade para o plano <strong>Creator Pro</strong> para taxas reduzidas.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Bank Account */}
      <BankAccountForm />

      {/* Checkout Settings — admin only */}
      {isAdmin && (
        <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
          <CardHeader>
            <CardTitle className="text-lg">Configurações do Checkout</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Marketing Consent (GDPR)</p>
                <p className="text-xs text-muted-foreground">Solicitar consentimento de marketing no checkout</p>
              </div>
              <Switch checked={gdprConsent} onCheckedChange={setGdprConsent} />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Termos & Condições</p>
                  <p className="text-xs text-muted-foreground">Exigir aceite de termos no checkout</p>
                </div>
                <Switch checked={termsEnabled} onCheckedChange={setTermsEnabled} />
              </div>
              {termsEnabled && (
                <Textarea
                  value={termsText}
                  onChange={(e) => setTermsText(e.target.value)}
                  placeholder="Cole seus termos e condições aqui..."
                  className="min-h-[120px]"
                />
              )}
            </div>

            <div className="space-y-2">
              <Label>Idioma do Checkout</Label>
              <Select value={checkoutLang} onValueChange={setCheckoutLang}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pt-BR">Português</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Español</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
