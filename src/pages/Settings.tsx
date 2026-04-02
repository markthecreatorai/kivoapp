import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSearchParams } from "react-router-dom";
import { SettingsProfile } from "@/components/settings/SettingsProfile";
import { SettingsIntegrations } from "@/components/settings/SettingsIntegrations";
import { SettingsBilling } from "@/components/settings/SettingsBilling";
import { SettingsPayments } from "@/components/settings/SettingsPayments";
import { SettingsNotifications } from "@/components/settings/SettingsNotifications";
import { SettingsSecurity } from "@/components/settings/SettingsSecurity";
import { SettingsFiscal } from "@/components/settings/SettingsFiscal";
import { Lock } from "lucide-react";

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "profile";

  return (
    <div className="p-4 md:p-5 max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold text-foreground">Configurações da conta</h1>
        <p className="text-sm text-muted-foreground flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5" />
          Configurações globais da sua conta Kivo. Não afeta configurações de comunidades.
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setSearchParams({ tab: v })}
        className="w-full"
      >
        <TabsList className="w-full justify-start overflow-x-auto bg-transparent h-auto flex-wrap gap-1 p-0">
          <TabsTrigger className="rounded-full px-3 py-1.5 text-[12px]" value="profile">Perfil</TabsTrigger>
          <TabsTrigger className="rounded-full px-3 py-1.5 text-[12px]" value="integrations">Integrações</TabsTrigger>
          <TabsTrigger className="rounded-full px-3 py-1.5 text-[12px]" value="billing">Billing</TabsTrigger>
          <TabsTrigger className="rounded-full px-3 py-1.5 text-[12px]" value="payments">Recebimentos</TabsTrigger>
          <TabsTrigger className="rounded-full px-3 py-1.5 text-[12px]" value="fiscal">Fiscal</TabsTrigger>
          <TabsTrigger className="rounded-full px-3 py-1.5 text-[12px]" value="notifications">Notificações</TabsTrigger>
          <TabsTrigger className="rounded-full px-3 py-1.5 text-[12px]" value="security">Segurança</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-6"><SettingsProfile /></TabsContent>
        <TabsContent value="integrations" className="mt-6"><SettingsIntegrations /></TabsContent>
        <TabsContent value="billing" className="mt-6"><SettingsBilling /></TabsContent>
        <TabsContent value="payments" className="mt-6"><SettingsPayments /></TabsContent>
        <TabsContent value="fiscal" className="mt-6"><SettingsFiscal /></TabsContent>
        <TabsContent value="notifications" className="mt-6"><SettingsNotifications /></TabsContent>
        <TabsContent value="security" className="mt-6"><SettingsSecurity /></TabsContent>
      </Tabs>
    </div>
  );
}
