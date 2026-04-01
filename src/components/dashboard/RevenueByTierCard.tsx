import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Crown } from "lucide-react";

interface TierRevenue {
  tier_id: string;
  tier_name: string;
  community_name: string;
  total_revenue: number;
  member_count: number;
}

interface Props {
  data: TierRevenue[];
  formatCurrency: (v: number) => string;
}

export function RevenueByTierCard({ data, formatCurrency }: Props) {
  if (!data || data.length === 0) return null;

  const maxRevenue = Math.max(...data.map((d) => Number(d.total_revenue)), 1);

  return (
    <Card className="bg-card border border-border/40 shadow-none rounded-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Crown className="h-4 w-4 text-muted-foreground" />
          Top tiers por receita
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.map((t, i) => {
          const pct = (Number(t.total_revenue) / maxRevenue) * 100;
          return (
            <div key={t.tier_id} className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0 mr-2">
                  <span className="text-sm text-foreground font-medium truncate block">
                    {i + 1}. {t.tier_name}
                  </span>
                  <span className="text-xs text-muted-foreground">{t.community_name}</span>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-sm font-semibold text-foreground">{formatCurrency(Number(t.total_revenue))}</span>
                  <span className="text-xs text-muted-foreground ml-1">({t.member_count} membros)</span>
                </div>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all bg-primary"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
