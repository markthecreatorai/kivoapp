import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

import CollectEmailsFlow from "./editor/CollectEmailsFlow";
import {
  ProductEditorProvider,
  supabaseSaveAdapter,
} from "@/features/product-editor";
import DigitalProductFlow from "./editor/DigitalProductFlow";
import CustomProductFlow from "./editor/CustomProductFlow";
import UrlMediaFlow from "./editor/UrlMediaFlow";
import RecurringProductFlow from "./editor/RecurringProductFlow";
import WebinarProductFlow from "./editor/WebinarProductFlow";
import CoachingCallFlow from "./editor/CoachingCallFlow";
import CommunityFlow from "./editor/CommunityFlow";
import CourseFlow from "./editor/CourseFlow";

export default function ProductEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
  const queryClient = useQueryClient();

  // Buscar dados do produto (Draft) e seu profile financeiro associado
  const { data: product, isLoading, error } = useQuery({
    queryKey: ["product", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(`*, prices(*)`)
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const [saving, setSaving] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Carregando editor...</p>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm font-medium text-foreground">Produto não encontrado.</p>
        <Button variant="outline" onClick={() => navigate("/store?tab=loja")}>
          Voltar para Loja
        </Button>
      </div>
    );
  }

  // O Flow escolhido é derivado pelo metadata.format_id (Ex: 'collect_emails')
  // Se não existir (legados), recai pro DB 'type'
  const formatId = (product as any)?.metadata?.format_id || product.type.toLowerCase();

  // Dependendo do config type, renderiza o Componente Main Handler apropriado
  const renderFlow = () => {
    switch (formatId) {
      case "collect_emails":
      case "lead_magnet":
        return (
          <ProductEditorProvider initialRow={product as any} adapter={supabaseSaveAdapter}>
            <CollectEmailsFlow initialProduct={product} setSaving={setSaving} />
          </ProductEditorProvider>
        );
      case "digital_product":
      case "digital":
        return <DigitalProductFlow initialProduct={product} setSaving={setSaving} />;
      case "recurring":
      case "recurring_membership":
        return <RecurringProductFlow initialProduct={product} setSaving={setSaving} />;
      case "coaching_call":
        return <CoachingCallFlow initialProduct={product} setSaving={setSaving} />;
      case "community":
        return <CommunityFlow initialProduct={product} setSaving={setSaving} />;
      case "course":
      case "online_course":
        return <CourseFlow initialProduct={product} setSaving={setSaving} />;
      case "custom_product":
      case "service":
        return <CustomProductFlow initialProduct={product} setSaving={setSaving} />;
      case "url_media":
      case "affiliate":
      case "referral_link":
        return <UrlMediaFlow initialProduct={product} setSaving={setSaving} />;
      case "webinar":
      case "event":
        return <WebinarProductFlow initialProduct={product} setSaving={setSaving} />;
      default:
        // Fallback pro "em breve" ou placeholder
        return (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-center border-dashed border-2 rounded-2xl m-6">
            <p className="font-semibold text-lg text-foreground">Editor em construção</p>
            <p className="text-muted-foreground mt-2">O layout do editor para formato `{formatId}` será implementado em breve.</p>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* ── Editor Shared NavBar ── */}
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <button
            onClick={() => navigate("/store?tab=loja")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Minha Loja
          </button>
          
          <span className="text-muted-foreground/30">/</span>
          <span className="text-sm font-medium text-foreground truncate max-w-[200px] sm:max-w-md">
            {product.name || "Sem título"}
          </span>

          <div className="flex-1" />
          
          {/* Save button removed — each flow handles its own autosave */}
        </div>
      </div>

      {/* ── Content Area ── */}
      {renderFlow()}
      
    </div>
  );
}
