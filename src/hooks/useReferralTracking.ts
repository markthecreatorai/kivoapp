import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import Cookies from "js-cookie";

export const REFERRAL_COOKIE_NAME = "kivo_referral_code";
export const REFERRAL_COOKIE_DAYS = 90;

export function useReferralTracking() {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // Procura por ?ref=codigo na URL
    const refCode = searchParams.get("ref");
    
    if (refCode) {
      // Salva o código de indicação no cookie por 90 dias
      Cookies.set(REFERRAL_COOKIE_NAME, refCode, { 
        expires: REFERRAL_COOKIE_DAYS,
        path: "/",
        sameSite: "Lax", // Permitir cross-site seguro
        secure: window.location.protocol === "https:"
      });
      
      console.log(`[Referral Tracking] Referral code captured: ${refCode}`);
      
      // Opcional: registrar o clique imediato no banco de dados (tracker_clicks)
      // para exibir na métrica de cliques do afiliado.
    }
  }, [searchParams]);
}
