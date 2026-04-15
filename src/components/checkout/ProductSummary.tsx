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
  return (
    <div className="space-y-1">
      <h1 className="text-lg font-bold text-foreground leading-tight">{product.name}</h1>
      {product.short_description && (
        <p className="text-sm text-muted-foreground line-clamp-2">{product.short_description}</p>
      )}
    </div>
  );
}
