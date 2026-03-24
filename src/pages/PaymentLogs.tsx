import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious,
} from "@/components/ui/pagination";
import { Loader2, RefreshCw, Eye, RotateCcw, Search, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

const PAGE_SIZE = 20;

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  RECEIVED: { label: "Recebido", variant: "outline" },
  PROCESSED: { label: "Processado", variant: "default" },
  FAILED: { label: "Falhou", variant: "destructive" },
  DEAD_LETTER: { label: "Dead Letter", variant: "destructive" },
  RETRY: { label: "Retry", variant: "secondary" },
};

export default function PaymentLogs() {
  const { currentWorkspace } = useWorkspace();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("");
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["webhook-events", currentWorkspace?.id, page, statusFilter, eventTypeFilter],
    queryFn: async () => {
      if (!currentWorkspace?.id) return { events: [], total: 0 };

      let query = supabase
        .from("webhook_events")
        .select("id, provider, event_type, external_event_id, status, attempts, created_at, processed_at, error_message, order_id, status_before, status_after, last_attempt_at, next_retry_at", { count: "exact" })
        .eq("workspace_id", currentWorkspace.id)
        .order("created_at", { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      if (eventTypeFilter) {
        query = query.ilike("event_type", `%${eventTypeFilter}%`);
      }

      const { data: events, count, error } = await query;
      if (error) throw error;
      return { events: events || [], total: count || 0 };
    },
    enabled: !!currentWorkspace?.id,
  });

  const handleRetry = async (eventId: string) => {
    setRetrying(eventId);
    try {
      const { error } = await supabase.functions.invoke("retry-webhooks", {
        body: { event_id: eventId },
      });
      if (error) throw error;
      toast.success("Evento reprocessado com sucesso");
      refetch();
    } catch (err: any) {
      toast.error("Erro ao reprocessar: " + (err.message || "Erro desconhecido"));
    } finally {
      setRetrying(null);
    }
  };

  const totalPages = Math.ceil((data?.total || 0) / PAGE_SIZE);
  const deadLetterCount = data?.events?.filter((e: any) => e.status === "DEAD_LETTER").length || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Logs de Pagamento</h1>
          <p className="text-sm text-muted-foreground">Auditoria de eventos de webhook e pagamentos</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Filtrar por tipo de evento..."
                  value={eventTypeFilter}
                  onChange={(e) => { setEventTypeFilter(e.target.value); setPage(1); }}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="PROCESSED">Processado</SelectItem>
                <SelectItem value="FAILED">Falhou</SelectItem>
                <SelectItem value="DEAD_LETTER">Dead Letter</SelectItem>
                <SelectItem value="RECEIVED">Recebido</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Dead letter warning */}
      {deadLetterCount > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
            <div>
              <p className="text-sm font-medium text-destructive">
                {deadLetterCount} evento(s) em Dead Letter
              </p>
              <p className="text-xs text-muted-foreground">
                Eventos que falharam após todas as tentativas de retry. Revise e reprocesse manualmente.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Eventos ({data?.total || 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tentativas</TableHead>
                      <TableHead>Transição</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.events?.map((event: any) => {
                      const status = STATUS_MAP[event.status] || { label: event.status, variant: "outline" as const };
                      return (
                        <TableRow key={event.id}>
                          <TableCell>
                            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{event.event_type}</code>
                          </TableCell>
                          <TableCell>
                            <Badge variant={status.variant}>{status.label}</Badge>
                          </TableCell>
                          <TableCell className="text-sm">{event.attempts}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {event.status_before && event.status_after ? (
                              <span>{event.status_before} → {event.status_after}</span>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {format(new Date(event.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedEvent(event)}>
                                <Eye className="w-4 h-4" />
                              </Button>
                              {(event.status === "FAILED" || event.status === "DEAD_LETTER") && (
                                <Button
                                  variant="ghost" size="icon" className="h-8 w-8"
                                  disabled={retrying === event.id}
                                  onClick={() => handleRetry(event.id)}
                                >
                                  {retrying === event.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {(!data?.events || data.events.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                          Nenhum evento encontrado
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="mt-4 flex justify-center">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious onClick={() => setPage(Math.max(1, page - 1))} />
                      </PaginationItem>
                      {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => (
                        <PaginationItem key={i + 1}>
                          <PaginationLink isActive={page === i + 1} onClick={() => setPage(i + 1)}>
                            {i + 1}
                          </PaginationLink>
                        </PaginationItem>
                      ))}
                      <PaginationItem>
                        <PaginationNext onClick={() => setPage(Math.min(totalPages, page + 1))} />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Detail Modal */}
      <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Evento</DialogTitle>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground">ID</p>
                  <p className="font-mono text-xs">{selectedEvent.id}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">External ID</p>
                  <p className="font-mono text-xs">{selectedEvent.external_event_id}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Tipo</p>
                  <p>{selectedEvent.event_type}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Provider</p>
                  <p>{selectedEvent.provider}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <Badge variant={STATUS_MAP[selectedEvent.status]?.variant || "outline"}>
                    {STATUS_MAP[selectedEvent.status]?.label || selectedEvent.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Tentativas</p>
                  <p>{selectedEvent.attempts}</p>
                </div>
                {selectedEvent.order_id && (
                  <div>
                    <p className="text-muted-foreground">Order ID</p>
                    <p className="font-mono text-xs">{selectedEvent.order_id}</p>
                  </div>
                )}
                {selectedEvent.status_before && (
                  <div>
                    <p className="text-muted-foreground">Transição</p>
                    <p>{selectedEvent.status_before} → {selectedEvent.status_after}</p>
                  </div>
                )}
              </div>
              {selectedEvent.error_message && (
                <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                  <p className="text-xs font-medium text-destructive">Erro</p>
                  <p className="text-xs mt-1">{selectedEvent.error_message}</p>
                </div>
              )}
              {selectedEvent.processed_at && (
                <p className="text-xs text-muted-foreground">
                  Processado em: {format(new Date(selectedEvent.processed_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
