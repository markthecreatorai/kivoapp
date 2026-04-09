import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import Cookies from "js-cookie";
import { supabase } from "@/integrations/supabase/client";

export const REFERRAL_COOKIE_NAME = "kivo_referral_code";
export const REFERRAL_COOKIE_DAYS = 30;
const REFERRAL_LS_KEY = "kivo_referral";

interface ReferralData {
  code: string;
  expires: number; // timestamp ms
}

/** Read referral code from cookie or localStorage fallback */
export function getReferralCode(): string | null {
  const fromCookie = Cookies.get(REFERRAL_COOKIE_NAME);
  if (fromCookie) return fromCookie;

  try {
    const raw = localStorage.getItem(REFERRAL_LS_KEY);
    if (!raw) return null;
    const data: ReferralData = JSON.parse(raw);
    if (Date.now() > data.expires) {
      localStorage.removeItem(REFERRAL_LS_KEY);
      return null;
    }
    return data.code;
  } catch {
    return null;
  }
}

/** Clear referral tracking data after successful attribution */
export function clearReferralCode() {
  Cookies.remove(REFERRAL_COOKIE_NAME, { path: "/" });
  localStorage.removeItem(REFERRAL_LS_KEY);
}

export function useReferralTracking() {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const refCode = searchParams.get("ref");

    if (refCode) {
      // Last-click attribution: always overwrite existing cookie
      Cookies.set(REFERRAL_COOKIE_NAME, refCode, {
        expires: REFERRAL_COOKIE_DAYS,
        path: "/",
        sameSite: "Lax",
        secure: window.location.protocol === "https:",
      });

      // LocalStorage fallback with expiry
      const lsData: ReferralData = {
        code: refCode,
        expires: Date.now() + REFERRAL_COOKIE_DAYS * 24 * 60 * 60 * 1000,
      };
      localStorage.setItem(REFERRAL_LS_KEY, JSON.stringify(lsData));

      console.log(`[Referral Tracking] Referral code captured (last-click): ${refCode}`);

      // Log the click event (fire-and-forget, non-blocking)
      supabase
        .from("referral_profiles")
        .select("user_id")
        .eq("referral_code", refCode)
        .maybeSingle()
        .then(({ data: profile }) => {
          if (profile?.user_id) {
            supabase.from("referral_audit_log" as any).insert({
              referrer_user_id: profile.user_id,
              event_type: "affiliate_link_clicked",
              metadata: {
                referral_code: refCode,
                landing_url: window.location.href,
                user_agent: navigator.userAgent,
              },
            } as any);
          }
        })
        .then(() => {})
        .catch(() => {});
    }
  }, [searchParams]);
}
