import { useState } from "react";
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
} from "lucide-react";
import { usePlanLimits } from "@/hooks/usePlanLimits";
import { UpgradeModal } from "@/components/UpgradeModal";
import { trackEvent } from "@/lib/tracking";
import type { Database } from "@/integrations/supabase/types";
import kivoReferralLogo from "@/assets/kivo-referral-logo.png";

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
  const [creatingId, setCreatingId] = useState<string | null>(null);
  
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState("");
  const planInfo = usePlanLimits();

  const handleSelectFormat = async (format: ProductFormatConfig) => {
    // Kivo affiliate → redirect to /referrals
    if (format.id === "affiliate") {
      navigate("/referrals");
      return;
    }

    if (!currentWorkspace?.id) {
      toast.error("Nenhum workspace ativo encontrado.");
      return;
    }
    
    // Validar limites de plano localmente
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

    setCreatingId(format.id);
    
    try {
      // Cria o draft (rascunho) na tabela 'products' seguindo a especificação
      const { data: product, error } = await supabase
        .from("products")
        .insert({
          workspace_id: currentWorkspace.id,
          type: format.dbType,
          status: "DRAFT",
          name: "Novo Produto", 
          slug: `novo-produto-${Date.now().toString(36)}`,
          metadata: { format_id: format.id }
        })
        .select("id")
        .single();

      if (error) throw error;
      
      trackEvent("product_draft_created", { type: format.dbType, format: format.id }, currentWorkspace.id);
      
      // Criar precos zero por padrao (ajuda no upsert futuro)
      await supabase.from("prices").insert({
        product_id: product.id,
        amount: 0,
        type: "ONE_TIME",
      });
      
      // Redireciona pro Editor
      navigate(`/products/${product.id}/edit`);
    } catch (err: any) {
      toast.error("Erro ao iniciar produto: " + err.message);
      setCreatingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] dark:bg-background">
      {/* Top bar simplificada */}
      <div className="bg-background/80 backdrop-blur border-b border-border/50">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center gap-4">
          <button
            onClick={() => navigate("/store?tab=loja")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar à Loja
          </button>
          <div className="flex-1" />
          <p className="text-sm font-medium text-foreground">Novo Produto</p>
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PRODUCT_FORMATS.map((format) => (
            <button
              key={format.id}
              disabled={creatingId !== null}
              onClick={() => handleSelectFormat(format)}
              className={cn(
                "group flex items-start gap-5 p-5 bg-card border border-border/60 rounded-2xl text-left transition-all",
                creatingId === format.id ? "opacity-60 scale-[0.98] border-primary" : "hover:border-primary/40 hover:shadow-sm"
              )}
            >
              {format.id === "affiliate" ? (
                <div className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 overflow-hidden">
                  <img src={kivoReferralLogo} alt="Kivo" className="h-12 w-12 object-contain" />
                </div>
              ) : (
                <div className={cn("h-12 w-12 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105", format.iconBg, format.iconColor)}>
                  <format.icon className={cn("h-6 w-6", creatingId === format.id ? "animate-pulse" : "")} />
                </div>
              )}
              <div className="flex-1">
                <h3 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                  {format.title}
                </h3>
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                  {format.description}
                </p>
              </div>
            </button>
          ))}
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
