import { AlertTriangle, ArrowRight, Crown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { usePlanLimits, PLAN_LABELS, PLAN_UPGRADE_MAP } from "@/hooks/usePlanLimits";

const USAGE_LABELS: Record<string, { label: string; feature: string }> = {
  products: { label: "Produtos", feature: "criar mais produtos" },
  courses: { label: "Cursos", feature: "criar mais cursos" },
  affiliates: { label: "Afiliados", feature: "adicionar mais afiliados" },
  emailContacts: { label: "Contatos de Email", feature: "adicionar mais contatos" },
};

export function UsageAlerts() {
  const { plan, limits, usage, getUsagePercent, isNearLimit, loading } = usePlanLimits();

  if (loading || plan === "CREATOR_PRO") return null;

  const upgradeTo = PLAN_UPGRADE_MAP[plan];
  const planCode = upgradeTo?.toLowerCase().replace(/_/g, "-");
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const buildUpgradeUrl = (feature?: string) => {
    const params = new URLSearchParams({
      source_ui: "locked_features_modal",
      ...(planCode ? { plan: planCode } : {}),
      ...(feature ? { feature } : {}),
    });

    return `${origin}/billing/upgrade-flow?${params.toString()}`;
  };

  const alerts: { key: string; percent: number; current: number; max: number }[] = [];

  const checkKeys = ["products", "courses", "affiliates", "emailContacts"] as const;
  
  for (const key of checkKeys) {
    const percent = getUsagePercent(key);
    const limitMap: Record<string, string> = {
      products: "maxProducts",
      courses: "maxCourses", 
      affiliates: "maxAffiliates",
      emailContacts: "maxEmailContacts",
    };
    const max = (limits as any)[limitMap[key]];
    if (max !== null && max > 0 && percent >= 80) {
      alerts.push({ key, percent, current: usage[key], max: max as number });
    }
  }

  // Show feature blocks for FREE plan
  const blockedFeatures: string[] = [];
  if (plan === "FREE") {
    if (!limits.hasMemberArea) blockedFeatures.push("Área de Membros");
    if (!limits.hasAffiliates) blockedFeatures.push("Programa de Afiliados");
    if (!limits.hasEmailMarketing) blockedFeatures.push("Email Marketing");
  }

  if (alerts.length === 0 && blockedFeatures.length === 0) return null;

  return (
    <div className="space-y-3">
      {alerts.map(({ key, percent, current, max }) => {
        const info = USAGE_LABELS[key];
        const isAtLimit = percent >= 100;

        return (
          <Card key={key} className={`border ${isAtLimit ? "border-destructive/50 bg-destructive/5" : "border-yellow-500/30 bg-yellow-50/50 dark:bg-yellow-950/10"}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className={`w-4 h-4 ${isAtLimit ? "text-destructive" : "text-yellow-600"}`} />
                  <span className="text-sm font-medium text-foreground">
                    {info.label}: {current}/{max}
                  </span>
                </div>
                <Button asChild size="sm" variant="outline" className="h-7 text-xs gap-1">
                  <a href={buildUpgradeUrl(info.feature)} target="_self" rel="nofollow">
                    <Crown className="w-3 h-3" /> Upgrade
                  </a>
                </Button>
              </div>
              <Progress value={percent} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">
                {isAtLimit
                  ? `Limite do plano ${PLAN_LABELS[plan]} atingido`
                  : `${100 - percent}% restante no plano ${PLAN_LABELS[plan]}`
                }
              </p>
            </CardContent>
          </Card>
        );
      })}

      {blockedFeatures.length > 0 && (
        <Card className="border-muted">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Crown className="w-4 h-4 text-muted-foreground" />
                  Recursos bloqueados no plano {PLAN_LABELS[plan]}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {blockedFeatures.join(", ")}
                </p>
              </div>
              <Button asChild size="sm" className="gap-1">
                <a href={buildUpgradeUrl("desbloquear todos os recursos")} target="_self" rel="nofollow">
                  Upgrade <ArrowRight className="w-3 h-3" />
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
