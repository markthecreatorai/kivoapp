import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CreditCard, Users, Plus, Save, Trash2, AlertTriangle,
  CheckCircle, XCircle, Clock, Ban,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Props {
  community: any;
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  trialing: "bg-blue-100 text-blue-700",
  past_due: "bg-yellow-100 text-yellow-700",
  canceled: "bg-gray-100 text-gray-700",
  expired: "bg-red-100 text-red-700",
  pending: "bg-orange-100 text-orange-700",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Ativo",
  trialing: "Trial",
  past_due: "Inadimplente",
  canceled: "Cancelado",
  expired: "Expirado",
  pending: "Pendente",
};

export default function AdminSubscriptionsTab({ community }: Props) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("plans");

  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ["circle-plans-admin", community.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("circle_plans" as any)
        .select("*")
        .eq("community_id", community.id)
        .order("created_at", { ascending: true });
      return (data || []) as any[];
    },
  });

  const { data: subscriptions, isLoading: subsLoading } = useQuery({
    queryKey: ["circle-subscriptions-admin", community.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("circle_subscriptions" as any)
        .select("*, plan:circle_plans(*)")
        .eq("community_id", community.id)
        .order("created_at", { ascending: false });
      return (data || []) as any[];
    },
  });

  const [planForm, setPlanForm] = useState({
    name: "Plano Mensal",
    price_cents: 4990,
    interval: "monthly" as string,
    trial_days: 0,
    description: "",
  });
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);

  const savePlan = useMutation({
    mutationFn: async () => {
      if (editingPlanId) {
        const { error } = await (supabase as any)
          .from("circle_plans")
          .update({
            name: planForm.name,
            price_cents: planForm.price_cents,
            interval: planForm.interval,
            trial_days: planForm.trial_days,
            description: planForm.description,
          })
          .eq("id", editingPlanId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("circle_plans")
          .insert({
            community_id: community.id,
            name: planForm.name,
            price_cents: planForm.price_cents,
            interval: planForm.interval,
            trial_days: planForm.trial_days,
            description: planForm.description,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circle-plans-admin"] });
      toast.success(editingPlanId ? "Plano atualizado!" : "Plano criado!");
      setEditingPlanId(null);
      setPlanForm({ name: "Plano Mensal", price_cents: 4990, interval: "monthly", trial_days: 0, description: "" });
    },
    onError: () => toast.error("Erro ao salvar plano"),
  });

  const togglePlan = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await (supabase as any)
        .from("circle_plans")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circle-plans-admin"] });
      toast.success("Plano atualizado!");
    },
  });

  const deletePlan = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("circle_plans")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circle-plans-admin"] });
      toast.success("Plano excluído!");
    },
    onError: () => toast.error("Não é possível excluir um plano com assinaturas ativas"),
  });

  const startEditPlan = (plan: any) => {
    setEditingPlanId(plan.id);
    setPlanForm({
      name: plan.name,
      price_cents: plan.price_cents,
      interval: plan.interval,
      trial_days: plan.trial_days,
      description: plan.description || "",
    });
  };

  const formatPrice = (cents: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

  const activeCount = subscriptions?.filter((s: any) => s.status === "active" || s.status === "trialing").length || 0;
  const pastDueCount = subscriptions?.filter((s: any) => s.status === "past_due").length || 0;
  const canceledCount = subscriptions?.filter((s: any) => s.status === "canceled" || s.status === "expired").length || 0;
  const mrr = subscriptions
    ?.filter((s: any) => s.status === "active")
    .reduce((sum: number, s: any) => {
      const price = s.plan?.price_cents || 0;
      return sum + (s.plan?.interval === "yearly" ? Math.round(price / 12) : price);
    }, 0) || 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{activeCount}</p>
          <p className="text-xs text-muted-foreground">Ativos</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{formatPrice(mrr)}</p>
          <p className="text-xs text-muted-foreground">MRR</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-yellow-600">{pastDueCount}</p>
          <p className="text-xs text-muted-foreground">Inadimplentes</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-muted-foreground">{canceledCount}</p>
          <p className="text-xs text-muted-foreground">Cancelados</p>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="plans"><CreditCard className="h-4 w-4 mr-1.5" />Planos</TabsTrigger>
          <TabsTrigger value="subscribers"><Users className="h-4 w-4 mr-1.5" />Assinantes</TabsTrigger>
        </TabsList>

        <TabsContent value="plans" className="mt-4 space-y-4">
          {plans?.map((plan: any) => (
            <Card key={plan.id} className="p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{plan.name}</span>
                  <Badge variant={plan.is_active ? "default" : "secondary"} className="text-[10px]">
                    {plan.is_active ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {formatPrice(plan.price_cents)}/{plan.interval === "yearly" ? "ano" : "mês"}
                  {plan.trial_days > 0 && ` · ${plan.trial_days} dias trial`}
                </p>
              </div>
              <Switch
                checked={plan.is_active}
                onCheckedChange={(val) => togglePlan.mutate({ id: plan.id, is_active: val })}
              />
              <Button size="sm" variant="outline" onClick={() => startEditPlan(plan)}>Editar</Button>
              <Button size="sm" variant="ghost" onClick={() => deletePlan.mutate(plan.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </Card>
          ))}

          <Card className="p-4 space-y-4">
            <h3 className="font-semibold text-sm">
              {editingPlanId ? "Editar plano" : "Criar novo plano"}
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Nome</Label>
                <Input
                  value={planForm.name}
                  onChange={(e) => setPlanForm((p) => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div>
                <Label>Preço (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={(planForm.price_cents / 100).toFixed(2)}
                  onChange={(e) => setPlanForm((p) => ({ ...p, price_cents: Math.round(parseFloat(e.target.value || "0") * 100) }))}
                />
              </div>
              <div>
                <Label>Intervalo</Label>
                <Select
                  value={planForm.interval}
                  onValueChange={(v) => setPlanForm((p) => ({ ...p, interval: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Mensal</SelectItem>
                    <SelectItem value="yearly">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Dias de trial grátis</Label>
                <Input
                  type="number"
                  value={planForm.trial_days}
                  onChange={(e) => setPlanForm((p) => ({ ...p, trial_days: parseInt(e.target.value || "0") }))}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => savePlan.mutate()} disabled={savePlan.isPending}>
                <Save className="h-4 w-4 mr-1.5" />
                {editingPlanId ? "Salvar alterações" : "Criar plano"}
              </Button>
              {editingPlanId && (
                <Button variant="outline" onClick={() => {
                  setEditingPlanId(null);
                  setPlanForm({ name: "Plano Mensal", price_cents: 4990, interval: "monthly", trial_days: 0, description: "" });
                }}>
                  Cancelar
                </Button>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="subscribers" className="mt-4 space-y-3">
          {subsLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>
          ) : !subscriptions?.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma assinatura ainda.</p>
          ) : (
            subscriptions.map((sub: any) => (
              <Card key={sub.id} className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">
                      {sub.user_id?.substring(0, 8)}...
                    </span>
                    <Badge className={`text-[10px] ${STATUS_COLORS[sub.status] || ""}`}>
                      {STATUS_LABELS[sub.status] || sub.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {sub.plan?.name || "Plano"} · {formatPrice(sub.plan?.price_cents || 0)}
                    {sub.next_billing_at && ` · Próx: ${format(new Date(sub.next_billing_at), "dd/MM/yy")}`}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {sub.created_at && format(new Date(sub.created_at), "dd/MM/yy")}
                </p>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
