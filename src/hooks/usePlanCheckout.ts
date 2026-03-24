import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { trackEvent } from "@/lib/tracking";
import { toast } from "@/hooks/use-toast";

export type SourceUI = "dashboard_banner" | "locked_features_modal" | "settings_plans_modal" | "pricing_page";

interface StartCheckoutParams {
  planCode: string;
  billingCycle?: "monthly" | "annual";
  sourceUI: SourceUI;
}

export function usePlanCheckout() {
  const [loading, setLoading] = useState(false);
  const { currentWorkspace } = useWorkspace();

  const startPlanCheckout = async ({ planCode, billingCycle = "monthly", sourceUI }: StartCheckoutParams) => {
    if (!currentWorkspace) {
      toast({ title: "Erro", description: "Workspace não encontrado.", variant: "destructive" });
      return;
    }

    trackEvent("upgrade_click", { plan_code: planCode, source_ui: sourceUI, workspace_id: currentWorkspace.id });

    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        toast({ title: "Sessão expirada", description: "Faça login novamente.", variant: "destructive" });
        return;
      }

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/create-subscription-checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          workspace_id: currentWorkspace.id,
          plan_code: planCode,
          billing_cycle: billingCycle,
          origin_path: window.location.pathname,
        }),
      });

      const result = await res.json();

      if (!res.ok || !result.checkout_url) {
        const errorMsg = result.error || "Não foi possível iniciar o checkout. Tente novamente.";
        trackEvent("upgrade_checkout_failed", { plan_code: planCode, source_ui: sourceUI, error: errorMsg });
        toast({ title: "Erro ao iniciar assinatura", description: errorMsg, variant: "destructive" });
        return;
      }

      trackEvent("upgrade_checkout_created", {
        plan_code: planCode,
        source_ui: sourceUI,
        subscription_id: result.subscription_id,
        provider: result.provider,
      });

      window.location.assign(result.checkout_url);
    } catch (err: any) {
      trackEvent("upgrade_checkout_failed", { plan_code: planCode, source_ui: sourceUI, error: err?.message });
      toast({ title: "Erro inesperado", description: "Não foi possível processar agora, tente novamente em instantes.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return { startPlanCheckout, loading };
}
