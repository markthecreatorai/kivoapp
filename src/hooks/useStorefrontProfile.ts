import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";

export interface StorefrontProfile {
  title: string;
  bio: string | null;
  avatarUrl: string | null;
  socialLinks: Record<string, string>;
}

const DEFAULTS: StorefrontProfile = {
  title: "Minha Loja",
  bio: null,
  avatarUrl: null,
  socialLinks: {},
};

/**
 * Returns the current storefront profile data for preview context.
 * Falls back to defaults when no storefront is configured.
 */
export function useStorefrontProfile(): StorefrontProfile {
  const { currentWorkspace } = useWorkspace();

  const { data: storefront } = useQuery({
    queryKey: ["storefront-profile", currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return null;
      const { data } = await supabase
        .from("storefronts")
        .select("title, bio, avatar_url, social_links")
        .eq("workspace_id", currentWorkspace.id)
        .single();
      return data;
    },
    enabled: !!currentWorkspace?.id,
    staleTime: 60_000,
  });

  if (!storefront) return DEFAULTS;

  return {
    title: storefront.title || DEFAULTS.title,
    bio: storefront.bio,
    avatarUrl: storefront.avatar_url,
    socialLinks: (storefront.social_links as Record<string, string>) || {},
  };
}
