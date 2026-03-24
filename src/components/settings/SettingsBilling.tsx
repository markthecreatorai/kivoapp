import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download } from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceProvider";

const INVOICES = [
  { id: "1", date: "01/03/2026", amount: "R$ 0,00", status: "Pago" },
  { id: "2", date: "01/02/2026", amount: "R$ 0,00", status: "Pago" },
];

export function SettingsBilling() {
  const { currentWorkspace } = useWorkspace();

  const currentPlan = ((currentWorkspace as any)?.metadata as any)?.plan || "free";

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
            <Button asChild>
              <a href={`/#pricing?source_ui=settings_billing&plan=creator`} rel="nofollow">
                Trocar Plano
              </a>
            </Button>
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
    </div>
  );
}
