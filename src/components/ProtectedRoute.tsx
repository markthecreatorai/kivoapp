import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthProvider";
import { useWorkspace } from "@/contexts/WorkspaceProvider";

interface ProtectedRouteProps {
  children: ReactNode;
  requireWorkspace?: boolean;
  requireEmailVerification?: boolean;
}

export default function ProtectedRoute({ 
  children, 
  requireWorkspace = true,
  requireEmailVerification = true,
}: ProtectedRouteProps) {
  const { user, loading: authLoading } = useAuth();
  const { currentWorkspace, loading: workspaceLoading, fetchError } = useWorkspace();
  const location = useLocation();

  // While auth/workspace loads, render nothing — the persistent layout
  // (sidebar + topbar) stays mounted. Only the inner content is blank
  // for a brief moment, avoiding a full white-screen flash.
  if (authLoading || (user && workspaceLoading)) {
    return null;
  }

  // Redirect to login if not authenticated
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Redirect to verify-email if not confirmed (skip for OAuth users who have confirmed emails)
  if (requireEmailVerification && !user.email_confirmed_at) {
    return <Navigate to="/verify-email" replace />;
  }

  // Only redirect to onboarding if:
  // 1. A workspace IS required for this route
  // 2. Workspace finished loading (not still fetching)
  // 3. No fetch error occurred (avoid false redirect when RLS blocks the query)
  // 4. There's genuinely no workspace
  if (requireWorkspace && !workspaceLoading && !fetchError && !currentWorkspace) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}