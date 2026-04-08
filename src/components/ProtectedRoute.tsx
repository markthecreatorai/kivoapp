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

  // Show a minimal loading skeleton while auth/workspace resolves
  if (authLoading || (user && workspaceLoading)) {
    return (
      <div className="p-6 space-y-6 animate-in fade-in-0 duration-200">
        <div className="space-y-2">
          <div className="h-7 w-48 rounded bg-muted animate-pulse" />
          <div className="h-4 w-72 rounded bg-muted animate-pulse" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl border bg-card p-4 space-y-3">
              <div className="h-3 w-20 rounded bg-muted animate-pulse" />
              <div className="h-6 w-16 rounded bg-muted animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
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