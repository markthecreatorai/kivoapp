import { useCallback, useState } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Package,
  GraduationCap,
  Calendar,
  Truck,
  Megaphone,
  RefreshCw,
  MonitorPlay,
  Share2,
  Box,
  Users,
  Link2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { usePlanLimits } from "@/hooks/usePlanLimits";
import { UpgradeModal } from "@/components/UpgradeModal";
import { trackEvent } from "@/lib/tracking";
import type { Database } from "@/integrations/supabase/types";
import kivoReferralLogo from "@/assets/kivo-referral-logo.png";
import {
  createProductDraft,
  type DraftFormat,
} from "@/features/product-editor";

type ProductType = Database["public"]["Enums"]["product_type"];

interface ProductFormatConfig {
  id: string;
  dbType: ProductType;
  title: string;
  description: string;
  icon: React.ElementType;
  iconBg: string; // Tailwind bg color class for the icon
  iconColor: string; // Tailwind text color class for the icon
}

const PRODUCT_FORMATS: ProductFormatConfig[] = [
  {
    id: "collect_emails",
    dbType: "LEAD_MAGNET",
    title: "Coletar Emails / Aplicações",
    description: "Capture leads com formulário, lead magnet ou aplicação",
    icon: Megaphone,
    iconBg: "bg-pink-100 dark:bg-pink-900/30",
    iconColor: "text-pink-600 dark:text-pink-400",
  },
  {
    id: "digital_product",
    dbType: "DIGITAL",
    title: "Produto Digital",
    description: "PDFs, guias, templates, eBooks, arquivos e conteúdos digitais",
    icon: Package,
    iconBg: "bg-blue-100 dark:bg-blue-900/30",
    iconColor: "text-blue-600 dark:text-blue-400",
  },
  {
    id: "coaching_call",
    dbType: "SERVICE",
    title: "Call / Consultoria",
    description: "Calls estratégicas, consultorias, mentorias e sessões 1:1",
    icon: Calendar,
    iconBg: "bg-green-100 dark:bg-green-900/30",
    iconColor: "text-green-600 dark:text-green-400",
  },
  {
    id: "custom_product",
    dbType: "SERVICE",
    title: "Produto Personalizado",
    description: "Auditorias, análises, pedidos sob demanda, serviço customizado",
    icon: Box,
    iconBg: "bg-amber-100 dark:bg-amber-900/30",
    iconColor: "text-amber-600 dark:text-amber-400",
  },
  {
    id: "course",
    dbType: "COURSE",
    title: "Curso Online",
    description: "Crie, hospede e venda cursos com acesso estruturado",
    icon: GraduationCap,
    iconBg: "bg-indigo-100 dark:bg-indigo-900/30",
    iconColor: "text-indigo-600 dark:text-indigo-400",
  },
  {
    id: "recurring",
    dbType: "DIGITAL", 
    title: "Assinatura Recorrente",
    description: "Cobrança recorrente para acesso a conteúdo, benefícios ou comunidade",
    icon: RefreshCw,
    iconBg: "bg-purple-100 dark:bg-purple-900/30",
    iconColor: "text-purple-600 dark:text-purple-400",
  },
  {
    id: "webinar",
    dbType: "SERVICE",
    title: "Webinar / Evento",
    description: "Venda acesso para aulas ao vivo, workshops e eventos online",
    icon: MonitorPlay,
    iconBg: "bg-cyan-100 dark:bg-cyan-900/30",
    iconColor: "text-cyan-600 dark:text-cyan-400",
  },
  {
    id: "community",
    dbType: "COURSE", 
    title: "Comunidade",
    description: "Crie uma comunidade gratuita ou paga com acesso controlado",
    icon: Users,
    iconBg: "bg-gray-100 dark:bg-gray-800",
    iconColor: "text-gray-600 dark:text-gray-400",
  },
  {
    id: "url_media",
    dbType: "DIGITAL",
    title: "URL / Mídia",
    description: "Direcione para site, link externo, vídeo, playlist rápida",
    icon: Link2,
    iconBg: "bg-red-100 dark:bg-red-900/30",
    iconColor: "text-red-600 dark:text-red-400",
  },
  {
    id: "affiliate",
    dbType: "DIGITAL",
    title: "Link de Afiliado Kivo",
    description: "Indique a Kivo e receba 20% de comissão recorrente sobre cada assinatura",
    icon: Share2, // will be overridden with custom logo in render
    iconBg: "bg-transparent",
    iconColor: "",
  },
];

export default function NewProduct() {
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [errorByFormat, setErrorByFormat] = useState<Record<string, string>>({});

  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState("");
  const planInfo = usePlanLimits();

  const clearError = useCallback((id: string) => {
    setErrorByFormat((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const handleSelectFormat = useCallback(
    async (format: ProductFormatConfig) => {
      // Idempotência client-side: enquanto há criação em andamento,
      // ignora cliques (evita double-tap em qualquer card). O service
      // ainda dedupa por (workspace, format) caso essa barreira falhe.
      if (creatingId !== null) return;

      if (!currentWorkspace?.id) {
        toast.error("Nenhum workspace ativo encontrado.");
        return;
      }

      if (!planInfo.canCreateProduct) {
        setUpgradeFeature("criar mais produtos");
        setUpgradeOpen(true);
        return;
      }
      if (format.dbType === "COURSE" && !planInfo.canCreateCourse) {
        setUpgradeFeature("criar cursos");
        setUpgradeOpen(true);
        return;
      }

      clearError(format.id);
      setCreatingId(format.id);

      // Caso especial afiliado: garantir referral profile antes
      let referralLink = "";
      if (format.id === "affiliate" && user) {
        try {
          const { data: refProfile } = await supabase
            .from("referral_profiles")
            .select("referral_code, referral_link")
            .eq("user_id", user.id)
            .maybeSingle();
          if (refProfile?.referral_code) {
            referralLink = `${window.location.origin}/?ref=${refProfile.referral_code}`;
          } else {
            const baseName =
              user.user_metadata?.full_name?.split(" ")[0]?.toLowerCase() ||
              user.email?.split("@")[0]?.toLowerCase() ||
              "creator";
            const code = `${baseName}${Math.floor(Math.random() * 1000)}`.replace(
              /[^a-z0-9-]/g,
              "",
            );
            referralLink = `${window.location.origin}/?ref=${code}`;
            await supabase.from("referral_profiles").insert({
              user_id: user.id,
              referral_code: code,
              referral_link: referralLink,
            });
          }
        } catch {
          /* não bloqueia: produto ainda pode ser criado sem o link */
        }
      }

      const isAffiliate = format.id === "affiliate";
      const draftFormat: DraftFormat = {
        id: format.id,
        dbType: format.dbType,
        defaultName: isAffiliate ? "Link de Afiliado Kivo" : "Novo Produto",
        publishImmediately: isAffiliate,
        extraMetadata:
          isAffiliate && referralLink ? { referral_link: referralLink } : {},
      };

      try {
        const { productId, reused } = await createProductDraft({
          workspaceId: currentWorkspace.id,
          format: draftFormat,
        });

        trackEvent(
          "product_draft_created",
          { type: format.dbType, format: format.id, reused },
          currentWorkspace.id,
        );

        navigate(`/products/${productId}/edit`);
      } catch (err: any) {
        const message =
          err?.message ?? "Não foi possível criar o rascunho. Tente novamente.";
        setErrorByFormat((prev) => ({ ...prev, [format.id]: message }));
        toast.error("Erro ao iniciar produto: " + message);
        setCreatingId(null);
      }
    },
    [creatingId, currentWorkspace?.id, planInfo, user, navigate, clearError],
  );

  return (
    <div className="min-h-screen bg-[#F8F9FA] dark:bg-background">
      {/* Top bar com breadcrumb consistente */}
      <div className="bg-background/80 backdrop-blur border-b border-border/50">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center gap-4">
          <button
            onClick={() => navigate("/store?tab=loja")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            data-testid="np-breadcrumb-back"
            aria-label="Voltar para a Loja"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar à Loja
          </button>
          <nav
            className="flex-1 flex items-center text-sm text-muted-foreground"
            aria-label="Trilha de navegação"
          >
            <span className="hidden md:inline">Loja</span>
            <span className="hidden md:inline mx-2">/</span>
            <span className="hidden md:inline text-foreground">Novo Produto</span>
          </nav>
          <p className="text-sm font-medium text-foreground md:hidden">Novo Produto</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-12">
        {/* Header */}
        <div className="max-w-xl mb-10">
          <h1 className="text-2xl font-bold text-foreground">Escolha o formato do seu produto</h1>
          <p className="text-muted-foreground mt-2">
            Selecione o formato que melhor se adapta ao que você quer oferecer à sua audiência. O rascunho será salvo e você poderá configurar os detalhes no editor.
          </p>
        </div>

        {/* Formats Grid */}
        <div
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
          aria-busy={creatingId !== null}
        >
          {PRODUCT_FORMATS.map((format) => {
            const isCreating = creatingId === format.id;
            const error = errorByFormat[format.id];
            const disabled = creatingId !== null;
            return (
              <div key={format.id} className="space-y-2">
                <button
                  type="button"
                  data-testid={`np-format-${format.id}`}
                  disabled={disabled}
                  aria-disabled={disabled}
                  aria-busy={isCreating}
                  onClick={() => handleSelectFormat(format)}
                  className={cn(
                    "w-full group flex items-start gap-5 p-5 bg-card border border-border/60 rounded-2xl text-left transition-all",
                    isCreating
                      ? "opacity-90 scale-[0.99] border-primary"
                      : "hover:border-primary/40 hover:shadow-sm",
                    disabled && !isCreating && "opacity-60 cursor-not-allowed",
                  )}
                >
                  {format.id === "affiliate" ? (
                    <div className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 overflow-hidden">
                      <img src={kivoReferralLogo} alt="Kivo" className="h-12 w-12 object-contain" />
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "h-12 w-12 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105",
                        format.iconBg,
                        format.iconColor,
                      )}
                    >
                      <format.icon className={cn("h-6 w-6", isCreating && "opacity-0")} />
                      {isCreating && (
                        <Loader2
                          className="absolute h-5 w-5 animate-spin"
                          data-testid={`np-loading-${format.id}`}
                        />
                      )}
                    </div>
                  )}
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
                      {format.title}
                      {isCreating && (
                        <span className="text-xs font-normal text-primary inline-flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Criando rascunho…
                        </span>
                      )}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {format.description}
                    </p>
                  </div>
                </button>

                {/* Fallback de erro com retry */}
                {error && (
                  <div
                    role="alert"
                    data-testid={`np-error-${format.id}`}
                    className="flex items-start gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive"
                  >
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium">Não foi possível criar o rascunho</p>
                      <p className="text-xs opacity-80 mt-0.5">{error}</p>
                    </div>
                    <button
                      type="button"
                      data-testid={`np-retry-${format.id}`}
                      onClick={() => handleSelectFormat(format)}
                      className="text-xs font-medium underline underline-offset-2 hover:no-underline"
                    >
                      Tentar novamente
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <UpgradeModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        currentPlan={planInfo.plan}
        feature={upgradeFeature}
      />
    </div>
  );
}
