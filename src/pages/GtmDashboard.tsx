import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, TrendingUp, Users, Package, CreditCard, Eye } from "lucide-react";
import { subDays, format } from "date-fns";

export default function GtmDashboard() {
  const [days, setDays] = useState(7);
  const since = useMemo(() => subDays(new Date(), days).toISOString(), [days]);

  // Signups (workspaces created)
  const { data: signups } = useQuery({
    queryKey: ["gtm-signups", since],
    queryFn: async () => {
      const { count } = await supabase.from("workspaces").select("*", { count: "exact", head: true }).gte("created_at", since);
      return count || 0;
    },
  });

  // Products published
  const { data: published } = useQuery({
    queryKey: ["gtm-published", since],
    queryFn: async () => {
      const { count } = await supabase.from("products").select("*", { count: "exact", head: true }).eq("is_published", true).gte("created_at", since);
      return count || 0;
    },
  });

  // First sales (orders paid)
  const { data: sales } = useQuery({
    queryKey: ["gtm-sales", since],
    queryFn: async () => {
      const { count } = await supabase.from("orders").select("*", { count: "exact", head: true }).eq("status", "PAID").gte("created_at", since);
      return count || 0;
    },
  });

  // Landing visits (analytics_events page_view on /)
  const { data: landingViews } = useQuery({
    queryKey: ["gtm-landing", since],
    queryFn: async () => {
      const { count } = await supabase.from("analytics_events").select("*", { count: "exact", head: true }).eq("event_type", "page_view").eq("page_path", "/").gte("created_at", since);
      return count || 0;
    },
  });

  // CTA clicks (event_type = cta_click)
  const { data: ctaClicks } = useQuery({
    queryKey: ["gtm-cta", since],
    queryFn: async () => {
      const { count } = await supabase.from("analytics_events").select("*", { count: "exact", head: true }).eq("event_type", "cta_click").gte("created_at", since);
      return count || 0;
    },
  });

  const ctr = landingViews && landingViews > 0 ? ((ctaClicks || 0) / landingViews * 100).toFixed(1) : "0";
  const signupToProduct = signups && signups > 0 ? ((published || 0) / signups * 100).toFixed(1) : "0";
  const productToSale = published && published > 0 ? ((sales || 0) / published * 100).toFixed(1) : "0";

  const metrics = [
    { label: "Visitas Landing", value: landingViews ?? 0, icon: Eye, color: "text-blue-500" },
    { label: "Cliques CTA", value: ctaClicks ?? 0, icon: TrendingUp, color: "text-primary", sub: `CTR: ${ctr}%` },
    { label: "Signups", value: signups ?? 0, icon: Users, color: "text-green-500" },
    { label: "Produtos Publicados", value: published ?? 0, icon: Package, color: "text-purple-500", sub: `${signupToProduct}% dos signups` },
    { label: "1ª Venda", value: sales ?? 0, icon: CreditCard, color: "text-primary", sub: `${productToSale}% dos publicados` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Painel GTM</h1>
          <p className="text-muted-foreground text-sm">Métricas de tração semanal</p>
        </div>
        <Select value={String(days)} onValueChange={v => setDays(+v)}>
          <SelectTrigger className="w-32 input-radius"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 dias</SelectItem>
            <SelectItem value="14">14 dias</SelectItem>
            <SelectItem value="30">30 dias</SelectItem>
          </SelectContent>
        </Select>
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

      {/* A/B results hint */}
      <Card className="card-radius">
        <CardHeader><CardTitle className="text-lg">Teste A/B — Headline</CardTitle></CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg border">
              <Badge variant="secondary" className="mb-2">Variante A</Badge>
              <p className="text-sm font-medium text-foreground">All-in-one</p>
              <p className="text-xs text-muted-foreground mt-1">"Tudo que você precisa para vender digital."</p>
              <p className="text-xs text-muted-foreground mt-2">Medir CTR via utm_campaign=ab_A</p>
            </div>
            <div className="p-4 rounded-lg border">
              <Badge variant="secondary" className="mb-2">Variante B</Badge>
              <p className="text-sm font-medium text-foreground">Economia de taxas</p>
              <p className="text-xs text-muted-foreground mt-1">"Pague até 60% menos em taxas."</p>
              <p className="text-xs text-muted-foreground mt-2">Medir CTR via utm_campaign=ab_B</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
