import React, { useState, useEffect } from "react";
import { TrendingUp, DollarSign, Eye, Users } from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { useAuth } from "@/contexts/AuthProvider";
import { supabase } from "@/integrations/supabase/client";

// Components
import { MetricCard } from "@/components/dashboard/MetricCard";
import { PeriodFilter } from "@/components/dashboard/PeriodFilter";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { RecentSales } from "@/components/dashboard/RecentSales";
import { OnboardingChecklist } from "@/components/dashboard/OnboardingChecklist";
import { UsageAlerts } from "@/components/dashboard/UsageAlerts";
import { EmailVerificationBanner } from "@/components/dashboard/EmailVerificationBanner";

interface Metrics {
  totalRevenue: number;
  totalSales: number;
  totalVisits: number;
  totalLeads: number;
  revenueChange: number;
  salesChange: number;
  visitsChange: number;
  leadsChange: number;
}

interface RevenueData {
  date: string;
  revenue: number;
}

export default function Dashboard() {
  const [selectedPeriod, setSelectedPeriod] = useState<number | "custom">(30);
  const [metrics, setMetrics] = useState<Metrics>({
    totalRevenue: 0,
    totalSales: 0,
    totalVisits: 0,
    totalLeads: 0,
    revenueChange: 0,
    salesChange: 0,
    visitsChange: 0,
    leadsChange: 0
  });
  const [revenueData, setRevenueData] = useState<RevenueData[]>([]);
  const [loading, setLoading] = useState(true);

  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();

  const currentDate = new Date();
  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Creator';
  const greeting = `Olá, ${displayName}! 👋`;
  const dateString = currentDate.toLocaleDateString('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

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

        // Buscar receita total
        const { data: revenueData, error: revenueError } = await supabase.
        from('orders').
        select('total_amount, created_at').
        eq('workspace_id', currentWorkspace.id).
        eq('status', 'PAID').
        gte('created_at', startDate.toISOString());

        if (revenueError) throw revenueError;

        const totalRevenue = revenueData?.reduce((sum, order) => sum + Number(order.total_amount), 0) || 0;

        // Buscar vendas
        const { data: salesData, error: salesError } = await supabase.
        from('orders').
        select('id, created_at').
        eq('workspace_id', currentWorkspace.id).
        eq('status', 'PAID').
        gte('created_at', startDate.toISOString());

        if (salesError) throw salesError;

        const totalSales = salesData?.length || 0;

        // Buscar visitas
        const { data: visitsData, error: visitsError } = await supabase.
        from('analytics_events').
        select('id, created_at').
        eq('workspace_id', currentWorkspace.id).
        eq('event_type', 'PAGE_VIEW').
        gte('created_at', startDate.toISOString());

        if (visitsError) throw visitsError;

        const totalVisits = visitsData?.length || 0;

        // Buscar leads
        const { data: leadsData, error: leadsError } = await supabase.
        from('leads').
        select('id, created_at').
        eq('workspace_id', currentWorkspace.id).
        gte('created_at', startDate.toISOString());

        if (leadsError) throw leadsError;

        const totalLeads = leadsData?.length || 0;

        // Buscar dados do período anterior para comparação
        const { data: prevRevenueData } = await supabase.
        from('orders').
        select('total_amount').
        eq('workspace_id', currentWorkspace.id).
        eq('status', 'PAID').
        gte('created_at', prevStartDate.toISOString()).
        lt('created_at', prevEndDate.toISOString());

        const prevRevenue = prevRevenueData?.reduce((sum, order) => sum + Number(order.total_amount), 0) || 0;
        const revenueChange = prevRevenue > 0 ? (totalRevenue - prevRevenue) / prevRevenue * 100 : 0;

        // Preparar dados para o gráfico
        const chartData: RevenueData[] = [];
        for (let i = periodDays - 1; i >= 0; i--) {
          const date = new Date();
          date.setDate(date.getDate() - i);
          const dateStr = date.toISOString().split('T')[0];

          const dayRevenue = revenueData?.filter((order) =>
          order.created_at.startsWith(dateStr)
          ).reduce((sum, order) => sum + Number(order.total_amount), 0) || 0;

          chartData.push({
            date: dateStr,
            revenue: dayRevenue
          });
        }

        setMetrics({
          totalRevenue,
          totalSales,
          totalVisits,
          totalLeads,
          revenueChange,
          salesChange: 0, // Simplificado para este exemplo
          visitsChange: 0,
          leadsChange: 0
        });

        setRevenueData(chartData);
      } catch (error) {
        console.error('Erro ao buscar métricas:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, [currentWorkspace, selectedPeriod]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto px-0">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">{greeting}</h1>
        <p className="text-muted-foreground capitalize">{dateString}</p>
      </div>

      {/* Email Verification Banner */}
      <EmailVerificationBanner />

      {/* Usage Alerts */}
      <UsageAlerts />

      {/* Onboarding Checklist */}
      <OnboardingChecklist />

      {/* Period Filter */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">Visão Geral</h2>
        <PeriodFilter
          selectedPeriod={selectedPeriod}
          onPeriodChange={setSelectedPeriod} />
        
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="Receita Total"
          value={formatCurrency(metrics.totalRevenue)}
          icon={DollarSign}
          change={metrics.revenueChange} />
        
        <MetricCard
          title="Vendas"
          value={metrics.totalSales}
          icon={TrendingUp}
          change={metrics.salesChange} />
        
        <MetricCard
          title="Visitas"
          value={metrics.totalVisits}
          icon={Eye}
          change={metrics.visitsChange} />
        
        <MetricCard
          title="Leads"
          value={metrics.totalLeads}
          icon={Users}
          change={metrics.leadsChange} />
        
      </div>

      {/* Charts and Recent Sales */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RevenueChart data={revenueData} period={selectedPeriod} />
        </div>
        <div>
          <RecentSales />
        </div>
      </div>
    </div>);

}