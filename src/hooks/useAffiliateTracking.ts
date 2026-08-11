import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const COOKIE_KEY = "kivo_affiliate_link_id";
const SESSION_KEY = "kivo_session_id";

/**
 * Tracks affiliate referral from ?ref= query param.
 * Stores affiliate_link_id in localStorage (persists across sessions for cookie duration).
 * The tracking session id is stored too: the backend only accepts an affiliate link
 * when there is a live attribution for that exact (link, session) pair.
 */
export function useAffiliateTracking() {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const refCode = searchParams.get("ref");
    if (!refCode) return;

    (async () => {
      try {
        const sessionId = sessionStorage.getItem(SESSION_KEY) || crypto.randomUUID();
        sessionStorage.setItem(SESSION_KEY, sessionId);

        // A tabela affiliate_links não é exposta ao client: resolução via edge function
        const { data, error } = await supabase.functions.invoke("resolve-affiliate-code", {
          body: { code: refCode, session_id: sessionId },
        });

        if (error || !data?.affiliate_link_id) return;

        localStorage.setItem(
          COOKIE_KEY,
          JSON.stringify({
            linkId: data.affiliate_link_id,
            affiliateId: "",
            sessionId,
            expiresAt: data.expires_at,
          }),
        );
        sessionStorage.setItem("kivo_affiliate_link_id", data.affiliate_link_id);
      } catch (err) {
        console.error("Affiliate tracking error:", err);
      }
    })();
  }, [searchParams]);
}

/**
 * Returns the stored affiliate link ID (and the tracking session that generated
 * the attribution) if the cookie is still valid.
 */
export function getStoredAffiliateLink():
  | { linkId: string; affiliateId: string; sessionId: string | null }
  | null {
  const sessionId = (() => {
    try {
      return sessionStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  })();

  try {
    const raw = localStorage.getItem(COOKIE_KEY);
    if (!raw) {
      // Fallback to sessionStorage
      const sessionVal = sessionStorage.getItem("kivo_affiliate_link_id");
      return sessionVal ? { linkId: sessionVal, affiliateId: "", sessionId } : null;
    }
    const data = JSON.parse(raw);
    if (new Date(data.expiresAt) < new Date()) {
      localStorage.removeItem(COOKIE_KEY);
      return null;
    }
    return {
      linkId: data.linkId,
      affiliateId: data.affiliateId,
      sessionId: data.sessionId || sessionId,
    };
  } catch {
    return null;
  }
}
