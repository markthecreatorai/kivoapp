import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface SalesPerformanceChartProps {
  data: Array<{ date: string; sales: number }>;
}

export function SalesPerformanceChart({ data }: SalesPerformanceChartProps) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat("pt-BR", { month: "short", day: "numeric" }).format(date);
  };

  return (
    <Card className="bg-card border border-border/40 shadow-none rounded-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Desempenho de vendas</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">
          {data.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  className="text-[10px]"
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  className="text-[10px]"
                  axisLine={false}
                  tickLine={false}
                  width={30}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(value: number) => [value, "Vendas"]}
                  labelFormatter={(label) => formatDate(label)}
                />
                <Bar
                  dataKey="sales"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center">
              <p className="text-sm text-muted-foreground">Sem dados no período</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
