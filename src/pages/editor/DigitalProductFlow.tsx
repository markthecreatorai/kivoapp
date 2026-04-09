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
  Link2,
  UploadCloud,
  Mail,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Lock,
  ShoppingCart,
  Users,
  MessageSquare,
} from "lucide-react";
import { FormFieldsBuilder } from "@/components/FormFieldsBuilder";
import { ReviewsBuilder } from "@/components/ReviewsBuilder";
import { RichTextEditor } from "@/components/RichTextEditor";

export default function DigitalProductFlow({
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
    cardStyle: initialProduct.thumbnail_style || "preview", // button | callout | preview
    name: initialProduct.name || "",
    shortDescription: initialProduct.short_description || "",
    ctaText: initialProduct.listing_button_text || "Comprar",
    thumbnailUrl: initialProduct.thumbnail_url || "",
    
    // CHECKOUT Tab
    checkoutImage: initialProduct.checkout_image || "",
    description: initialProduct.checkout_description || "",
    isFree: initialPriceConfig.amount === 0,
    price: initialPriceConfig.amount,
    compareAtPrice: initialPriceConfig.compare_at_amount,
    deliveryType: initialProduct.delivery_mode || "url",
    deliveryUrl: initialProduct.delivery_url || "",
    
    // OPÇÕES Tab
    confirmationSubject: initialProduct.confirmation_email_subject || "Sua compra foi aprovada!",
    confirmationBody: initialProduct.confirmation_email_body || "Obrigado por adquirir este produto.",
  });

  const updateForm = (updates: Partial<typeof form>) => setForm((p) => ({ ...p, ...updates }));

  const [openEmail, setOpenEmail] = useState(false);

  const saveMutation = useMutation({
    mutationFn: async (status: "DRAFT" | "PUBLISHED") => {
      setSaving(true);
      // 1. Update Product table
      const { error: prodError } = await supabase.from("products").update({
        status,
        name: form.name,
        short_description: form.shortDescription,
        listing_button_text: form.ctaText,
        thumbnail_style: form.cardStyle,
        thumbnail_url: form.thumbnailUrl,
        checkout_image: form.checkoutImage,
        checkout_description: form.description,
        delivery_mode: form.deliveryType,
        delivery_url: form.deliveryUrl,
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
      toast.success(status === "PUBLISHED" ? "Produto Digital Publicado!" : "Rascunho salvo!");
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
        <p className="text-xs font-medium text-muted-foreground mb-3 text-center">
          Preview em tempo real
        </p>

        {/* Fake Phone */}
        <div className="w-[320px] h-[600px] bg-black rounded-[40px] p-2 shadow-xl flex flex-col justify-start">
          <div 
            className="w-full h-full rounded-[32px] overflow-hidden flex flex-col relative overflow-y-auto"
            style={{ backgroundColor: themeTokens.backgroundColor }}
          >
            {/* Notch */}
            <div className="w-32 h-6 bg-black absolute top-0 inset-x-0 mx-auto rounded-b-xl z-20"></div>

            {/* Thumbnail Preview */}
              {tab === "thumbnail" && (
              <div className="p-4 pt-10 flex items-center h-full">
                {form.cardStyle === "button" && (
                  <div 
                    className="w-full py-4 px-6 rounded-2xl border-2 text-center text-sm font-bold shadow-sm truncate"
                    style={{ borderColor: themeTokens.primaryColor, color: themeTokens.textColor, backgroundColor: themeTokens.backgroundColor }}
                  >
                    {form.name || "Título do Produto"}
                  </div>
                )}
                {form.cardStyle === "callout" && (
                  <div 
                    className="w-full rounded-2xl border p-5 shadow-sm"
                    style={{ borderColor: themeTokens.primaryColor + '40', backgroundColor: themeTokens.backgroundColor }}
                  >
                    <p className="font-bold text-lg leading-snug" style={{ color: themeTokens.textColor }}>{form.name || "Título do produto"}</p>
                    {form.shortDescription && (
                      <p className="text-sm mt-2 line-clamp-2" style={{ color: themeTokens.textColor, opacity: 0.7 }}>{form.shortDescription}</p>
                    )}
                    <div
                      className="mt-5 py-3 text-white text-sm font-medium text-center"
                      style={{ backgroundColor: themeTokens.primaryColor, borderRadius: themeTokens.buttonRadius }}
                    >
                      {form.ctaText || "Comprar"}
                    </div>
                  </div>
                )}
                {form.cardStyle === "preview" && (
                  <div 
                    className="w-full rounded-3xl border overflow-hidden shadow-sm"
                    style={{ borderColor: themeTokens.primaryColor + '40', backgroundColor: themeTokens.backgroundColor }}
                  >
                    <div className="h-44 flex items-center justify-center overflow-hidden" style={{ backgroundColor: themeTokens.textColor + '10' }}>
                      {form.thumbnailUrl ? (
                        <img src={form.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <ImageIcon className="h-10 w-10" style={{ color: themeTokens.textColor, opacity: 0.3 }} />
                      )}
                    </div>
                    <div className="p-5">
                      <p className="font-bold text-lg leading-snug" style={{ color: themeTokens.textColor }}>{form.name || "Título do produto"}</p>
                      {form.shortDescription && (
                        <p className="text-sm mt-2 line-clamp-2" style={{ color: themeTokens.textColor, opacity: 0.7 }}>{form.shortDescription}</p>
                      )}
                      
                       <div className="mt-4 flex items-center justify-between">
                          <span className="font-bold" style={{ color: themeTokens.textColor }}>
                             {form.isFree ? "Gratuito" : `R$ ${form.price.toFixed(2).replace(".", ",")}`}
                          </span>
                          <div
                            className="py-2.5 px-5 text-white rounded-xl text-sm font-medium"
                            style={{ backgroundColor: themeTokens.primaryColor, borderRadius: themeTokens.buttonRadius }}
                          >
                            {form.ctaText || "Comprar"}
                          </div>
                       </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Checkout / Opções Preview */}
            {(tab === "checkout" || tab === "opcoes") && (
              <div className="min-h-full" style={{ backgroundColor: themeTokens.backgroundColor }}>
                {form.checkoutImage && (
                  <div className="h-48 bg-zinc-100 overflow-hidden">
                    <img src={form.checkoutImage} className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="p-5 space-y-4 pt-10">
                  <p className="font-bold text-xl leading-snug" style={{ color: themeTokens.textColor }}>{form.name || "Título do Produto"}</p>
                  
                  <div className="flex items-center gap-2">
                    {!form.isFree && form.price > 0 && (
                      <span className="text-2xl font-bold" style={{ color: themeTokens.primaryColor }}>
                        R$ {form.price.toFixed(2).replace(".", ",")}
                      </span>
                    )}
                    {!form.isFree && form.compareAtPrice && (
                      <span className="text-sm line-through" style={{ color: themeTokens.textColor, opacity: 0.5 }}>
                        R$ {form.compareAtPrice.toFixed(2).replace(".", ",")}
                      </span>
                    )}
                    {form.isFree && <span className="text-xl font-bold" style={{ color: themeTokens.primaryColor }}>Download Grátis</span>}
                  </div>

                  {form.description && (
                    <p className="text-sm line-clamp-5 mt-4" style={{ color: themeTokens.textColor, opacity: 0.8 }}>
                      {form.description}
                    </p>
                  )}

                  <div className="pt-6 space-y-3">
                     <div className="space-y-1">
                       <p className="text-xs font-medium" style={{ color: themeTokens.textColor }}>Nome completo</p>
                       <div className="h-10 border rounded-lg" style={{ backgroundColor: themeTokens.textColor + '10', borderColor: themeTokens.textColor + '30' }} />
                     </div>
                     <div className="space-y-1">
                       <p className="text-xs font-medium" style={{ color: themeTokens.textColor }}>E-mail de acesso</p>
                       <div className="h-10 border rounded-lg" style={{ backgroundColor: themeTokens.textColor + '10', borderColor: themeTokens.textColor + '30' }} />
                     </div>
                     <div className="pt-2">
                        <div
                           className="w-full py-4 text-white font-medium text-center"
                           style={{ backgroundColor: themeTokens.primaryColor, borderRadius: themeTokens.buttonRadius, boxShadow: `0 4px 14px ${themeTokens.primaryColor}40` }}
                         >
                           {form.ctaText || "Finalizar Compra"}
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
    { key: "preview", label: "Preview", desc: "Imagem grande e detalhes" },
    { key: "callout", label: "Callout", desc: "Apenas imagem e CTA" },
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
              <TabsTrigger value="checkout" className="flex-1 text-xs sm:text-sm">2. Checkout</TabsTrigger>
              <TabsTrigger value="opcoes" className="flex-1 text-xs sm:text-sm">3. Opções Extras</TabsTrigger>
            </TabsList>

            {/* ABA: THUMBNAIL */}
            <TabsContent value="thumbnail" className="space-y-8 animate-in fade-in">
              <div className="space-y-2">
                <h2 className="text-xl font-bold">Vitrine da Loja (Thumbnail)</h2>
                <p className="text-sm text-muted-foreground">Escolha como o produto digital vai aparecer para as pessoas.</p>
              </div>

              {/* Seletor de Estilo */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold">Qual estilo de card combina mais?</Label>
                <div className="flex gap-3">
                  {CARD_STYLES.map(({ key, label, desc }) => (
                    <button
                      key={key}
                      onClick={() => updateForm({ cardStyle: key })}
                      className={cn(
                        "flex-1 p-3 rounded-xl border-2 text-center transition-all",
                        form.cardStyle === key
                          ? "border-primary bg-primary/5 text-primary"
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
                  <Label className="text-sm font-semibold">Imagem de Capa (URL)</Label>
                  <Input 
                    placeholder="https://..." 
                    value={form.thumbnailUrl} onChange={e => updateForm({thumbnailUrl: e.target.value})}
                  />
                  <p className="text-[11px] text-muted-foreground">Use 16:9 ou imagens quadradas (1:1) de alta qualidade.</p>
                </div>
              )}

              {/* Textos */}
              <div className="space-y-4 border-t border-border/40 pt-6">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Nome do Produto *</Label>
                  <Input 
                    placeholder="Ex: Template de Automação Notion" 
                    maxLength={80}
                    value={form.name} onChange={e => updateForm({name: e.target.value})}
                  />
                  <p className="text-right text-[10px] text-muted-foreground">{form.name.length}/80</p>
                </div>

                {form.cardStyle !== "button" && (
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Subtítulo (Headline)</Label>
                    <Textarea 
                      placeholder="Aquela frase que captura a atenção do cliente na vitrine." 
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
                    placeholder="Comprar Produto" 
                    maxLength={30}
                    value={form.ctaText} onChange={e => updateForm({ctaText: e.target.value})}
                  />
                </div>
              </div>
            </TabsContent>

            {/* ABA: CHECKOUT */}
            <TabsContent value="checkout" className="space-y-8 animate-in fade-in">
              <div className="space-y-2">
                <h2 className="text-xl font-bold">Página de Checkout</h2>
                <p className="text-sm text-muted-foreground">A página final de conversão para o seu produto digital.</p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">Imagem de Fundo do Checkout (Hero Image)</Label>
                <Input 
                  placeholder="https://..." 
                  value={form.checkoutImage} onChange={e => updateForm({checkoutImage: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold text-foreground">Apresentação da Oferta</Label>
                <RichTextEditor
                  placeholder="Liste tudo o que o cliente recebe aqui. Pode abusar do formato."
                  value={form.description}
                  onChange={v => updateForm({description: v})}
                  minHeight="140px"
                />
              </div>

              {/* Precificação */}
              <div className="space-y-4 p-5 rounded-2xl border border-border/60 bg-card shadow-sm">
                <p className="text-base font-semibold text-foreground">Valor e Cobrança</p>

                <div className="flex items-center gap-3">
                  <Switch
                    checked={form.isFree}
                    onCheckedChange={(v) => updateForm({ isFree: v })}
                    id="is-free"
                  />
                  <Label htmlFor="is-free" className="text-sm cursor-pointer">Distribuir gratuitamente</Label>
                </div>

                {!form.isFree && (
                  <div className="grid grid-cols-2 gap-4 mt-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Qual o preço cobrado? (R$) *</Label>
                      <Input
                        type="number" min={0} step={0.01} placeholder="0,00"
                         className="text-lg font-mono font-medium"
                        value={form.price || ""} onChange={(e) => updateForm({ price: Number(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Preço Original / Ancoragem (R$)</Label>
                      <Input
                        type="number" min={0} step={0.01} placeholder="Desconto opcional"
                        value={form.compareAtPrice ?? ""} onChange={(e) => updateForm({ compareAtPrice: e.target.value ? Number(e.target.value) : null })}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Entrega */}
              <div className="space-y-4 p-5 rounded-2xl border border-border/60 bg-card shadow-sm">
                 <p className="text-base font-semibold text-foreground border-b pb-2">Como entregar?</p>

                 <div className="flex gap-2">
                    <Button 
                      variant={form.deliveryType === "url" ? "default" : "outline"} 
                      onClick={() => updateForm({deliveryType: "url"})} className="flex-1"
                    >
                       <Link2 className="w-4 h-4 mr-2" /> Link de Acesso Ext./Drive
                    </Button>
                    <Button 
                      variant={form.deliveryType === "file" ? "default" : "outline"} 
                      onClick={() => updateForm({deliveryType: "file"})} className="flex-1"
                    >
                       <UploadCloud className="w-4 h-4 mr-2" /> Auto-Hospedagem (.PDF/Zip)
                    </Button>
                 </div>

                 {form.deliveryType === "url" ? (
                    <div className="space-y-2 mt-4">
                      <Label className="text-xs font-semibold">URL Secreta de Entrega</Label>
                      <Input placeholder="https://..." value={form.deliveryUrl} onChange={e => updateForm({deliveryUrl: e.target.value})} />
                      <p className="text-[11px] text-muted-foreground">Assim que o pagamento bater ou o usuário clicar, ele será teleportado para esse link com o seu recurso.</p>
                    </div>
                 ) : (
                    <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-border text-center rounded-xl bg-muted/20">
                       <UploadCloud className="w-6 h-6 text-muted-foreground/60 mb-2" />
                       <p className="text-sm font-medium">Upload Seguro Pós-Edição</p>
                       <p className="text-xs text-muted-foreground">Basta publicar o rascunho. As opções de upload de múltiplas aulas e PDFs estará desbloqueada abaixo.</p>
                    </div>
                 )}
              </div>

            </TabsContent>

            {/* ABA: OPÇÕES */}
            <TabsContent value="opcoes" className="space-y-6 animate-in fade-in">
              <div className="space-y-2">
                <h2 className="text-xl font-bold">Mecanismos de Crescimento</h2>
                <p className="text-sm text-muted-foreground">Ative recursos que expandem seu LTV e Ticket Médio via One-Click Upsells Automáticos.</p>
              </div>

              <div className="space-y-3">
                  {/* Avaliações / Depoimentos (Prova Social) */}
                  <ReviewsBuilder productId={initialProduct.id} />

                 {/* Locked - Order Bump */}
                 <div className="rounded-xl border border-border/50 bg-card p-4 flex items-center gap-4 opacity-50 grayscale select-none">
                     <div className="h-10 w-10 flex items-center justify-center rounded-lg bg-zinc-200 text-zinc-600">
                        <ShoppingCart className="h-5 w-5" />
                     </div>
                     <div className="flex-1">
                        <p className="text-sm font-semibold flex gap-2 items-center text-zinc-900">One-Click Order Bump <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold bg-zinc-800 text-zinc-100 h-5 gap-1"><Lock className="w-3 h-3"/> Pro</span></p>
                        <p className="text-xs text-zinc-500 mt-1">Adicione outro e-book, mini-curso ou call ao pedido bem no momento mágico de pagar. Impulsiona a conversão brutalmente.</p>
                     </div>
                 </div>

                 {/* Locked - Programa de Indicação/Afiliados */}
                 <div className="rounded-xl border border-border/50 bg-card p-4 flex items-center gap-4 opacity-50 grayscale select-none">
                     <div className="h-10 w-10 flex items-center justify-center rounded-lg bg-zinc-200 text-zinc-600">
                        <Users className="h-5 w-5" />
                     </div>
                     <div className="flex-1">
                        <p className="text-sm font-semibold flex gap-2 items-center text-zinc-900">Rede de Afiliados (Receita Mútua) <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold bg-zinc-800 text-zinc-100 h-5 gap-1"><Lock className="w-3 h-3"/> Pro</span></p>
                        <p className="text-xs text-zinc-500 mt-1">Gere links virais pra seus alunos ou afiliados lhe promoverem ganhando X% das vendas em split direto no Asaas.</p>
                     </div>
                 </div>

                 {/* Colapsável: Confirmação Email Livre */}
                 <div className={cn("rounded-xl border bg-card transition-all mt-6", openEmail ? "border-primary/40 shadow-sm" : "border-border/60 hover:border-border")}>
                    <div className="flex items-center gap-3 p-4 cursor-pointer select-none" onClick={() => setOpenEmail(!openEmail)}>
                       <div className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-primary/10 text-primary">
                          <Mail className="h-5 w-5" />
                       </div>
                       <div className="flex-1">
                          <p className="text-sm font-semibold text-foreground">Email Automático de Acesso Pós-Compra</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Envia o link / material 1s após a operadora aceitar cartão</p>
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
                           <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Corpo da Mensagem (E-mail Dinâmico)</Label>
                           <RichTextEditor
                             value={form.confirmationBody}
                             onChange={v => updateForm({confirmationBody: v})}
                             variables={[
                               { label: "Nome do Cliente", value: "nome_cliente" },
                               { label: "Seu Nome", value: "meu_nome" },
                               { label: "Nome do Produto", value: "nome_produto" },
                               { label: "Link / Arquivos", value: "arquivos_produto" },
                             ]}
                             minHeight="160px"
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
              <Button onClick={handleNext} className="bg-primary hover:bg-primary/90 max-w-[200px] w-full shadow-md transition-transform active:scale-95">
                Continuar
              </Button>
            ) : (
              <Button onClick={() => saveMutation.mutate("PUBLISHED")} className="text-white shadow-xl w-fit sm:w-[250px] transition-transform active:scale-95" style={{ backgroundColor: themeTokens.primaryColor }}>
                <Rocket className="h-4 w-4 mr-2" /> Lançar Produto Digital
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
