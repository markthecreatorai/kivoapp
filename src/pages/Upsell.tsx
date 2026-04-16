import { useState, useEffect } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Loader2, Clock, ArrowRight, Zap } from "lucide-react";
import { trackEvent } from "@/lib/tracking";

interface UpsellOffer {
  id: string;
  trigger_product_id: string;
  upsell_product_id: string;
  type: string;
  headline: string | null;
  description: string | null;
  special_price: number;
  cta_text: string | null;
}

interface UpsellProduct {
  id: string;
  name: string;
  thumbnail_url: string | null;
  short_description: string | null;
  workspace_id: string;
}

export default function Upsell() {
  const { offerId } = useParams<{ offerId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const orderId = searchParams.get("order");

  const [offer, setOffer] = useState<UpsellOffer | null>(null);
  const [product, setProduct] = useState<UpsellProduct | null>(null);
  const [originalPrice, setOriginalPrice] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [timeLeft, setTimeLeft] = useState(15 * 60);

  // Timer
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 0) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  useEffect(() => {
    async function load() {
      if (!offerId) { setLoading(false); return; }

      const { data: offerData } = await supabase
        .from("upsell_offers")
        .select("id, trigger_product_id, upsell_product_id, type, headline, description, special_price, cta_text")
        .eq("id", offerId)
        .eq("is_active", true)
        .maybeSingle();

      if (!offerData) { navigateToSuccess(); return; }
      setOffer(offerData);

      const { data: prod } = await supabase
        .from("products")
        .select("id, name, thumbnail_url, short_description, workspace_id")
        .eq("id", offerData.upsell_product_id)
        .maybeSingle();
      setProduct(prod);

      const { data: priceData } = await supabase
        .from("prices")
        .select("amount")
        .eq("product_id", offerData.upsell_product_id)
        .eq("is_default", true)
        .eq("is_active", true)
        .maybeSingle();
      if (priceData) setOriginalPrice(priceData.amount);

      // Track upsell shown
      trackEvent("upsell_shown", {
        offer_id: offerData.id,
        offer_type: offerData.type,
        upsell_product_id: offerData.upsell_product_id,
        trigger_product_id: offerData.trigger_product_id,
        special_price: offerData.special_price,
        order_id: orderId,
      }, prod?.workspace_id);

      setLoading(false);
    }
    load();
  }, [offerId]);

  const navigateToSuccess = () => {
    if (orderId) navigate(`/order/success/${orderId}`, { replace: true });
    else navigate("/", { replace: true });
  };

  const handleAccept = async () => {
    if (!offer || !orderId) return;
    setProcessing(true);

    // Track upsell accepted
    trackEvent("upsell_accepted", {
      offer_id: offer.id,
      offer_type: offer.type,
      upsell_product_id: offer.upsell_product_id,
      trigger_product_id: offer.trigger_product_id,
      special_price: offer.special_price,
      original_price: originalPrice,
      order_id: orderId,
    }, product?.workspace_id);

    try {
      const res = await supabase.functions.invoke("create-payment", {
        body: {
          product_id: offer.upsell_product_id,
          price_id: null,
          method: "upsell",
          workspace_id: product?.workspace_id || null,
          upsell_offer_id: offer.id,
          parent_order_id: orderId,
          amount: offer.special_price,
          customer: {},
        },
      });

      if (res.error) throw new Error(res.error.message);

      trackEvent("upsell_payment_succeeded", {
        offer_id: offer.id,
        order_id: orderId,
        amount: offer.special_price,
      }, product?.workspace_id);
    } catch (e: any) {
      console.error("Upsell error:", e);
      trackEvent("upsell_payment_failed", {
        offer_id: offer.id,
        order_id: orderId,
        error: e.message,
      }, product?.workspace_id);
    }

    navigateToSuccess();
  };

  const handleDecline = async () => {
    if (!offer) { navigateToSuccess(); return; }

    // Track upsell declined
    trackEvent("upsell_declined", {
      offer_id: offer.id,
      offer_type: offer.type,
      upsell_product_id: offer.upsell_product_id,
      trigger_product_id: offer.trigger_product_id,
      special_price: offer.special_price,
      order_id: orderId,
    }, product?.workspace_id);

    // Check for downsell
    const { data: downsells } = await supabase
      .from("upsell_offers")
      .select("id")
      .eq("trigger_product_id", offer.trigger_product_id)
      .eq("type", "DOWNSELL")
      .eq("is_active", true)
      .order("position")
      .limit(1);

    if (downsells && downsells.length > 0) {
      navigate(`/upsell/${downsells[0].id}?order=${orderId}`, { replace: true });
    } else {
      navigateToSuccess();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!offer || !product) return null;

  const ctaLabel = offer.cta_text || `SIM! Eu quero por apenas ${formatCurrency(offer.special_price)}`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/50">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
        {/* Timer */}
        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 flex items-center justify-center gap-2 animate-fade-in">
          <Clock className="w-4 h-4 text-destructive" />
          <span className="text-sm font-bold text-destructive">
            Oferta expira em {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
          </span>
        </div>

        {/* Headline */}
        <div className="text-center space-y-3 animate-fade-in">
          <div className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs font-semibold px-3 py-1 rounded-full">
            <Zap className="w-3 h-3" />
            OFERTA EXCLUSIVA
          </div>
          <h1 className="text-2xl font-bold text-foreground leading-tight">
            {offer.headline || "Espere! Oferta exclusiva para você"}
          </h1>
          {offer.description && (
            <p className="text-muted-foreground">{offer.description}</p>
          )}
        </div>

        {/* Product card */}
        <div className="bg-card rounded-xl border p-5 space-y-4 animate-fade-in" style={{ animationDelay: "0.1s" }}>
          {product.thumbnail_url && (
            <img
              src={product.thumbnail_url}
              alt={product.name}
              className="w-full h-48 object-cover rounded-lg"
            />
          )}
          <h2 className="text-lg font-bold text-foreground">{product.name}</h2>
          {product.short_description && (
            <p className="text-sm text-muted-foreground">{product.short_description}</p>
          )}

          {/* Pricing */}
          <div className="flex items-center gap-3">
            {originalPrice > offer.special_price && (
              <span className="text-lg text-muted-foreground line-through">
                {formatCurrency(originalPrice)}
              </span>
            )}
            <span className="text-3xl font-bold text-primary">
              {formatCurrency(offer.special_price)}
            </span>
          </div>
        </div>

        {/* CTA */}
        <div className="space-y-3 animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <Button
            onClick={handleAccept}
            disabled={processing || timeLeft === 0}
            className="w-full h-16 text-lg font-bold bg-green-600 hover:bg-green-700 gap-2"
          >
            {processing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                {ctaLabel}
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </Button>

          <button
            onClick={handleDecline}
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
          >
            Não obrigado, continuar para meu pedido →
          </button>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground pt-4">
          Feito com 💜 na{" "}
          <a href="https://kivohub.com.br" className="hover:underline text-primary">Kivo</a>
        </p>
      </div>
    </div>
  );
}
