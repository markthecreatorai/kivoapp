import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthProvider";
import { isAdminUser } from "@/lib/admin";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface AdminRouteProps {
  children: ReactNode;
}

export default function AdminRoute({ children }: AdminRouteProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const logged = useRef(false);

  const allowed = isAdminUser(user);

  useEffect(() => {
    if (!allowed && user && !logged.current) {
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

  if (!allowed) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
