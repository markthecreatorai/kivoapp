import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Mail, RefreshCw, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { trackEvent } from "@/lib/tracking";
import { validateAuthEmail } from "@/lib/authEmailGuard";

export function EmailVerificationBanner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [dismissed, setDismissed] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown(c => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // Don't show if verified, dismissed, or no user
  if (!user || user.email_confirmed_at || dismissed) return null;

  const handleResend = () => {
    if (!user.email) return;
    const emailCheck = validateAuthEmail(user.email);
    if (!emailCheck.ok) {
      toast({ title: "Email inválido", description: emailCheck.error, variant: "destructive" });
      return;
    }
    trackEvent("auth.resend_clicked", { surface: "email_banner" });
    // O reenvio agora acontece na tela de código de 4 dígitos.
    window.location.href = `/verify-email?email=${encodeURIComponent(emailCheck.email)}`;
  };


  return (
    <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800/50 rounded-lg p-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="p-2 rounded-full bg-yellow-100 dark:bg-yellow-900/30 shrink-0">
          <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            Confirme seu email para continuar usando a plataforma
          </p>
          <p className="text-xs text-muted-foreground truncate">
            Enviamos um link de verificação para {user.email}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs h-8"
          onClick={handleResend}
          disabled={resending || cooldown > 0}
        >
          <RefreshCw className={`w-3 h-3 ${resending ? "animate-spin" : ""}`} />
          {cooldown > 0 ? `${cooldown}s` : "Reenviar"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0"
          onClick={() => setDismissed(true)}
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
