import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Check, Crown, Sparkles, Zap, Download, Loader2 } from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { cn } from "@/lib/utils";

const PLANS = [
  { id: "free", code: "free", name: "Free", monthly: 0, annual: 0, features: ["1 produto", "Taxa de 7%", "Link-in-bio", "Com marca Kivo"] },
  { id: "creator", code: "creator", name: "Creator", monthly: 49, annual: 39, popular: true, features: ["Até 10 produtos", "Taxa de 5%", "Sem marca Kivo", "Área de membros", "Analytics básico"] },
  { id: "creator-pro", code: "creator-pro", name: "Creator Pro", monthly: 149, annual: 119, features: ["Produtos ilimitados", "Taxa de 3%", "WhatsApp integrado", "IA para conteúdo", "NFS-e automática", "Analytics avançado"] },
];

const INVOICES = [
  { id: "1", date: "01/03/2026", amount: "R$ 0,00", status: "Pago" },
  { id: "2", date: "01/02/2026", amount: "R$ 0,00", status: "Pago" },
];

export function SettingsBilling() {
  const { currentWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [isAnnual, setIsAnnual] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("free");

  const currentPlan = ((currentWorkspace as any)?.metadata as any)?.plan || "free";

  const handleUpgrade = () => {
    if (selectedPlan === "free" || selectedPlan === currentPlan) return;
    setShowPlanModal(false);
    navigate(`/pricing?plan=${selectedPlan}&source=settings_plans_modal`);
  };

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
        <CardHeader>
          <CardTitle className="text-lg">Seu Plano</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xl font-bold capitalize">{currentPlan === "creator-pro" ? "Creator Pro" : currentPlan}</p>
              <p className="text-sm text-muted-foreground">
                {currentPlan === "free" ? "Gratuito para sempre" : "Cobrado mensalmente"}
              </p>
            </div>
            <Badge variant="secondary" className="text-sm">Ativo</Badge>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10">
              Cancelar Assinatura
            </Button>
            <Button onClick={() => setShowPlanModal(true)}>Trocar Plano</Button>
          </div>
        </CardContent>
      </Card>

      {/* Invoices */}
      <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
        <CardHeader>
          <CardTitle className="text-lg">Faturas</CardTitle>
        </CardHeader>
        <CardContent>
          {INVOICES.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma fatura ainda</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {INVOICES.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>{inv.date}</TableCell>
                    <TableCell>{inv.amount}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="bg-accent/10 text-accent">{inv.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm"><Download className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Plan Modal */}
      <Dialog open={showPlanModal} onOpenChange={setShowPlanModal}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Trocar Plano</DialogTitle>
            <DialogDescription>Escolha o melhor plano para você</DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-center gap-3 py-2">
            <span className={cn("text-sm", !isAnnual && "font-semibold")}>Mensal</span>
            <Switch checked={isAnnual} onCheckedChange={setIsAnnual} />
            <span className={cn("text-sm", isAnnual && "font-semibold")}>
              Anual <Badge variant="secondary" className="ml-1 text-xs">-20%</Badge>
            </span>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {PLANS.map((plan) => {
              const price = isAnnual ? plan.annual : plan.monthly;
              const isCurrent = currentPlan === plan.id;
              const isSelected = selectedPlan === plan.id;
              return (
                <Card
                  key={plan.id}
                  className={cn(
                    "cursor-pointer transition-all hover:shadow-md relative",
                    isSelected && "ring-2 ring-primary",
                    isCurrent && "bg-muted/30"
                  )}
                  onClick={() => setSelectedPlan(plan.id)}
                >
                  {plan.popular && (
                    <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-primary text-xs">Popular</Badge>
                  )}
                  <CardContent className="p-4 space-y-3">
                    <p className="font-semibold">{plan.name}</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold">R${price}</span>
                      <span className="text-sm text-muted-foreground">/mês</span>
                    </div>
                    {isCurrent && <Badge variant="outline" className="text-xs">Plano Atual</Badge>}
                    <ul className="space-y-1.5">
                      {plan.features.map((f, i) => (
                        <li key={i} className="flex items-center gap-2 text-xs">
                          <Check className="h-3 w-3 text-accent shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPlanModal(false)}>Cancelar</Button>
            <Button
              disabled={selectedPlan === currentPlan || selectedPlan === "free"}
              onClick={handleUpgrade}
            >
              Assinar Plano
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
