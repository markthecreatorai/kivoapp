import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Store } from "lucide-react";
import { ensureProducerWorkspace } from "@/lib/accountType";
import { toast } from "sonner";

/**
 * Mostrado quando uma conta de MEMBRO tenta acessar uma área exclusiva de
 * infoprodutor. Em vez de jogar o usuário no onboarding de criador, oferecemos
 * o upgrade in-app (cria o workspace na hora e mantém o papel de membro).
 */
export default function ProducerUpgradePrompt() {
  const [loading, setLoading] = useState(false);

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      await ensureProducerWorkspace();
      window.location.href = "/onboarding";
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível ativar sua conta de criador");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
          <Store className="w-7 h-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">Área exclusiva de criadores</h1>
        <p className="text-sm text-muted-foreground">
          Sua conta é de membro. Para criar e vender produtos você precisa ativar
          sua conta de criador — leva alguns segundos e você continua com acesso a
          todas as comunidades que já participa.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
          <Button onClick={handleUpgrade} disabled={loading} className="h-11 font-semibold">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Quero vender na Kivo"}
          </Button>
          <Button variant="outline" className="h-11" asChild>
            <a href="/circles">Voltar para minhas comunidades</a>
          </Button>
        </div>
      </div>
    </div>
  );
}
