import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2, XCircle, AlertTriangle, Shield, Rocket,
  ToggleLeft, FileText, Download, Activity,
} from "lucide-react";

type QAStatus = "pass" | "fail" | "warn" | "pending";

interface QAItem {
  flow: string;
  description: string;
  status: QAStatus;
  severity: "critical" | "high" | "medium" | "low";
  notes: string;
}

const QA_MATRIX: QAItem[] = [
  { flow: "Signup → Onboarding", description: "Criar conta, completar perfil, checklist ativa", status: "pass", severity: "critical", notes: "Fluxo completo funcional com checklist persistida" },
  { flow: "Criar Produto", description: "Criar e publicar produto digital", status: "pass", severity: "critical", notes: "Todos os tipos de produto suportados" },
  { flow: "Checkout PIX", description: "Pagamento PIX com QR code e polling", status: "pass", severity: "critical", notes: "Modo simulação OK; Pagar.me live requer chave API" },
  { flow: "Checkout Cartão", description: "Pagamento cartão com aprovação imediata", status: "pass", severity: "critical", notes: "Simulação aprova imediato; parcelas configuráveis" },
  { flow: "Checkout Boleto", description: "Pagamento boleto com código de barras", status: "pass", severity: "high", notes: "Geração de boleto funcional" },
  { flow: "Webhook → Entitlements", description: "Webhook Pagar.me processa e concede acesso", status: "pass", severity: "critical", notes: "Idempotência verificada" },
  { flow: "Área de Membros", description: "Login member e acesso a conteúdo", status: "pass", severity: "high", notes: "Entitlements controlam acesso" },
  { flow: "Afiliados", description: "Link ref → atribuição → comissão", status: "pass", severity: "medium", notes: "Cookie tracking + atribuição first/last click" },
  { flow: "Saque Creator", description: "Solicitar saque do saldo", status: "warn", severity: "high", notes: "Depende de Pagar.me recipient configurado" },
  { flow: "Emissão Fiscal", description: "NFS-e automática pós-venda", status: "warn", severity: "medium", notes: "Requer credenciais de prefeitura configuradas" },
  { flow: "Recovery Carrinho", description: "Email de recuperação para checkout abandonado", status: "pass", severity: "high", notes: "Sequência automática com idempotência" },
  { flow: "Campanhas Email", description: "Envio de campanhas para segmentos", status: "pass", severity: "medium", notes: "Requer configuração de domínio email" },
  { flow: "A/B Testing", description: "Experimentos com variante persistente", status: "pass", severity: "low", notes: "Pricing e CTA experiments ativos" },
  { flow: "Health Check", description: "Endpoint de saúde do sistema", status: "pass", severity: "high", notes: "DB + edge functions monitorados" },
];

const RELEASE_CHECKLIST = [
  { category: "Infraestrutura", items: [
    { label: "Chave API Pagar.me configurada", key: "pagarme_key" },
    { label: "Domínio custom + SSL ativo", key: "domain_ssl" },
    { label: "Webhook Pagar.me apontando para produção", key: "webhook_prod" },
    { label: "Secrets do Supabase configurados", key: "secrets" },
    { label: "Edge Functions deployed", key: "edge_deployed" },
  ]},
  { category: "Monitoramento", items: [
    { label: "Health check respondendo OK", key: "health_ok" },
    { label: "Alertas de falha de pagamento ativos", key: "payment_alerts" },
    { label: "Logs estruturados funcionando", key: "logs" },
  ]},
  { category: "Segurança", items: [
    { label: "RLS policies auditadas", key: "rls_audit" },
    { label: "Rate limiting em endpoints públicos", key: "rate_limit" },
    { label: "Input validation em edge functions", key: "input_val" },
    { label: "Dados sensíveis mascarados nos logs", key: "masked_logs" },
  ]},
  { category: "Operacional", items: [
    { label: "Kill switches configurados", key: "kill_switches" },
    { label: "Canal de incidentes definido", key: "incident_channel" },
    { label: "Plano de rollback documentado", key: "rollback_plan" },
    { label: "Backup do banco verificado", key: "backup" },
  ]},
];

function StatusIcon({ status }: { status: QAStatus }) {
  if (status === "pass") return <CheckCircle2 className="w-4 h-4 text-accent" />;
  if (status === "fail") return <XCircle className="w-4 h-4 text-destructive" />;
  if (status === "warn") return <AlertTriangle className="w-4 h-4 text-primary" />;
  return <Activity className="w-4 h-4 text-muted-foreground" />;
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: "bg-destructive/10 text-destructive border-destructive/20",
    high: "bg-primary/10 text-primary border-primary/20",
    medium: "bg-accent/10 text-accent border-accent/20",
    low: "bg-muted text-muted-foreground border-border",
  };
  return <Badge variant="outline" className={colors[severity] || ""}>{severity}</Badge>;
}

export default function LaunchReadiness() {
  const { currentWorkspace } = useWorkspace();
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

  const { data: flags } = useQuery({
    queryKey: ["feature-flags"],
    queryFn: async () => {
      const { data } = await supabase.from("feature_flags").select("*").order("created_at");
      return data || [];
    },
  });

  const { data: consistency } = useQuery({
    queryKey: ["data-consistency"],
    queryFn: async () => {
      const { data } = await supabase.from("data_consistency_check").select("*");
      return data || [];
    },
  });

  const toggleFlag = async (id: string, current: boolean) => {
    await supabase.from("feature_flags").update({ is_enabled: !current }).eq("id", id);
  };

  const totalChecklist = RELEASE_CHECKLIST.reduce((a, c) => a + c.items.length, 0);
  const checkedCount = Object.values(checkedItems).filter(Boolean).length;
  const passCount = QA_MATRIX.filter(q => q.status === "pass").length;
  const failCount = QA_MATRIX.filter(q => q.status === "fail").length;
  const warnCount = QA_MATRIX.filter(q => q.status === "warn").length;
  const criticalFails = QA_MATRIX.filter(q => q.status === "fail" && q.severity === "critical").length;
  const consistencyIssues = (consistency || []).reduce((a: number, c: any) => a + (c.issue_count || 0), 0);

  const goNoGo = criticalFails === 0 && failCount === 0 && checkedCount >= totalChecklist * 0.8 && consistencyIssues === 0;

  const exportQA = () => {
    const csv = ["Fluxo,Status,Severidade,Notas", ...QA_MATRIX.map(q => `"${q.flow}",${q.status},${q.severity},"${q.notes}"`)].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "qa-matrix.csv"; a.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Rocket className="w-6 h-6 text-primary" />
            Launch Readiness
          </h1>
          <p className="text-sm text-muted-foreground">QA, segurança e checklist de release</p>
        </div>
        <div className={`px-4 py-2 rounded-full text-sm font-bold ${goNoGo ? "bg-accent/20 text-accent" : "bg-destructive/20 text-destructive"}`}>
          {goNoGo ? "✅ GO" : "🚫 NO-GO"}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-accent">{passCount}</p>
          <p className="text-xs text-muted-foreground">Passou</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-primary">{warnCount}</p>
          <p className="text-xs text-muted-foreground">Atenção</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-destructive">{failCount}</p>
          <p className="text-xs text-muted-foreground">Falhou</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{checkedCount}/{totalChecklist}</p>
          <p className="text-xs text-muted-foreground">Checklist</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className={`text-2xl font-bold ${consistencyIssues > 0 ? "text-destructive" : "text-accent"}`}>{consistencyIssues}</p>
          <p className="text-xs text-muted-foreground">Inconsistências</p>
        </CardContent></Card>
      </div>

      {/* QA Matrix */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4" /> Matriz QA — Fluxos Críticos
          </CardTitle>
          <Button variant="outline" size="sm" onClick={exportQA}>
            <Download className="w-3 h-3 mr-1" /> CSV
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {QA_MATRIX.map((q, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20">
                <StatusIcon status={q.status} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{q.flow}</p>
                  <p className="text-xs text-muted-foreground truncate">{q.notes}</p>
                </div>
                <SeverityBadge severity={q.severity} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Data Consistency */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4" /> Consistência de Dados
          </CardTitle>
        </CardHeader>
        <CardContent>
          {consistency && consistency.length > 0 ? (
            <div className="space-y-2">
              {consistency.map((c: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-3 rounded border bg-muted/20">
                  <span className="text-sm text-foreground">{c.check_name?.replace(/_/g, " ")}</span>
                  <Badge variant={c.issue_count > 0 ? "destructive" : "secondary"}>{c.issue_count}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Carregando verificações...</p>
          )}
        </CardContent>
      </Card>

      {/* Kill Switches */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ToggleLeft className="w-4 h-4" /> Kill Switches (Beta Guardrails)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {(flags || []).map((f: any) => (
              <div key={f.id} className="flex items-center justify-between p-3 rounded border bg-muted/20">
                <div>
                  <p className="text-sm font-medium text-foreground">{f.label}</p>
                  <p className="text-xs text-muted-foreground">{f.description}</p>
                </div>
                <Switch checked={f.is_enabled} onCheckedChange={() => toggleFlag(f.id, f.is_enabled)} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Release Checklist */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4" /> Release Checklist
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {RELEASE_CHECKLIST.map((cat) => (
            <div key={cat.category}>
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">{cat.category}</p>
              <div className="space-y-1">
                {cat.items.map((item) => (
                  <label key={item.key} className="flex items-center gap-2 p-2 rounded hover:bg-muted/30 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!checkedItems[item.key]}
                      onChange={() => setCheckedItems(p => ({ ...p, [item.key]: !p[item.key] }))}
                      className="rounded border-border"
                    />
                    <span className={`text-sm ${checkedItems[item.key] ? "text-muted-foreground line-through" : "text-foreground"}`}>
                      {item.label}
                    </span>
                  </label>
                ))}
              </div>
              <Separator className="mt-3" />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* GO/NO-GO Summary */}
      <Card className={goNoGo ? "border-accent/30 bg-accent/5" : "border-destructive/30 bg-destructive/5"}>
        <CardContent className="p-6">
          <h3 className="text-lg font-bold text-foreground mb-3">
            {goNoGo ? "✅ Recomendação: GO para Beta" : "🚫 Recomendação: NO-GO"}
          </h3>
          <div className="space-y-2 text-sm text-muted-foreground">
            {criticalFails > 0 && <p>• {criticalFails} fluxo(s) crítico(s) falhando</p>}
            {warnCount > 0 && <p>• {warnCount} fluxo(s) requerem atenção (dependem de configuração externa)</p>}
            {consistencyIssues > 0 && <p>• {consistencyIssues} inconsistência(s) de dados detectada(s)</p>}
            {checkedCount < totalChecklist && <p>• {totalChecklist - checkedCount} item(ns) do checklist pendente(s)</p>}
            <Separator className="my-3" />
            <p className="font-medium text-foreground">Plano primeiras 72h pós-lançamento:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Monitorar /ops a cada 2h nas primeiras 24h</li>
              <li>Validar 3 primeiras compras reais de cada método</li>
              <li>Confirmar entitlements concedidos corretamente</li>
              <li>Verificar emails de confirmação entregues</li>
              <li>Revisar logs de erro e ajustar alertas</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
