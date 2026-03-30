import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Rocket, Save, Mail, ChevronDown, ChevronUp,
  Users, CheckCircle2, Copy, CircleDashed, LogIn, KeySquare, Plus
} from "lucide-react";
import { FormFieldsBuilder } from "@/components/FormFieldsBuilder";
import { ReviewsBuilder } from "@/components/ReviewsBuilder";
import { RichTextEditor } from "@/components/RichTextEditor";
import { useWorkspace } from "@/contexts/WorkspaceProvider";

export default function CommunityFlow({
  initialProduct,
  setSaving,
}: {
  initialProduct: any;
  setSaving: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { currentWorkspace } = useWorkspace();
  const [tab, setTab] = useState("thumbnail");

  const initialPriceConfig = initialProduct.prices?.[0] || { amount: 0, compare_at_amount: null, type: "ONE_TIME" };

  const [form, setForm] = useState({
    // THUMBNAIL Tab
    cardStyle: initialProduct.thumbnail_style || "callout", // button | callout
    name: initialProduct.name || "",
    shortDescription: initialProduct.short_description || "",
    ctaText: initialProduct.listing_button_text || "Entrar na Comunidade",
    thumbnailUrl: initialProduct.thumbnail_url || "",
    
    // CHECKOUT Tab
    checkoutImage: initialProduct.checkout_image || "",
    description: initialProduct.checkout_description || "",
    isFree: initialPriceConfig.amount === 0,
    price: initialPriceConfig.amount || 0,
    compareAtPrice: initialPriceConfig.compare_at_amount,
    pricingType: initialPriceConfig.type || "ONE_TIME", // ONE_TIME | RECURRING
    billingInterval: initialPriceConfig.interval || "MONTHLY",
    
    // COMMUNITY Tab
    circleId: initialProduct.circle_id || null,

    // OPÇÕES Tab
    confirmationSubject: initialProduct.confirmation_email_subject || "Acesso Liberado: Comunidade",
    confirmationBody: initialProduct.confirmation_email_body || "Obrigado por se juntar à comunidade. Acesse sua conta para começar a interagir.",
  });

  const updateForm = (updates: Partial<typeof form>) => setForm((p) => ({ ...p, ...updates }));

  const [openEmail, setOpenEmail] = useState(false);
  const [showCircleModal, setShowCircleModal] = useState(false);

  // Fetch user circles to link
  const { data: userCircles, isLoading: loadingCircles } = useQuery({
    queryKey: ["workspace_circles", currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return [];
      const { data, error } = await (supabase as any)
        .from("circles")
        .select("*")
        .eq("workspace_id", currentWorkspace.id);
      if (error) throw error;
      return data;
    },
    enabled: !!currentWorkspace?.id,
  });

  const linkedCircle = userCircles?.find(c => c.id === form.circleId);

  const saveMutation = useMutation({
    mutationFn: async (status: "DRAFT" | "PUBLISHED") => {
      setSaving(true);

      if (status === "PUBLISHED" && !form.circleId) {
         throw new Error("Você precisa vincular uma comunidade antes de publicar este produto.");
      }

      // Update Product
      const { error: prodError } = await supabase.from("products").update({
        status,
        name: form.name,
        short_description: form.shortDescription,
        listing_button_text: form.ctaText,
        thumbnail_style: form.cardStyle,
        thumbnail_url: form.thumbnailUrl,
        checkout_image: form.checkoutImage,
        checkout_description: form.description,
        circle_id: form.circleId,
        delivery_mode: "community", // Identificador interno
        confirmation_email_subject: form.confirmationSubject,
        confirmation_email_body: form.confirmationBody,
      }).eq("id", initialProduct.id);

      if (prodError) throw prodError;

      // Update Prices
      const priceData = {
         product_id: initialProduct.id,
         amount: form.isFree ? 0 : form.price,
         compare_at_amount: form.compareAtPrice,
         type: form.pricingType,
         interval: form.pricingType === "RECURRING" ? form.billingInterval : null,
      };

      if (initialPriceConfig.id) {
         await supabase.from("prices").update(priceData).eq("id", initialPriceConfig.id);
      } else {
         await supabase.from("prices").insert(priceData);
      }

      return status;
    },
    onSuccess: (status) => {
      queryClient.invalidateQueries({ queryKey: ["product", initialProduct.id] });
      toast.success(status === "PUBLISHED" ? "Comunidade Publicada na Loja!" : "Rascunho salvo!");
    },
    onError: (err: any) => {
      toast.error("Erro ao salvar: " + err.message);
    },
    onSettled: () => setSaving(false),
  });

  const handleNext = () => {
    if (tab === "thumbnail") {
      if (!form.name.trim()) { toast.error("Informe um nome."); return; }
      setTab("checkout");
    } else if (tab === "checkout") {
      if (!form.isFree && form.price <= 0) { toast.error("Informe um preço ou marque gratuito."); return; }
      setTab("community");
    } else if (tab === "community") {
      setTab("opcoes");
    }
  };

  const CARD_STYLES = [
    { key: "callout", label: "Callout", desc: "Imagem com detalhes" },
    { key: "button", label: "Button", desc: "Apenas botão minimalista" },
  ];

  const MobilePreview = () => (
    <div className="hidden lg:block w-[320px] shrink-0 sticky top-24">
      <p className="text-xs font-medium text-slate-600/60 dark:text-slate-500/50 mb-3 text-center uppercase tracking-widest font-semibold flex items-center justify-center gap-1">
        <Users className="w-3 h-3" /> Preview de Comunidade
      </p>

      {/* Fake Phone */}
      <div className="w-[320px] h-[600px] bg-black rounded-[40px] p-2 shadow-xl flex flex-col justify-start">
        <div className="w-full h-full rounded-[32px] overflow-hidden bg-[#F5F5F5] dark:bg-zinc-950 flex flex-col relative overflow-y-auto">
          {/* Notch */}
          <div className="w-32 h-6 bg-black absolute top-0 inset-x-0 mx-auto rounded-b-xl z-20"></div>

          {/* Thumbnail Preview */}
          {tab === "thumbnail" && (
            <div className="p-4 pt-10 flex items-center h-full">
              {form.cardStyle === "button" && (
                <div className="w-full py-4 px-6 rounded-2xl border-2 border-slate-700 bg-white dark:bg-zinc-900 text-center text-sm font-bold text-zinc-900 dark:text-zinc-100 shadow-sm truncate">
                  {form.name || "Nome da Comunidade"}
                </div>
              )}
              {form.cardStyle === "callout" && (
                <div className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
                  {form.thumbnailUrl ? (
                      <div className="h-32 bg-zinc-100 dark:bg-zinc-800 overflow-hidden rounded-xl mb-4">
                          <img src={form.thumbnailUrl} className="w-full h-full object-cover" />
                      </div>
                  ) : (
                      <div className="h-32 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center rounded-xl mb-4 text-zinc-400">
                         <Users className="w-8 h-8 opacity-20" />
                      </div>
                  )}
                  
                  <div className="flex items-center gap-2 mb-2">
                     <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent hover:bg-secondary/80 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-bold">COMUNIDADE</span>
                  </div>

                  <p className="font-bold text-zinc-900 dark:text-zinc-100 text-lg leading-snug">{form.name || "Comunidade VIP"}</p>
                  {form.shortDescription && (
                    <p className="text-sm text-zinc-500 mt-2 line-clamp-2">{form.shortDescription}</p>
                  )}
                  <div className="mt-5 py-3 rounded-xl bg-slate-800 dark:bg-slate-700 text-white text-sm font-medium text-center">
                    {form.ctaText || "Entrar na Comunidade"}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Checkout Preview */}
          {(tab === "checkout" || tab === "community" || tab === "opcoes") && (
            <div className="bg-white dark:bg-zinc-900 min-h-full">
              {form.checkoutImage ? (
                <div className="h-40 overflow-hidden relative">
                  <img src={form.checkoutImage} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-900/80 to-transparent"></div>
                </div>
              ) : (
                <div className="h-20 bg-slate-900 shrink-0" />
              )}

              <div className="p-5 space-y-4 -mt-8 relative z-10">
                 <div className="w-16 h-16 rounded-xl bg-white dark:bg-zinc-800 border-4 border-white dark:border-zinc-900 shadow-md flex items-center justify-center overflow-hidden mb-3">
                   {form.thumbnailUrl ? (
                     <img src={form.thumbnailUrl} className="w-full h-full object-cover" />
                   ) : <Users className="w-6 h-6 text-slate-400" />}
                 </div>

                <p className="font-bold text-xl text-zinc-900 dark:text-zinc-100 leading-snug">{form.name || "Acesso à Comunidade"}</p>
                
                <div className="flex items-center gap-2">
                  {!form.isFree && form.price > 0 && (
                    <span className="text-2xl font-bold text-slate-800 dark:text-slate-200">
                      R$ {form.price.toFixed(2).replace(".", ",")}
                      {form.pricingType === "RECURRING" && <span className="text-sm text-zinc-500 font-medium">/{form.billingInterval === "YEARLY" ? "ano" : "mês"}</span>}
                    </span>
                  )}
                  {form.isFree && <span className="text-xl font-bold text-slate-800 dark:text-slate-200">Acesso Gratuito</span>}
                </div>

                {form.description && (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2 leading-relaxed line-clamp-4">
                    {form.description}
                  </p>
                )}

                <div className="pt-4 space-y-3">
                   <div className="space-y-1">
                     <div className="h-10 border rounded-lg bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700" />
                   </div>
                   <div className="pt-2">
                      <div className="w-full py-4 rounded-xl bg-slate-900 dark:bg-slate-700 text-white font-bold text-center shadow-lg shadow-slate-900/20">
                        {form.ctaText || "Participar Agora"}
                      </div>
                   </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-col lg:flex-row gap-10">
        
        {/* Lado Esquerdo - Formulário */}
        <div className="flex-1 min-w-0">
          <Tabs value={tab} onValueChange={setTab} className="mb-8">
            <TabsList className="bg-muted/50 p-1 w-full flex mb-6">
              <TabsTrigger value="thumbnail" className="flex-1 text-xs sm:text-sm">1. Divulgação</TabsTrigger>
              <TabsTrigger value="checkout" className="flex-1 text-xs sm:text-sm">2. Venda & Planos</TabsTrigger>
              <TabsTrigger value="community" className="flex-1 text-xs sm:text-sm">3. Comunidade</TabsTrigger>
              <TabsTrigger value="opcoes" className="flex-1 text-xs sm:text-sm">4. Opções</TabsTrigger>
            </TabsList>

            {/* ABA: THUMBNAIL */}
            <TabsContent value="thumbnail" className="space-y-8 animate-in fade-in">
              <div className="space-y-2">
                <h2 className="text-xl font-bold flex items-center gap-2"><Users className="w-5 h-5 text-slate-600"/> Vender Acesso à Comunidades</h2>
                <p className="text-sm text-muted-foreground">Crie assinaturas ou cobre acesso vitalício a grupos da sua área Circle.</p>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-semibold">Decida o Estilo da Vitrine</Label>
                <div className="flex gap-3">
                  {CARD_STYLES.map(({ key, label, desc }) => (
                    <button
                      key={key}
                      onClick={() => updateForm({ cardStyle: key })}
                      className={cn(
                        "flex-1 p-3 rounded-xl border-2 text-center transition-all",
                        form.cardStyle === key
                          ? "border-slate-800 dark:border-slate-500 bg-slate-800/5 text-slate-800 dark:text-slate-300"
                          : "border-border bg-card hover:border-border/80 text-foreground"
                      )}
                    >
                      <p className="text-sm font-semibold">{label}</p>
                      <p className="text-[10px] text-muted-foreground mt-1 hidden sm:block">{desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {form.cardStyle !== "button" && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Imagem de Capa / Icone (URL)</Label>
                  <Input 
                    placeholder="Link do logo da comunidade..." 
                    value={form.thumbnailUrl} onChange={e => updateForm({thumbnailUrl: e.target.value})}
                  />
                </div>
              )}

              <div className="space-y-4 border-t border-border/40 pt-6">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Nome da Oferta *</Label>
                  <Input 
                    placeholder="Ex: Acesso VIP Club" 
                    maxLength={80}
                    value={form.name} onChange={e => updateForm({name: e.target.value})}
                  />
                  <p className="text-right text-[10px] text-muted-foreground">{form.name.length}/80</p>
                </div>

                {form.cardStyle !== "button" && (
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Pequena Descrição (Opcional)</Label>
                    <Textarea 
                      placeholder="Descreva o que o membro ganha participando desse grupo." 
                      maxLength={120}
                      value={form.shortDescription} onChange={e => updateForm({shortDescription: e.target.value})}
                      rows={2}
                      className="resize-none"
                    />
                    <p className="text-right text-[10px] text-muted-foreground">{form.shortDescription.length}/120</p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Texto do Botão</Label>
                  <Input 
                    placeholder="Assinar Agora" 
                    maxLength={30}
                    value={form.ctaText} onChange={e => updateForm({ctaText: e.target.value})}
                  />
                </div>
              </div>
            </TabsContent>

            {/* ABA: CHECKOUT */}
            <TabsContent value="checkout" className="space-y-8 animate-in fade-in">
              <div className="space-y-2">
                <h2 className="text-xl font-bold">Página de Checkout e Preço</h2>
                <p className="text-sm text-muted-foreground">Como será cobrado o acesso a essa comunidade?</p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">Capa do Checkout (Hero Image)</Label>
                <Input 
                  placeholder="https://..." 
                  value={form.checkoutImage} onChange={e => updateForm({checkoutImage: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold text-foreground">Apresentação da Oferta</Label>
                <RichTextEditor
                  placeholder="Descreva as vantagens de se juntar. Salas, networking, etc."
                  value={form.description}
                  onChange={v => updateForm({description: v})}
                  minHeight="120px"
                />
              </div>

              {/* Precificação */}
              <div className="space-y-4 p-5 rounded-2xl border border-border/60 bg-card shadow-sm">
                <p className="text-base font-semibold text-foreground border-b pb-2">Modelo de Cobrança</p>

                <div className="flex gap-2">
                   <Button 
                     variant={form.pricingType === "ONE_TIME" ? "default" : "outline"} 
                     onClick={() => updateForm({pricingType: "ONE_TIME"})} 
                     className={cn("flex-1", form.pricingType === "ONE_TIME" && "bg-slate-800 text-white hover:bg-slate-900")}
                   >
                     Acesso Vitalício / Único
                   </Button>
                   <Button 
                     variant={form.pricingType === "RECURRING" ? "default" : "outline"} 
                     onClick={() => updateForm({pricingType: "RECURRING"})} 
                     className={cn("flex-1", form.pricingType === "RECURRING" && "bg-slate-800 text-white hover:bg-slate-900")}
                   >
                     Assinatura Recorrente
                   </Button>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <Switch
                    checked={form.isFree}
                    onCheckedChange={(v) => updateForm({ isFree: v })}
                  />
                  <Label className="text-sm cursor-pointer">Acesso Totalmente Gratuito</Label>
                </div>

                {!form.isFree && (
                  <div className="pt-2 animate-in fade-in slide-in-from-top-2">
                    <div className="flex gap-4">
                       <div className="flex-1 space-y-1.5">
                         <Label className="text-xs text-muted-foreground">Valor (R$) *</Label>
                         <Input
                           type="number" min={0} step={0.01} placeholder="0,00"
                           className="text-lg font-mono font-medium focus-visible:ring-slate-500"
                           value={form.price || ""} onChange={(e) => updateForm({ price: Number(e.target.value) })}
                         />
                       </div>

                       {form.pricingType === "RECURRING" && (
                         <div className="flex-1 space-y-1.5">
                           <Label className="text-xs text-muted-foreground">Ciclo de Cobrança</Label>
                           <Select value={form.billingInterval} onValueChange={(v) => updateForm({ billingInterval: v })}>
                             <SelectTrigger className="h-[42px]">
                               <SelectValue />
                             </SelectTrigger>
                             <SelectContent>
                               <SelectItem value="WEEKLY">Semanal</SelectItem>
                               <SelectItem value="MONTHLY">Mensal</SelectItem>
                               <SelectItem value="QUARTERLY">Trimestral</SelectItem>
                               <SelectItem value="SEMIANNUAL">Semestral</SelectItem>
                               <SelectItem value="YEARLY">Anual</SelectItem>
                             </SelectContent>
                           </Select>
                         </div>
                       )}
                    </div>
                  </div>
                )}
              </div>

              {/* Formulário / Dados do Cliente */}
              <div className="space-y-4 pt-4 mt-6 border-t border-border/40">
                   <div className="space-y-1">
                     <p className="text-base font-semibold text-foreground">Campos do Checkout</p>
                     <p className="text-sm text-muted-foreground">Colete informações extras do membro antes da aprovação.</p>
                   </div>
                   <FormFieldsBuilder productId={initialProduct.id} />
              </div>
            </TabsContent>

            {/* ABA: COMMUNITY (VINCULAÇÃO) */}
            <TabsContent value="community" className="space-y-8 animate-in fade-in">
              <div className="space-y-2">
                <h2 className="text-xl font-bold border-b pb-2">Comunidade Vinculada</h2>
                <p className="text-sm text-muted-foreground block mb-4">Escolha qual comunidade ou grupo de alunos será liberado após a compra aprovada.</p>
              </div>

              {!form.circleId ? (
                 <div className="border-2 border-dashed border-border rounded-xl p-8 text-center bg-card">
                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4 text-muted-foreground">
                       <CircleDashed className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">Nenhuma comunidade vinculada</h3>
                    <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
                       Você precisa selecionar uma comunidade existente ou criar uma nova para vender acesso.
                    </p>
                    <div className="flex items-center justify-center gap-3">
                       <Button variant="outline" onClick={() => setShowCircleModal(true)}>
                          <LogIn className="w-4 h-4 mr-2" /> Selecionar Existente
                       </Button>
                       <Button className="bg-slate-800 text-white hover:bg-slate-900" onClick={() => toast.info("Vá no menu Communities para criar uma nova e depois volte aqui.")}>
                          <Plus className="w-4 h-4 mr-2" /> Nova Comunidade
                       </Button>
                    </div>
                 </div>
              ) : (
                 <div className="border border-green-500/30 bg-green-50/10 dark:bg-green-900/10 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                       <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold text-green-600 border-green-500/30 bg-green-50 gap-1"><CheckCircle2 className="w-3 h-3"/> Vínculo Ativo</span>
                       <Button variant="ghost" size="sm" onClick={() => updateForm({circleId: null})} className="text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 h-8">
                          Desvincular
                       </Button>
                    </div>

                    <div className="flex items-center gap-4 bg-card p-4 rounded-xl border border-border shadow-sm">
                       <div className="w-14 h-14 rounded-lg bg-slate-100 flex items-center justify-center overflow-hidden border">
                          {linkedCircle?.logo_url ? (
                             <img src={linkedCircle.logo_url} className="w-full h-full object-cover" />
                          ) : <Users className="w-6 h-6 text-slate-400" />}
                       </div>
                       <div className="flex-1">
                          <p className="font-bold text-lg text-foreground leading-tight">{linkedCircle?.name || "..."}</p>
                          <p className="text-sm text-muted-foreground">Acesso direto ao espaço da comunidade</p>
                       </div>
                       <Button variant="outline" size="sm" onClick={() => setShowCircleModal(true)}>
                          Trocar
                       </Button>
                    </div>
                 </div>
              )}

              {/* Modal de Seleção */}
              {showCircleModal && (
                 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-card rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                       <div className="p-4 border-b bg-muted/30 flex justify-between items-center">
                          <h3 className="font-bold">Selecione a Comunidade</h3>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setShowCircleModal(false)}>✕</Button>
                       </div>
                       <div className="p-4 overflow-y-auto w-full">
                          {loadingCircles ? (
                             <p className="text-center text-muted-foreground py-8">Carregando...</p>
                          ) : userCircles?.length === 0 ? (
                             <p className="text-center text-muted-foreground py-8 text-sm">Nenhuma comunidade criada neste workspace ainda.</p>
                          ) : (
                             <div className="space-y-2">
                                {userCircles?.map(circle => (
                                   <div 
                                      key={circle.id} 
                                      className={cn("flex items-center gap-3 p-3 rounded-xl border cursor-pointer hover:bg-muted/50 transition-colors", form.circleId === circle.id ? "border-slate-800 bg-slate-50 dark:bg-slate-900/30" : "border-border")}
                                      onClick={() => {
                                         updateForm({circleId: circle.id});
                                         setShowCircleModal(false);
                                      }}
                                   >
                                      <div className="w-10 h-10 rounded-md bg-slate-200 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
                                          {circle.logo_url ? <img src={circle.logo_url} className="w-full h-full object-cover" /> : <Users className="w-5 h-5 text-slate-400" />}
                                      </div>
                                      <p className="font-semibold text-sm flex-1">{circle.name}</p>
                                      {form.circleId === circle.id && <CheckCircle2 className="w-5 h-5 text-slate-800 dark:text-slate-400" />}
                                   </div>
                                ))}
                             </div>
                          )}
                       </div>
                    </div>
                 </div>
              )}

            </TabsContent>

            {/* ABA: OPÇÕES */}
            <TabsContent value="opcoes" className="space-y-6 animate-in fade-in">
              <div className="space-y-2">
                <h2 className="text-xl font-bold">Automações Pós-Compra</h2>
                <p className="text-sm text-muted-foreground">Configurações opcionais após a aprovação do grupo.</p>
              </div>

              <div className="space-y-3">
                 <div className={cn("rounded-xl border bg-card transition-all mt-6", openEmail ? "border-slate-500/40 shadow-sm" : "border-border/60 hover:border-border")}>
                    <div className="flex items-center gap-3 p-4 cursor-pointer select-none" onClick={() => setOpenEmail(!openEmail)}>
                       <div className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-800/10 text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                          <Mail className="h-5 w-5" />
                       </div>
                       <div className="flex-1">
                          <p className="text-sm font-semibold text-foreground">Email de Confirmação & Boas Vindas</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Avise o membro que o acesso já está liberado dentro da plataforma.</p>
                       </div>
                       <div className="flex items-center gap-2">
                         <Switch checked={true} disabled />
                         {openEmail ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                       </div>
                    </div>

                    {openEmail && (
                      <div className="px-5 pb-5 border-t border-border/30 pt-4 space-y-4">
                         <div className="space-y-2">
                           <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assunto</Label>
                           <Input value={form.confirmationSubject} onChange={e => updateForm({confirmationSubject: e.target.value})} />
                         </div>
                         <div className="space-y-2">
                           <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Corpo da Mensagem (Suporte Dynamic Tags)</Label>
                           <RichTextEditor
                             value={form.confirmationBody}
                             onChange={v => updateForm({confirmationBody: v})}
                             variables={[
                               { label: "Nome do Membro", value: "nome" },
                               { label: "Nome da Comunidade", value: "nome_comunidade" },
                               { label: "Seu Nome", value: "meu_nome" },
                             ]}
                             minHeight="140px"
                           />
                         </div>
                      </div>
                    )}
                 </div>

                 {/* Avaliações / Depoimentos (Prova Social) */}
                 <ReviewsBuilder productId={initialProduct.id} />
              </div>
            </TabsContent>

          </Tabs>

          <div className="flex items-center justify-between pt-6 mt-6 border-t border-border/40 pb-10">
            <Button variant="outline" onClick={() => saveMutation.mutate("DRAFT")}>
              <Save className="h-4 w-4 mr-2" /> Salvar Rascunho
            </Button>
            {tab !== "opcoes" ? (
              <Button onClick={handleNext} className="bg-slate-800 hover:bg-slate-900 text-white max-w-[200px] w-full shadow-md transition-transform active:scale-95">
                Continuar
              </Button>
            ) : (
              <Button onClick={() => saveMutation.mutate("PUBLISHED")} className="bg-slate-800 hover:bg-slate-900 text-white shadow-xl w-fit sm:w-[250px] transition-transform active:scale-95">
                <Rocket className="h-4 w-4 mr-2" /> Ativar Plano
              </Button>
            )}
          </div>
        </div>

        {/* Lado Direito */}
        <MobilePreview />

      </div>
    </div>
  );
}
