import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { XCircle } from "lucide-react";

export default function BillingCancel() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center space-y-4">
          <XCircle className="h-12 w-12 text-muted-foreground mx-auto" />
          <h2 className="text-xl font-bold text-foreground">Checkout cancelado</h2>
          <p className="text-muted-foreground text-sm">
            Você cancelou o processo de assinatura. Nenhuma cobrança foi realizada.
          </p>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => navigate("/dashboard")}>
              Voltar ao Dashboard
            </Button>
            <Button className="flex-1" onClick={() => navigate("/pricing")}>
              Ver Planos
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
