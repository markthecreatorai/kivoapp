import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Wallet, Clock, DollarSign, TrendingUp, Shield, ArrowRight } from "lucide-react";

interface BalanceCardsProps {
  grossRevenue: number;
  netRevenue: number;
  availableBalance: number;
  reserveBalance: number;
  isLoading: boolean;
  onCashOut: () => void;
  onBreakdown: () => void;
  onReserves: () => void;
  fmt: (cents: number) => string;
}

export function BalanceCards({
  grossRevenue, netRevenue, availableBalance, reserveBalance,
  isLoading, onCashOut, onBreakdown, onReserves, fmt,
}: BalanceCardsProps) {
  const cards = [
    {
      icon: TrendingUp,
      label: "Receita Bruta",
      value: grossRevenue,
      color: "text-foreground",
      action: null,
    },
    {
      icon: DollarSign,
      label: "Receita Líquida",
      value: netRevenue,
      color: "text-green-600",
      action: { label: "Ver detalhes", onClick: onBreakdown },
    },
    {
      icon: Wallet,
      label: "Disponível para Saque",
      value: availableBalance,
      color: "text-primary",
      action: { label: "Solicitar saque", onClick: onCashOut, primary: true },
    },
    {
      icon: Shield,
      label: "Em Reserva",
      value: reserveBalance,
      color: "text-muted-foreground",
      action: { label: "Ver reservas", onClick: onReserves },
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => (
        <Card key={c.label} className="bg-card border border-border/50 shadow-sm rounded-xl">
          <CardContent className="p-5 space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
              <c.icon className="h-4 w-4" /> {c.label}
            </div>
            {isLoading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <p className={`text-2xl font-bold ${c.color}`}>{fmt(c.value)}</p>
            )}
            {c.action && (
              c.action.primary ? (
                <Button size="sm" className="w-full mt-1" onClick={c.action.onClick}>
                  <DollarSign className="h-3.5 w-3.5 mr-1" /> {c.action.label}
                </Button>
              ) : (
                <button
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                  onClick={c.action.onClick}
                >
                  {c.action.label} <ArrowRight className="h-3 w-3" />
                </button>
              )
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
