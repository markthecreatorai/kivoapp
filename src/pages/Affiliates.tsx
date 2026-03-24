import { useState, useEffect } from "react";
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
import { Users, DollarSign, CreditCard, Copy, Check, X, Pause, Loader2, Link2, Crown } from "lucide-react";
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

export default function Affiliates() {
  const { currentWorkspace } = useWorkspace();
  const [program, setProgram] = useState<AffiliateProgram | null>(null);
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [commissionFilter, setCommissionFilter] = useState("ALL");
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const planInfo = usePlanLimits();

  useEffect(() => {
    if (currentWorkspace && planInfo.limits.hasAffiliates) loadData();
  }, [currentWorkspace, planInfo.limits.hasAffiliates]);

  const loadData = async () => {
    if (!currentWorkspace) return;
    setLoading(true);

    // Load program
    const { data: prog } = await supabase
      .from("affiliate_programs")
      .select("*")
      .eq("workspace_id", currentWorkspace.id)
      .maybeSingle();
    
    if (prog) setProgram(prog as AffiliateProgram);

    // Load affiliates
    const { data: affs } = await supabase
      .from("affiliates")
      .select("id, name, email, status, created_at")
      .eq("workspace_id", currentWorkspace.id)
      .order("created_at", { ascending: false });
    if (affs) setAffiliates(affs);

    // Load commissions
    const { data: comms } = await supabase
      .from("commissions")
      .select("id, amount, status, created_at, affiliate_id, order_id")
      .in("order_id", (await supabase.from("orders").select("id").eq("workspace_id", currentWorkspace.id)).data?.map(o => o.id) || [])
      .order("created_at", { ascending: false });
    if (comms) setCommissions(comms);

    // Load payouts
    const { data: pays } = await supabase
      .from("payouts")
      .select("id, total_amount, status, method, created_at, affiliate_id")
      .eq("workspace_id", currentWorkspace.id)
      .order("created_at", { ascending: false });
    if (pays) setPayouts(pays);

    setLoading(false);
  };

  // Block entire page if affiliates not available
  if (!planInfo.loading && !planInfo.limits.hasAffiliates) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
        <div className="p-4 rounded-full bg-muted">
          <Crown className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Programa de Afiliados</h2>
        <p className="text-muted-foreground max-w-md">
          O programa de afiliados está disponível a partir do plano Creator. 
          Faça upgrade para gerenciar seus afiliados e comissões.
        </p>
        <Button onClick={() => setUpgradeOpen(true)} className="gap-2">
          <Crown className="w-4 h-4" /> Fazer Upgrade
        </Button>
        <UpgradeModal
          open={upgradeOpen}
          onOpenChange={setUpgradeOpen}
          currentPlan={planInfo.plan}
          feature="usar o programa de afiliados"
        />
      </div>
    );
  }

  const saveProgram = async (updates: Partial<AffiliateProgram>) => {
    if (!currentWorkspace) return;
    setSaving(true);
    
    if (program) {
      await supabase.from("affiliate_programs").update(updates).eq("id", program.id);
      setProgram({ ...program, ...updates });
    } else {
      const { data } = await supabase
        .from("affiliate_programs")
        .insert({ workspace_id: currentWorkspace.id, ...updates })
        .select()
        .single();
      if (data) setProgram(data as AffiliateProgram);
    }
    
    setSaving(false);
    toast.success("Configurações salvas");
  };

  const updateAffiliateStatus = async (id: string, status: string) => {
    await supabase.from("affiliates").update({ 
      status,
      approved_at: status === "APPROVED" ? new Date().toISOString() : null 
    }).eq("id", id);

    // Generate default affiliate link on approval
    if (status === "APPROVED") {
      const { data: existingLink } = await supabase
        .from("affiliate_links")
        .select("id")
        .eq("affiliate_id", id)
        .maybeSingle();
      
      if (!existingLink) {
        await supabase.from("affiliate_links").insert({
          affiliate_id: id,
          code: "", // trigger generates code
        });
      }
    }

    setAffiliates(prev => prev.map(a => a.id === id ? { ...a, status } : a));
    toast.success(`Afiliado ${status === "APPROVED" ? "aprovado" : status === "REJECTED" ? "rejeitado" : "suspenso"}`);
  };

  const copyApplyLink = () => {
    if (!currentWorkspace) return;
    const url = `${window.location.origin}/affiliate/apply/${currentWorkspace.slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copiado!");
  };

  const filteredAffiliates = statusFilter === "ALL" ? affiliates : affiliates.filter(a => a.status === statusFilter);
  const filteredCommissions = commissionFilter === "ALL" ? commissions : commissions.filter(c => c.status === commissionFilter);

  const totalPending = commissions.filter(c => c.status === "PENDING").reduce((s, c) => s + c.amount, 0);
  const totalApproved = commissions.filter(c => c.status === "APPROVED").reduce((s, c) => s + c.amount, 0);
  const totalPaid = commissions.filter(c => c.status === "PAID").reduce((s, c) => s + c.amount, 0);

  const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
  const statusBadge = (status: string) => {
    const map: Record<string, string> = { PENDING: "secondary", APPROVED: "default", REJECTED: "destructive", SUSPENDED: "outline", PAID: "default", CANCELLED: "destructive" };
    return <Badge variant={map[status] as any || "secondary"}>{status}</Badge>;
  };

  if (loading) {
    return <div className="p-6 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Afiliados</h1>
          <p className="text-muted-foreground">Gerencie seu programa de afiliados</p>
        </div>
        <Button variant="outline" onClick={copyApplyLink} className="gap-2">
          <Link2 className="w-4 h-4" /> Copiar link de aplicação
        </Button>
      </div>

      {/* Program Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Configurações do Programa</CardTitle>
            <div className="flex items-center gap-2">
              <Label htmlFor="enabled" className="text-sm">Ativar programa</Label>
              <Switch
                id="enabled"
                checked={program?.is_enabled ?? false}
                onCheckedChange={(v) => saveProgram({ is_enabled: v })}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Comissão padrão (%)</Label>
              <Input
                type="number"
                value={program?.default_commission_percent ?? 20}
                onChange={(e) => saveProgram({ default_commission_percent: Number(e.target.value) })}
              />
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
              <Input
                type="number"
                value={program?.min_payout_amount ?? 50}
                onChange={(e) => saveProgram({ min_payout_amount: Number(e.target.value) })}
              />
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
              <Switch
                checked={program?.auto_approve ?? false}
                onCheckedChange={(v) => saveProgram({ auto_approve: v })}
              />
              <Label>Auto-aprovar afiliados</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="affiliates">
        <TabsList>
          <TabsTrigger value="affiliates" className="gap-1"><Users className="w-4 h-4" /> Afiliados</TabsTrigger>
          <TabsTrigger value="commissions" className="gap-1"><DollarSign className="w-4 h-4" /> Comissões</TabsTrigger>
          <TabsTrigger value="payouts" className="gap-1"><CreditCard className="w-4 h-4" /> Payouts</TabsTrigger>
        </TabsList>

        {/* Affiliates Tab */}
        <TabsContent value="affiliates" className="space-y-4">
          <div className="flex gap-2">
            {["ALL", "PENDING", "APPROVED", "REJECTED", "SUSPENDED"].map(s => (
              <Button key={s} variant={statusFilter === s ? "default" : "outline"} size="sm" onClick={() => setStatusFilter(s)}>
                {s === "ALL" ? "Todos" : s}
              </Button>
            ))}
          </div>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAffiliates.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum afiliado encontrado</TableCell></TableRow>
                ) : filteredAffiliates.map(aff => (
                  <TableRow key={aff.id}>
                    <TableCell className="font-medium">{aff.name}</TableCell>
                    <TableCell>{aff.email}</TableCell>
                    <TableCell>{statusBadge(aff.status)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{new Date(aff.created_at).toLocaleDateString("pt-BR")}</TableCell>
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
            <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Aprovado</p><p className="text-xl font-bold text-foreground">{fmt(totalApproved)}</p></CardContent></Card>
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
                  <TableHead>Comissão</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCommissions.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">Nenhuma comissão</TableCell></TableRow>
                ) : filteredCommissions.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="text-sm">{new Date(c.created_at).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell className="font-medium">{fmt(c.amount)}</TableCell>
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
                  <TableHead>Valor</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhum payout</TableCell></TableRow>
                ) : payouts.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm">{new Date(p.created_at).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell className="font-medium">{fmt(p.total_amount)}</TableCell>
                    <TableCell>{p.method || "—"}</TableCell>
                    <TableCell>{statusBadge(p.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
