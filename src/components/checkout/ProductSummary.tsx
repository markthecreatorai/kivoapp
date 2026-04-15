import { formatCurrency } from "@/lib/utils";

interface ProductSummaryProps {
  product: {
    name: string;
    thumbnail_url: string | null;
    short_description: string | null;
    sales_count: number | null;
  };
  price: {
    amount: number;
    compare_at_amount: number | null;
    pix_discount_percent: number | null;
  };
}

export function ProductSummary({ product, price }: ProductSummaryProps) {
  const pixPrice = price.pix_discount_percent
    ? price.amount * (1 - price.pix_discount_percent / 100)
    : null;

  return (
    <div className="flex gap-4 p-4 bg-card rounded-xl border">
      {product.thumbnail_url && (
        <img
          src={product.thumbnail_url}
          alt={product.name}
          className="w-20 h-20 rounded-lg object-cover shrink-0"
        />
      )}
      <div className="flex-1 min-w-0">
        <h1 className="text-lg font-bold text-foreground leading-tight">{product.name}</h1>
        {product.short_description && (
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{product.short_description}</p>
        )}
        {price.amount > 0 && (
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {price.compare_at_amount && price.compare_at_amount > price.amount && (
              <span className="text-sm text-muted-foreground line-through">
                {formatCurrency(price.compare_at_amount)}
              </span>
            )}
            <span className="text-xl font-bold text-foreground">{formatCurrency(price.amount)}</span>
            {pixPrice && (
              <span className="text-xs font-semibold bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                PIX: {formatCurrency(pixPrice)}
              </span>
            )}
          </div>
        )}
        {(product.sales_count ?? 0) > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            🔥 {product.sales_count} pessoas compraram
          </p>
        )}
      </div>
    </div>
  );
}
