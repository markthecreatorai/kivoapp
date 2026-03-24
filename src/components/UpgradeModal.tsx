import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Crown, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PLAN_LABELS, PLAN_UPGRADE_MAP, type PlanType } from "@/hooks/usePlanLimits";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPlan: PlanType;
  feature: string;
}

const PLAN_TO_CODE: Record<PlanType, string> = {
  FREE: "free",
  CREATOR: "creator",
  CREATOR_PRO: "creator-pro",
};

export function UpgradeModal({ open, onOpenChange, currentPlan, feature }: UpgradeModalProps) {
  const upgradeTo = PLAN_UPGRADE_MAP[currentPlan];

  if (!upgradeTo) return null;

  const upgradeUrl = typeof window !== "undefined"
    ? `${window.location.origin}/billing/upgrade-flow?plan=${PLAN_TO_CODE[upgradeTo]}&source_ui=locked_features_modal&feature=${encodeURIComponent(feature)}`
    : `/billing/upgrade-flow?plan=${PLAN_TO_CODE[upgradeTo]}&source_ui=locked_features_modal&feature=${encodeURIComponent(feature)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-full bg-primary/10">
              <Crown className="w-5 h-5 text-primary" />
            </div>
            <Badge variant="secondary" className="text-xs">
              {PLAN_LABELS[currentPlan]} → {PLAN_LABELS[upgradeTo]}
            </Badge>
          </div>
          <DialogTitle className="text-xl">
            Faça upgrade para {feature}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Seu plano {PLAN_LABELS[currentPlan]} atingiu o limite. 
            Desbloqueie mais recursos com o plano {PLAN_LABELS[upgradeTo]}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-3 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            Agora não
          </Button>
          <div className="flex-1 relative z-[60] pointer-events-auto">
            <a
              data-upgrade-cta="true"
              href={upgradeUrl}
              target="_self"
              rel="nofollow"
              className="w-full gap-2 inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
            >
              Fazer Upgrade <ArrowRight className="w-4 h-4 ml-1" />
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
