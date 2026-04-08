import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthProvider";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { getInitials } from "@/lib/avatarUtils";

export interface UserAvatarData {
  avatarUrl: string | null;
  displayName: string;
  initials: string;
}

/**
 * Centralised hook that resolves the logged-in user's avatar.
 *
 * Priority:
 *  1. storefronts.avatar_url  (uploaded via Settings)
 *  2. user_metadata.avatar_url / picture  (OAuth providers)
 *
 * Also exposes displayName and initials for convenience.
 */
export function useUserAvatar(): UserAvatarData {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();

  const { data: storefrontAvatar } = useQuery({
    queryKey: ["user-avatar-storefront", currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return null;
      const { data } = await supabase
        .from("storefronts")
        .select("avatar_url")
        .eq("workspace_id", currentWorkspace.id)
        .maybeSingle();
      return data?.avatar_url || null;
    },
    enabled: !!currentWorkspace?.id,
    staleTime: 1000 * 60 * 10,
  });

  const avatarUrl =
    storefrontAvatar ||
    user?.user_metadata?.avatar_url ||
    user?.user_metadata?.picture ||
    null;

  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split("@")[0] ||
    "Usuário";

  const initials = getInitials(displayName, user?.email);

  return { avatarUrl, displayName, initials };
}
