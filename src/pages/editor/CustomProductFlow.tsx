import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useStorefrontTheme } from "@/hooks/useStorefrontTheme";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Rocket,
  Save,
  Mail,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Lock,
  MessageSquare,
  ShoppingCart,
  Users,
  PenTool,
  Plus
} from "lucide-react";
import { FormFieldsBuilder } from "@/components/FormFieldsBuilder";
import { ReviewsBuilder } from "@/components/ReviewsBuilder";
import { RichTextEditor } from "@/components/RichTextEditor";

export default function CustomProductFlow({
  initialProduct,
  setSaving,
}: {
  initialProduct: any;
  setSaving: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("thumbnail");
  const themeTokens = useStorefrontTheme();

  // Initial Price derived from DB relation (if exists)
  const initialPriceConfig = initialProduct.prices?.[0] || { amount: 0, compare_at_amount: null };

  const [form, setForm] = useState({
    // THUMBNAIL Tab
    cardStyle: initialProduct.thumbnail_style || "callout", // button | callout
    name: initialProduct.name || "",
    shortDescription: initialProduct.short_description || "",
    ctaText: initialProduct.listing_button_text || "Solicitar Pedido",
    thumbnailUrl: initialProduct.thumbnail_url || "",
    
    // CHECKOUT Tab
    checkoutImage: initialProduct.checkout_image || "",
    description: initialProduct.checkout_description || "",
    isFree: initialPriceConfig.amount === 0,
    price: initialPriceConfig.amount,
    compareAtPrice: initialPriceConfig.compare_at_amount,
    
    // OPÇÕES Tab
    confirmationSubject: initialProduct.confirmation_email_subject || "Seu Pedido foi Recebido!",
    confirmationBody: initialProduct.confirmation_email_body || "Obrigado por solicitar. Estarei analisando suas informações e começarei a trabalhar em breve.",
  });

  const updateForm = (updates: Partial<typeof form>) => setForm((p) => ({ ...p, ...updates }));

  const [openEmail, setOpenEmail] = useState(false);

  const saveMutation = useMutation({
    mutationFn: async (status: "DRAFT" | "PUBLISHED") => {
      setSaving(true);
      // 1. Update Product table with no delivery_mode
      const { error: prodError } = await supabase.from("products").update({
        status,
        name: form.name,
        short_description: form.shortDescription,
        listing_button_text: form.ctaText,
        thumbnail_style: form.cardStyle,
        thumbnail_url: form.thumbnailUrl,
        checkout_image: form.checkoutImage,
        checkout_description: form.description,
        delivery_mode: "manual", // ALWAYS Manual
        confirmation_email_subject: form.confirmationSubject,
        confirmation_email_body: form.confirmationBody,
      }).eq("id", initialProduct.id);

      if (prodError) throw prodError;

      // 2. Update Prices table
      if (initialPriceConfig.id) {
         await supabase.from("prices").update({
           amount: form.isFree ? 0 : form.price,
           compare_at_amount: form.compareAtPrice,
         }).eq("id", initialPriceConfig.id);
      } else {
         await supabase.from("prices").insert({
           product_id: initialProduct.id,
           amount: form.isFree ? 0 : form.price,
           compare_at_amount: form.compareAtPrice,
           type: "ONE_TIME"
         });
      }

      return status;
    },
    onSuccess: (status) => {
      queryClient.invalidateQueries({ queryKey: ["product", initialProduct.id] });
      toast.success(status === "PUBLISHED" ? "Serviço Personalizado Publicado!" : "Rascunho salvo!");
    },
    onError: (err: any) => {
      toast.error("Erro ao salvar: " + err.message);
    },
    onSettled: () => setSaving(false),
  });

  const handleNext = () => {
    if (tab === "thumbnail") {
      if (!form.name.trim()) { toast.error("Informe título"); return; }
      setTab("checkout");
    } else if (tab === "checkout") {
      if (!form.isFree && form.price <= 0) { toast.error("Informe um preço válido."); return; }
      setTab("opcoes");
    }
  };

  const MobilePreview = () => {
    return (
      <div className="hidden lg:block w-[320px] shrink-0 sticky top-24">
        <p className="text-xs font-medium text-amber-600/60 dark:text-amber-500/50 mb-3 text-center uppercase tracking-widest font-semibold">
          Preview de Serviço
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
                  <div className="w-full py-4 px-6 rounded-2xl border-2 border-amber-600 bg-white dark:bg-zinc-900 text-center text-sm font-bold text-zinc-900 dark:text-zinc-100 shadow-sm truncate">
                    {form.name || "Título do Serviço"}
                  </div>
                )}
                {form.cardStyle === "callout" && (
                  <div className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
                    {form.thumbnailUrl ? (
                        <div className="h-32 bg-zinc-100 dark:bg-zinc-800 overflow-hidden rounded-xl mb-4">
                            <img src={form.thumbnailUrl} className="w-full h-full object-cover" />
                        </div>
                    ) : null}
                    <p className="font-bold text-zinc-900 dark:text-zinc-100 text-lg leading-snug">{form.name || "Título do Serviço"}</p>
                    {form.shortDescription && (
                      <p className="text-sm text-zinc-500 mt-2 line-clamp-2">{form.shortDescription}</p>
                    )}
                    <div
                      className="mt-5 py-3 text-white text-sm font-medium text-center"
                      style={{ backgroundColor: themeTokens.primaryColor, borderRadius: themeTokens.buttonRadius }}
                    >
                      {form.ctaText || "Solicitar Pedido"}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Checkout / Opções Preview */}
            {(tab === "checkout" || tab === "opcoes") && (
              <div className="bg-white dark:bg-zinc-900 min-h-full">
                {form.checkoutImage && (
                  <div className="h-48 bg-zinc-100 overflow-hidden">
                    <img src={form.checkoutImage} className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="p-5 space-y-4 pt-10">
                  <p className="font-bold text-xl text-zinc-900 dark:text-zinc-100 leading-snug">{form.name || "Título do Serviço"}</p>
                  
                  <div className="flex items-center gap-2">
                    {!form.isFree && form.price > 0 && (
                      <span className="text-2xl font-bold" style={{ color: themeTokens.primaryColor }}>
                        R$ {form.price.toFixed(2).replace(".", ",")}
                      </span>
                    )}
                    {!form.isFree && form.compareAtPrice && (
                      <span className="text-sm text-zinc-400 line-through">
                        R$ {form.compareAtPrice.toFixed(2).replace(".", ",")}
                      </span>
                    )}
                    {form.isFree && <span className="text-xl font-bold" style={{ color: themeTokens.primaryColor }}>Serviço Grátis</span>}
                  </div>

                  {form.description && (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-4 leading-relaxed">
                      {form.description}
                    </p>
                  )}

                  <div className="pt-6 space-y-3">
                     <p className="text-sm font-bold border-b pb-2 mb-4 dark:border-zinc-800">Seu Briefing</p>
                     <div className="space-y-1">
                       <p className="text-xs font-medium text-zinc-700">Nome completo</p>
                       <div className="h-10 border rounded-lg bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700" />
                     </div>
                     <div className="space-y-1">
                       <p className="text-[10px] text-amber-600 font-bold mb-1">CAMPO EXTRA DEMO</p>
                       <p className="text-xs font-medium text-zinc-700">Qual perfil você quer que eu analise?</p>
                       <div className="h-10 border rounded-lg bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700" />
                     </div>
                     <div className="pt-4">
                        <div
                          className="w-full py-4 text-white font-medium text-center"
                          style={{ backgroundColor: themeTokens.primaryColor, borderRadius: themeTokens.buttonRadius, boxShadow: `0 4px 14px ${themeTokens.primaryColor}40` }}
                        >
                          {form.ctaText || "Enviar Pedido"}
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
  };

  const CARD_STYLES = [
    { key: "callout", label: "Callout", desc: "Imagem, textos e botão" },
    { key: "button", label: "Button", desc: "Link rápido minimalista" },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-col lg:flex-row gap-10">
        
        {/* Lado Esquerdo - Formulário */}
        <div className="flex-1 min-w-0">
          <Tabs value={tab} onValueChange={setTab} className="mb-8">
            <TabsList className="bg-muted/50 p-1 w-full flex mb-6">
              <TabsTrigger value="thumbnail" className="flex-1 text-xs sm:text-sm">1. Thumbnail</TabsTrigger>
              <TabsTrigger value="checkout" className="flex-1 text-xs sm:text-sm">2. Ficha & Pedido</TabsTrigger>
              <TabsTrigger value="opcoes" className="flex-1 text-xs sm:text-sm">3. Opções Extras</TabsTrigger>
            </TabsList>

            {/* ABA: THUMBNAIL */}
            <TabsContent value="thumbnail" className="space-y-8 animate-in fade-in">
              <div className="space-y-2">
                <h2 className="text-xl font-bold">Vitrine da Loja (Personalizado)</h2>
                <p className="text-sm text-muted-foreground">Isso é um serviço manual ou consultoria em lote. Escolha como exibi-lo.</p>
              </div>

              {/* Seletor de Estilo */}
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
                          ? "border-amber-600 bg-amber-600/5 text-amber-600"
                          : "border-border bg-card hover:border-border/80 text-foreground"
                      )}
                    >
                      <p className="text-sm font-semibold">{label}</p>
                      <p className="text-[10px] text-muted-foreground mt-1 hidden sm:block">{desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Imagem */}
              {form.cardStyle !== "button" && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Imagem Ilustrativa (URL)</Label>
                  <Input 
                    placeholder="https://..." 
                    value={form.thumbnailUrl} onChange={e => updateForm({thumbnailUrl: e.target.value})}
                  />
                </div>
              )}

              {/* Textos */}
              <div className="space-y-4 border-t border-border/40 pt-6">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Nome do Serviço / Análise *</Label>
                  <Input 
                    placeholder="Ex: Análise de Perfil Instagram VIP" 
                    maxLength={80}
                    value={form.name} onChange={e => updateForm({name: e.target.value})}
                  />
                  <p className="text-right text-[10px] text-muted-foreground">{form.name.length}/80</p>
                </div>

                {form.cardStyle !== "button" && (
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Proposta de Valor</Label>
                    <Textarea 
                      placeholder="Descreva rapidamente o que você vai entregar ao seu cliente se ele aprovar o pedido." 
                      maxLength={120}
                      value={form.shortDescription} onChange={e => updateForm({shortDescription: e.target.value})}
                      rows={2}
                      className="resize-none"
                    />
                    <p className="text-right text-[10px] text-muted-foreground">{form.shortDescription.length}/120</p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Texto do Botão na Vitrine</Label>
                  <Input 
                    placeholder="Solicitar Análise" 
                    maxLength={30}
                    value={form.ctaText} onChange={e => updateForm({ctaText: e.target.value})}
                  />
                </div>
              </div>
            </TabsContent>

            {/* ABA: CHECKOUT / BRIEFING */}
            <TabsContent value="checkout" className="space-y-8 animate-in fade-in">
              <div className="space-y-2">
                <h2 className="text-xl font-bold">Ficha de Pedido e Briefing</h2>
                <p className="text-sm text-muted-foreground">Aqui o cliente te passa o contexto que você precisa para trabalhar. Diferente dos Produtos Digitais, as entregas Personalizadas **não possuem download imediato.**</p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">Capa (Hero Image)</Label>
                <Input 
                  placeholder="https://..." 
                  value={form.checkoutImage} onChange={e => updateForm({checkoutImage: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold text-foreground">Apresentação da Oferta</Label>
                <RichTextEditor
                  placeholder="Descreva o que será entregue, quais seus prazos e regras do serviço."
                  value={form.description}
                  onChange={v => updateForm({description: v})}
                  minHeight="120px"
                />
              </div>

              {/* Precificação */}
              <div className="space-y-4 p-5 rounded-2xl border border-border/60 bg-card shadow-sm">
                <p className="text-base font-semibold text-foreground">Valor Cobrado</p>

                <div className="flex items-center gap-3">
                  <Switch
                    checked={form.isFree}
                    onCheckedChange={(v) => updateForm({ isFree: v })}
                  />
                  <Label className="text-sm cursor-pointer">Revisão/Orçamento Gratuito</Label>
                </div>

                {!form.isFree && (
                  <div className="grid grid-cols-2 gap-4 mt-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Valor (R$) *</Label>
                      <Input
                        type="number" min={0} step={0.01} placeholder="0,00"
                         className="text-lg font-mono font-medium border-amber-500/50 focus-visible:ring-amber-500"
                        value={form.price || ""} onChange={(e) => updateForm({ price: Number(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">De R$ (Ancoragem)</Label>
                      <Input
                        type="number" min={0} step={0.01} placeholder="Opcional"
                        value={form.compareAtPrice ?? ""} onChange={(e) => updateForm({ compareAtPrice: e.target.value ? Number(e.target.value) : null })}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Briefing / Formulário Customizado */}
              <div className="space-y-4 pt-4 mt-6 border-t border-border/40">
                   <div className="space-y-1">
                     <p className="text-base font-semibold text-foreground">Construtor de Briefing / Formulário</p>
                     <p className="text-sm text-muted-foreground">Quais informações você precisa do cliente na hora que ele comprar?</p>
                   </div>
                   <FormFieldsBuilder productId={initialProduct.id} />
              </div>

            </TabsContent>

            {/* ABA: OPÇÕES */}
            <TabsContent value="opcoes" className="space-y-6 animate-in fade-in">
              <div className="space-y-2">
                <h2 className="text-xl font-bold">Mecanismos Pós-Compra</h2>
                <p className="text-sm text-muted-foreground">Configure os passos após você receber o dinheiro e o briefing do cliente.</p>
                {/* Avaliações / Depoimentos (Prova Social) */}
                <ReviewsBuilder productId={initialProduct.id} />
              </div>

              <div className="space-y-3">
                 {/* Custom - Email de Suporte/Confirmação de recebimento */}
                 <div className={cn("rounded-xl border bg-card transition-all mt-6", openEmail ? "border-amber-500/40 shadow-sm" : "border-border/60 hover:border-border")}>
                    <div className="flex items-center gap-3 p-4 cursor-pointer select-none" onClick={() => setOpenEmail(!openEmail)}>
                       <div className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-amber-600/10 text-amber-600">
                          <Mail className="h-5 w-5" />
                       </div>
                       <div className="flex-1">
                          <p className="text-sm font-semibold text-foreground">Email Automático de Confirmação (Recibo de Pedido)</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Avise o cliente que o briefing chegou e o prazo vai começar.</p>
                       </div>
                       <div className="flex items-center gap-2">
                         <Switch checked={true} disabled />
                         {openEmail ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                       </div>
                    </div>

                    {openEmail && (
                      <div className="px-5 pb-5 border-t border-border/30 pt-4 space-y-4">
                         <div className="space-y-2">
                           <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assunto (Confirmação)</Label>
                           <Input value={form.confirmationSubject} onChange={e => updateForm({confirmationSubject: e.target.value})} />
                         </div>
                         <div className="space-y-2">
                           <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Corpo da Mensagem (E-mail Dinâmico)</Label>
                           <RichTextEditor
                             value={form.confirmationBody}
                             onChange={v => updateForm({confirmationBody: v})}
                             variables={[
                               { label: "Nome do Cliente", value: "nome_cliente" },
                               { label: "Nome do Produto", value: "nome_produto" },
                             ]}
                             minHeight="140px"
                           />
                         </div>
                      </div>
                    )}
                 </div>

              </div>
            </TabsContent>

          </Tabs>

          <div className="flex items-center justify-between pt-6 mt-6 border-t border-border/40 pb-10">
            <Button variant="outline" onClick={() => saveMutation.mutate("DRAFT")}>
              <Save className="h-4 w-4 mr-2" /> Salvar Rascunho
            </Button>
            {tab !== "opcoes" ? (
              <Button onClick={handleNext} className="bg-amber-600 hover:bg-amber-700 text-white max-w-[200px] w-full shadow-md transition-transform active:scale-95">
                Continuar
              </Button>
            ) : (
              <Button onClick={() => saveMutation.mutate("PUBLISHED")} className="text-white shadow-xl w-fit sm:w-[250px] transition-transform active:scale-95" style={{ backgroundColor: themeTokens.primaryColor }}>
                <PenTool className="h-4 w-4 mr-2" /> Habilitar Serviço
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
