import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: string | number;
  icon?: LucideIcon;
  change?: number;
  prefix?: string;
  suffix?: string;
}

export function MetricCard({ title, value, icon: Icon, change, prefix = "", suffix = "" }: MetricCardProps) {
  const formattedValue = typeof value === 'number' ? value.toLocaleString() : value;

  return (
    <Card className="bg-card border border-border/35 shadow-none rounded-lg">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            {title}
          </p>
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-xl md:text-2xl font-semibold text-foreground">
            {prefix}{formattedValue}{suffix}
          </span>
          {change !== undefined && change !== 0 && (
            <span
              className={cn(
                "text-xs font-medium",
                change >= 0 ? "text-[hsl(var(--success))]" : "text-destructive"
              )}
            >
              {change >= 0 ? "+" : ""}{change.toFixed(1)}%
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
