import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useSearchParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getStoredAffiliateLink } from "@/hooks/useAffiliateTracking";
import { ProductSummary } from "@/components/checkout/ProductSummary";
import { CustomerForm } from "@/components/checkout/CustomerForm";
import { CouponSection } from "@/components/checkout/CouponSection";
import { PaymentTabs, type CardData } from "@/components/checkout/PaymentTabs";
import { OrderTotal } from "@/components/checkout/OrderTotal";
import { OrderBumpCard, type OrderBump } from "@/components/checkout/OrderBumpCard";
import { validateCPF } from "@/lib/cpf";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, Lock, RefreshCw } from "lucide-react";
import { trackEvent } from "@/lib/tracking";

interface Product {
  id: string;
  name: string;
  slug: string;
  thumbnail_url: string | null;
  short_description: string | null;
  sales_count: number | null;
  workspace_id: string;
}

interface Price {
  id: string;
  amount: number;
  compare_at_amount: number | null;
  pix_discount_percent: number | null;
  max_installments: number | null;
  type: string | null;
}

interface BrandingColors {
  primary: string;
  accent: string;
}

interface SubscriptionPlan {
  billing_interval: string;
  trial_days: number;
}

export default function Checkout() {
  const { productSlug } = useParams<{ productSlug: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [product, setProduct] = useState<Product | null>(null);
  const [price, setPrice] = useState<Price | null>(null);
  const [subPlan, setSubPlan] = useState<SubscriptionPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [customer, setCustomer] = useState({ name: "", email: "", cpf: "", phone: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [activeTab, setActiveTab] = useState<string>("pix");

  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [pixData, setPixData] = useState<{ qr_code: string; qr_code_url: string; expires_at: string } | null>(null);
  const [boletoData, setBoletoData] = useState<{ barcode: string; pdf_url: string; due_at?: string } | null>(null);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isRecovery, setIsRecovery] = useState(false);
  const [orderBumps, setOrderBumps] = useState<OrderBump[]>([]);
  const [selectedBumps, setSelectedBumps] = useState<Set<string>>(new Set());
  const [branding, setBranding] = useState<BrandingColors | null>(null);

  // Load product + price (supports ?session= recovery param)
  useEffect(() => {
    async function load() {
      const recoverySessionId = searchParams.get("session");

      // ── Recovery flow: restore from abandoned session ──
      if (recoverySessionId) {
        const { data: session } = await supabase
          .from("checkout_sessions")
          .select("id, email, workspace_id, coupon_code, status")
          .eq("id", recoverySessionId)
          .maybeSingle();

        if (session && session.status === "ABANDONED") {
          setSessionId(session.id);
          setIsRecovery(true);
          if (session.email) {
            setCustomer((prev) => ({ ...prev, email: session.email! }));
          }
          if (session.coupon_code) {
            setAppliedCoupon({ code: session.coupon_code, discount: 0 });
          }
          trackEvent("cart_recovery_started", { session_id: recoverySessionId }, session.workspace_id);

          // Load product from line items
          const { data: lineItems } = await supabase
            .from("checkout_line_items")
            .select("product_id")
            .eq("checkout_session_id", session.id)
            .limit(1);

          if (lineItems && lineItems.length > 0) {
            const { data: prod } = await supabase
              .from("products")
              .select("id, name, slug, thumbnail_url, short_description, sales_count, workspace_id")
              .eq("id", lineItems[0].product_id)
              .maybeSingle();

            if (prod) {
              const { data: priceData } = await supabase
                .from("prices")
                .select("id, amount, compare_at_amount, pix_discount_percent, max_installments, type")
                .eq("product_id", prod.id)
                .eq("is_default", true)
                .eq("is_active", true)
                .maybeSingle();

              if (priceData) {
                if (priceData.type === "RECURRING") {
                  const { data: planData } = await supabase
                    .from("subscription_plans")
                    .select("billing_interval, trial_days")
                    .eq("product_id", prod.id)
                    .maybeSingle();
                  if (planData) setSubPlan(planData);
                }
                setProduct(prod);
                setPrice(priceData);
                setLoading(false);
                return;
              }
            }
          }
        }
      }

      // ── Normal flow via productSlug ──
      if (!productSlug) { setNotFound(true); setLoading(false); return; }

      const { data: prod } = await supabase
        .from("products")
        .select("id, name, slug, thumbnail_url, short_description, sales_count, workspace_id")
        .eq("slug", productSlug)
        .eq("status", "PUBLISHED")
        .is("deleted_at", null)
        .maybeSingle();

      if (!prod) { setNotFound(true); setLoading(false); return; }

      const { data: priceData } = await supabase
        .from("prices")
        .select("id, amount, compare_at_amount, pix_discount_percent, max_installments, type")
        .eq("product_id", prod.id)
        .eq("is_default", true)
        .eq("is_active", true)
        .maybeSingle();

      if (!priceData) { setNotFound(true); setLoading(false); return; }

      if (priceData.type === "RECURRING") {
        const { data: planData } = await supabase
          .from("subscription_plans")
          .select("billing_interval, trial_days")
          .eq("product_id", prod.id)
          .maybeSingle();
        if (planData) setSubPlan(planData);
      }

      setProduct(prod);
      setPrice(priceData);
      setLoading(false);
      trackEvent("checkout_started", { product_id: prod.id, product_name: prod.name }, prod.workspace_id);

      // Fetch order bumps for this product
      const { data: bumpsData } = await supabase
        .from("order_bumps")
        .select("id, bump_product_id, headline, description, position")
        .eq("main_product_id", prod.id)
        .eq("is_active", true)
        .order("position");

      if (bumpsData && bumpsData.length > 0) {
        const bumpProductIds = bumpsData.map((b) => b.bump_product_id);
        const { data: bumpProducts } = await supabase
          .from("products")
          .select("id, name, thumbnail_url")
          .in("id", bumpProductIds);
        const { data: bumpPrices } = await supabase
          .from("prices")
          .select("product_id, amount")
          .in("product_id", bumpProductIds)
          .eq("is_default", true)
          .eq("is_active", true);

        const enriched: OrderBump[] = bumpsData.map((b) => {
          const bp = bumpProducts?.find((p) => p.id === b.bump_product_id);
          const bpr = bumpPrices?.find((p) => p.product_id === b.bump_product_id);
          return {
            id: b.id,
            bump_product_id: b.bump_product_id,
            headline: b.headline,
            description: b.description,
            bump_product_name: bp?.name || "Produto",
            bump_product_thumbnail: bp?.thumbnail_url || null,
            bump_price: bpr?.amount || 0,
          };
        }).filter((b) => b.bump_price > 0);
        setOrderBumps(enriched);
      }
    }
    load();
  }, [productSlug, searchParams]);

  // UTM + affiliate from sessionStorage
  const utmSource = searchParams.get("utm_source") || sessionStorage.getItem("kivo_utm_source") || undefined;
  const utmMedium = searchParams.get("utm_medium") || sessionStorage.getItem("kivo_utm_medium") || undefined;
  const utmCampaign = searchParams.get("utm_campaign") || sessionStorage.getItem("kivo_utm_campaign") || undefined;
  // Get affiliate link from localStorage (cookie-based) or sessionStorage fallback
  const affiliateLinkId = (() => {
    const stored = getStoredAffiliateLink();
    return stored?.linkId || undefined;
  })();

  // Bump toggle
  const toggleBump = useCallback((bumpProductId: string) => {
    setSelectedBumps((prev) => {
      const next = new Set(prev);
      if (next.has(bumpProductId)) {
        next.delete(bumpProductId);
        trackEvent("order_bump_removed", { bump_product_id: bumpProductId }, product?.workspace_id);
      } else {
        next.add(bumpProductId);
        trackEvent("order_bump_added", { bump_product_id: bumpProductId }, product?.workspace_id);
      }
      return next;
    });
  }, [product]);

  // Price calculations
  const bumpAmount = useMemo(
    () => orderBumps.filter((b) => selectedBumps.has(b.bump_product_id)).reduce((sum, b) => sum + b.bump_price, 0),
    [orderBumps, selectedBumps]
  );
  const subtotal = (price?.amount ?? 0) + bumpAmount;
  const couponDiscount = appliedCoupon?.discount ?? 0;
  const pixDiscountAmount = price?.pix_discount_percent ? (price.amount) * (price.pix_discount_percent / 100) : null;
  const pixTotal = pixDiscountAmount ? subtotal - couponDiscount - pixDiscountAmount : null;
  const cardTotal = subtotal - couponDiscount;
  const currentTotal = activeTab === "pix" && pixTotal ? pixTotal : cardTotal;
  const selectedBumpIds = useMemo(() => Array.from(selectedBumps), [selectedBumps]);

  // Save email on blur for checkout recovery
  const handleEmailBlur = useCallback(async () => {
    if (!customer.email || !product) return;
    try {
      const { data } = await supabase
        .from("checkout_sessions")
        .insert({
          workspace_id: product.workspace_id,
          email: customer.email,
          subtotal_amount: subtotal,
          total_amount: currentTotal,
          utm_source: utmSource,
          utm_medium: utmMedium,
          utm_campaign: utmCampaign,
        })
        .select("id")
        .single();
      if (data) setSessionId(data.id);
    } catch {}
  }, [customer.email, product, subtotal, currentTotal]);

  // Validate form
  const validate = useCallback((): boolean => {
    const errs: Record<string, string> = {};
    if (!customer.name.trim()) errs.name = "Nome é obrigatório";
    if (!customer.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email))
      errs.email = "Email inválido";
    if (!validateCPF(customer.cpf)) errs.cpf = "CPF inválido";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [customer]);

  // Coupon validation via edge function
  const handleApplyCoupon = async (code: string): Promise<boolean> => {
    if (!product || !price) return false;
    try {
      const res = await supabase.functions.invoke("validate-coupon", {
        body: {
          code,
          workspace_id: product.workspace_id,
          customer_email: customer.email || undefined,
          order_amount: price.amount,
        },
      });
      if (res.error) return false;
      const data = res.data;
      if (data?.valid) {
        setAppliedCoupon({ code: data.code, discount: data.discount });
        trackEvent("coupon_applied", { code: data.code, discount: data.discount }, product.workspace_id);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  // Payment handlers
  const handlePayPix = async () => {
    if (!validate() || !product || !price) return;
    setPaymentLoading(true);
    setPaymentError(null);
    try {
      const res = await supabase.functions.invoke("create-payment", {
        body: {
          product_id: product.id,
          price_id: price.id,
          method: "pix",
          customer: {
            name: customer.name,
            email: customer.email,
            cpf: customer.cpf.replace(/\D/g, ""),
            phone: customer.phone.replace(/\D/g, ""),
          },
          workspace_id: product.workspace_id,
          checkout_session_id: sessionId,
          coupon_code: appliedCoupon?.code,
          affiliate_link_id: affiliateLinkId,
          bump_product_ids: selectedBumpIds,
        },
      });
      if (res.error) throw new Error(res.error.message);
      const data = res.data;
      if (data?.error) throw new Error(data.error);
      if (data.order_id) setOrderId(data.order_id);
      setPixData({
        qr_code: data.pix_qr_code || "00020126580014br.gov.bcb.pix0136demo-pix-code",
        qr_code_url: data.pix_qr_code_url || "",
        expires_at: data.expires_at || new Date(Date.now() + 30 * 60000).toISOString(),
      });
    } catch (e: any) {
      setPaymentError(e.message || "Erro ao gerar PIX. Tente novamente.");
    } finally {
      setPaymentLoading(false);
    }
  };

  const handlePayCard = async (cardData: CardData) => {
    if (!validate() || !product || !price) return;
    setPaymentLoading(true);
    setPaymentError(null);
    try {
      const res = await supabase.functions.invoke("create-payment", {
        body: {
          product_id: product.id,
          price_id: price.id,
          method: "credit_card",
          customer: {
            name: customer.name,
            email: customer.email,
            cpf: customer.cpf.replace(/\D/g, ""),
            phone: customer.phone.replace(/\D/g, ""),
          },
          card: {
            number: cardData.number.replace(/\s/g, ""),
            exp_month: cardData.expiry.split("/")[0],
            exp_year: "20" + cardData.expiry.split("/")[1],
            cvv: cardData.cvv,
            holder_name: cardData.holder_name,
          },
          installments: cardData.installments,
          workspace_id: product.workspace_id,
          checkout_session_id: sessionId,
          coupon_code: appliedCoupon?.code,
          affiliate_link_id: affiliateLinkId,
          bump_product_ids: selectedBumpIds,
        },
      });
      if (res.error) throw new Error(res.error.message);
      const data = res.data;
      if (data?.error) throw new Error(data.error);
      if (data?.status === "paid" || data?.status === "authorized") {
        trackEvent("payment_succeeded", { method: "credit_card", order_id: data.order_id }, product.workspace_id);
        if (isRecovery && sessionId) {
          await supabase.from("checkout_sessions").update({ recovered_checkout: true, status: "COMPLETED", completed_at: new Date().toISOString() }).eq("id", sessionId);
          trackEvent("cart_recovered", { session_id: sessionId, order_id: data.order_id, method: "credit_card" }, product.workspace_id);
        }
        await supabase.functions.invoke("post-purchase", { body: { order_id: data.order_id } });
        navigate(`/order/success/${data.order_id}`);
      } else {
        trackEvent("payment_failed", { method: "credit_card", reason: data?.message }, product.workspace_id);
        setPaymentError(data?.message || "Pagamento recusado. Tente outro cartão.");
      }
    } catch (e: any) {
      trackEvent("payment_failed", { method: "credit_card", reason: e.message }, product.workspace_id);
      setPaymentError(e.message || "Erro ao processar pagamento.");
    } finally {
      setPaymentLoading(false);
    }
  };

  const handlePayBoleto = async () => {
    if (!validate() || !product || !price) return;
    setPaymentLoading(true);
    setPaymentError(null);
    try {
      const res = await supabase.functions.invoke("create-payment", {
        body: {
          product_id: product.id,
          price_id: price.id,
          method: "boleto",
          customer: {
            name: customer.name,
            email: customer.email,
            cpf: customer.cpf.replace(/\D/g, ""),
            phone: customer.phone.replace(/\D/g, ""),
          },
          workspace_id: product.workspace_id,
          checkout_session_id: sessionId,
          coupon_code: appliedCoupon?.code,
          affiliate_link_id: affiliateLinkId,
          bump_product_ids: selectedBumpIds,
        },
      });
      if (res.error) throw new Error(res.error.message);
      const data = res.data;
      if (data?.error) throw new Error(data.error);
      setBoletoData({
        barcode: data.boleto_barcode || "23793.38128 60000.000003 00000.000400 1 84340000012500",
        pdf_url: data.boleto_pdf_url || "",
        due_at: data.boleto_due_at || undefined,
      });
    } catch (e: any) {
      setPaymentError(e.message || "Erro ao gerar boleto.");
    } finally {
      setPaymentLoading(false);
    }
  };

  // Polling for PIX payment confirmation
  const [orderId, setOrderId] = useState<string | null>(null);

  // Poll check-payment-status every 7 seconds when PIX is active
  useEffect(() => {
    if (!pixData || paymentSuccess || !orderId) return;
    
    const pollInterval = setInterval(async () => {
      try {
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const url = `https://${projectId}.supabase.co/functions/v1/check-payment-status?order_id=${orderId}`;
        const resp = await fetch(url, {
          headers: { "apikey": apiKey },
        });
        if (!resp.ok) return;
        const data = await resp.json();
        if (data?.status === "SUCCEEDED") {
          clearInterval(pollInterval);
          setPaymentSuccess(true);
          trackEvent("payment_succeeded", { method: "pix", order_id: orderId }, product?.workspace_id);
          if (isRecovery && sessionId) {
            await supabase.from("checkout_sessions").update({ recovered_checkout: true, status: "COMPLETED", completed_at: new Date().toISOString() }).eq("id", sessionId);
            trackEvent("cart_recovered", { session_id: sessionId, order_id: orderId, method: "pix" }, product?.workspace_id);
          }
          await supabase.functions.invoke("post-purchase", { body: { order_id: orderId } });
          navigate(`/order/success/${orderId}`);
        }
      } catch {
        // Silently continue polling
      }
    }, 7000);

    return () => clearInterval(pollInterval);
  }, [pixData, paymentSuccess, orderId, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !product || !price) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 text-center">
        <h1 className="text-2xl font-bold text-foreground mb-2">Produto não encontrado</h1>
        <p className="text-muted-foreground mb-6">Este produto não existe ou não está disponível.</p>
        <Link to="/" className="text-primary hover:underline font-medium">
          ← Voltar para o início
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4 pb-28">
        {/* Header */}
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Lock className="w-3.5 h-3.5" />
          <span>Compra segura</span>
          <ShieldCheck className="w-3.5 h-3.5 text-accent" />
        </div>

        {/* Product Summary */}
        <ProductSummary product={product} price={price} />

        {/* Subscription info */}
        {subPlan && (
          <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 text-sm">
            {subPlan.trial_days > 0 ? (
              <p className="text-foreground font-medium">
                ✨ Comece grátis por {subPlan.trial_days} dias, depois{" "}
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(price.amount)}
                {subPlan.billing_interval === "monthly" ? "/mês" : subPlan.billing_interval === "quarterly" ? "/trimestre" : "/ano"}
              </p>
            ) : (
              <p className="text-foreground font-medium">
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(price.amount)}
                {subPlan.billing_interval === "monthly" ? "/mês" : subPlan.billing_interval === "quarterly" ? "/trimestre" : "/ano"}
                {" "}— Assinatura recorrente
              </p>
            )}
          </div>
        )}

        {/* Coupon */}
        <CouponSection
          appliedCoupon={appliedCoupon}
          onApply={handleApplyCoupon}
          onRemove={() => setAppliedCoupon(null)}
        />

        {/* Order Bumps */}
        {orderBumps.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              🔥 Aproveite e adicione
            </p>
            {orderBumps.map((bump) => (
              <OrderBumpCard
                key={bump.id}
                bump={bump}
                checked={selectedBumps.has(bump.bump_product_id)}
                onToggle={toggleBump}
              />
            ))}
          </div>
        )}

        {/* Customer Form */}
        <CustomerForm
          data={customer}
          onChange={setCustomer}
          onEmailBlur={handleEmailBlur}
          errors={errors}
        />

        {/* Payment */}
        <PaymentTabs
          total={currentTotal}
          pixTotal={pixTotal}
          maxInstallments={price.max_installments ?? 1}
          onPayPix={handlePayPix}
          onPayCard={handlePayCard}
          onPayBoleto={handlePayBoleto}
          pixData={pixData}
          boletoData={boletoData}
          paymentLoading={paymentLoading}
          paymentError={paymentError}
          paymentSuccess={paymentSuccess}
          onTabChange={setActiveTab}
        />

        {/* Payment error with retry - only shown if not already visible in PaymentTabs */}
        {paymentError && !paymentSuccess && activeTab !== "pix" && activeTab !== "card" && activeTab !== "boleto" && (
          <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5 space-y-2">
            <p className="text-sm text-destructive font-medium">{paymentError}</p>
            <p className="text-xs text-muted-foreground">Verifique os dados e tente novamente. Seus dados estão salvos.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPaymentError(null)}
              className="gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Tentar novamente
            </Button>
          </div>
        )}

        {/* Order Total */}
        <OrderTotal
          subtotal={price?.amount ?? 0}
          discount={couponDiscount}
          pixDiscount={activeTab === "pix" ? pixDiscountAmount : null}
          bumpAmount={bumpAmount}
          total={currentTotal}
          showPix={activeTab === "pix"}
        />

        {/* Trust signals */}
        <div className="grid grid-cols-3 gap-3 text-center pt-2">
          <div className="space-y-1">
            <ShieldCheck className="w-5 h-5 mx-auto text-accent" />
            <p className="text-[10px] text-muted-foreground leading-tight">Pagamento 100% seguro</p>
          </div>
          <div className="space-y-1">
            <Lock className="w-5 h-5 mx-auto text-accent" />
            <p className="text-[10px] text-muted-foreground leading-tight">Dados criptografados</p>
          </div>
          <div className="space-y-1">
            <RefreshCw className="w-5 h-5 mx-auto text-accent" />
            <p className="text-[10px] text-muted-foreground leading-tight">Suporte disponível</p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground pt-4">
          Feito com 💜 na{" "}
          <a href="https://kivo.com.br" className="hover:underline text-primary">Kivo</a>
        </p>
      </div>

      {/* Sticky bottom bar */}
      {!paymentSuccess && (
        <div className="fixed bottom-0 left-0 right-0 bg-card border-t p-4 md:hidden">
          <div className="max-w-lg mx-auto flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-lg font-bold text-foreground">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(currentTotal)}</p>
            </div>
            <div className="flex items-center gap-1 text-xs text-accent">
              <ShieldCheck className="w-4 h-4" />
              Pagamento seguro
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
