import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function BillingSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
  const [status, setStatus] = useState<"polling" | "confirmed" | "timeout">("polling");
  const subscriptionId = searchParams.get("subscription_id");

  useEffect(() => {
    if (!currentWorkspace) return;

    let attempts = 0;
    const maxAttempts = 15;

    const poll = async () => {
      attempts++;
      const { data } = await supabase
        .from("workspace_subscriptions")
        .select("status, plan_code")
        .eq("workspace_id", currentWorkspace.id)
        .in("status", ["active", "trialing"])
        .maybeSingle();

      if (data) {
        setStatus("confirmed");
        toast({ title: "Assinatura ativada! 🎉", description: `Plano ${data.plan_code} ativado com sucesso.` });
        return;
      }

      if (attempts >= maxAttempts) {
        setStatus("timeout");
        return;
      }

      setTimeout(poll, 2000);
    };

    poll();
  }, [currentWorkspace]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center space-y-4">
          {status === "polling" && (
            <>
              <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
              <h2 className="text-xl font-bold text-foreground">Confirmando sua assinatura...</h2>
              <p className="text-muted-foreground text-sm">
                Estamos aguardando a confirmação do pagamento. Isso pode levar alguns segundos.
              </p>
            </>
          )}
          {status === "confirmed" && (
            <>
              <CheckCircle2 className="h-12 w-12 text-primary mx-auto" />
              <h2 className="text-xl font-bold text-foreground">Assinatura ativada!</h2>
              <p className="text-muted-foreground text-sm">
                Seu plano foi atualizado com sucesso. Aproveite todos os novos recursos!
              </p>
              <Button className="w-full" onClick={() => navigate("/dashboard")}>
                Ir para o Dashboard
              </Button>
            </>
          )}
          {status === "timeout" && (
            <>
              <CheckCircle2 className="h-12 w-12 text-muted-foreground mx-auto" />
              <h2 className="text-xl font-bold text-foreground">Pagamento em processamento</h2>
              <p className="text-muted-foreground text-sm">
                Seu pagamento está sendo processado. O plano será ativado automaticamente assim que confirmado.
              </p>
              <Button className="w-full" onClick={() => navigate("/dashboard")}>
                Ir para o Dashboard
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
