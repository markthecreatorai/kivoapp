import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreditCard, DollarSign, Zap } from "lucide-react";
import { GatewayWizard, GatewayStatusBadge } from "./GatewayWizard";
import { BankAccountForm } from "./BankAccountForm";
import { useAuth } from "@/contexts/AuthProvider";
import { isAdminUser } from "@/lib/admin";

export function SettingsPayments() {
  const { user } = useAuth();
  const isAdmin = isAdminUser(user);
  const [gdprConsent, setGdprConsent] = useState(false);
  const [termsEnabled, setTermsEnabled] = useState(false);
  const [termsText, setTermsText] = useState("");
  const [checkoutLang, setCheckoutLang] = useState("pt-BR");
  const [showGatewayWizard, setShowGatewayWizard] = useState(false);
  const [selectedGateway, setSelectedGateway] = useState<"asaas" | "pagarme">("asaas");

  const openWizard = (gw: "asaas" | "pagarme") => {
    setSelectedGateway(gw);
    setShowGatewayWizard(true);
  };

  return (
    <div className="space-y-6">
      {/* Gateway config — admin only */}
      {isAdmin && (
        <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
          <CardHeader>
            <CardTitle className="text-lg">Métodos de Pagamento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Asaas - Primary */}
            <div className="flex items-center justify-between p-4 border border-primary/30 rounded-lg bg-primary/5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Zap className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">Asaas</p>
                  <p className="text-xs text-muted-foreground">Gateway principal — PIX, cartão, boleto + assinaturas</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <GatewayStatusBadge gateway="asaas" />
                <Button variant="outline" size="sm" onClick={() => openWizard("asaas")}>
                  Configurar
                </Button>
              </div>
            </div>

            {/* Pagar.me - Legacy */}
            <div className="flex items-center justify-between p-4 border border-border/50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium">Pagar.me</p>
                  <p className="text-xs text-muted-foreground">Gateway legado — PIX, cartão, boleto</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <GatewayStatusBadge gateway="pagarme" />
                <Button variant="outline" size="sm" onClick={() => openWizard("pagarme")}>
                  Configurar
                </Button>
              </div>
            </div>

            {/* Stripe - Coming soon */}
            <div className="flex items-center justify-between p-4 border border-border/50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <DollarSign className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium">Stripe</p>
                  <p className="text-xs text-muted-foreground">Pagamentos internacionais via cartão</p>
                </div>
              </div>
              <Button variant="outline" size="sm" disabled>Em breve</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bank Account — visible to all */}
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

      {isAdmin && (
        <GatewayWizard open={showGatewayWizard} onOpenChange={setShowGatewayWizard} gateway={selectedGateway} />
      )}
    </div>
  );
}
