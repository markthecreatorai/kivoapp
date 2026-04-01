import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Store, Users, BookOpen, HelpCircle } from "lucide-react";

interface SourceData {
  source_type: string;
  total_revenue: number;
  order_count: number;
}

interface Props {
  data: SourceData[];
  formatCurrency: (v: number) => string;
}

const SOURCE_CONFIG: Record<string, { label: string; color: string; icon: typeof Store }> = {
  store: { label: "Loja", color: "hsl(var(--primary))", icon: Store },
  community: { label: "Comunidade", color: "hsl(262, 80%, 55%)", icon: Users },
  course: { label: "Cursos", color: "hsl(142, 70%, 45%)", icon: BookOpen },
  other: { label: "Outros", color: "hsl(var(--muted-foreground))", icon: HelpCircle },
};

export function RevenueBySourceCard({ data, formatCurrency }: Props) {
  const total = data.reduce((s, d) => s + Number(d.total_revenue), 0);

  if (total === 0) {
    return (
      <Card className="bg-card border border-border/40 shadow-none rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-foreground">Receita por origem</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma venda no período selecionado</p>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map((d) => ({
    name: SOURCE_CONFIG[d.source_type]?.label || d.source_type,
    value: Number(d.total_revenue),
    color: SOURCE_CONFIG[d.source_type]?.color || SOURCE_CONFIG.other.color,
  }));

  return (
    <Card className="bg-card border border-border/40 shadow-none rounded-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-foreground">Receita por origem</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-6">
          {/* Mini pie chart */}
          <div className="w-28 h-28 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={28}
                  outerRadius={48}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                >
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
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

          {/* Legend */}
          <div className="flex-1 space-y-2.5">
            {data.map((d) => {
              const cfg = SOURCE_CONFIG[d.source_type] || SOURCE_CONFIG.other;
              const Icon = cfg.icon;
              const pct = total > 0 ? ((Number(d.total_revenue) / total) * 100).toFixed(0) : "0";
              return (
                <div key={d.source_type} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cfg.color }} />
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm text-foreground">{cfg.label}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-semibold text-foreground">{formatCurrency(Number(d.total_revenue))}</span>
                    <span className="text-xs text-muted-foreground ml-1.5">({pct}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
