import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Wallet, Clock, DollarSign, ArrowRight } from "lucide-react";

interface BalanceCardsProps {
  availableBalance: number;
  pendingBalance: number;
  isLoading: boolean;
  holdDays: number;
  onCashOut: () => void;
  onBreakdown: () => void;
  fmt: (cents: number) => string;
}

export function BalanceCards({ availableBalance, pendingBalance, isLoading, holdDays, onCashOut, onBreakdown, fmt }: BalanceCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
        <CardContent className="p-5 space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
            <Wallet className="h-4 w-4" /> Disponível para Saque
          </div>
          {isLoading ? <Skeleton className="h-8 w-24" /> : (
            <p className="text-2xl font-bold text-foreground">{fmt(availableBalance)}</p>
          )}
          <button className="text-xs text-primary hover:underline flex items-center gap-1" onClick={onBreakdown}>
            Ver detalhes <ArrowRight className="h-3 w-3" />
          </button>
        </CardContent>
      </Card>

      <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
        <CardContent className="p-5 space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
            <Clock className="h-4 w-4" /> Em Hold
          </div>
          {isLoading ? <Skeleton className="h-8 w-24" /> : (
            <p className="text-2xl font-bold text-foreground">{fmt(pendingBalance)}</p>
          )}
          <p className="text-xs text-muted-foreground">Liberado em até {holdDays} dias</p>
        </CardContent>
      </Card>

      <Card className="bg-card border border-border/50 shadow-sm rounded-xl flex items-center justify-center">
        <CardContent className="p-5 text-center">
          <Button onClick={onCashOut} className="w-full">
            <DollarSign className="h-4 w-4 mr-2" /> Solicitar Saque
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
