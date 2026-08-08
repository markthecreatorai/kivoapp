import { useState, useEffect, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QrCode, CreditCard, FileText, Copy, Check, Loader2, Clock } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { formatCardNumber, formatExpiry, detectCardBrand, validateCardFields, expectedCvcLength, type CardValidationErrors } from "@/lib/cpf";
import { supabase } from "@/integrations/supabase/client";

interface InstallmentOption {
  number: number;
  value: number;
  total: number;
  interest_rate: number;
  has_interest: boolean;
}

interface PaymentTabsProps {
  total: number;
  pixTotal: number | null;
  maxInstallments: number;
  onPayPix: () => Promise<void>;
  onPayCard: (payload: CardTokenPayload) => Promise<void>;
  onPayBoleto: () => Promise<void>;
  /** Dados do titular usados apenas para a tokenização do cartão */
  customer?: { name: string; email: string; cpf: string; phone?: string };
  pixData: { qr_code: string; qr_code_url: string; expires_at: string } | null;
  boletoData: { barcode: string; pdf_url: string; due_at?: string } | null;
  paymentLoading: boolean;
  paymentError: string | null;
  paymentSuccess: boolean;
  onTabChange?: (tab: string) => void;
}

export interface CardData {
  number: string;
  expiry: string;
  cvv: string;
  holder_name: string;
  installments: number;
}

/** Único payload de cartão que sai deste componente para o backend de pedidos */
export interface CardTokenPayload {
  card_token: string;
  card_last4: string;
  card_brand: string;
  installments: number;
}


function PixCountdown({ expiresAt, onExpired }: { expiresAt: string; onExpired: () => void }) {
  const [timeLeft, setTimeLeft] = useState("");
  const expiredRef = useRef(false);

  useEffect(() => {
    const target = new Date(expiresAt).getTime();
    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) {
        setTimeLeft("Expirado");
        if (!expiredRef.current) {
          expiredRef.current = true;
          onExpired();
        }
        return;
      }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt, onExpired]);

  return (
    <div className="flex items-center justify-center gap-2 text-sm">
      <Clock className="w-4 h-4 text-muted-foreground" />
      <span className={timeLeft === "Expirado" ? "text-destructive font-medium" : "text-muted-foreground font-mono"}>
        {timeLeft}
      </span>
    </div>
  );
}

export function PaymentTabs({
  total, pixTotal, maxInstallments,
  onPayPix, onPayCard, onPayBoleto, customer,
  pixData, boletoData, paymentLoading, paymentError, paymentSuccess,
  onTabChange
}: PaymentTabsProps) {
  const [card, setCard] = useState<CardData>({
    number: "", expiry: "", cvv: "", holder_name: "", installments: 1
  });
  const [copied, setCopied] = useState(false);
  const [pixExpired, setPixExpired] = useState(false);
  const [cardErrors, setCardErrors] = useState<CardValidationErrors>({});
  const [tokenizing, setTokenizing] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [installmentOptions, setInstallmentOptions] = useState<InstallmentOption[]>([]);
  const [loadingInstallments, setLoadingInstallments] = useState(false);

  // Troca os dados do cartão por um token do gateway. O PAN/CVV nunca
  // chega ao create-payment nem é persistido em nenhum estado global.
  const tokenizeAndPay = async () => {
    const errs = validateCardFields(card);
    setCardErrors(errs);
    setTokenError(null);
    if (Object.keys(errs).length > 0) return;
    if (!customer?.name || !customer?.email || !customer?.cpf) {
      setTokenError("Preencha seus dados antes de pagar com cartão.");
      return;
    }

    setTokenizing(true);
    try {
      const [expMonth, expYear] = card.expiry.split("/");
      const res = await supabase.functions.invoke("tokenize-card", {
        body: {
          customer: {
            name: customer.name,
            email: customer.email,
            cpf: customer.cpf.replace(/\D/g, ""),
            phone: customer.phone?.replace(/\D/g, ""),
          },
          card: {
            number: card.number.replace(/\D/g, ""),
            exp_month: expMonth,
            exp_year: expYear,
            cvv: card.cvv.replace(/\D/g, ""),
            holder_name: card.holder_name,
          },
        },
      });
      const data: any = res.data;
      if (res.error || data?.error || !data?.card_token) {
        throw new Error(data?.error || res.error?.message || "Não foi possível validar o cartão.");
      }

      // Limpa dados sensíveis do formulário imediatamente após tokenizar
      setCard((prev) => ({ ...prev, number: "", cvv: "" }));

      await onPayCard({
        card_token: data.card_token,
        card_last4: data.card_last4,
        card_brand: data.card_brand,
        installments: card.installments,
      });
    } catch (e: any) {
      setTokenError(e?.message || "Não foi possível validar o cartão.");
    } finally {
      setTokenizing(false);
    }
  };


  useEffect(() => {
    if (maxInstallments <= 1 || total <= 0) {
      setInstallmentOptions([{ number: 1, value: total, total, interest_rate: 0, has_interest: false }]);
      return;
    }

    let cancelled = false;
    setLoadingInstallments(true);

    (async () => {
      try {
        const res = await supabase.functions.invoke("simulate-installments", {
          body: { amount: total, max_installments: maxInstallments },
        });
        if (cancelled) return;
        if (res.data?.installments?.length) {
          setInstallmentOptions(res.data.installments);
        } else {
          setInstallmentOptions(
            Array.from({ length: maxInstallments }, (_, i) => ({
              number: i + 1,
              value: Math.round((total / (i + 1)) * 100) / 100,
              total,
              interest_rate: 0,
              has_interest: false,
            }))
          );
        }
      } catch {
        setInstallmentOptions(
          Array.from({ length: maxInstallments }, (_, i) => ({
            number: i + 1,
            value: Math.round((total / (i + 1)) * 100) / 100,
            total,
            interest_rate: 0,
            has_interest: false,
          }))
        );
      } finally {
        if (!cancelled) setLoadingInstallments(false);
      }
    })();

    return () => { cancelled = true; };
  }, [total, maxInstallments]);

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const brand = detectCardBrand(card.number);
  const cvcMax = expectedCvcLength(brand);
  const selectedOption = installmentOptions.find(o => o.number === card.installments) || installmentOptions[0];
  const cardTotal = selectedOption?.total || total;

  const formatInstallmentLabel = (opt: InstallmentOption) => {
    if (opt.number === 1) return `1x de ${formatCurrency(opt.value)} (sem juros)`;
    if (opt.has_interest) return `${opt.number}x de ${formatCurrency(opt.value)} (total ${formatCurrency(opt.total)})`;
    return `${opt.number}x de ${formatCurrency(opt.value)} (sem juros)`;
  };

  if (paymentSuccess) {
    return (
      <div className="py-8 text-center">
        <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Check className="w-7 h-7 text-green-600" />
        </div>
        <h3 className="text-lg font-bold text-foreground">Pagamento confirmado! 🎉</h3>
        <p className="text-sm text-muted-foreground mt-2">Você receberá os detalhes por email em instantes.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Dados do pagamento</p>

      <Tabs defaultValue="pix" onValueChange={(v) => onTabChange?.(v)}>
        <TabsList className="w-full grid grid-cols-3 bg-transparent border border-border rounded-lg h-10">
          <TabsTrigger value="pix" className="text-xs gap-1 data-[state=active]:bg-muted rounded-md"><QrCode className="w-3.5 h-3.5" />PIX</TabsTrigger>
          <TabsTrigger value="card" className="text-xs gap-1 data-[state=active]:bg-muted rounded-md"><CreditCard className="w-3.5 h-3.5" />Cartão</TabsTrigger>
          <TabsTrigger value="boleto" className="text-xs gap-1 data-[state=active]:bg-muted rounded-md"><FileText className="w-3.5 h-3.5" />Boleto</TabsTrigger>
        </TabsList>

        <TabsContent value="pix" className="mt-4 space-y-4">
          {pixData && !pixExpired ? (
            <div className="text-center space-y-4">
              <p className="text-sm font-semibold text-foreground">⏳ Aguardando pagamento PIX</p>
              <PixCountdown expiresAt={pixData.expires_at} onExpired={() => setPixExpired(true)} />
              {pixData.qr_code_url && (
                <img src={pixData.qr_code_url} alt="QR Code PIX" className="w-48 h-48 mx-auto rounded-lg border" />
              )}
              <div className="bg-muted/50 p-3 rounded-lg">
                <p className="text-[10px] text-muted-foreground mb-1">Código Copia e Cola</p>
                <p className="text-xs text-foreground break-all font-mono select-all leading-relaxed">{pixData.qr_code}</p>
              </div>
              <Button onClick={() => copyToClipboard(pixData.qr_code)} variant="outline" className="w-full">
                {copied ? <><Check className="w-4 h-4 mr-2" /> Copiado!</> : <><Copy className="w-4 h-4 mr-2" /> Copiar código PIX</>}
              </Button>
              <div className="flex items-center gap-2 justify-center">
                <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Confirmação automática ao pagar</p>
              </div>
            </div>
          ) : pixExpired ? (
            <div className="text-center space-y-3">
              <p className="text-sm text-destructive font-medium">QR Code expirado</p>
              <Button onClick={() => { setPixExpired(false); onPayPix(); }} disabled={paymentLoading} className="w-full bg-green-500 hover:bg-green-600 text-white rounded-full h-12 text-base font-bold">
                {paymentLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Gerar novo PIX"}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {pixTotal && (
                <p className="text-sm text-center text-green-600 font-medium">
                  Pague via PIX por apenas {formatCurrency(pixTotal)}
                </p>
              )}
              <Button
                onClick={onPayPix}
                disabled={paymentLoading}
                className="w-full bg-green-500 hover:bg-green-600 text-white rounded-full h-12 text-base font-bold"
              >
                {paymentLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : `Gerar PIX ${formatCurrency(pixTotal ?? total)}`}
              </Button>
            </div>
          )}
          {paymentError && <p className="text-sm text-destructive text-center">{paymentError}</p>}
        </TabsContent>

        <TabsContent value="card" className="mt-4 space-y-3">
          <div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
            <div>
              <Input
                value={card.holder_name}
                onChange={(e) => { setCard({ ...card, holder_name: e.target.value.toUpperCase() }); setCardErrors(prev => ({ ...prev, holder_name: undefined })); }}
                placeholder="Nome no cartão"
                className={`border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 h-11 ${cardErrors.holder_name ? 'bg-red-50' : ''}`}
              />
              {cardErrors.holder_name && <p className="text-xs text-destructive px-3 pb-1">{cardErrors.holder_name}</p>}
            </div>
            <div>
              <div className="relative">
                <Input
                  value={card.number}
                  onChange={(e) => { setCard({ ...card, number: formatCardNumber(e.target.value) }); setCardErrors(prev => ({ ...prev, number: undefined })); }}
                  placeholder="Número do cartão"
                  inputMode="numeric"
                  className={`border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 h-11 pr-16 ${cardErrors.number ? 'bg-red-50' : ''}`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground uppercase">
                  {brand !== 'generic' ? brand : ''}
                </span>
              </div>
              {cardErrors.number && <p className="text-xs text-destructive px-3 pb-1">{cardErrors.number}</p>}
            </div>
            <div>
              <div className="flex divide-x divide-border">
                <Input
                  value={card.expiry}
                  onChange={(e) => { setCard({ ...card, expiry: formatExpiry(e.target.value) }); setCardErrors(prev => ({ ...prev, expiry: undefined })); }}
                  placeholder="MM/AA"
                  inputMode="numeric"
                  className={`border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 h-11 flex-1 ${cardErrors.expiry ? 'bg-red-50' : ''}`}
                />
                <Input
                  value={card.cvv}
                  onChange={(e) => { setCard({ ...card, cvv: e.target.value.replace(/\D/g, '').slice(0, cvcMax) }); setCardErrors(prev => ({ ...prev, cvv: undefined })); }}
                  placeholder="CVC"
                  inputMode="numeric"
                  className={`border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 h-11 w-24 ${cardErrors.cvv ? 'bg-red-50' : ''}`}
                />
              </div>
              {(cardErrors.expiry || cardErrors.cvv) && (
                <div className="flex px-3 pb-1 gap-4">
                  {cardErrors.expiry && <p className="text-xs text-destructive flex-1">{cardErrors.expiry}</p>}
                  {cardErrors.cvv && <p className="text-xs text-destructive w-24">{cardErrors.cvv}</p>}
                </div>
              )}
            </div>
          </div>

          {maxInstallments > 1 && (
            <div>
              {loadingInstallments ? (
                <div className="h-11 flex items-center justify-center border rounded-lg">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mr-2" />
                  <span className="text-xs text-muted-foreground">Calculando parcelas...</span>
                </div>
              ) : (
                <Select
                  value={String(card.installments)}
                  onValueChange={(v) => setCard({ ...card, installments: parseInt(v) })}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {installmentOptions.map((opt) => (
                      <SelectItem key={opt.number} value={String(opt.number)}>
                        {formatInstallmentLabel(opt)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedOption?.has_interest && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Total com juros: {formatCurrency(selectedOption.total)}
                  {selectedOption.interest_rate > 0 && ` (${selectedOption.interest_rate.toFixed(2)}% a.m.)`}
                </p>
              )}
            </div>
          )}

          <Button
            onClick={tokenizeAndPay}
            disabled={paymentLoading || tokenizing || loadingInstallments}
            className="w-full bg-green-500 hover:bg-green-600 text-white rounded-full h-12 text-base font-bold"
          >
            {(paymentLoading || tokenizing) ? <Loader2 className="w-5 h-5 animate-spin" /> : `Pagar ${formatCurrency(cardTotal)}`}
          </Button>
          {(tokenError || paymentError) && (
            <p className="text-sm text-destructive text-center">{tokenError || paymentError}</p>
          )}

        </TabsContent>

        <TabsContent value="boleto" className="mt-4 space-y-4">
          {boletoData ? (
            <div className="space-y-3">
              <div className="bg-muted/50 p-3 rounded-lg">
                <p className="text-xs font-mono break-all">{boletoData.barcode}</p>
              </div>
              <Button onClick={() => copyToClipboard(boletoData.barcode)} variant="outline" className="w-full">
                {copied ? <><Check className="w-4 h-4 mr-2" /> Copiado!</> : <><Copy className="w-4 h-4 mr-2" /> Copiar linha digitável</>}
              </Button>
              {boletoData.pdf_url && (
                <a href={boletoData.pdf_url} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" className="w-full">
                    <FileText className="w-4 h-4 mr-2" /> Ver PDF do boleto
                  </Button>
                </a>
              )}
              <p className="text-xs text-muted-foreground text-center">
                {boletoData.due_at
                  ? `Vencimento: ${new Date(boletoData.due_at).toLocaleDateString("pt-BR")}. O acesso será liberado após confirmação.`
                  : "Seu boleto vence em 3 dias úteis. O acesso será liberado após confirmação."}
              </p>
            </div>
          ) : (
            <Button
              onClick={onPayBoleto}
              disabled={paymentLoading}
              className="w-full bg-green-500 hover:bg-green-600 text-white rounded-full h-12 text-base font-bold"
            >
              {paymentLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : `Gerar Boleto ${formatCurrency(total)}`}
            </Button>
          )}
          {paymentError && <p className="text-sm text-destructive text-center">{paymentError}</p>}
        </TabsContent>
      </Tabs>
    </div>
  );
}
