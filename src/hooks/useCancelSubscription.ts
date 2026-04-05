import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { trackEvent } from "@/lib/tracking";
import { toast } from "@/hooks/use-toast";

export function useCancelSubscription() {
  const [loading, setLoading] = useState(false);
  const { currentWorkspace } = useWorkspace();

  const cancelSubscription = async (): Promise<boolean> => {
    if (!currentWorkspace) {
      toast({ title: "Erro", description: "Workspace não encontrado.", variant: "destructive" });
      return false;
    }

    setLoading(true);
    trackEvent("subscription_cancel_requested", { workspace_id: currentWorkspace.id });

    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) {
        toast({ title: "Sessão expirada", description: "Faça login novamente.", variant: "destructive" });
        return false;
      }

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/cancel-subscription`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ workspace_id: currentWorkspace.id }),
      });

      const result = await res.json();

      if (!res.ok) {
        toast({ title: "Erro ao cancelar", description: result.error || "Tente novamente.", variant: "destructive" });
        trackEvent("subscription_cancel_failed", { error: result.error });
        return false;
      }

      toast({ title: "Assinatura cancelada", description: "Seu acesso continua até o final do período atual." });
      trackEvent("subscription_cancel_succeeded", { workspace_id: currentWorkspace.id });
      return true;
    } catch (err: any) {
      toast({ title: "Erro inesperado", description: "Tente novamente.", variant: "destructive" });
      trackEvent("subscription_cancel_failed", { error: err?.message });
      return false;
    } finally {
      setLoading(false);
    }
  };

  return { cancelSubscription, loading };
}
