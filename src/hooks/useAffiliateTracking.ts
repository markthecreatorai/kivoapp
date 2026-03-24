import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const COOKIE_KEY = "kivo_affiliate_link_id";
const SESSION_KEY = "kivo_session_id";

/**
 * Tracks affiliate referral from ?ref= query param.
 * Stores affiliate_link_id in localStorage (persists across sessions for cookie duration).
 */
export function useAffiliateTracking() {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const refCode = searchParams.get("ref");
    if (!refCode) return;

    (async () => {
      try {
        // Look up the affiliate link
        const { data: link } = await supabase
          .from("affiliate_links")
          .select("id, affiliate_id")
          .eq("code", refCode)
          .maybeSingle();

        if (!link) return;

        // Get cookie duration from program
        const { data: affData } = await supabase
          .from("affiliates")
          .select("workspace_id")
          .eq("id", link.affiliate_id)
          .single();

        let cookieDays = 30;
        if (affData) {
          const { data: prog } = await supabase
            .from("affiliate_programs")
            .select("cookie_duration_days")
            .eq("workspace_id", affData.workspace_id)
            .maybeSingle();
          if (prog) cookieDays = prog.cookie_duration_days;
        }

        const expiresAt = new Date(Date.now() + cookieDays * 86400000).toISOString();

        // Store in localStorage with expiration
        localStorage.setItem(COOKIE_KEY, JSON.stringify({
          linkId: link.id,
          affiliateId: link.affiliate_id,
          expiresAt,
        }));

        // Also keep in sessionStorage for backward compat
        sessionStorage.setItem("kivo_affiliate_link_id", link.id);

        // Increment click count (fire and forget)
        const { data: current } = await supabase
          .from("affiliate_links")
          .select("click_count")
          .eq("id", link.id)
          .single();

        if (current) {
          await supabase
            .from("affiliate_links")
            .update({ click_count: (current.click_count || 0) + 1 })
            .eq("id", link.id);
        }

        // Create attribution record
        const sessionId = sessionStorage.getItem(SESSION_KEY) || crypto.randomUUID();
        sessionStorage.setItem(SESSION_KEY, sessionId);

        await supabase.from("affiliate_attributions").insert({
          affiliate_link_id: link.id,
          session_id: sessionId,
          expires_at: expiresAt,
        });
      } catch (err) {
        console.error("Affiliate tracking error:", err);
      }
    })();
  }, [searchParams]);
}

/**
 * Returns the stored affiliate link ID if cookie is still valid.
 */
export function getStoredAffiliateLink(): { linkId: string; affiliateId: string } | null {
  try {
    const raw = localStorage.getItem(COOKIE_KEY);
    if (!raw) {
      // Fallback to sessionStorage
      const sessionVal = sessionStorage.getItem("kivo_affiliate_link_id");
      return sessionVal ? { linkId: sessionVal, affiliateId: "" } : null;
    }
    const data = JSON.parse(raw);
    if (new Date(data.expiresAt) < new Date()) {
      localStorage.removeItem(COOKIE_KEY);
      return null;
    }
    return { linkId: data.linkId, affiliateId: data.affiliateId };
  } catch {
    return null;
  }
}
