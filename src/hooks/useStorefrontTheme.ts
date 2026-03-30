import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";

export interface StorefrontThemeTokens {
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
  fontBody: string;
  buttonStyle: "rounded" | "pill" | "square";
  buttonRadius: string;
  cardRadius: string;
  imageRadius: string;
  spacing: string;
  cardShadow: string;
  layoutStyle: "compact" | "spacious" | "minimal";
}

const DEFAULTS: StorefrontThemeTokens = {
  primaryColor: "#F9423A",
  secondaryColor: "#1a1a1a",
  backgroundColor: "#ffffff",
  textColor: "#1a1a1a",
  fontBody: "Inter",
  buttonStyle: "rounded",
  buttonRadius: "0.75rem",
  cardRadius: "1rem",
  imageRadius: "0.75rem",
  spacing: "1rem",
  cardShadow: "0 1px 3px 0 rgb(0 0 0 / 0.1)",
  layoutStyle: "compact",
};

function getButtonRadius(style?: string | null): string {
  switch (style) {
    case "pill":   return "9999px";
    case "square": return "0px";
    default:       return "0.75rem"; // rounded
  }
}

function getCardRadius(style?: string | null): string {
  switch (style) {
    case "pill":   return "1.5rem";
    case "square": return "0.25rem";
    default:       return "1rem"; // rounded
  }
}

function getImageRadius(style?: string | null): string {
  switch (style) {
    case "pill":   return "1rem";
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
        .select("primary_color, secondary_color, background_color, text_color, font_body, button_style, custom_css")
        .eq("storefront_id", storefront.id)
        .single();
      return data;
    },
    enabled: !!storefront?.id,
    staleTime: 60_000,
  });

  if (!theme) return DEFAULTS;

  const style = (theme.button_style ?? "rounded") as StorefrontThemeTokens["buttonStyle"];

  // Parse layout style from custom_css if present
  const layoutStyle = theme.custom_css?.includes("layout:spacious") 
    ? "spacious" 
    : theme.custom_css?.includes("layout:minimal")
    ? "minimal"
    : "compact";

  return {
    primaryColor:     theme.primary_color     || DEFAULTS.primaryColor,
    secondaryColor:   theme.secondary_color   || DEFAULTS.secondaryColor,
    backgroundColor:  theme.background_color  || DEFAULTS.backgroundColor,
    textColor:        theme.text_color        || DEFAULTS.textColor,
    fontBody:         theme.font_body         || DEFAULTS.fontBody,
    buttonStyle:      style,
    buttonRadius:     getButtonRadius(style),
    cardRadius:       getCardRadius(style),
    imageRadius:      getImageRadius(style),
    spacing:          layoutStyle === "spacious" ? "1.5rem" : layoutStyle === "minimal" ? "0.5rem" : "1rem",
    cardShadow:       layoutStyle === "minimal" ? "none" : "0 1px 3px 0 rgb(0 0 0 / 0.1)",
    layoutStyle:      layoutStyle as StorefrontThemeTokens["layoutStyle"],
  };
}
