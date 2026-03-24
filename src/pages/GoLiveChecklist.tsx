import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { CheckCircle, XCircle, AlertTriangle, Shield, Zap, BookOpen } from "lucide-react";

interface CheckItem {
  id: string;
  label: string;
  category: string;
  critical: boolean;
}

const CHECKLIST: CheckItem[] = [
  // Secrets
  { id: "asaas-key", label: "ASAAS_API_KEY configurada", category: "secrets", critical: true },
  { id: "asaas-webhook", label: "ASAAS_WEBHOOK_TOKEN configurado", category: "secrets", critical: true },
  { id: "cron-secret", label: "CRON_SECRET configurado", category: "secrets", critical: true },
  { id: "telegram", label: "TELEGRAM_API_KEY + CHAT_ID configurados", category: "secrets", critical: false },
  // Jobs
  { id: "job-reconcile", label: "reconcile-asaas-daily ativo (06:00)", category: "jobs", critical: true },
  { id: "job-payouts", label: "process-payouts-daily ativo (07:00)", category: "jobs", critical: true },
  { id: "job-reserves", label: "release-reserves-daily ativo (08:00)", category: "jobs", critical: true },
  // Webhooks
  { id: "webhook-url", label: "Webhook Asaas apontando para URL de produção", category: "webhooks", critical: true },
  { id: "webhook-token", label: "Token de autenticação validado", category: "webhooks", critical: true },
  { id: "webhook-idempotency", label: "Idempotência por event_id + provider", category: "webhooks", critical: true },
  // Alertas
  { id: "alert-telegram", label: "Alertas Telegram disparando", category: "alerts", critical: false },
  { id: "alert-deadletter", label: "Alerta dead-letter configurado", category: "alerts", critical: false },
  // Smoke tests
  { id: "smoke-pix", label: "Pagamento PIX completo", category: "smoke", critical: true },
  { id: "smoke-card", label: "Pagamento Cartão completo", category: "smoke", critical: true },
  { id: "smoke-circle", label: "Assinatura Circle ativa", category: "smoke", critical: true },
  { id: "smoke-payout", label: "Payout automático processado", category: "smoke", critical: true },
  { id: "smoke-chargeback", label: "Chargeback simulado (homologação)", category: "smoke", critical: false },
  { id: "smoke-ledger", label: "Ledger/split/reserve consistentes", category: "smoke", critical: true },
];

const RUNBOOKS = [
  {
    title: "Pagamento não confirmado",
    diagnosis: "Verificar status no painel Asaas → conferir webhook_events → checar ordem no Kivo.",
    action: "Se webhook não chegou: reprocessar manualmente via Asaas. Se chegou mas falhou: rodar reconciliação manual.",
    rollback: "Cancelar ordem pendente após 24h. Notificar cliente se necessário.",
  },
  {
    title: "Webhook atrasado / não recebido",
    diagnosis: "Checar webhook_events por provider=ASAAS. Verificar logs da edge function webhook-asaas.",
    action: "Rodar reconciliação manual para sincronizar. Reprocessar evento dead-letter se existir.",
    rollback: "Kill switch: desabilitar recebimento e processar manualmente enquanto investiga.",
  },
  {
    title: "Payout falho",
    diagnosis: "Verificar payout_requests com status=failed. Checar failure_reason e logs da function process-payouts.",
    action: "Corrigir dados bancários do creator. Re-solicitar payout manualmente ou via admin panel.",
    rollback: "Reverter reserva de saldo. Creator mantém saldo disponível.",
  },
  {
    title: "Chargeback novo",
    diagnosis: "Verificar chargeback_cases. Identificar order e creator afetados.",
    action: "Congelar saldo creator. Coletar evidências. Submeter resposta dentro do SLA.",
    rollback: "Se perdido: debitar creator. Se saldo insuficiente: registrar negative_balance.",
  },
  {
    title: "Divergência de reconciliação",
    diagnosis: "Verificar reconciliation_log com status=divergent. Comparar com painel Asaas.",
    action: "Corrigir status local para refletir realidade do gateway. Registrar em audit_logs.",
    rollback: "Se volume alto: pausar operações e investigar antes de corrigir em massa.",
  },
];

export default function GoLiveChecklist() {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const toggle = (id: string) => setChecked((prev) => ({ ...prev, [id]: !prev[id] }));

  const totalCritical = CHECKLIST.filter((c) => c.critical).length;
  const checkedCritical = CHECKLIST.filter((c) => c.critical && checked[c.id]).length;
  const totalAll = CHECKLIST.length;
  const checkedAll = CHECKLIST.filter((c) => checked[c.id]).length;

  const isGo = checkedCritical === totalCritical;

  const categories = [
    { key: "secrets", label: "Secrets Validados", icon: Shield },
    { key: "jobs", label: "Jobs Ativos", icon: Zap },
    { key: "webhooks", label: "Webhooks", icon: Zap },
    { key: "alerts", label: "Alertas", icon: AlertTriangle },
    { key: "smoke", label: "Smoke Tests", icon: CheckCircle },
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Go-Live Financeiro</h1>
          <p className="text-muted-foreground text-sm">Checklist de produção + runbooks de incidentes</p>
        </div>
        <Badge variant={isGo ? "default" : "destructive"} className="text-base px-4 py-1">
          {isGo ? "✅ GO" : `🚫 NO-GO (${totalCritical - checkedCritical} bloqueantes)`}
        </Badge>
      </div>

      {/* Progress */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${(checkedAll / totalAll) * 100}%` }} />
              </div>
            </div>
            <span className="text-sm font-medium">{checkedAll}/{totalAll}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Críticos: {checkedCritical}/{totalCritical}</p>
        </CardContent>
      </Card>

      {/* Checklist by category */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {categories.map(({ key, label, icon: Icon }) => {
          const items = CHECKLIST.filter((c) => c.category === key);
          const done = items.filter((c) => checked[c.id]).length;
          return (
            <Card key={key}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Icon className="h-4 w-4" /> {label}
                  <Badge variant={done === items.length ? "default" : "secondary"} className="ml-auto text-[10px]">
                    {done}/{items.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => toggle(item.id)}
                    className="flex items-center gap-2 w-full text-left text-sm hover:bg-muted/50 rounded p-1 transition-colors"
                  >
                    {checked[item.id] ? (
                      <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <span className={checked[item.id] ? "line-through text-muted-foreground" : ""}>
                      {item.label}
                    </span>
                    {item.critical && !checked[item.id] && (
                      <Badge variant="destructive" className="text-[9px] ml-auto">BLOQUEANTE</Badge>
                    )}
                  </button>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Runbooks */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5" /> Runbooks de Incidentes Financeiros</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple">
            {RUNBOOKS.map((rb, i) => (
              <AccordionItem key={i} value={`rb-${i}`}>
                <AccordionTrigger className="text-sm font-medium">{rb.title}</AccordionTrigger>
                <AccordionContent className="space-y-3 text-sm">
                  <div>
                    <p className="font-semibold text-primary">🔍 Diagnóstico</p>
                    <p className="text-muted-foreground">{rb.diagnosis}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-emerald-600">⚡ Ação Imediata</p>
                    <p className="text-muted-foreground">{rb.action}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-destructive">🔄 Rollback / Kill Switch</p>
                    <p className="text-muted-foreground">{rb.rollback}</p>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      {/* 72h plan */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Plano Primeiras 72h Pós Go-Live</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p><strong>H+0 a H+4:</strong> Monitorar primeiro pagamento real. Validar webhook recebido e ledger atualizado.</p>
          <p><strong>H+4 a H+24:</strong> Acompanhar aprovação por método. Verificar que reconciliação diária rodou sem divergência.</p>
          <p><strong>H+24 a H+48:</strong> Primeiro payout real processado. Confirmar transferência na conta do creator.</p>
          <p><strong>H+48 a H+72:</strong> Revisão completa: alertas, SLAs, reservas. Decisão de abertura ampla ou manter controlado.</p>
        </CardContent>
      </Card>
    </div>
  );
}
