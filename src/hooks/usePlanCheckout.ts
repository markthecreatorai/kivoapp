import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { trackEvent } from "@/lib/tracking";
import { toast } from "@/hooks/use-toast";
import { getReferralCode, clearReferralCode } from "@/hooks/useReferralTracking";

export type SourceUI = "dashboard_banner" | "locked_features_modal" | "settings_plans_modal" | "pricing_page" | "upgrade_flow" | string;

export interface PixData {
  qr_code_image: string | null;
  copy_paste: string | null;
  expiration_date: string | null;
}

export interface CheckoutResult {
  status: "active" | "pending" | "pending_pix";
  subscription_id: string;
  provider: string;
  payment_id?: string;
  pix?: PixData | null;
  referral_attached?: boolean;
  referral_reason?: string | null;
}

interface CreditCardData {
  holderName: string;
  number: string;
  expiryMonth: string;
  expiryYear: string;
  ccv: string;
  postalCode?: string;
  addressNumber?: string;
  phone?: string;
}

interface StartCheckoutParams {
  planCode: string;
  billingCycle?: "monthly" | "annual";
  sourceUI: SourceUI;
  cpf?: string;
  customerName?: string;
  paymentMethod: "card" | "pix";
  creditCard?: CreditCardData;
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

  const startPlanCheckout = async ({
    planCode,
    billingCycle = "monthly",
    sourceUI,
    cpf,
    customerName,
    paymentMethod,
    creditCard,
  }: StartCheckoutParams): Promise<CheckoutResult | null> => {
    if (!currentWorkspace) {
      toast({ title: "Erro", description: "Workspace não encontrado.", variant: "destructive" });
      return null;
    }

    trackEvent("upgrade_checkout_created", { plan_code: planCode, source_ui: sourceUI, payment_method: paymentMethod });

    setLoading(true);
    try {
      const token = await getToken();
      if (!token) {
        toast({ title: "Sessão expirada", description: "Faça login novamente.", variant: "destructive" });
        return null;
      }

      const referralCode = getReferralCode();

      const res = await callFunction("create-subscription-checkout", {
        workspace_id: currentWorkspace.id,
        plan_code: planCode,
        billing_cycle: billingCycle,
        origin_path: window.location.pathname,
        cpf: cpf || undefined,
        customer_name: customerName || undefined,
        payment_method: paymentMethod,
        credit_card: creditCard || undefined,
        referral_code: referralCode || undefined,
      }, token);

      const result = await res.json();

      if (!res.ok) {
        const errorMsg = result.error || "Não foi possível iniciar o checkout. Tente novamente.";
        trackEvent("upgrade_checkout_failed", { plan_code: planCode, source_ui: sourceUI, error: errorMsg });
        toast({ title: "Erro ao iniciar assinatura", description: errorMsg, variant: "destructive" });
        return null;
      }

      // Only clear the referral cookie when the backend accepted the attribution
      if (referralCode && result.referral_attached) {
        clearReferralCode();
      }

      trackEvent("upgrade_checkout_succeeded", {
        plan_code: planCode,
        source_ui: sourceUI,
        subscription_id: result.subscription_id,
        status: result.status,
      });

      return result as CheckoutResult;
    } catch (err: any) {
      trackEvent("upgrade_checkout_failed", { plan_code: planCode, source_ui: sourceUI, error: err?.message });
      toast({ title: "Erro inesperado", description: "Não foi possível processar agora, tente novamente.", variant: "destructive" });
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Mid-cycle upgrade
  const upgradeMidCycle = async ({ planCode, sourceUI }: { planCode: string; sourceUI: SourceUI }): Promise<boolean> => {
    if (!currentWorkspace) {
      toast({ title: "Erro", description: "Workspace não encontrado.", variant: "destructive" });
      return false;
    }

    trackEvent("upgrade_midcycle_click", { plan_code: planCode, source_ui: sourceUI });

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

      trackEvent("upgrade_midcycle_succeeded", { plan_code: planCode, source_ui: sourceUI });
      toast({ title: "Upgrade realizado! 🎉", description: `Seu plano foi atualizado.` });
      return true;
    } catch (err: any) {
      trackEvent("upgrade_midcycle_failed", { plan_code: planCode, source_ui: sourceUI, error: err?.message });
      toast({ title: "Erro inesperado", description: "Não foi possível processar agora.", variant: "destructive" });
      return false;
    } finally {
      setLoading(false);
    }
  };

  return { startPlanCheckout, upgradeMidCycle, loading };
}
