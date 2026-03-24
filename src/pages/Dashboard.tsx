import React, { useState, useEffect } from "react";
import { DollarSign, TrendingUp, Receipt } from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { useAuth } from "@/contexts/AuthProvider";
import { supabase } from "@/integrations/supabase/client";

import { MetricCard } from "@/components/dashboard/MetricCard";
import { PeriodFilter } from "@/components/dashboard/PeriodFilter";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { PaymentMethodsCard } from "@/components/dashboard/PaymentMethodsCard";
import { SalesPerformanceChart } from "@/components/dashboard/SalesPerformanceChart";
import { TicketChart } from "@/components/dashboard/TicketChart";
import { OnboardingChecklist } from "@/components/dashboard/OnboardingChecklist";
import { DashboardUpgradeCard } from "@/components/dashboard/DashboardUpgradeCard";
import { EmailVerificationBanner } from "@/components/dashboard/EmailVerificationBanner";

interface Metrics {
  totalRevenue: number;
  totalSales: number;
  ticketMedio: number;
  revenueChange: number;
  salesChange: number;
}

interface ChartData {
  date: string;
  revenue: number;
  sales: number;
  ticket: number;
}

export default function Dashboard() {
  const [selectedPeriod, setSelectedPeriod] = useState<number | "custom">(30);
  const [metrics, setMetrics] = useState<Metrics>({
    totalRevenue: 0,
    totalSales: 0,
    ticketMedio: 0,
    revenueChange: 0,
    salesChange: 0,
  });
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);

  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();

  useEffect(() => {
    if (!currentWorkspace) return;

    const fetchMetrics = async () => {
      setLoading(true);
      try {
        const periodDays = selectedPeriod === "custom" ? 30 : selectedPeriod;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - periodDays);

        const prevStartDate = new Date();
        prevStartDate.setDate(prevStartDate.getDate() - periodDays * 2);
        const prevEndDate = new Date();
        prevEndDate.setDate(prevEndDate.getDate() - periodDays);

        const { data: ordersData, error } = await supabase
          .from("orders")
          .select("total_amount, created_at, payment_method")
          .eq("workspace_id", currentWorkspace.id)
          .eq("status", "PAID")
          .gte("created_at", startDate.toISOString());

        if (error) throw error;

        const totalRevenue = ordersData?.reduce((sum, o) => sum + Number(o.total_amount), 0) || 0;
        const totalSales = ordersData?.length || 0;
        const ticketMedio = totalSales > 0 ? totalRevenue / totalSales : 0;

        // Previous period
        const { data: prevData } = await supabase
          .from("orders")
          .select("total_amount")
          .eq("workspace_id", currentWorkspace.id)
          .eq("status", "PAID")
          .gte("created_at", prevStartDate.toISOString())
          .lt("created_at", prevEndDate.toISOString());

        const prevRevenue = prevData?.reduce((sum, o) => sum + Number(o.total_amount), 0) || 0;
        const revenueChange = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0;

        // Chart data
        const chart: ChartData[] = [];
        for (let i = periodDays - 1; i >= 0; i--) {
          const date = new Date();
          date.setDate(date.getDate() - i);
          const dateStr = date.toISOString().split("T")[0];

          const dayOrders = ordersData?.filter((o) => o.created_at.startsWith(dateStr)) || [];
          const dayRevenue = dayOrders.reduce((sum, o) => sum + Number(o.total_amount), 0);
          const daySales = dayOrders.length;

          chart.push({
            date: dateStr,
            revenue: dayRevenue,
            sales: daySales,
            ticket: daySales > 0 ? dayRevenue / daySales : 0,
          });
        }

        setMetrics({ totalRevenue, totalSales, ticketMedio, revenueChange, salesChange: 0 });
        setChartData(chart);
      } catch (error) {
        console.error("Erro ao buscar métricas:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, [currentWorkspace, selectedPeriod]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Email Verification */}
      <EmailVerificationBanner />
      <DashboardUpgradeCard />
      <OnboardingChecklist />

      {/* Page title + filters */}
      <div className="space-y-3">
        <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
        <PeriodFilter selectedPeriod={selectedPeriod} onPeriodChange={setSelectedPeriod} />
      </div>

      {/* 3 KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          title="Total em vendas"
          value={formatCurrency(metrics.totalRevenue)}
          change={metrics.revenueChange}
        />
        <MetricCard
          title="Total de transações"
          value={metrics.totalSales}
        />
        <MetricCard
          title="Ticket médio"
          value={formatCurrency(metrics.ticketMedio)}
        />
      </div>

      {/* Payment methods block */}
      <PaymentMethodsCard />

      {/* 2 charts side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SalesPerformanceChart data={chartData.map((d) => ({ date: d.date, sales: d.sales }))} />
        <TicketChart data={chartData.map((d) => ({ date: d.date, ticket: d.ticket }))} />
      </div>
    </div>
  );
}
