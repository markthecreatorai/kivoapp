import { Crown, ArrowRight, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePlanLimits, PLAN_LABELS, PLAN_UPGRADE_MAP } from "@/hooks/usePlanLimits";

export function DashboardUpgradeCard() {
  const { plan, loading } = usePlanLimits();

  if (loading) return null;

  const upgradeTo = PLAN_UPGRADE_MAP[plan];
  if (!upgradeTo) return null;

  const planCode = upgradeTo === "CREATOR" ? "creator" : "creator-pro";
  const upgradeUrl = `/billing/upgrade-flow?source_ui=dashboard_upgrade_card&plan=${planCode}`;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="shrink-0 p-2 rounded-full bg-primary/10">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              Você está no plano {PLAN_LABELS[plan]}
            </p>
            <p className="text-xs text-muted-foreground">
              Desbloqueie mais recursos com o {PLAN_LABELS[upgradeTo]}.
            </p>
          </div>
        </div>
        <Button asChild size="sm" className="shrink-0 gap-1.5">
          <a href={upgradeUrl} aria-label={`Fazer upgrade para o plano ${PLAN_LABELS[upgradeTo]}`}>
            <Crown className="w-4 h-4" />
            Fazer Upgrade
            <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}