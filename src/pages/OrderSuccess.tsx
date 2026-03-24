import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Loader2, Check, Download, GraduationCap, Calendar, Mail, ArrowRight } from "lucide-react";
import confetti from "canvas-confetti";

interface OrderData {
  id: string;
  order_number: string | null;
  total_amount: number;
  payment_method: string | null;
  status: string;
  created_at: string;
  paid_at: string | null;
  product_id: string | null;
}

interface ProductData {
  id: string;
  name: string;
  type: string;
  thumbnail_url: string | null;
  slug: string;
}

export default function OrderSuccess() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<OrderData | null>(null);
  const [product, setProduct] = useState<ProductData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!orderId) { setNotFound(true); setLoading(false); return; }

      const { data: orderData } = await supabase
        .from("orders")
        .select("id, order_number, total_amount, payment_method, status, created_at, paid_at, product_id")
        .eq("id", orderId)
        .maybeSingle();

      if (!orderData) { setNotFound(true); setLoading(false); return; }
      setOrder(orderData);

      if (orderData.product_id) {
        const { data: prod } = await supabase
          .from("products")
          .select("id, name, type, thumbnail_url, slug")
          .eq("id", orderData.product_id)
          .maybeSingle();
        setProduct(prod);

        // Check for upsell offers
        if (prod) {
          const { data: upsells } = await supabase
            .from("upsell_offers")
            .select("id")
            .eq("trigger_product_id", prod.id)
            .eq("is_active", true)
            .eq("type", "UPSELL")
            .order("position")
            .limit(1);

          if (upsells && upsells.length > 0) {
            // Redirect to upsell before showing success
            const redirected = sessionStorage.getItem(`upsell_shown_${orderId}`);
            if (!redirected) {
              sessionStorage.setItem(`upsell_shown_${orderId}`, "true");
              navigate(`/upsell/${upsells[0].id}?order=${orderId}`, { replace: true });
              return;
            }
          }

          // Get download URL for digital products
          if (prod.type === "DIGITAL") {
            const { data: assets } = await supabase
              .from("digital_assets")
              .select("file_url")
              .eq("product_id", prod.id)
              .limit(1);
            if (assets && assets.length > 0) {
              setDownloadUrl(assets[0].file_url);
            }
          }
        }
      }

      setLoading(false);
    }
    load();
  }, [orderId, navigate]);

  // Fire confetti on mount
  useEffect(() => {
    if (!loading && order) {
      const duration = 2000;
      const end = Date.now() + duration;
      const frame = () => {
        confetti({
          particleCount: 3,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
          colors: ["#F9423A", "#10b981", "#6366f1"],
        });
        confetti({
          particleCount: 3,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
          colors: ["#F9423A", "#10b981", "#6366f1"],
        });
        if (Date.now() < end) requestAnimationFrame(frame);
      };
      frame();
    }
  }, [loading, order]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 text-center">
        <h1 className="text-2xl font-bold text-foreground mb-2">Pedido não encontrado</h1>
        <p className="text-muted-foreground mb-6">Este pedido não existe ou o link é inválido.</p>
        <Link to="/" className="text-primary hover:underline font-medium">← Voltar ao início</Link>
      </div>
    );
  }

  const paymentMethodLabel: Record<string, string> = {
    pix: "PIX",
    credit_card: "Cartão de Crédito",
    boleto: "Boleto Bancário",
  };

  const renderDeliveryAction = () => {
    if (!product) return null;

    switch (product.type) {
      case "DIGITAL_PRODUCT":
        return (
          <Button
            onClick={() => downloadUrl && window.open(downloadUrl, "_blank")}
            disabled={!downloadUrl}
            className="w-full h-14 text-base font-bold bg-green-600 hover:bg-green-700 gap-2"
          >
            <Download className="w-5 h-5" />
            Baixar Arquivo
          </Button>
        );
      case "ECOURSE":
      case "MEMBERSHIP":
        return (
          <Button asChild className="w-full h-14 text-base font-bold gap-2">
            <Link to="/member">
              <GraduationCap className="w-5 h-5" />
              Acessar Área de Membros
            </Link>
          </Button>
        );
      case "COACHING_CALL":
        return (
          <Button className="w-full h-14 text-base font-bold gap-2">
            <Calendar className="w-5 h-5" />
            Agendar sua Sessão
          </Button>
        );
      case "LEAD_MAGNET":
        return (
          <div className="flex items-center gap-3 p-4 bg-muted rounded-xl">
            <Mail className="w-6 h-6 text-primary shrink-0" />
            <p className="text-sm text-foreground">
              Enviamos o arquivo para seu email! Verifique sua caixa de entrada.
            </p>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
        {/* Success header */}
        <div className="text-center space-y-4 animate-fade-in">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <Check className="w-10 h-10 text-green-600" strokeWidth={3} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Pagamento confirmado!</h1>
            <p className="text-muted-foreground mt-1">Obrigado pela sua compra 🎉</p>
          </div>
        </div>

        {/* Order summary */}
        <div className="bg-card rounded-xl border p-5 space-y-4 animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <h2 className="text-base font-semibold text-foreground">Resumo do pedido</h2>
          
          {product && (
            <div className="flex gap-3">
              {product.thumbnail_url && (
                <img src={product.thumbnail_url} alt={product.name} className="w-16 h-16 rounded-lg object-cover shrink-0" />
              )}
              <div>
                <p className="font-medium text-foreground">{product.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{product.type.replace(/_/g, " ").toLowerCase()}</p>
              </div>
            </div>
          )}

          <div className="space-y-2 text-sm border-t pt-3">
            {order.order_number && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pedido</span>
                <span className="font-mono text-foreground">{order.order_number}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor pago</span>
              <span className="font-bold text-foreground">{formatCurrency(order.total_amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Método</span>
              <span className="text-foreground">{paymentMethodLabel[order.payment_method || ""] || order.payment_method}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Data</span>
              <span className="text-foreground">
                {new Date(order.paid_at || order.created_at).toLocaleDateString("pt-BR", {
                  day: "2-digit", month: "long", year: "numeric"
                })}
              </span>
            </div>
          </div>
        </div>

        {/* Delivery action */}
        <div className="animate-fade-in" style={{ animationDelay: "0.2s" }}>
          {renderDeliveryAction()}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground pt-4">
          Feito com 💜 na{" "}
          <a href="https://kivo.com.br" className="hover:underline text-primary">Kivo</a>
        </p>
      </div>
    </div>
  );
}
