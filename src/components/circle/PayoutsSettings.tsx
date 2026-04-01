import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthProvider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Settings, Wallet, Clock, DollarSign, AlertCircle,
  CheckCircle2, XCircle, Loader2, Save, CreditCard,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function fmt(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

const STATUS_MAP: Record<string, { label: string; icon: typeof CheckCircle2; className: string }> = {
  pending: { label: "Pendente", icon: Clock, className: "bg-amber-500/10 text-amber-600" },
  processing: { label: "Processando", icon: Loader2, className: "bg-blue-500/10 text-blue-600" },
  paid: { label: "Pago", icon: CheckCircle2, className: "bg-green-500/10 text-green-600" },
  failed: { label: "Falhou", icon: XCircle, className: "bg-destructive/10 text-destructive" },
  requested: { label: "Solicitado", icon: Clock, className: "bg-amber-500/10 text-amber-600" },
};

export default function PayoutsSettings() {
  const { user } = useAuth();
  const [configOpen, setConfigOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [method, setMethod] = useState("pix");
  const [pixKey, setPixKey] = useState("");

  // Payout profile
  const { data: profile, isLoading: profileLoading, refetch: refetchProfile } = useQuery({
    queryKey: ["payout-profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("referral_payout_profiles" as any)
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      return data as any;
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  // Referral payouts (affiliate earnings)
  const { data: refPayouts, isLoading: refLoading } = useQuery({
    queryKey: ["referral-payouts", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("referral_payouts" as any)
        .select("*")
        .eq("referrer_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data || []) as any[];
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  // Referral commissions for balance
  const { data: commissions } = useQuery({
    queryKey: ["referral-balance", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("referral_commissions" as any)
        .select("commission_amount, status, available_at, payout_id")
        .eq("referrer_user_id", user.id);
      return (data || []) as any[];
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const isLoading = profileLoading || refLoading;

  // Balance KPIs
  const now = new Date();
  const available = (commissions || [])
    .filter((c: any) => c.status === "available" && !c.payout_id && (!c.available_at || new Date(c.available_at) <= now))
    .reduce((s: number, c: any) => s + Number(c.commission_amount || 0), 0);

  const pending = (commissions || [])
    .filter((c: any) => (c.status === "pending" || (c.status === "available" && c.available_at && new Date(c.available_at) > now)) && !c.payout_id)
    .reduce((s: number, c: any) => s + Number(c.commission_amount || 0), 0);

  const totalPaid = (refPayouts || [])
    .filter((p: any) => p.payout_status === "paid")
    .reduce((s: number, p: any) => s + Number(p.total_amount || 0), 0);

  // Open config with pre-fill
  const openConfig = () => {
    if (profile) {
      setMethod(profile.payout_method || "pix");
      const details = profile.payout_details || {};
      setPixKey(details.pix_key || "");
    }
    setConfigOpen(true);
  };

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        payout_method: method,
        payout_details: method === "pix" ? { pix_key: pixKey } : {},
        status: "pending",
      };

      if (profile?.id) {
        await supabase
          .from("referral_payout_profiles" as any)
          .update({ payout_method: method, payout_details: payload.payout_details } as any)
          .eq("id", profile.id);
      } else {
        await supabase.from("referral_payout_profiles" as any).insert(payload as any);
      }
      toast.success("Dados de recebimento salvos!");
      refetchProfile();
      setConfigOpen(false);
    } catch {
      toast.error("Erro ao salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const allPayouts = refPayouts || [];
  const hasPayouts = allPayouts.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Saques</h2>
          <p className="text-sm text-muted-foreground">
            Saques de ganhos de comunidade e afiliados.
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={openConfig}>
          <Settings className="h-4 w-4" />
          <span className="hidden sm:inline">Configurar</span>
        </Button>
      </div>

      {/* Balance KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5 space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Wallet className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Disponível</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{fmt(available * 100)}</p>
        </Card>
        <Card className="p-5 space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Pendente</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{fmt(pending * 100)}</p>
        </Card>
        <Card className="p-5 space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground">
            <DollarSign className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Total sacado</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{fmt(totalPaid * 100)}</p>
        </Card>
      </div>

      {/* Payout method status */}
      {profile && (
        <Card className="p-4 flex items-center gap-3">
          <CreditCard className="h-5 w-5 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              Método: {profile.payout_method === "pix" ? "PIX" : profile.payout_method === "bank" ? "Transferência bancária" : profile.payout_method}
            </p>
            {profile.payout_method === "pix" && profile.payout_details?.pix_key && (
              <p className="text-xs text-muted-foreground truncate">
                Chave: {profile.payout_details.pix_key}
              </p>
            )}
          </div>
          <Badge variant={profile.status === "verified" ? "default" : "secondary"}>
            {profile.status === "verified" ? "Verificado" : "Pendente"}
          </Badge>
        </Card>
      )}

      {/* Payouts List / Empty */}
      <Card className="p-5">
        {hasPayouts ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-left">
                  <th className="pb-2 font-medium">Data</th>
                  <th className="pb-2 font-medium">Valor</th>
                  <th className="pb-2 font-medium">Itens</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Referência</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {allPayouts.map((p: any) => {
                  const st = STATUS_MAP[p.payout_status] || STATUS_MAP.pending;
                  const StIcon = st.icon;
                  return (
                    <tr key={p.id}>
                      <td className="py-3 text-muted-foreground">
                        {new Date(p.created_at).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="py-3 font-semibold text-foreground">
                        {fmt(Number(p.total_amount || 0) * 100)}
                      </td>
                      <td className="py-3 text-muted-foreground">{p.items_count}</td>
                      <td className="py-3">
                        <span className={cn("inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium", st.className)}>
                          <StIcon className="h-3 w-3" />
                          {st.label}
                        </span>
                      </td>
                      <td className="py-3 font-mono text-xs text-muted-foreground">
                        {p.provider_reference || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="mx-auto h-14 w-14 rounded-full bg-muted/50 flex items-center justify-center mb-4">
              <Wallet className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="text-base font-semibold text-foreground">Nenhum saque ainda</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              Quando você tiver ganhos de afiliados ou comunidade disponíveis, seus saques aparecerão aqui.
            </p>
          </div>
        )}
      </Card>

      {/* Config Dialog */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configurar recebimento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Método de recebimento</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="bank">Transferência bancária</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {method === "pix" && (
              <div className="space-y-2">
                <Label>Chave PIX</Label>
                <Input
                  placeholder="CPF, email, celular ou chave aleatória"
                  value={pixKey}
                  onChange={e => setPixKey(e.target.value)}
                />
              </div>
            )}

            {method === "bank" && (
              <p className="text-sm text-muted-foreground">
                Configuração de conta bancária disponível em breve.
              </p>
            )}

            <Button className="w-full gap-2" onClick={saveProfile} disabled={saving || (method === "pix" && !pixKey.trim())}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
