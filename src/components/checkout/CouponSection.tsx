import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronUp, Tag, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface CouponSectionProps {
  appliedCoupon: { code: string; discount: number } | null;
  onApply: (code: string) => Promise<{ ok: boolean; error?: string }>;
  onRemove: () => void;
}

export function CouponSection({ appliedCoupon, onApply, onRemove }: CouponSectionProps) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleApply = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError("");
    const result = await onApply(code.trim().toUpperCase());
    if (!result.ok) setError(result.error || "Cupom inválido ou expirado");
    setLoading(false);
  };


  if (appliedCoupon) {
    return (
      <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-xl">
        <div className="flex items-center gap-2">
          <Tag className="w-4 h-4 text-green-600" />
          <span className="text-sm font-medium text-green-800">
            {appliedCoupon.code} — {formatCurrency(appliedCoupon.discount)} de desconto
          </span>
        </div>
        <button onClick={onRemove} className="text-green-600 hover:text-green-800">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <Tag className="w-4 h-4" />
        Tem cupom de desconto?
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {open && (
        <div className="flex gap-2 mt-3">
          <Input
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(""); }}
            placeholder="CÓDIGO"
            className="h-10 uppercase"
          />
          <Button onClick={handleApply} disabled={loading} size="sm" className="h-10 px-4 shrink-0">
            {loading ? "..." : "Aplicar"}
          </Button>
        </div>
      )}
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  );
}
