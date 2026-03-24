import { useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
  const upgradeTo = PLAN_UPGRADE_MAP[currentPlan];

  if (!upgradeTo) return null;

  const handleUpgrade = () => {
    onOpenChange(false);
    const targetCode = PLAN_TO_CODE[upgradeTo];
    navigate(`/billing/upgrade-flow?plan=${targetCode}&source=locked_features_modal&feature=${encodeURIComponent(feature)}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
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
          <Button className="flex-1 gap-2" onClick={handleUpgrade}>
            Fazer Upgrade <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
