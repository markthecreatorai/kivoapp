import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreditCard, QrCode, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaymentMethod {
  label: string;
  icon: React.ElementType;
  amount: number;
  count: number;
  color: string;
}

interface PaymentMethodsCardProps {
  methods?: PaymentMethod[];
  totalAmount?: number;
  totalCount?: number;
}

const defaultMethods: PaymentMethod[] = [
  { label: "Cartão de crédito", icon: CreditCard, amount: 0, count: 0, color: "hsl(var(--primary))" },
  { label: "Pix", icon: Smartphone, amount: 0, count: 0, color: "hsl(var(--success))" },
  { label: "Pix QR Code", icon: QrCode, amount: 0, count: 0, color: "hsl(142 71% 65%)" },
];

export function PaymentMethodsCard({
  methods = defaultMethods,
  totalAmount = 0,
  totalCount = 0,
}: PaymentMethodsCardProps) {
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const total = methods.reduce((s, m) => s + m.amount, 0) || 1;

  return (
    <Card className="bg-card border border-border/35 shadow-none rounded-lg">
      <CardHeader className="pb-3 px-4 pt-4">
        <CardTitle className="text-sm font-semibold">Métodos de pagamento</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-4 pb-4">
        {/* Distribution bar */}
        <div className="flex h-2.5 rounded-full overflow-hidden bg-muted">
          {methods.map((m, i) => {
            const pct = (m.amount / total) * 100;
            if (pct <= 0) return null;
            return (
              <div
                key={i}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{ width: `${pct}%`, backgroundColor: m.color }}
              />
            );
          })}
        </div>

        {/* Method rows */}
        <div className="space-y-3">
          {methods.map((m, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: m.color }}
                />
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <m.icon className="h-4 w-4 text-muted-foreground" />
                  <span>{m.label}</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-sm font-semibold text-foreground">
                  {formatCurrency(m.amount)}
                </span>
                <span className="text-xs text-muted-foreground ml-2">
                  ({m.count})
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Total */}
        <div className="flex items-center justify-between border-t border-border/40 pt-3">
          <span className="text-sm font-semibold text-foreground">Total</span>
          <div className="text-right">
            <span className="text-sm font-bold text-foreground">
              {formatCurrency(totalAmount || methods.reduce((s, m) => s + m.amount, 0))}
            </span>
            <span className="text-xs text-muted-foreground ml-2">
              ({totalCount || methods.reduce((s, m) => s + m.count, 0)})
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
