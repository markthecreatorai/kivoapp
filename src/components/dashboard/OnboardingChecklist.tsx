import React, { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, X, ArrowRight, Rocket, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  action?: string;
  href?: string;
}

const STEP_KEYS = ["profile_complete", "payment_connected", "product_created", "product_published", "first_sale"] as const;

export function OnboardingChecklist() {
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [isVisible, setIsVisible] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const { currentWorkspace } = useWorkspace();

  const persistStep = useCallback(async (stepKey: string) => {
    if (!currentWorkspace) return;
    try {
      await supabase.from("onboarding_progress" as any).upsert({
        workspace_id: currentWorkspace.id,
        step_key: stepKey,
        completed_at: new Date().toISOString(),
      }, { onConflict: "workspace_id,step_key" });
    } catch {}
  }, [currentWorkspace]);

  useEffect(() => {
    if (!currentWorkspace) return;

    const checkOnboardingStatus = async () => {
      try {
        // ── Step 1: Profile complete ──────────────────────────────────
        // Consider complete if storefront has a non-empty title set
        let profileComplete = false;
        try {
          const { data: storefront } = await supabase
            .from("storefronts")
            .select("title, bio")
            .eq("workspace_id", currentWorkspace.id)
            .maybeSingle();
          profileComplete = !!(storefront?.title?.trim());
        } catch {}

        // ── Step 2: Payment connected ─────────────────────────────────
        let paymentConnected = false;
        try {
          const { data: bankAccounts } = await supabase
            .from("bank_accounts")
            .select("id")
            .eq("workspace_id", currentWorkspace.id)
            .limit(1);
          paymentConnected = (bankAccounts?.length || 0) > 0;
        } catch {}

        // ── Step 3: Product created (any status, including DRAFT) ─────
        let productCreated = false;
        let productPublished = false;
        try {
          const { data: products } = await supabase
            .from("products")
            .select("id, status")
            .eq("workspace_id", currentWorkspace.id)
            .is("deleted_at", null)
            .limit(20);

          productCreated = (products?.length || 0) > 0;
          // status field stores 'PUBLISHED' | 'DRAFT'
          productPublished = (products || []).some((p: any) => p.status === "PUBLISHED");
        } catch {
          // RLS fallback — read from persisted progress table
          try {
            const { data: progress } = await supabase
              .from("onboarding_progress" as any)
              .select("step_key, completed_at")
              .eq("workspace_id", currentWorkspace.id);
            const steps = (progress || []) as any[];
            productCreated = steps.some(s => s.step_key === "product_created" && s.completed_at);
            productPublished = steps.some(s => s.step_key === "product_published" && s.completed_at);
          } catch {}
        }

        // ── Step 4: First sale ────────────────────────────────────────
        let firstSale = false;
        try {
          const { data: sales } = await supabase
            .from("orders")
            .select("id")
            .eq("workspace_id", currentWorkspace.id)
            .eq("status", "PAID")
            .limit(1);
          firstSale = (sales?.length || 0) > 0;
        } catch {}

        // ── Persist completed steps ───────────────────────────────────
        if (profileComplete) persistStep("profile_complete");
        if (paymentConnected) persistStep("payment_connected");
        if (productCreated) persistStep("product_created");
        if (productPublished) persistStep("product_published");
        if (firstSale) {
          persistStep("first_sale");
          try {
            await supabase
              .from("workspaces")
              .update({ activated_at: new Date().toISOString() })
              .eq("id", currentWorkspace.id)
              .is("activated_at", null);
          } catch {}
        }

        const items: ChecklistItem[] = [
          {
            id: "profile",
            title: "Completar perfil da loja",
            description: "Configure nome, bio e aparência da sua storefront",
            completed: profileComplete,
            action: "Personalizar",
            href: "/store/editor",
          },
          {
            id: "payment",
            title: "Conectar pagamento",
            description: "Adicione sua conta bancária para receber",
            completed: paymentConnected,
            action: "Configurar",
            href: "/settings?tab=payments",
          },
          {
            id: "product",
            title: "Criar primeiro produto",
            description: "Adicione um produto digital, curso ou serviço",
            completed: productCreated,
            action: "Criar produto",
            href: "/products/new",
          },
          {
            id: "publish",
            title: "Publicar produto",
            description: "Torne seu produto visível para compradores",
            completed: productPublished,
            action: "Ver produtos",
            href: "/store?tab=loja",
          },
          {
            id: "sale",
            title: "Fazer primeira venda 🎉",
            description: "Compartilhe sua loja e conquiste seu primeiro cliente",
            completed: firstSale,
            action: "Compartilhar",
            href: "/store",
          },
        ];

        setChecklist(items);
        setIsVisible(!items.every(item => item.completed));
      } catch (error) {
        console.error("Erro ao verificar onboarding:", error);
      }
    };

    checkOnboardingStatus();
  }, [currentWorkspace, persistStep]);

  if (dismissed || !isVisible || checklist.length === 0) return null;

  const completedCount = checklist.filter(i => i.completed).length;
  const totalCount = checklist.length;
  const progress = (completedCount / totalCount) * 100;
  const nextStep = checklist.find(i => !i.completed);

  return (
    <div className="space-y-4">
      {/* Full checklist */}
      <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-lg font-semibold">Configuração inicial</CardTitle>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {completedCount} de {totalCount} etapas • {progress.toFixed(0)}% completo
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setDismissed(true)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-muted rounded-full h-2 mt-3">
            <div className="bg-primary h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </CardHeader>

        <CardContent>
          <div className="space-y-2">
            {checklist.map((item, index) => (
              <div
                key={item.id}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border transition-colors",
                  item.completed
                    ? "border-border/20 bg-muted/20"
                    : nextStep?.id === item.id
                    ? "border-primary/30 bg-primary/5"
                    : "border-border/30 hover:border-border/60"
                )}
              >
                <div className={cn(
                  "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold",
                  item.completed
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}>
                  {item.completed ? <Check className="h-3.5 w-3.5" /> : index + 1}
                </div>

                <div className="flex-1 min-w-0">
                  <p className={cn("font-medium text-sm", item.completed && "text-muted-foreground line-through")}>
                    {item.title}
                  </p>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>

                {!item.completed && item.action && item.href && (
                  <Button asChild size="sm" variant={nextStep?.id === item.id ? "default" : "outline"}>
                    <Link to={item.href}>{item.action}</Link>
                  </Button>
                )}
                {item.completed && (
                  <Badge variant="secondary" className="text-xs">Concluído</Badge>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
