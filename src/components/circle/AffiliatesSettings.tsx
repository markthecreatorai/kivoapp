import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthProvider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  DollarSign, Copy, Check, ExternalLink, TrendingUp,
  Wallet, Link2, Users, Clock, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export default function AffiliatesSettings() {
  const { user } = useAuth();
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  // Get affiliate record for current user
  const { data: affiliate, isLoading: affLoading } = useQuery({
    queryKey: ["my-affiliate", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("affiliates")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  // Get affiliate links
  const { data: links, isLoading: linksLoading } = useQuery({
    queryKey: ["my-affiliate-links", affiliate?.id],
    queryFn: async () => {
      if (!affiliate) return [];
      const { data } = await supabase
        .from("affiliate_links")
        .select("*, product:products(name)")
        .eq("affiliate_id", affiliate.id)
        .order("created_at", { ascending: false });
      return (data || []) as any[];
    },
    enabled: !!affiliate,
    staleTime: 60_000,
  });

  // Get commissions
  const { data: commissions, isLoading: commissionsLoading } = useQuery({
    queryKey: ["my-commissions", affiliate?.id],
    queryFn: async () => {
      if (!affiliate) return [];
      const { data } = await supabase
        .from("commissions")
        .select("*, order:orders(order_number, total_amount, created_at)")
        .eq("affiliate_id", affiliate.id)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data || []) as any[];
    },
    enabled: !!affiliate,
    staleTime: 60_000,
  });

  const isLoading = affLoading || linksLoading || commissionsLoading;

  // Compute KPIs
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const last30d = (commissions || [])
    .filter((c: any) => new Date(c.created_at) >= thirtyDaysAgo && c.status !== "cancelled")
    .reduce((sum: number, c: any) => sum + Number(c.amount || 0), 0);

  const lifetime = (commissions || [])
    .filter((c: any) => c.status !== "cancelled")
    .reduce((sum: number, c: any) => sum + Number(c.amount || 0), 0);

  const availableBalance = (commissions || [])
    .filter((c: any) => c.status === "approved" && (!c.hold_until || new Date(c.hold_until) <= now))
    .reduce((sum: number, c: any) => sum + Number(c.amount || 0), 0);

  const pendingBalance = (commissions || [])
    .filter((c: any) => c.status === "approved" && c.hold_until && new Date(c.hold_until) > now)
    .reduce((sum: number, c: any) => sum + Number(c.amount || 0), 0);

  const handleCopy = (link: string, id: string) => {
    navigator.clipboard.writeText(link);
    setCopiedLink(id);
    toast.success("Link copiado!");
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const baseUrl = window.location.origin;

  // Not an affiliate yet
  if (!affLoading && !affiliate) {
    return (
      <div className="space-y-4">
        <Card className="p-8 text-center space-y-4">
          <div className="mx-auto h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center">
            <Users className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Programa de Afiliados</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Você ainda não está participando de nenhum programa de afiliados. 
            Entre em contato com o criador da comunidade para se candidatar.
          </p>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    approved: { label: "Ativo", variant: "default" },
    pending: { label: "Pendente", variant: "secondary" },
    rejected: { label: "Rejeitado", variant: "destructive" },
    suspended: { label: "Suspenso", variant: "outline" },
  };
  const affStatus = statusMap[affiliate?.status || "pending"] || statusMap.pending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Afiliados</h2>
          <p className="text-sm text-muted-foreground">
            Compartilhe seu link, indique membros e ganhe comissões.
          </p>
        </div>
        <Badge variant={affStatus.variant}>{affStatus.label}</Badge>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5 space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <TrendingUp className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Últimos 30 dias</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(last30d * 100)}</p>
        </Card>
        <Card className="p-5 space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <DollarSign className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Lifetime</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(lifetime * 100)}</p>
        </Card>
        <Card className="p-5 space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Wallet className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Saldo disponível</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(availableBalance * 100)}</p>
          {pendingBalance > 0 && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> {formatCurrency(pendingBalance * 100)} pendente
            </p>
          )}
          <Button
            size="sm"
            className="mt-2 w-full"
            disabled={availableBalance <= 0}
          >
            {availableBalance > 0 ? "Solicitar Payout" : "Sem saldo disponível"}
          </Button>
        </Card>
      </div>

      {/* Affiliate Links */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">Seus links de afiliado</h3>
        </div>

        {links && links.length > 0 ? (
          <div className="space-y-3">
            {links.map((link: any) => {
              const fullUrl = `${baseUrl}/checkout/${link.product_id || "store"}?ref=${link.code}`;
              const isCopied = copiedLink === link.id;
              return (
                <div key={link.id} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground mb-1 truncate">
                      {(link as any).product?.name || "Link geral"} · {link.click_count} cliques
                    </p>
                    <Input
                      readOnly
                      value={fullUrl}
                      className="text-xs h-9 bg-muted/30 font-mono"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 h-9 gap-1.5"
                    onClick={() => handleCopy(fullUrl, link.id)}
                  >
                    {isCopied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                    {isCopied ? "Copiado" : "Copiar"}
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-6">
            <ExternalLink className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum link de afiliado disponível</p>
          </div>
        )}
      </Card>

      {/* Referrals Table */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">Referrals</h3>
        </div>

        {commissions && commissions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-left">
                  <th className="pb-2 font-medium">Data</th>
                  <th className="pb-2 font-medium">Pedido</th>
                  <th className="pb-2 font-medium">Comissão</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {commissions.map((c: any) => {
                  const commStatus: Record<string, { label: string; className: string }> = {
                    pending: { label: "Pendente", className: "bg-amber-500/10 text-amber-600" },
                    approved: { label: "Aprovada", className: "bg-green-500/10 text-green-600" },
                    paid: { label: "Paga", className: "bg-primary/10 text-primary" },
                    cancelled: { label: "Cancelada", className: "bg-destructive/10 text-destructive" },
                  };
                  const st = commStatus[c.status] || commStatus.pending;
                  return (
                    <tr key={c.id}>
                      <td className="py-3 text-muted-foreground">
                        {new Date(c.created_at).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="py-3 font-mono text-xs">
                        {(c as any).order?.order_number || "—"}
                      </td>
                      <td className="py-3 font-semibold text-foreground">
                        {formatCurrency(Number(c.amount || 0) * 100)}
                      </td>
                      <td className="py-3">
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", st.className)}>
                          {st.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="mx-auto h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
              <AlertCircle className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">Nenhum referral ainda</p>
            <p className="text-xs text-muted-foreground mt-1">
              Compartilhe seu link de afiliado para começar a ganhar comissões.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
