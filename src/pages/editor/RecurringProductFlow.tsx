import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  Rocket,
  Save,
  Link2,
  Mail,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Lock,
  ShoppingCart,
  MessageSquare,
  RefreshCw
} from "lucide-react";
import { FormFieldsBuilder } from "@/components/FormFieldsBuilder";
import { ReviewsBuilder } from "@/components/ReviewsBuilder";
import { RichTextEditor } from "@/components/RichTextEditor";

export default function RecurringProductFlow({
  initialProduct,
  setSaving,
}: {
  initialProduct: any;
  setSaving: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("thumbnail");

  const initialPriceConfig = initialProduct.prices?.[0] || { amount: 0, compare_at_amount: null };

  const [form, setForm] = useState({
    // THUMBNAIL Tab
    cardStyle: initialProduct.thumbnail_style || "callout", // button | callout
    name: initialProduct.name || "",
    shortDescription: initialProduct.short_description || "",
    ctaText: initialProduct.listing_button_text || "Assinar",
    thumbnailUrl: initialProduct.thumbnail_url || "",
    
    // CHECKOUT Tab
    checkoutImage: initialProduct.checkout_image || "",
    description: initialProduct.checkout_description || "",
    price: initialPriceConfig.amount || 0,
    compareAtPrice: initialPriceConfig.compare_at_amount,
    
    billingInterval: (initialPriceConfig.interval || initialProduct.billing_interval || "MONTHLY").toUpperCase(), // WEEKLY | MONTHLY | QUARTERLY | SEMIANNUAL | YEARLY
    cancelAfterEnabled: initialProduct.cancel_after_enabled || false,
    cancelAfterCycles: initialProduct.cancel_after_cycles || 12,
    
    deliveryUrl: initialProduct.delivery_url || "", // Acesso à area de membros ou discord

    // OPÇÕES Tab
    confirmationSubject: initialProduct.confirmation_email_subject || "Sua assinatura foi ativada!",
    confirmationBody: initialProduct.confirmation_email_body || "Obrigado por assinar. Acesse seus benefícios no link oficial.",
  });

  const updateForm = (updates: Partial<typeof form>) => setForm((p) => ({ ...p, ...updates }));

  const [openEmail, setOpenEmail] = useState(false);

  const saveMutation = useMutation({
    mutationFn: async (status: "DRAFT" | "PUBLISHED") => {
      setSaving(true);
      
      const { error: prodError } = await supabase.from("products").update({
        status,
        name: form.name,
        short_description: form.shortDescription,
        listing_button_text: form.ctaText,
        thumbnail_style: form.cardStyle,
        thumbnail_url: form.thumbnailUrl,
        checkout_image: form.checkoutImage,
        checkout_description: form.description,
        
        billing_interval: form.billingInterval,
        cancel_after_enabled: form.cancelAfterEnabled,
        cancel_after_cycles: form.cancelAfterEnabled ? form.cancelAfterCycles : null,
        
        delivery_mode: "url", 
        delivery_url: form.deliveryUrl,
        
        confirmation_email_subject: form.confirmationSubject,
        confirmation_email_body: form.confirmationBody,
      }).eq("id", initialProduct.id);

      if (prodError) throw prodError;

      if (initialPriceConfig.id) {
         await supabase.from("prices").update({
           amount: form.price,
           compare_at_amount: form.compareAtPrice,
           type: "RECURRING",
           interval: form.billingInterval
         }).eq("id", initialPriceConfig.id);
      } else {
         await supabase.from("prices").insert({
           product_id: initialProduct.id,
           amount: form.price,
           compare_at_amount: form.compareAtPrice,
           type: "RECURRING",
           interval: form.billingInterval
         });
      }

      return status;
    },
    onSuccess: (status) => {
      queryClient.invalidateQueries({ queryKey: ["product", initialProduct.id] });
      toast.success(status === "PUBLISHED" ? "Assinatura Publicada!" : "Rascunho salvo!");
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
      if (form.price <= 0) { toast.error("Assinaturas exigem um valor."); return; }
      setTab("opcoes");
    }
  };

  const formatInterval = (interval: string) => {
    switch (interval?.toUpperCase()) {
      case "WEEKLY": return "/semana";
      case "QUARTERLY": return "/trimestre";
      case "SEMIANNUAL": return "/semestre";
      case "YEARLY": return "/ano";
      case "MONTHLY":
      default: return "/mês";
    }
  };

  const MobilePreview = () => {
    return (
      <div className="hidden lg:block w-[320px] shrink-0 sticky top-24">
        <p className="text-xs font-medium text-purple-600/60 dark:text-purple-500/50 mb-3 text-center uppercase tracking-widest font-semibold flex items-center justify-center gap-1">
          <RefreshCw className="w-3 h-3" /> Preview de Assinatura
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
                  <div className="w-full py-4 px-6 rounded-2xl border-2 border-purple-600 bg-white dark:bg-zinc-900 text-center text-sm font-bold text-zinc-900 dark:text-zinc-100 shadow-sm truncate flex justify-center gap-1">
                    {form.name || "Assinatura Vip"} <span className="opacity-50 font-normal">{formatInterval(form.billingInterval)}</span>
                  </div>
                )}
                {form.cardStyle === "callout" && (
                  <div className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
                    {form.thumbnailUrl ? (
                        <div className="h-32 bg-zinc-100 dark:bg-zinc-800 overflow-hidden rounded-xl mb-4">
                            <img src={form.thumbnailUrl} className="w-full h-full object-cover" />
                        </div>
                    ) : null}
                    <div className="flex items-start justify-between">
                       <p className="font-bold text-zinc-900 dark:text-zinc-100 text-lg leading-snug">{form.name || "Assinatura Premium"}</p>
                       <span className="text-xs font-bold text-purple-600 bg-purple-100 dark:bg-purple-900/30 px-2 py-1 rounded-md">{formatInterval(form.billingInterval)}</span>
                    </div>
                    {form.shortDescription && (
                      <p className="text-sm text-zinc-500 mt-2 line-clamp-2">{form.shortDescription}</p>
                    )}
                    <div className="mt-5 py-3 rounded-xl bg-purple-600 text-white text-sm font-medium text-center shadow-lg shadow-purple-600/20">
                      {form.ctaText || "Assinar"}
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
                  <p className="font-bold text-xl text-zinc-900 dark:text-zinc-100 leading-snug">{form.name || "Assinatura de Conteúdo"}</p>
                  
                  <div className="flex flex-col gap-1">
                    <div className="flex items-end gap-1">
                       <span className="text-3xl font-bold text-purple-600">
                         R$ {form.price.toFixed(2).replace(".", ",")}
                       </span>
                       <span className="text-sm font-medium text-zinc-500 pb-1">{formatInterval(form.billingInterval)}</span>
                    </div>
                    {form.cancelAfterEnabled && (
                       <span className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider bg-zinc-100 dark:bg-zinc-800 w-fit px-2 py-0.5 rounded-sm">
                         LIMITADO A {form.cancelAfterCycles} COBRANÇAS
                       </span>
                    )}
                  </div>

                  {form.description && (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-4 leading-relaxed">
                      {form.description}
                    </p>
                  )}

                  <div className="pt-6 space-y-3">
                     <p className="text-sm font-bold border-b pb-2 mb-4 dark:border-zinc-800">Dados da Assinatura</p>
                     <div className="space-y-1">
                       <p className="text-xs font-medium text-zinc-700">Nome completo</p>
                       <div className="h-10 border rounded-lg bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700" />
                     </div>
                     <div className="space-y-1">
                       <p className="text-xs font-medium text-zinc-700">E-mail</p>
                       <div className="h-10 border rounded-lg bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700" />
                     </div>
                     <div className="pt-4">
                        <div className="w-full py-4 rounded-xl bg-purple-600 text-white font-bold text-center shadow-lg shadow-purple-600/20">
                          {form.ctaText || "Assinar Agora"}
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
              <TabsTrigger value="checkout" className="flex-1 text-xs sm:text-sm">2. Plano e Checkout</TabsTrigger>
              <TabsTrigger value="opcoes" className="flex-1 text-xs sm:text-sm">3. Engajamento</TabsTrigger>
            </TabsList>

            {/* ABA: THUMBNAIL */}
            <TabsContent value="thumbnail" className="space-y-8 animate-in fade-in">
              <div className="space-y-2">
                <h2 className="text-xl font-bold">Vitrine da Loja (Assinatura / Comunidade)</h2>
                <p className="text-sm text-muted-foreground">Mostre aos seus visitantes as vantagens de assinar o seu plano recorrente.</p>
              </div>

              {/* Seletor de Estilo */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold">Decida o Estilo</Label>
                <div className="flex gap-3">
                  {CARD_STYLES.map(({ key, label, desc }) => (
                    <button
                      key={key}
                      onClick={() => updateForm({ cardStyle: key })}
                      className={cn(
                        "flex-1 p-3 rounded-xl border-2 text-center transition-all",
                        form.cardStyle === key
                          ? "border-purple-600 bg-purple-600/5 text-purple-600"
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
                  <Label className="text-sm font-semibold">Nome do Plano / Clube *</Label>
                  <Input 
                    placeholder="Ex: Kivo Club Pro" 
                    maxLength={80}
                    value={form.name} onChange={e => updateForm({name: e.target.value})}
                  />
                  <p className="text-right text-[10px] text-muted-foreground">{form.name.length}/80</p>
                </div>

                {form.cardStyle !== "button" && (
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Proposta de Valor</Label>
                    <Textarea 
                      placeholder="Quais os ganhos mensais do assinante?" 
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
                    placeholder="Aderir Plano" 
                    maxLength={30}
                    value={form.ctaText} onChange={e => updateForm({ctaText: e.target.value})}
                  />
                </div>
              </div>
            </TabsContent>

            {/* ABA: CHECKOUT */}
            <TabsContent value="checkout" className="space-y-8 animate-in fade-in">
              <div className="space-y-2">
                <h2 className="text-xl font-bold">Checkout e Lógica do Plano</h2>
                <p className="text-sm text-muted-foreground">Adicione a frequência com que seu cliente será cobrado automaticamente pelo gateway.</p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">Sua Promessa (Hero Image)</Label>
                <Input 
                  placeholder="https://..." 
                  value={form.checkoutImage} onChange={e => updateForm({checkoutImage: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold text-foreground">Apresentação e Benefícios</Label>
                <RichTextEditor
                  placeholder="Liste tudo que o clube oferece. Dica: use listas com tópicos."
                  value={form.description}
                  onChange={v => updateForm({description: v})}
                  minHeight="120px"
                />
              </div>

              {/* Frequência e Preço */}
              <div className="space-y-4 p-5 rounded-2xl border-2 border-purple-500/30 bg-purple-50/20 dark:bg-card shadow-sm">
                <div className="flex items-center gap-2 border-b border-purple-500/20 pb-3 mb-2 font-bold text-purple-600 dark:text-purple-400">
                  <RefreshCw className="w-5 h-5"/>
                  Motor de Recorrência Asaas
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Frequência da Cobrança</Label>
                    <Select value={form.billingInterval} onValueChange={(v) => updateForm({ billingInterval: v })}>
                      <SelectTrigger className="border-purple-300 focus:ring-purple-500 w-full h-11 bg-card">
                        <SelectValue placeholder="Selecione..." />
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
                  
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Valor do Ciclo (R$) *</Label>
                    <Input
                      type="number" min={0} step={0.01} placeholder="0,00"
                       className="h-11 text-lg font-mono font-bold text-purple-600 border-purple-300 focus-visible:ring-purple-500"
                      value={form.price || ""} onChange={(e) => updateForm({ price: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between gap-3 p-3 bg-card border border-border/60 rounded-xl">
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={form.cancelAfterEnabled}
                        onCheckedChange={(v) => updateForm({ cancelAfterEnabled: v })}
                      />
                      <div className="grid">
                        <Label className="text-sm font-semibold cursor-pointer">Cobrança de Prazo Fixo</Label>
                        <span className="text-xs text-muted-foreground">A assinatura para automaticamente após X ciclos.</span>
                      </div>
                    </div>
                  </div>

                  {form.cancelAfterEnabled && (
                    <div className="flex items-center gap-2 p-3 bg-purple-100 dark:bg-purple-900/10 rounded-xl animate-in fade-in zoom-in-95">
                      <span className="text-sm font-medium">Encerrar e parar de cobrar após</span>
                      <Input 
                        type="number" min={1} max={100}
                        className="w-16 h-8 text-center px-1"
                        value={form.cancelAfterCycles} onChange={(e) => updateForm({cancelAfterCycles: Number(e.target.value)})}
                      />
                      <span className="text-sm font-medium">parcelas.</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Acesso pós compra */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Link de Acesso dos Membros (URL Secreta)</Label>
                <Input 
                  placeholder="https://discord.gg/... ou Link do Área de Membros" 
                  value={form.deliveryUrl} onChange={e => updateForm({deliveryUrl: e.target.value})}
                />
                <p className="text-[11px] text-muted-foreground">Entregue automaticamente por e-mail e exibido na tela de "Parabéns".</p>
              </div>

              {/* Formulário / Dados do Cliente */}
              <div className="space-y-4 pt-4 mt-6 border-t border-border/40">
                   <div className="space-y-1">
                     <p className="text-base font-semibold text-foreground">Campos do Checkout</p>
                     <p className="text-sm text-muted-foreground">Colete o WhatsApp ou informações relevantes do seu assinante.</p>
                   </div>
                   <FormFieldsBuilder productId={initialProduct.id} />
              </div>

            </TabsContent>

            {/* ABA: OPÇÕES */}
            <TabsContent value="opcoes" className="space-y-6 animate-in fade-in">
              <div className="space-y-2">
                <h2 className="text-xl font-bold">Mecanismos de Fidelização</h2>
                <p className="text-sm text-muted-foreground">Automações Pós-Assinatura.</p>
              </div>

              <div className="space-y-3">
                 {/* Avaliações / Depoimentos (Prova Social) */}
                 <ReviewsBuilder productId={initialProduct.id} />

                 {/* Custom - Email Livre */}
                 <div className={cn("rounded-xl border bg-card transition-all mt-6", openEmail ? "border-purple-500/40 shadow-sm" : "border-border/60 hover:border-border")}>
                    <div className="flex items-center gap-3 p-4 cursor-pointer select-none" onClick={() => setOpenEmail(!openEmail)}>
                       <div className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-purple-600/10 text-purple-600">
                          <Mail className="h-5 w-5" />
                       </div>
                       <div className="flex-1">
                          <p className="text-sm font-semibold text-foreground">Email de Boas-vindas (Ao Pagar 1º Mês)</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Avise sua nova tribo ou gere acesso.</p>
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
                               { label: "Nome do Produto", value: "nome_produto" },
                               { label: "Link de Acesso", value: "link_acesso" },
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
              <Button onClick={handleNext} className="bg-purple-600 hover:bg-purple-700 text-white max-w-[200px] w-full shadow-md transition-transform active:scale-95">
                Continuar
              </Button>
            ) : (
              <Button onClick={() => saveMutation.mutate("PUBLISHED")} className="bg-purple-600 hover:bg-purple-700 text-white shadow-xl shadow-purple-600/20 w-fit sm:w-[250px] transition-transform active:scale-95">
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
