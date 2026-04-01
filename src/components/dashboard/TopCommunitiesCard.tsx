import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";

interface CommunityRevenue {
  community_id: string;
  community_name: string;
  total_revenue: number;
  order_count: number;
}

interface Props {
  data: CommunityRevenue[];
  formatCurrency: (v: number) => string;
}

export function TopCommunitiesCard({ data, formatCurrency }: Props) {
  if (!data || data.length === 0) return null;

  const maxRevenue = Math.max(...data.map((d) => Number(d.total_revenue)), 1);

  return (
    <Card className="bg-card border border-border/40 shadow-none rounded-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          Top comunidades por receita
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.map((c, i) => {
          const pct = (Number(c.total_revenue) / maxRevenue) * 100;
          return (
            <div key={c.community_id} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground font-medium truncate flex-1 mr-2">
                  {i + 1}. {c.community_name}
                </span>
                <div className="text-right shrink-0">
                  <span className="text-sm font-semibold text-foreground">{formatCurrency(Number(c.total_revenue))}</span>
                  <span className="text-xs text-muted-foreground ml-1">({c.order_count} vendas)</span>
                </div>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: "hsl(262, 80%, 55%)",
                  }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
