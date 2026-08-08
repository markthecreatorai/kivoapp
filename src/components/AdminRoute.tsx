import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthProvider";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

interface AdminRouteProps {
  children: ReactNode;
}

export default function AdminRoute({ children }: AdminRouteProps) {
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const logged = useRef(false);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  // Server-side role check (public.user_roles) — no client-side hardcoded emails
  useEffect(() => {
    if (loading) return;
    if (!user) {
      setAllowed(false);
      return;
    }
    let active = true;
    (supabase as any)
      .rpc("is_admin_user", { _user_id: user.id })
      .then(({ data }: { data: boolean | null }) => {
        if (active) setAllowed(Boolean(data));
      })
      .catch(() => {
        if (active) setAllowed(false);
      });
    return () => {
      active = false;
    };
  }, [user, loading]);

  useEffect(() => {
    if (allowed === false && user && !logged.current) {
      logged.current = true;
      toast({
        title: "Acesso restrito",
        description: "Você não tem permissão para acessar esta página.",
        variant: "destructive",
      });
      // Log denied access
      supabase.from("audit_logs").insert({
        action: "admin_access_denied",
        entity_type: "route",
        entity_id: window.location.pathname,
        user_id: user.id,
        workspace_id: "00000000-0000-0000-0000-000000000000",
        metadata: { route: window.location.pathname, email: user.email },
      }).then(() => {});
    }
  }, [allowed, user, toast]);

  if (loading || allowed === null) {
    return null;
  }

  if (!allowed) {
    return <Navigate to="/dashboard" replace />;
  }


  return <>{children}</>;
}
