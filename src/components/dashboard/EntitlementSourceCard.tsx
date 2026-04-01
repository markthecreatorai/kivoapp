import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { ShieldCheck } from "lucide-react";

interface SourceBreakdown {
  source_type: string;
  active_count: number;
  percentage: number;
}

interface Props {
  data: SourceBreakdown[];
}

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  SUBSCRIPTION: { label: "Assinatura", color: "hsl(var(--primary))" },
  PRODUCT: { label: "Produto vinculado", color: "hsl(142, 70%, 45%)" },
  ADMIN: { label: "Manual (admin)", color: "hsl(262, 80%, 55%)" },
};

export function EntitlementSourceCard({ data }: Props) {
  if (!data || data.length === 0) return null;

  const chartData = data.map((d) => ({
    name: SOURCE_LABELS[d.source_type]?.label || d.source_type,
    value: Number(d.active_count),
    color: SOURCE_LABELS[d.source_type]?.color || "hsl(var(--muted-foreground))",
  }));

  const total = data.reduce((s, d) => s + Number(d.active_count), 0);

  return (
    <Card className="bg-card border border-border/40 shadow-none rounded-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          Entitlements ativos por origem
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-6">
          <div className="w-24 h-24 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={24}
                  outerRadius={42}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                >
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="flex-1 space-y-2">
            {data.map((d) => {
              const cfg = SOURCE_LABELS[d.source_type] || { label: d.source_type, color: "hsl(var(--muted-foreground))" };
              return (
                <div key={d.source_type} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cfg.color }} />
                    <span className="text-sm text-foreground">{cfg.label}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-semibold text-foreground">{d.active_count}</span>
                    <span className="text-xs text-muted-foreground ml-1">({d.percentage}%)</span>
                  </div>
                </div>
              );
            })}
            <div className="pt-1 border-t border-border">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Total ativo</span>
                <span className="text-sm font-bold text-foreground">{total}</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
