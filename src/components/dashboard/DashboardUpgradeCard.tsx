import { Crown, ArrowRight, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { usePlanLimits, PLAN_LABELS, PLAN_UPGRADE_MAP } from "@/hooks/usePlanLimits";

export function DashboardUpgradeCard() {
  const { plan, loading } = usePlanLimits();

  if (loading) return null;

  const upgradeTo = PLAN_UPGRADE_MAP[plan];
  if (!upgradeTo) return null;

  const upgradeUrl = "/billing/upgrade-flow?source_ui=dashboard_upgrade_card&plan=creator";

  return (
    <Card className="relative isolate border-primary/20 bg-primary/5 pointer-events-auto">
      <CardContent className="pointer-events-auto p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="shrink-0 p-2 rounded-full bg-primary/10 pointer-events-none" aria-hidden="true">
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
        <a
          href={upgradeUrl}
          role="button"
          target="_self"
          rel="nofollow"
          aria-label={`Fazer upgrade para o plano ${PLAN_LABELS[upgradeTo]}`}
          className="relative z-20 pointer-events-auto inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          style={{ position: "relative", zIndex: 20, pointerEvents: "auto" }}
          onClickCapture={(e) => {
            e.stopPropagation();
            window.location.assign(upgradeUrl);
          }}
        >
          <Crown className="w-4 h-4 pointer-events-none" aria-hidden="true" />
          Fazer Upgrade
          <ArrowRight className="w-3.5 h-3.5 pointer-events-none" aria-hidden="true" />
        </a>
      </CardContent>
    </Card>
  );
}