import { Checkbox } from "@/components/ui/checkbox";
import { formatCurrency } from "@/lib/utils";
import { ShoppingCart } from "lucide-react";

export interface OrderBump {
  id: string;
  bump_product_id: string;
  headline: string | null;
  description: string | null;
  bump_product_name: string;
  bump_product_thumbnail: string | null;
  bump_price: number;
}

interface OrderBumpCardProps {
  bump: OrderBump;
  checked: boolean;
  onToggle: (bumpProductId: string) => void;
}

export function OrderBumpCard({ bump, checked, onToggle }: OrderBumpCardProps) {
  return (
    <label
      htmlFor={`bump-${bump.id}`}
      className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
        checked
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-dashed border-border bg-card hover:border-primary/40"
      }`}
    >
      <Checkbox
        id={`bump-${bump.id}`}
        checked={checked}
        onCheckedChange={() => onToggle(bump.bump_product_id)}
        className="mt-0.5"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <ShoppingCart className="w-4 h-4 text-primary shrink-0" />
          <p className="text-sm font-semibold text-foreground truncate">
            {bump.headline || `Adicione: ${bump.bump_product_name}`}
          </p>
        </div>
        {bump.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 mb-1">
            {bump.description}
          </p>
        )}
        <p className="text-sm font-bold text-primary">
          + {formatCurrency(bump.bump_price)}
        </p>
      </div>
      {bump.bump_product_thumbnail && (
        <img
          src={bump.bump_product_thumbnail}
          alt={bump.bump_product_name}
          className="w-14 h-14 rounded-lg object-cover shrink-0"
        />
      )}
    </label>
  );
}
