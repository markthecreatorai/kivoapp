import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Receipt, Settings, CreditCard, ChevronLeft, ChevronRight,
  Filter, AlertCircle, RefreshCw, Download,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface Props {
  userId: string;
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  PAID: { label: "Pago", variant: "default" },
  paid: { label: "Pago", variant: "default" },
  COMPLETED: { label: "Concluído", variant: "default" },
  PENDING: { label: "Pendente", variant: "secondary" },
  pending: { label: "Pendente", variant: "secondary" },
  FAILED: { label: "Falhou", variant: "destructive" },
  failed: { label: "Falhou", variant: "destructive" },
  REFUNDED: { label: "Reembolsado", variant: "outline" },
  refunded: { label: "Reembolsado", variant: "outline" },
  CANCELED: { label: "Cancelado", variant: "outline" },
  canceled: { label: "Cancelado", variant: "outline" },
  OVERDUE: { label: "Atrasado", variant: "destructive" },
};

const PAGE_SIZE = 15;

function formatCurrency(amount: number, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount / 100);
}

export default function PaymentHistorySection({ userId }: Props) {
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const periodStart = useMemo(() => {
    if (periodFilter === "all") return null;
    const now = new Date();
    const days = periodFilter === "30d" ? 30 : periodFilter === "90d" ? 90 : 365;
    return new Date(now.getTime() - days * 86400000).toISOString();
  }, [periodFilter]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["user-payment-history", userId, statusFilter, periodFilter, page],
    queryFn: async () => {
      // Get customer IDs for this user's email
      const { data: userData } = await supabase.auth.getUser();
      const email = userData?.user?.email;
      if (!email) return { payments: [], total: 0 };

      // Find customer records matching user email
      const { data: customers } = await supabase
        .from("customers")
        .select("id")
        .eq("email", email);

      if (!customers?.length) return { payments: [], total: 0 };

      const customerIds = customers.map(c => c.id);

      // Build query
      let query = supabase
        .from("orders")
        .select("*, products:product_id(name, type)", { count: "exact" })
        .in("customer_id", customerIds)
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter.toUpperCase());
      }
      if (periodStart) {
        query = query.gte("created_at", periodStart);
      }

      // Pagination
      const from = page * PAGE_SIZE;
      query = query.range(from, from + PAGE_SIZE - 1);

      const { data: orders, count, error } = await query;
      if (error) throw error;

      return { payments: orders || [], total: count || 0 };
    },
    enabled: !!userId,
    staleTime: 30_000,
  });

  const payments = data?.payments || [];
  const totalCount = data?.total || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  if (isLoading) {
    return (
      <Card className="p-6 space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-64" />
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="p-6">
        <div className="text-center py-12">
          <AlertCircle className="h-10 w-10 text-destructive/50 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-3">Erro ao carregar histórico de pagamentos.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Tentar novamente
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Histórico de pagamentos</h2>
            <p className="text-sm text-muted-foreground">Veja suas transações anteriores</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            <Filter className="h-4 w-4" />
          </Button>
        </div>

        {/* Filters */}
        {filtersOpen && (
          <div className="flex flex-wrap gap-3 mb-4 pb-4 border-b border-border/50">
            <Select value={periodFilter} onValueChange={(v) => { setPeriodFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="90d">Últimos 90 dias</SelectItem>
                <SelectItem value="365d">Último ano</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="paid">Pagos</SelectItem>
                <SelectItem value="pending">Pendentes</SelectItem>
                <SelectItem value="failed">Falhos</SelectItem>
                <SelectItem value="refunded">Reembolsados</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Content */}
        {payments.length === 0 ? (
          <div className="text-center py-12">
            <Receipt className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">You have no payments.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {payments.map((p: any) => {
              const status = STATUS_CONFIG[p.status] || { label: p.status, variant: "secondary" as const };
              const productName = p.products?.name || "Produto";
              const productType = p.products?.type;

              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedPayment(p)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors text-left"
                >
                  {/* Icon */}
                  <div className="flex-shrink-0 w-9 h-9 rounded-full bg-muted/60 flex items-center justify-center">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {productName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(p.created_at), "dd MMM yyyy, HH:mm", { locale: ptBR })}
                      {productType && (
                        <span className="ml-2 text-muted-foreground/60">
                          · {productType === "SUBSCRIPTION" ? "Assinatura" : productType === "COURSE" ? "Curso" : "Compra"}
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Amount + Status */}
                  <div className="flex-shrink-0 text-right">
                    <p className="text-sm font-semibold text-foreground">
                      {formatCurrency(p.total_amount || 0, p.currency || "BRL")}
                    </p>
                    <Badge variant={status.variant} className="text-[10px] px-1.5 py-0 mt-0.5">
                      {status.label}
                    </Badge>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 mt-4 border-t border-border/50">
            <p className="text-xs text-muted-foreground">
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} de {totalCount}
            </p>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={page >= totalPages - 1}
                onClick={() => setPage(p => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ── Payment Detail Modal ── */}
      <Dialog open={!!selectedPayment} onOpenChange={() => setSelectedPayment(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Detalhes do pagamento</DialogTitle>
            <DialogDescription>
              {selectedPayment?.products?.name || "Transação"}
            </DialogDescription>
          </DialogHeader>

          {selectedPayment && (
            <div className="space-y-4 py-2">
              {/* Status */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge variant={STATUS_CONFIG[selectedPayment.status]?.variant || "secondary"}>
                  {STATUS_CONFIG[selectedPayment.status]?.label || selectedPayment.status}
                </Badge>
              </div>

              <Separator />

              {/* Breakdown */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(selectedPayment.subtotal_amount || selectedPayment.total_amount || 0)}</span>
                </div>
                {(selectedPayment.discount_amount || 0) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Desconto</span>
                    <span className="text-green-600">
                      -{formatCurrency(selectedPayment.discount_amount)}
                    </span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between text-sm font-semibold">
                  <span>Total</span>
                  <span>{formatCurrency(selectedPayment.total_amount || 0)}</span>
                </div>
              </div>

              <Separator />

              {/* Meta */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Data</span>
                  <span>{format(new Date(selectedPayment.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ID</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {selectedPayment.order_number || selectedPayment.id?.slice(0, 8)}
                  </span>
                </div>
                {selectedPayment.payment_method && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Método</span>
                    <span>{selectedPayment.payment_method === "CREDIT_CARD" ? "Cartão de crédito" : selectedPayment.payment_method === "PIX" ? "Pix" : selectedPayment.payment_method}</span>
                  </div>
                )}
                {selectedPayment.source_type && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Origem</span>
                    <span>
                      {selectedPayment.source_type === "community" ? "Comunidade" : selectedPayment.source_type === "course" ? "Curso" : selectedPayment.source_type === "store" ? "Loja" : selectedPayment.source_type}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
