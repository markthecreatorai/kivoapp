import { useState, useEffect, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QrCode, CreditCard, FileText, Copy, Check, Loader2, Clock } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { formatCardNumber, formatExpiry, detectCardBrand } from "@/lib/cpf";

interface PaymentTabsProps {
  total: number;
  pixTotal: number | null;
  maxInstallments: number;
  onPayPix: () => Promise<void>;
  onPayCard: (cardData: CardData) => Promise<void>;
  onPayBoleto: () => Promise<void>;
  pixData: { qr_code: string; qr_code_url: string; expires_at: string } | null;
  boletoData: { barcode: string; pdf_url: string; due_at?: string } | null;
  paymentLoading: boolean;
  paymentError: string | null;
  paymentSuccess: boolean;
}

export interface CardData {
  number: string;
  expiry: string;
  cvv: string;
  holder_name: string;
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
  onPayPix, onPayCard, onPayBoleto,
  pixData, boletoData, paymentLoading, paymentError, paymentSuccess
}: PaymentTabsProps) {
  const [card, setCard] = useState<CardData>({
    number: "", expiry: "", cvv: "", holder_name: "", installments: 1
  });
  const [copied, setCopied] = useState(false);
  const [pixExpired, setPixExpired] = useState(false);

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const brand = detectCardBrand(card.number);

  const installmentOptions = Array.from({ length: maxInstallments }, (_, i) => {
    const n = i + 1;
    const installmentValue = total / n;
    return { value: n, label: n === 1 ? `1x de ${formatCurrency(total)} (sem juros)` : `${n}x de ${formatCurrency(installmentValue)}` };
  });

  if (paymentSuccess) {
    return (
      <div className="p-6 bg-green-50 border border-green-200 rounded-xl text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Check className="w-8 h-8 text-green-600" />
        </div>
        <h3 className="text-lg font-bold text-green-800">Pagamento confirmado! 🎉</h3>
        <p className="text-sm text-green-700 mt-2">Você receberá os detalhes por email em instantes.</p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-card rounded-xl border">
      <h2 className="text-base font-semibold text-foreground mb-3">Pagamento</h2>
      <Tabs defaultValue="pix">
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="pix" className="text-xs gap-1"><QrCode className="w-3.5 h-3.5" />PIX</TabsTrigger>
          <TabsTrigger value="card" className="text-xs gap-1"><CreditCard className="w-3.5 h-3.5" />Cartão</TabsTrigger>
          <TabsTrigger value="boleto" className="text-xs gap-1"><FileText className="w-3.5 h-3.5" />Boleto</TabsTrigger>
        </TabsList>

        <TabsContent value="pix" className="mt-4 space-y-4">
          {pixData && !pixExpired ? (
            <div className="text-center space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-green-800">⏳ Aguardando pagamento PIX</p>
              </div>

              {/* Countdown */}
              <PixCountdown expiresAt={pixData.expires_at} onExpired={() => setPixExpired(true)} />

              {/* QR Code image */}
              {pixData.qr_code_url && (
                <img src={pixData.qr_code_url} alt="QR Code PIX" className="w-48 h-48 mx-auto rounded-lg border" />
              )}

              {/* Copy-paste code */}
              <div className="bg-muted p-3 rounded-lg">
                <p className="text-[10px] text-muted-foreground mb-1">Código Copia e Cola</p>
                <p className="text-xs text-foreground break-all font-mono select-all leading-relaxed">
                  {pixData.qr_code}
                </p>
              </div>

              <Button onClick={() => copyToClipboard(pixData.qr_code)} variant="outline" className="w-full h-12">
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
              <Button onClick={() => { setPixExpired(false); onPayPix(); }} disabled={paymentLoading} className="w-full h-12 bg-green-600 hover:bg-green-700">
                {paymentLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Gerar novo PIX"}
              </Button>
            </div>
          ) : (
            <div className="text-center space-y-3">
              {pixTotal && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-sm text-green-800 font-semibold">
                    Pague via PIX por apenas {formatCurrency(pixTotal)}
                  </p>
                </div>
              )}
              <Button
                onClick={onPayPix}
                disabled={paymentLoading}
                className="w-full h-14 text-base font-bold bg-green-600 hover:bg-green-700"
              >
                {paymentLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : `Gerar PIX ${formatCurrency(pixTotal ?? total)}`}
              </Button>
            </div>
          )}
          {paymentError && <p className="text-sm text-destructive text-center">{paymentError}</p>}
        </TabsContent>

        <TabsContent value="card" className="mt-4 space-y-4">
          <div className="space-y-1">
            <Label className="text-sm">Número do cartão</Label>
            <div className="relative">
              <Input
                value={card.number}
                onChange={(e) => setCard({ ...card, number: formatCardNumber(e.target.value) })}
                placeholder="0000 0000 0000 0000"
                className="h-12 pr-12"
                inputMode="numeric"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground uppercase">
                {brand !== 'generic' ? brand : ''}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-sm">Validade</Label>
              <Input
                value={card.expiry}
                onChange={(e) => setCard({ ...card, expiry: formatExpiry(e.target.value) })}
                placeholder="MM/AA"
                className="h-12"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">CVV</Label>
              <Input
                value={card.cvv}
                onChange={(e) => setCard({ ...card, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                placeholder="123"
                className="h-12"
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-sm">Nome no cartão</Label>
            <Input
              value={card.holder_name}
              onChange={(e) => setCard({ ...card, holder_name: e.target.value.toUpperCase() })}
              placeholder="NOME COMO NO CARTÃO"
              className="h-12"
            />
          </div>

          {maxInstallments > 1 && (
            <div className="space-y-1">
              <Label className="text-sm">Parcelas</Label>
              <Select
                value={String(card.installments)}
                onValueChange={(v) => setCard({ ...card, installments: parseInt(v) })}
              >
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {installmentOptions.map((opt) => (
                    <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button
            onClick={() => onPayCard(card)}
            disabled={paymentLoading}
            className="w-full h-14 text-base font-bold"
          >
            {paymentLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : `Pagar ${formatCurrency(total)}`}
          </Button>
          {paymentError && <p className="text-sm text-destructive text-center">{paymentError}</p>}
        </TabsContent>

        <TabsContent value="boleto" className="mt-4 space-y-4">
          {boletoData ? (
            <div className="space-y-4">
              <div className="bg-muted p-3 rounded-lg">
                <p className="text-xs font-mono break-all">{boletoData.barcode}</p>
              </div>
              <Button onClick={() => copyToClipboard(boletoData.barcode)} variant="outline" className="w-full h-12">
                {copied ? <><Check className="w-4 h-4 mr-2" /> Copiado!</> : <><Copy className="w-4 h-4 mr-2" /> Copiar linha digitável</>}
              </Button>
              {boletoData.pdf_url && (
                <a href={boletoData.pdf_url} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" className="w-full h-12">
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
            <div className="text-center space-y-3">
              <Button
                onClick={onPayBoleto}
                disabled={paymentLoading}
                className="w-full h-14 text-base font-bold"
              >
                {paymentLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : `Gerar Boleto ${formatCurrency(total)}`}
              </Button>
            </div>
          )}
          {paymentError && <p className="text-sm text-destructive text-center">{paymentError}</p>}
        </TabsContent>
      </Tabs>
    </div>
  );
}
