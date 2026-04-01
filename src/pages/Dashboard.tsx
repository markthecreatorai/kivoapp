import React, { useState, useEffect } from "react";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { useAuth } from "@/contexts/AuthProvider";
import { supabase } from "@/integrations/supabase/client";

import { MetricCard } from "@/components/dashboard/MetricCard";
import { PeriodFilter } from "@/components/dashboard/PeriodFilter";
import { PaymentMethodsCard } from "@/components/dashboard/PaymentMethodsCard";
import { SalesPerformanceChart } from "@/components/dashboard/SalesPerformanceChart";
import { TicketChart } from "@/components/dashboard/TicketChart";
import { OnboardingChecklist } from "@/components/dashboard/OnboardingChecklist";
import { DashboardUpgradeCard } from "@/components/dashboard/DashboardUpgradeCard";
import { EmailVerificationBanner } from "@/components/dashboard/EmailVerificationBanner";
import { RevenueBySourceCard } from "@/components/dashboard/RevenueBySourceCard";
import { TopCommunitiesCard } from "@/components/dashboard/TopCommunitiesCard";
import { RevenueByTierCard } from "@/components/dashboard/RevenueByTierCard";
import { EntitlementSourceCard } from "@/components/dashboard/EntitlementSourceCard";

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

interface SourceData {
  source_type: string;
  total_revenue: number;
  order_count: number;
}

interface CommunityRevenue {
  community_id: string;
  community_name: string;
  total_revenue: number;
  order_count: number;
}

interface TierRevenue {
  tier_id: string;
  tier_name: string;
  community_name: string;
  total_revenue: number;
  member_count: number;
}

interface SourceBreakdown {
  source_type: string;
  active_count: number;
  percentage: number;
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
  const [sourceData, setSourceData] = useState<SourceData[]>([]);
  const [topCommunities, setTopCommunities] = useState<CommunityRevenue[]>([]);
  const [topTiers, setTopTiers] = useState<TierRevenue[]>([]);
  const [entitlementSources, setEntitlementSources] = useState<SourceBreakdown[]>([]);
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

        const endDate = new Date();

        // Fetch orders + source breakdown + top communities in parallel
        const [ordersRes, prevRes, sourceRes, communitiesRes] = await Promise.all([
          supabase
            .from("orders")
            .select("total_amount, created_at, payment_method")
            .eq("workspace_id", currentWorkspace.id)
            .eq("status", "PAID")
            .gte("created_at", startDate.toISOString()),
          supabase
            .from("orders")
            .select("total_amount")
            .eq("workspace_id", currentWorkspace.id)
            .eq("status", "PAID")
            .gte("created_at", prevStartDate.toISOString())
            .lt("created_at", prevEndDate.toISOString()),
          supabase.rpc("get_revenue_by_source" as any, {
            p_workspace_id: currentWorkspace.id,
            p_start_date: startDate.toISOString(),
            p_end_date: endDate.toISOString(),
          }),
          supabase.rpc("get_top_communities_revenue" as any, {
            p_workspace_id: currentWorkspace.id,
            p_start_date: startDate.toISOString(),
            p_end_date: endDate.toISOString(),
            p_limit: 5,
          }),
        ]);

        const ordersData = ordersRes.data || [];
        const prevData = prevRes.data || [];

        const totalRevenue = ordersData.reduce((sum: number, o: any) => sum + Number(o.total_amount), 0);
        const totalSales = ordersData.length;
        const ticketMedio = totalSales > 0 ? totalRevenue / totalSales : 0;

        const prevRevenue = prevData.reduce((sum: number, o: any) => sum + Number(o.total_amount), 0);
        const revenueChange = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0;

        // Chart data
        const chart: ChartData[] = [];
        for (let i = periodDays - 1; i >= 0; i--) {
          const date = new Date();
          date.setDate(date.getDate() - i);
          const dateStr = date.toISOString().split("T")[0];

          const dayOrders = ordersData.filter((o: any) => o.created_at.startsWith(dateStr));
          const dayRevenue = dayOrders.reduce((sum: number, o: any) => sum + Number(o.total_amount), 0);
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
        setSourceData((sourceRes.data as any) || []);
        setTopCommunities((communitiesRes.data as any) || []);
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

  // Derive per-source totals for KPI cards
  const communityRevenue = sourceData.find((s) => s.source_type === "community")?.total_revenue || 0;
  const courseRevenue = sourceData.find((s) => s.source_type === "course")?.total_revenue || 0;
  const storeRevenue = sourceData.find((s) => s.source_type === "store")?.total_revenue || 0;

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

      {/* 3 KPI cards — total */}
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

      {/* Revenue by source breakdown + per-source KPIs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RevenueBySourceCard data={sourceData} formatCurrency={formatCurrency} />
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-4">
          <MetricCard title="Receita Loja" value={formatCurrency(Number(storeRevenue))} />
          <MetricCard title="Receita Comunidade" value={formatCurrency(Number(communityRevenue))} />
          <MetricCard title="Receita Cursos" value={formatCurrency(Number(courseRevenue))} />
        </div>
      </div>

      {/* Top communities */}
      <TopCommunitiesCard data={topCommunities} formatCurrency={formatCurrency} />

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
