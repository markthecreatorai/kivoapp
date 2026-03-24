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
  cpf?: string;
  customerName?: string;
}

export function usePlanCheckout() {
  const [loading, setLoading] = useState(false);
  const { currentWorkspace } = useWorkspace();

  const getToken = async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  };

  const callFunction = async (name: string, body: Record<string, unknown>, token: string) => {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    return fetch(`https://${projectId}.supabase.co/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify(body),
    });
  };

  // New subscription checkout (no existing active sub)
  const startPlanCheckout = async ({ planCode, billingCycle = "monthly", sourceUI, cpf, customerName }: StartCheckoutParams) => {
    if (!currentWorkspace) {
      toast({ title: "Erro", description: "Workspace não encontrado.", variant: "destructive" });
      return;
    }

    trackEvent("upgrade_click", { plan_code: planCode, source_ui: sourceUI, workspace_id: currentWorkspace.id });

    setLoading(true);
    try {
      const token = await getToken();
      if (!token) {
        toast({ title: "Sessão expirada", description: "Faça login novamente.", variant: "destructive" });
        return;
      }

      const res = await callFunction("create-subscription-checkout", {
        workspace_id: currentWorkspace.id,
        plan_code: planCode,
        billing_cycle: billingCycle,
        origin_path: window.location.pathname,
      }, token);

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

  // Mid-cycle upgrade (existing active sub -> higher plan)
  const upgradeMidCycle = async ({ planCode, sourceUI }: { planCode: string; sourceUI: SourceUI }): Promise<boolean> => {
    if (!currentWorkspace) {
      toast({ title: "Erro", description: "Workspace não encontrado.", variant: "destructive" });
      return false;
    }

    trackEvent("upgrade_midcycle_click", { plan_code: planCode, source_ui: sourceUI, workspace_id: currentWorkspace.id });

    setLoading(true);
    try {
      const token = await getToken();
      if (!token) {
        toast({ title: "Sessão expirada", description: "Faça login novamente.", variant: "destructive" });
        return false;
      }

      const res = await callFunction("upgrade-subscription-midcycle", {
        workspace_id: currentWorkspace.id,
        target_plan_code: planCode,
        source_ui: sourceUI,
      }, token);

      const result = await res.json();

      if (!res.ok) {
        trackEvent("upgrade_midcycle_failed", { plan_code: planCode, source_ui: sourceUI, error: result.error });
        toast({ title: "Erro ao fazer upgrade", description: result.error || "Tente novamente.", variant: "destructive" });
        return false;
      }

      trackEvent("upgrade_midcycle_succeeded", {
        plan_code: planCode,
        source_ui: sourceUI,
        status: result.status,
      });

      toast({ title: "Upgrade realizado! 🎉", description: `Seu plano foi atualizado para ${planCode === "creator-pro" ? "Creator Pro" : "Creator"}.` });
      return true;
    } catch (err: any) {
      trackEvent("upgrade_midcycle_failed", { plan_code: planCode, source_ui: sourceUI, error: err?.message });
      toast({ title: "Erro inesperado", description: "Não foi possível processar agora, tente novamente em instantes.", variant: "destructive" });
      return false;
    } finally {
      setLoading(false);
    }
  };

  return { startPlanCheckout, upgradeMidCycle, loading };
}
