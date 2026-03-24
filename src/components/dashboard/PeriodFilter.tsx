import React from "react";
import { cn } from "@/lib/utils";

const periods: Array<{ label: string; value: number | "custom" }> = [
  { label: "Hoje", value: 1 },
  { label: "Esse mês", value: 30 },
  { label: "Últimos 30 dias", value: 30 },
  { label: "Últimos 90 dias", value: 90 },
  { label: "Todo o período", value: 365 },
  { label: "Personalizado", value: "custom" },
];

interface PeriodFilterProps {
  selectedPeriod: number | "custom";
  onPeriodChange: (period: number | "custom") => void;
}

export function PeriodFilter({ selectedPeriod, onPeriodChange }: PeriodFilterProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {periods.map((period) => (
        <button
          key={period.label}
          className={cn(
            "px-3 py-1.5 text-xs font-medium rounded-full border transition-all",
            selectedPeriod === period.value
              ? "bg-[hsl(var(--success-light))] text-[hsl(var(--success-light-foreground))] border-[hsl(var(--success)/0.3)]"
              : "bg-background text-muted-foreground border-border/60 hover:border-border hover:text-foreground"
          )}
          onClick={() => onPeriodChange(period.value)}
        >
          {period.label}
        </button>
      ))}
    </div>
  );
}
