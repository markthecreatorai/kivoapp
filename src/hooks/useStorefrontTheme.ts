import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";

export interface StorefrontThemeTokens {
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  fontBody: string;
  buttonStyle: "rounded" | "pill" | "square";
  buttonRadius: string;
}

const DEFAULTS: StorefrontThemeTokens = {
  primaryColor: "#F9423A",
  backgroundColor: "#ffffff",
  textColor: "#1a1a1a",
  fontBody: "Inter",
  buttonStyle: "rounded",
  buttonRadius: "0.75rem",
};

function getButtonRadius(style?: string | null): string {
  switch (style) {
    case "pill":   return "9999px";
    case "square": return "0px";
    default:       return "0.75rem"; // rounded
  }
}

/**
 * Returns the current storefront theme tokens for live preview use.
 * Falls back to sensible Kivo defaults when no theme is configured.
 */
export function useStorefrontTheme(): StorefrontThemeTokens {
  const { currentWorkspace } = useWorkspace();

  // 1. Fetch storefront for this workspace
  const { data: storefront } = useQuery({
    queryKey: ["storefront-for-theme", currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return null;
      const { data } = await supabase
        .from("storefronts")
        .select("id")
        .eq("workspace_id", currentWorkspace.id)
        .single();
      return data;
    },
    enabled: !!currentWorkspace?.id,
    staleTime: 60_000,
  });

  // 2. Fetch theme for that storefront
  const { data: theme } = useQuery({
    queryKey: ["storefront-theme-tokens", storefront?.id],
    queryFn: async () => {
      if (!storefront?.id) return null;
      const { data } = await supabase
        .from("storefront_themes")
        .select("primary_color, background_color, text_color, font_body, button_style")
        .eq("storefront_id", storefront.id)
        .single();
      return data;
    },
    enabled: !!storefront?.id,
    staleTime: 60_000,
  });

  if (!theme) return DEFAULTS;

  const style = (theme.button_style ?? "rounded") as StorefrontThemeTokens["buttonStyle"];

  return {
    primaryColor:     theme.primary_color     || DEFAULTS.primaryColor,
    backgroundColor:  theme.background_color  || DEFAULTS.backgroundColor,
    textColor:        theme.text_color        || DEFAULTS.textColor,
    fontBody:         theme.font_body         || DEFAULTS.fontBody,
    buttonStyle:      style,
    buttonRadius:     getButtonRadius(style),
  };
}
