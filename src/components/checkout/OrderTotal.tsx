import { formatCurrency } from "@/lib/utils";

interface OrderTotalProps {
  subtotal: number;
  discount: number;
  pixDiscount: number | null;
  bumpAmount: number;
  total: number;
  showPix: boolean;
}

export function OrderTotal({ subtotal, discount, pixDiscount, bumpAmount, total, showPix }: OrderTotalProps) {
  return (
    <div className="space-y-2 py-3 border-t border-border">
      <div className="flex justify-between text-sm text-muted-foreground">
        <span>Subtotal</span>
        <span>{formatCurrency(subtotal)}</span>
      </div>
      {discount > 0 && (
        <div className="flex justify-between text-sm text-green-600">
          <span>Desconto (cupom)</span>
          <span>-{formatCurrency(discount)}</span>
        </div>
      )}
      {showPix && pixDiscount && pixDiscount > 0 && (
        <div className="flex justify-between text-sm text-green-600">
          <span>Desconto PIX</span>
          <span>-{formatCurrency(pixDiscount)}</span>
        </div>
      )}
      {bumpAmount > 0 && (
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Order Bump</span>
          <span>+{formatCurrency(bumpAmount)}</span>
        </div>
      )}
      <div className="flex justify-between font-bold text-base pt-1">
        <span>Total</span>
        <span>{formatCurrency(total)}</span>
      </div>
    </div>
  );
}
