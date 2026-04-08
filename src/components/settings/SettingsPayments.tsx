import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Info } from "lucide-react";
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
                Todas as vendas são processadas automaticamente pela plataforma. 
                Cadastre sua conta bancária abaixo para receber os valores das suas vendas.
              </p>
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
