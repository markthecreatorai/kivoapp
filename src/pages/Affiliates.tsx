import { useState, useEffect, useMemo } from "react";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Users, DollarSign, CreditCard, Link2, Crown, Loader2, Settings, Trophy, TrendingUp, Check, X, Pause } from "lucide-react";
import { usePlanLimits } from "@/hooks/usePlanLimits";
import { UpgradeModal } from "@/components/UpgradeModal";

interface AffiliateProgram {
  id: string;
  is_enabled: boolean;
  attribution_model: string;
  cookie_duration_days: number;
  default_commission_percent: number;
  min_payout_amount: number;
  hold_days: number;
  auto_approve: boolean;
}

interface Affiliate {
  id: string;
  name: string;
  email: string;
  status: string;
  created_at: string;
}

interface Commission {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  affiliate_id: string;
  order_id: string;
}

interface Payout {
  id: string;
  total_amount: number;
  status: string;
  method: string | null;
  created_at: string;
  affiliate_id: string;
}

interface Product {
  id: string;
  name: string;
}

interface CommissionRule {
  id: string;
  product_id: string;
  percent: number;
  fixed_amount: number | null;
  is_active: boolean;
}

interface AffiliateLink {
  affiliate_id: string;
  click_count: number;
}

export default function Affiliates() {
  const { currentWorkspace } = useWorkspace();
  const [program, setProgram] = useState<AffiliateProgram | null>(null);
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [commissionRules, setCommissionRules] = useState<CommissionRule[]>([]);
  const [affiliateLinks, setAffiliateLinks] = useState<AffiliateLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rankingFilter, setRankingFilter] = useState("ALL");
  const [commissionFilter, setCommissionFilter] = useState("ALL");
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const planInfo = usePlanLimits();

  useEffect(() => {
    if (currentWorkspace && planInfo.limits.hasAffiliates) loadData();
  }, [currentWorkspace, planInfo.limits.hasAffiliates]);

  const loadData = async () => {
    if (!currentWorkspace) return;
    setLoading(true);

    const [progRes, affsRes, linksRes, prodsRes, rulesRes, paysRes] = await Promise.all([
      supabase.from("affiliate_programs").select("*").eq("workspace_id", currentWorkspace.id).maybeSingle(),
      supabase.from("affiliates").select("id, name, email, status, created_at").eq("workspace_id", currentWorkspace.id).order("created_at", { ascending: false }),
      supabase.from("affiliate_links").select("affiliate_id, click_count"),
      supabase.from("products").select("id, name").eq("workspace_id", currentWorkspace.id).eq("status", "PUBLISHED"),
      supabase.from("commission_rules").select("*"),
      supabase.from("payouts").select("id, total_amount, status, method, created_at, affiliate_id").eq("workspace_id", currentWorkspace.id).order("created_at", { ascending: false }),
    ]);

    if (progRes.data) setProgram(progRes.data as AffiliateProgram);
    if (affsRes.data) setAffiliates(affsRes.data);
    if (linksRes.data) setAffiliateLinks(linksRes.data);
    if (prodsRes.data) setProducts(prodsRes.data);
    if (rulesRes.data) setCommissionRules(rulesRes.data as CommissionRule[]);
    if (paysRes.data) setPayouts(paysRes.data);

    // Load commissions via orders
    const { data: orders } = await supabase.from("orders").select("id").eq("workspace_id", currentWorkspace.id);
    if (orders && orders.length > 0) {
      const { data: comms } = await supabase
        .from("commissions")
        .select("id, amount, status, created_at, affiliate_id, order_id")
        .in("order_id", orders.map(o => o.id))
        .order("created_at", { ascending: false });
      if (comms) setCommissions(comms);
    }

    setLoading(false);
  };

  // Block if no affiliates plan
  if (!planInfo.loading && !planInfo.limits.hasAffiliates) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
        <div className="p-4 rounded-full bg-muted"><Crown className="w-8 h-8 text-muted-foreground" /></div>
        <h2 className="text-xl font-bold text-foreground">Programa de Afiliados</h2>
        <p className="text-muted-foreground max-w-md">O programa de afiliados está disponível a partir do plano Creator. Faça upgrade para gerenciar seus afiliados e comissões.</p>
        <Button onClick={() => setUpgradeOpen(true)} className="gap-2"><Crown className="w-4 h-4" /> Fazer Upgrade</Button>
        <UpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} currentPlan={planInfo.plan} feature="usar o programa de afiliados" />
      </div>
    );
  }

  const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const statusBadge = (status: string) => {
    const map: Record<string, string> = { PENDING: "secondary", APPROVED: "default", REJECTED: "destructive", SUSPENDED: "outline", PAID: "default", CANCELLED: "destructive" };
    return <Badge variant={map[status] as any || "secondary"}>{status}</Badge>;
  };

  // KPI calculations
  const totalAffiliates = affiliates.filter(a => a.status === "APPROVED").length;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthlySales = commissions.filter(c => c.created_at >= monthStart && c.status !== "CANCELLED").reduce((s, c) => s + c.amount, 0);
  const totalPending = commissions.filter(c => c.status === "PENDING").reduce((s, c) => s + c.amount, 0);
  const totalPaid = commissions.filter(c => c.status === "PAID").reduce((s, c) => s + c.amount, 0);

  // Ranking data
  const rankingData = useMemo(() => {
    const clickMap = new Map<string, number>();
    affiliateLinks.forEach(l => {
      clickMap.set(l.affiliate_id, (clickMap.get(l.affiliate_id) || 0) + l.click_count);
    });

    return affiliates
      .filter(a => rankingFilter === "ALL" || a.status === rankingFilter)
      .map(a => {
        const affComms = commissions.filter(c => c.affiliate_id === a.id && c.status !== "CANCELLED");
        const revenue = affComms.reduce((s, c) => s + c.amount, 0);
        return {
          ...a,
          clicks: clickMap.get(a.id) || 0,
          salesCount: affComms.length,
          revenue,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }, [affiliates, commissions, affiliateLinks, rankingFilter]);

  const filteredCommissions = commissionFilter === "ALL" ? commissions : commissions.filter(c => c.status === commissionFilter);

  const affiliateNameMap = useMemo(() => {
    const m = new Map<string, string>();
    affiliates.forEach(a => m.set(a.id, a.name));
    return m;
  }, [affiliates]);

  // Handlers
  const saveProgram = async (updates: Partial<AffiliateProgram>) => {
    if (!currentWorkspace) return;
    setSaving(true);
    if (program) {
      await supabase.from("affiliate_programs").update(updates).eq("id", program.id);
      setProgram({ ...program, ...updates });
    } else {
      const { data } = await supabase.from("affiliate_programs").insert({ workspace_id: currentWorkspace.id, ...updates }).select().single();
      if (data) setProgram(data as AffiliateProgram);
    }
    setSaving(false);
    toast.success("Configurações salvas");
  };

  const updateAffiliateStatus = async (id: string, status: string) => {
    await supabase.from("affiliates").update({ status, approved_at: status === "APPROVED" ? new Date().toISOString() : null }).eq("id", id);
    if (status === "APPROVED") {
      const { data: existingLink } = await supabase.from("affiliate_links").select("id").eq("affiliate_id", id).maybeSingle();
      if (!existingLink) {
        await supabase.from("affiliate_links").insert({ affiliate_id: id, code: "" });
      }
    }
    setAffiliates(prev => prev.map(a => a.id === id ? { ...a, status } : a));
    toast.success(`Afiliado ${status === "APPROVED" ? "aprovado" : status === "REJECTED" ? "rejeitado" : "suspenso"}`);
  };

  const saveCommissionRule = async (productId: string, percent: number) => {
    const existing = commissionRules.find(r => r.product_id === productId);
    if (existing) {
      await supabase.from("commission_rules").update({ percent }).eq("id", existing.id);
      setCommissionRules(prev => prev.map(r => r.id === existing.id ? { ...r, percent } : r));
    } else {
      const { data } = await supabase.from("commission_rules").insert({ product_id: productId, percent, is_active: true }).select().single();
      if (data) setCommissionRules(prev => [...prev, data as CommissionRule]);
    }
    toast.success("Comissão do produto atualizada");
  };

  const removeCommissionRule = async (productId: string) => {
    const existing = commissionRules.find(r => r.product_id === productId);
    if (existing) {
      await supabase.from("commission_rules").delete().eq("id", existing.id);
      setCommissionRules(prev => prev.filter(r => r.id !== existing.id));
      toast.success("Comissão customizada removida");
    }
  };

  const copyApplyLink = () => {
    if (!currentWorkspace) return;
    const url = `${window.location.origin}/affiliate/apply/${currentWorkspace.slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copiado!");
  };

  if (loading) {
    return <div className="p-6 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Afiliados</h1>
          <p className="text-muted-foreground">Gerencie seu programa de afiliados por produto</p>
        </div>
        <Button variant="outline" onClick={copyApplyLink} className="gap-2">
          <Link2 className="w-4 h-4" /> Copiar link de aplicação
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Afiliados ativos</p>
            </div>
            <p className="text-2xl font-bold text-foreground">{totalAffiliates}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Vendas do mês</p>
            </div>
            <p className="text-2xl font-bold text-foreground">{fmt(monthlySales)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Comissão pendente</p>
            </div>
            <p className="text-2xl font-bold text-foreground">{fmt(totalPending)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <CreditCard className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Total pago</p>
            </div>
            <p className="text-2xl font-bold text-accent">{fmt(totalPaid)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="ranking">
        <TabsList>
          <TabsTrigger value="ranking" className="gap-1"><Trophy className="w-4 h-4" /> Ranking</TabsTrigger>
          <TabsTrigger value="commissions" className="gap-1"><DollarSign className="w-4 h-4" /> Comissões</TabsTrigger>
          <TabsTrigger value="payouts" className="gap-1"><CreditCard className="w-4 h-4" /> Payouts</TabsTrigger>
          <TabsTrigger value="settings" className="gap-1"><Settings className="w-4 h-4" /> Configurações</TabsTrigger>
        </TabsList>

        {/* Ranking Tab */}
        <TabsContent value="ranking" className="space-y-4">
          <div className="flex gap-2">
            {["ALL", "PENDING", "APPROVED", "SUSPENDED"].map(s => (
              <Button key={s} variant={rankingFilter === s ? "default" : "outline"} size="sm" onClick={() => setRankingFilter(s)}>
                {s === "ALL" ? "Todos" : s === "PENDING" ? "Pendente" : s === "APPROVED" ? "Aprovado" : "Suspenso"}
              </Button>
            ))}
          </div>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Cliques</TableHead>
                  <TableHead className="text-right">Vendas</TableHead>
                  <TableHead className="text-right">Receita gerada</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rankingData.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhum afiliado encontrado</TableCell></TableRow>
                ) : rankingData.map((aff, idx) => (
                  <TableRow key={aff.id}>
                    <TableCell>
                      {idx < 3 ? (
                        <Badge variant={idx === 0 ? "default" : "secondary"} className={idx === 0 ? "bg-yellow-500 text-yellow-950" : idx === 1 ? "bg-gray-300 text-gray-800" : "bg-orange-400 text-orange-950"}>
                          #{idx + 1}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">#{idx + 1}</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{aff.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{aff.email}</TableCell>
                    <TableCell>{statusBadge(aff.status)}</TableCell>
                    <TableCell className="text-right">{aff.clicks}</TableCell>
                    <TableCell className="text-right">{aff.salesCount}</TableCell>
                    <TableCell className="text-right font-medium">{fmt(aff.revenue)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {aff.status === "PENDING" && (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => updateAffiliateStatus(aff.id, "APPROVED")} className="text-accent"><Check className="w-4 h-4" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => updateAffiliateStatus(aff.id, "REJECTED")} className="text-destructive"><X className="w-4 h-4" /></Button>
                          </>
                        )}
                        {aff.status === "APPROVED" && (
                          <Button size="sm" variant="ghost" onClick={() => updateAffiliateStatus(aff.id, "SUSPENDED")}><Pause className="w-4 h-4" /></Button>
                        )}
                        {aff.status === "SUSPENDED" && (
                          <Button size="sm" variant="ghost" onClick={() => updateAffiliateStatus(aff.id, "APPROVED")} className="text-accent"><Check className="w-4 h-4" /></Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Commissions Tab */}
        <TabsContent value="commissions" className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Pendente</p><p className="text-xl font-bold text-foreground">{fmt(totalPending)}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Aprovado</p><p className="text-xl font-bold text-foreground">{fmt(commissions.filter(c => c.status === "APPROVED").reduce((s, c) => s + c.amount, 0))}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Pago</p><p className="text-xl font-bold text-accent">{fmt(totalPaid)}</p></CardContent></Card>
          </div>
          <div className="flex gap-2">
            {["ALL", "PENDING", "APPROVED", "PAID", "CANCELLED"].map(s => (
              <Button key={s} variant={commissionFilter === s ? "default" : "outline"} size="sm" onClick={() => setCommissionFilter(s)}>
                {s === "ALL" ? "Todos" : s}
              </Button>
            ))}
          </div>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Afiliado</TableHead>
                  <TableHead className="text-right">Comissão</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCommissions.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhuma comissão</TableCell></TableRow>
                ) : filteredCommissions.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="text-sm">{new Date(c.created_at).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell className="font-medium">{affiliateNameMap.get(c.affiliate_id) || "—"}</TableCell>
                    <TableCell className="text-right font-medium">{fmt(c.amount)}</TableCell>
                    <TableCell>{statusBadge(c.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Payouts Tab */}
        <TabsContent value="payouts" className="space-y-4">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Afiliado</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum payout</TableCell></TableRow>
                ) : payouts.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm">{new Date(p.created_at).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell className="font-medium">{affiliateNameMap.get(p.affiliate_id) || "—"}</TableCell>
                    <TableCell className="font-medium">{fmt(p.total_amount)}</TableCell>
                    <TableCell>{p.method || "—"}</TableCell>
                    <TableCell>{statusBadge(p.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Configurações Gerais</CardTitle>
                <div className="flex items-center gap-2">
                  <Label htmlFor="enabled" className="text-sm">Ativar programa</Label>
                  <Switch id="enabled" checked={program?.is_enabled ?? false} onCheckedChange={(v) => saveProgram({ is_enabled: v })} />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Comissão padrão (%)</Label>
                  <Input type="number" value={program?.default_commission_percent ?? 20} onChange={(e) => saveProgram({ default_commission_percent: Number(e.target.value) })} />
                </div>
                <div className="space-y-2">
                  <Label>Modelo de atribuição</Label>
                  <Select value={program?.attribution_model ?? "LAST_CLICK"} onValueChange={(v) => saveProgram({ attribution_model: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LAST_CLICK">Último Clique</SelectItem>
                      <SelectItem value="FIRST_CLICK">Primeiro Clique</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Duração do cookie (dias)</Label>
                  <Select value={String(program?.cookie_duration_days ?? 30)} onValueChange={(v) => saveProgram({ cookie_duration_days: Number(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[30, 60, 90, 180].map(d => <SelectItem key={d} value={String(d)}>{d} dias</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Mínimo para payout (R$)</Label>
                  <Input type="number" value={program?.min_payout_amount ?? 50} onChange={(e) => saveProgram({ min_payout_amount: Number(e.target.value) })} />
                </div>
                <div className="space-y-2">
                  <Label>Período de hold (dias)</Label>
                  <Select value={String(program?.hold_days ?? 14)} onValueChange={(v) => saveProgram({ hold_days: Number(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[7, 14, 30].map(d => <SelectItem key={d} value={String(d)}>{d} dias</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch checked={program?.auto_approve ?? false} onCheckedChange={(v) => saveProgram({ auto_approve: v })} />
                  <Label>Auto-aprovar afiliados</Label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Per-product commission overrides */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Comissão por Produto</CardTitle>
              <p className="text-sm text-muted-foreground">Defina comissões específicas para cada produto. Produtos sem override usam a comissão padrão ({program?.default_commission_percent ?? 20}%).</p>
            </CardHeader>
            <CardContent>
              {products.length === 0 ? (
                <p className="text-muted-foreground text-sm py-4 text-center">Nenhum produto publicado</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead className="w-40">Comissão (%)</TableHead>
                      <TableHead className="w-32">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map(p => {
                      const rule = commissionRules.find(r => r.product_id === p.id);
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              className="w-24"
                              placeholder={String(program?.default_commission_percent ?? 20)}
                              value={rule?.percent ?? ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === "") return;
                                saveCommissionRule(p.id, Number(val));
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            {rule ? (
                              <Button size="sm" variant="ghost" onClick={() => removeCommissionRule(p.id)} className="text-destructive text-xs">
                                Usar padrão
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">Padrão</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
