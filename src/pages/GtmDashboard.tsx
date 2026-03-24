import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { ArrowRight, TrendingUp, Users, Package, CreditCard, Eye, FlaskConical, BarChart3 } from "lucide-react";
import { subDays } from "date-fns";
import { useNavigate } from "react-router-dom";

export default function GtmDashboard() {
  const [days, setDays] = useState(7);
  const since = useMemo(() => subDays(new Date(), days).toISOString(), [days]);
  const { currentWorkspace } = useWorkspace();
  const navigate = useNavigate();

  const { data: signups } = useQuery({
    queryKey: ["gtm-signups", since],
    queryFn: async () => {
      const { count } = await supabase.from("workspaces").select("id", { count: "exact", head: true }).gte("created_at", since);
      return count || 0;
    },
  });

  // @ts-ignore - deep type chain
  const { data: published } = useQuery({
    queryKey: ["gtm-published", since],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id").gte("created_at", since);
      return data?.length || 0;
    },
  });

  const { data: sales } = useQuery({
    queryKey: ["gtm-sales", since],
    queryFn: async () => {
      const { count } = await supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "PAID").gte("created_at", since);
      return count || 0;
    },
  });

  const { data: landingViews } = useQuery({
    queryKey: ["gtm-landing", since],
    queryFn: async () => {
      const { count } = await supabase.from("analytics_events").select("id", { count: "exact", head: true }).eq("event_type", "page_view").eq("page_path", "/").gte("created_at", since);
      return count || 0;
    },
  });

  const { data: ctaClicks } = useQuery({
    queryKey: ["gtm-cta", since],
    queryFn: async () => {
      const { count } = await supabase.from("analytics_events").select("id", { count: "exact", head: true }).eq("event_type", "cta_click").gte("created_at", since);
      return count || 0;
    },
  });

  // A/B data
  const { data: abData } = useQuery({
    queryKey: ["gtm-ab", since],
    queryFn: async () => {
      const { data: events } = await supabase.from("analytics_events").select("metadata, event_type").in("event_type", ["page_view", "cta_click"]).eq("page_path", "/").gte("created_at", since);
      
      const variants = { A: { views: 0, clicks: 0, signups: 0 }, B: { views: 0, clicks: 0, signups: 0 } };
      (events || []).forEach((e: any) => {
        const variant = e.metadata?.ab_variant as "A" | "B";
        if (!variant || !variants[variant]) return;
        if (e.event_type === "page_view") variants[variant].views++;
        if (e.event_type === "cta_click") variants[variant].clicks++;
      });
      return variants;
    },
  });

  // Scorecard - acquisition leads by channel
  const { data: acquisitionStats } = useQuery({
    queryKey: ["gtm-acquisition", currentWorkspace?.id, since],
    queryFn: async () => {
      if (!currentWorkspace) return null;
      const { data: leads } = await supabase.from("acquisition_leads").select("channel, status, revenue_attributed, cost").eq("workspace_id", currentWorkspace.id).gte("created_at", since);
      
      if (!leads) return null;
      
      const channels: Record<string, { total: number; won: number; revenue: number; cost: number; demo: number }> = {};
      leads.forEach((l: any) => {
        if (!channels[l.channel]) channels[l.channel] = { total: 0, won: 0, revenue: 0, cost: 0, demo: 0 };
        channels[l.channel].total++;
        if (l.status === "won") channels[l.channel].won++;
        if (l.status === "demo") channels[l.channel].demo++;
        channels[l.channel].revenue += l.revenue_attributed || 0;
        channels[l.channel].cost += l.cost || 0;
      });
      return { channels, totalLeads: leads.length, totalWon: leads.filter((l: any) => l.status === "won").length };
    },
    enabled: !!currentWorkspace,
  });

  const ctr = landingViews && landingViews > 0 ? ((ctaClicks || 0) / landingViews * 100).toFixed(1) : "0";
  const signupToProduct = signups && signups > 0 ? ((published || 0) / signups * 100).toFixed(1) : "0";
  const productToSale = published && published > 0 ? ((sales || 0) / published * 100).toFixed(1) : "0";

  const metrics = [
    { label: "Visitas Landing", value: landingViews ?? 0, icon: Eye, color: "text-primary" },
    { label: "Cliques CTA", value: ctaClicks ?? 0, icon: TrendingUp, color: "text-primary", sub: `CTR: ${ctr}%` },
    { label: "Signups", value: signups ?? 0, icon: Users, color: "text-primary" },
    { label: "Produtos Pub.", value: published ?? 0, icon: Package, color: "text-primary", sub: `${signupToProduct}% dos signups` },
    { label: "1ª Venda", value: sales ?? 0, icon: CreditCard, color: "text-primary", sub: `${productToSale}% dos pub.` },
  ];

  const MIN_SAMPLE = 30;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Painel GTM</h1>
          <p className="text-muted-foreground text-sm">Métricas de tração semanal</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/acquisition")} className="pill-radius">Pipeline</Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/gtm/playbook")} className="pill-radius">Playbook</Button>
          <Select value={String(days)} onValueChange={v => setDays(+v)}>
            <SelectTrigger className="w-32 input-radius"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 dias</SelectItem>
              <SelectItem value="14">14 dias</SelectItem>
              <SelectItem value="30">30 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Funnel cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {metrics.map((m, i) => (
          <Card key={i} className="card-radius">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <m.icon className={`w-4 h-4 ${m.color}`} />
                <span className="text-xs text-muted-foreground">{m.label}</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{m.value}</p>
              {m.sub && <p className="text-xs text-muted-foreground mt-1">{m.sub}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Funnel visualization */}
      <Card className="card-radius">
        <CardHeader><CardTitle className="text-lg">Funil de Ativação</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 overflow-x-auto pb-2">
            {metrics.map((m, i) => (
              <div key={i} className="flex items-center gap-3 shrink-0">
                <div className="text-center min-w-[100px]">
                  <p className="text-xl font-bold text-foreground">{m.value}</p>
                  <p className="text-xs text-muted-foreground">{m.label}</p>
                </div>
                {i < metrics.length - 1 && <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* A/B Test Block */}
      <Card className="card-radius">
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><FlaskConical className="w-4 h-4" /> Teste A/B — Headline</CardTitle></CardHeader>
        <CardContent>
          {abData ? (
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                {(["A", "B"] as const).map(v => {
                  const d = abData[v];
                  const variantCtr = d.views > 0 ? ((d.clicks / d.views) * 100).toFixed(1) : "0";
                  return (
                    <div key={v} className="p-4 rounded-lg border">
                      <div className="flex items-center justify-between mb-3">
                        <Badge variant="secondary">Variante {v}</Badge>
                        {d.views >= MIN_SAMPLE && <Badge className="bg-primary/10 text-primary text-xs">{variantCtr}% CTR</Badge>}
                      </div>
                      <p className="text-sm font-medium text-foreground mb-2">{v === "A" ? "All-in-one" : "Economia de taxas"}</p>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-lg font-bold text-foreground">{d.views}</p>
                          <p className="text-xs text-muted-foreground">Views</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold text-foreground">{d.clicks}</p>
                          <p className="text-xs text-muted-foreground">Clicks</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold text-foreground">{variantCtr}%</p>
                          <p className="text-xs text-muted-foreground">CTR</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {(() => {
                const totalViews = abData.A.views + abData.B.views;
                if (totalViews < MIN_SAMPLE * 2) {
                  return <p className="text-sm text-muted-foreground text-center">⚠️ Dados insuficientes — mínimo {MIN_SAMPLE * 2} views (atual: {totalViews})</p>;
                }
                const ctrA = abData.A.views > 0 ? abData.A.clicks / abData.A.views : 0;
                const ctrB = abData.B.views > 0 ? abData.B.clicks / abData.B.views : 0;
                const lift = ctrA > 0 ? (((ctrB - ctrA) / ctrA) * 100).toFixed(1) : "N/A";
                const winner = ctrA > ctrB ? "A" : "B";
                return (
                  <div className="text-center p-3 rounded-lg bg-accent">
                    <p className="text-sm font-medium text-foreground">
                      🏆 Variante {winner} lidera · Lift: {lift}%
                    </p>
                  </div>
                );
              })()}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Carregando dados do teste...</p>
          )}
        </CardContent>
      </Card>

      {/* Scorecard by Channel */}
      <Card className="card-radius">
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><BarChart3 className="w-4 h-4" /> Scorecard por Canal</CardTitle></CardHeader>
        <CardContent>
          {acquisitionStats && Object.keys(acquisitionStats.channels).length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2 text-muted-foreground font-medium">Canal</th>
                    <th className="text-right p-2 text-muted-foreground font-medium">Leads</th>
                    <th className="text-right p-2 text-muted-foreground font-medium">Demos</th>
                    <th className="text-right p-2 text-muted-foreground font-medium">Won</th>
                    <th className="text-right p-2 text-muted-foreground font-medium">Conv.</th>
                    <th className="text-right p-2 text-muted-foreground font-medium">Receita</th>
                    <th className="text-right p-2 text-muted-foreground font-medium">CAC</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(acquisitionStats.channels).map(([channel, stats]) => (
                    <tr key={channel} className="border-b">
                      <td className="p-2 capitalize font-medium text-foreground">{channel}</td>
                      <td className="p-2 text-right text-foreground">{stats.total}</td>
                      <td className="p-2 text-right text-foreground">{stats.demo}</td>
                      <td className="p-2 text-right text-foreground">{stats.won}</td>
                      <td className="p-2 text-right text-foreground">{stats.total > 0 ? ((stats.won / stats.total) * 100).toFixed(0) : 0}%</td>
                      <td className="p-2 text-right text-foreground">R${(stats.revenue / 100).toFixed(0)}</td>
                      <td className="p-2 text-right text-foreground">{stats.won > 0 && stats.cost > 0 ? `R$${(stats.cost / stats.won / 100).toFixed(0)}` : "-"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <td className="p-2 text-foreground">Total</td>
                    <td className="p-2 text-right text-foreground">{acquisitionStats.totalLeads}</td>
                    <td className="p-2 text-right text-foreground">-</td>
                    <td className="p-2 text-right text-foreground">{acquisitionStats.totalWon}</td>
                    <td className="p-2 text-right text-foreground">{acquisitionStats.totalLeads > 0 ? ((acquisitionStats.totalWon / acquisitionStats.totalLeads) * 100).toFixed(0) : 0}%</td>
                    <td className="p-2 text-right text-foreground" colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum lead no pipeline ainda. <button onClick={() => navigate("/acquisition")} className="text-primary hover:underline">Adicionar leads →</button>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
