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
  Palette,
  Type,
  Settings,
} from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import { FormFieldsBuilder } from "@/components/FormFieldsBuilder";
import { ReviewsBuilder } from "@/components/ReviewsBuilder";
import { RichTextEditor } from "@/components/RichTextEditor";

export default function CollectEmailsFlow({
  initialProduct,
  setSaving,
}: {
  initialProduct: any;
  setSaving: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("visual");
  const themeTokens = useStorefrontTheme();
  
  const [form, setForm] = useState({
    name: initialProduct.name || "",
    shortDescription: initialProduct.short_description || "",
    ctaText: initialProduct.listing_button_text || "Inscrever-se",
    thumbnailUrl: initialProduct.thumbnail_url || "",
    deliveryType: initialProduct.delivery_mode || "url",
    deliveryUrl: initialProduct.delivery_url || "",
    confirmationSubject: initialProduct.confirmation_email_subject || "Confirmação de Inscrição",
    confirmationBody: initialProduct.confirmation_email_body || "Obrigado por se inscrever!",
  });

  const updateForm = (updates: Partial<typeof form>) => setForm(p => ({ ...p, ...updates }));

  const [openEmail, setOpenEmail] = useState(false);

  const saveMutation = useMutation({
    mutationFn: async (status: "DRAFT" | "PUBLISHED") => {
      setSaving(true);
      const { error } = await supabase.from("products").update({
        status,
        name: form.name,
        short_description: form.shortDescription,
        listing_button_text: form.ctaText,
        thumbnail_url: form.thumbnailUrl,
        delivery_mode: form.deliveryType,
        delivery_url: form.deliveryUrl,
        confirmation_email_subject: form.confirmationSubject,
        confirmation_email_body: form.confirmationBody,
      }).eq("id", initialProduct.id);

      if (error) throw error;
      return status;
    },
    onSuccess: (status) => {
      queryClient.invalidateQueries({ queryKey: ["product", initialProduct.id] });
      toast.success(status === "PUBLISHED" ? "Produto Publicado!" : "Rascunho salvo!");
    },
    onError: (err: any) => {
      toast.error("Erro ao salvar: " + err.message);
    },
    onSettled: () => setSaving(false),
  });

  const handleNext = () => {
    if (tab === "visual") {
      setTab("conteudo");
    } else if (tab === "conteudo") {
      if (!form.name.trim()) { toast.error("Informe título"); return; }
      setTab("config");
    }
  };

  // ─── Context-aware Preview ─────────────────────────────────────────────────
  const MobilePreview = () => (
    <div className="hidden lg:block w-[320px] shrink-0 sticky top-24">
      <p className="text-xs font-medium text-muted-foreground mb-3 text-center">
        Preview em tempo real
      </p>
      
      <div className="w-[320px] h-[600px] bg-black rounded-[40px] p-2 shadow-xl flex flex-col justify-start">
        <div className="w-full h-full rounded-[32px] overflow-hidden bg-white dark:bg-zinc-950 flex flex-col relative overflow-y-auto">
          <div className="w-32 h-6 bg-black absolute top-0 inset-x-0 mx-auto rounded-b-xl z-20"></div>

          {/* Visual tab: highlights thumbnail area */}
          {tab === "visual" && (
            <div className="p-4 pt-10">
              <div className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-sm">
                <div className={cn(
                  "h-40 flex items-center justify-center transition-all",
                  "ring-2 ring-primary/40 ring-offset-2"
                )} style={{ backgroundColor: themeTokens.surfaceColor }}>
                  {form.thumbnailUrl ? (
                    <img src={form.thumbnailUrl} className="w-full h-full object-cover" alt="" />
                  ) : <ImageIcon className="h-8 w-8 text-zinc-300 dark:text-zinc-600" />}
                </div>
                <div className="p-4 space-y-2 text-center">
                  <p className="font-bold text-lg text-zinc-900 dark:text-zinc-100 leading-tight">
                    {form.name || "Título aqui"}
                  </p>
                  <p className="text-sm text-zinc-500 line-clamp-2">
                    {form.shortDescription || "Breve descrição"}
                  </p>
                  <div className="pt-2">
                    <div
                      className="w-full py-2.5 text-white font-medium text-sm text-center"
                      style={{ backgroundColor: themeTokens.primaryColor, borderRadius: themeTokens.buttonRadius }}
                    >
                      {form.ctaText || "Inscrever"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Conteúdo tab: highlights text/CTA */}
          {tab === "conteudo" && (
            <div className="p-4 pt-10">
              <div className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-sm">
                <div className="h-40 flex items-center justify-center" style={{ backgroundColor: themeTokens.surfaceColor }}>
                  {form.thumbnailUrl ? (
                    <img src={form.thumbnailUrl} className="w-full h-full object-cover" alt="" />
                  ) : <ImageIcon className="h-8 w-8 text-zinc-300 dark:text-zinc-600" />}
                </div>
                <div className={cn(
                  "p-4 space-y-2 text-center transition-all",
                  "ring-2 ring-primary/40 ring-offset-2 rounded-b-2xl"
                )}>
                  <p className="font-bold text-lg text-zinc-900 dark:text-zinc-100 leading-tight">
                    {form.name || "Título aqui"}
                  </p>
                  <p className="text-sm text-zinc-500 line-clamp-2">
                    {form.shortDescription || "Breve descrição sobre o que será entregue."}
                  </p>
                  <div className="pt-2">
                    <div
                      className="w-full py-2.5 text-white font-medium text-sm text-center"
                      style={{ backgroundColor: themeTokens.primaryColor, borderRadius: themeTokens.buttonRadius }}
                    >
                      {form.ctaText || "Inscrever"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Configuração tab: shows form fields */}
          {tab === "config" && (
            <div className="p-4 pt-10 h-full flex flex-col">
              {form.thumbnailUrl && <img src={form.thumbnailUrl} className="w-full h-40 object-cover rounded-xl mb-4" alt="" />}
              <p className="font-bold text-lg mb-1">{form.name}</p>
              <p className="text-sm text-zinc-500 mb-4">{form.shortDescription}</p>
              <div className="px-1 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-center mb-4">
                <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Grátis</span>
              </div>
              
              <div className={cn(
                "space-y-3 mt-auto transition-all",
                "ring-2 ring-primary/40 ring-offset-2 rounded-xl p-3"
              )}>
                 <div className="space-y-1">
                   <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Nome *</p>
                   <div className="h-10 border rounded-lg bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800" />
                 </div>
                 <div className="space-y-1">
                   <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Email *</p>
                   <div className="h-10 border rounded-lg bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800" />
                 </div>
                  <div className="pt-2">
                     <div
                       className="w-full py-3 text-white font-medium text-center"
                       style={{ backgroundColor: themeTokens.primaryColor, borderRadius: themeTokens.buttonRadius, boxShadow: `0 4px 14px ${themeTokens.primaryColor}40` }}
                     >
                       {form.ctaText || "Enviar"}
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
        
        {/* Left - Form */}
        <div className="flex-1 min-w-0">
          <Tabs value={tab} onValueChange={setTab} className="mb-8">
             <TabsList className="bg-muted/50 p-1 w-full flex mb-6">
                <TabsTrigger value="visual" className="flex-1 text-xs sm:text-sm gap-1.5">
                  <Palette className="h-3.5 w-3.5" /> Visual
                </TabsTrigger>
                <TabsTrigger value="conteudo" className="flex-1 text-xs sm:text-sm gap-1.5">
                  <Type className="h-3.5 w-3.5" /> Conteúdo
                </TabsTrigger>
                <TabsTrigger value="config" className="flex-1 text-xs sm:text-sm gap-1.5">
                  <Settings className="h-3.5 w-3.5" /> Configuração
                </TabsTrigger>
             </TabsList>

             {/* ─── ABA: VISUAL ─── */}
             <TabsContent value="visual" className="space-y-6 animate-in fade-in">
                <div className="space-y-4">
                  <h2 className="text-lg font-bold">Imagem de Capa</h2>
                  <p className="text-sm text-muted-foreground">Opcional. Se não enviar, um fallback elegante será exibido automaticamente.</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold">URL da Imagem</Label>
                  <Input 
                    placeholder="Cole o link da imagem (ex: https://...)" 
                    value={form.thumbnailUrl} onChange={e => updateForm({thumbnailUrl: e.target.value})}
                  />
                  <p className="text-[11px] text-muted-foreground">Recomendado: 16:9 ou 1:1, alta qualidade.</p>
                </div>

                {form.thumbnailUrl && (
                  <div className="relative rounded-xl overflow-hidden border border-border/40">
                    <img src={form.thumbnailUrl} alt="Preview" className="w-full h-48 object-cover" />
                    <Button
                      variant="destructive"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => updateForm({ thumbnailUrl: "" })}
                    >
                      Remover
                    </Button>
                  </div>
                )}
             </TabsContent>

             {/* ─── ABA: CONTEÚDO ─── */}
             <TabsContent value="conteudo" className="space-y-6 animate-in fade-in">
                <div className="space-y-4">
                  <h2 className="text-lg font-bold">Textos e CTA</h2>
                  <p className="text-sm text-muted-foreground">O que aparece na vitrine e no formulário de captura.</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Título Principal *</Label>
                  <Input 
                    placeholder="Ex: Guia Rápido de Vendas" 
                    maxLength={50}
                    value={form.name} onChange={e => updateForm({name: e.target.value})}
                  />
                  <p className="text-right text-[10px] text-muted-foreground">{form.name.length}/50</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Subtítulo (Opcional)</Label>
                  <Textarea 
                    placeholder="Descreva sobre o que é ou a recompensa (Lead Magnet)..." 
                    maxLength={100}
                    value={form.shortDescription} onChange={e => updateForm({shortDescription: e.target.value})}
                    rows={2}
                    className="resize-none"
                  />
                   <p className="text-right text-[10px] text-muted-foreground">{form.shortDescription.length}/100</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Texto do Botão</Label>
                  <Input 
                    placeholder="Inscrever-se agora" 
                    maxLength={30}
                    value={form.ctaText} onChange={e => updateForm({ctaText: e.target.value})}
                  />
                </div>
             </TabsContent>

             {/* ─── ABA: CONFIGURAÇÃO ─── */}
             <TabsContent value="config" className="space-y-6 animate-in fade-in">
                <div className="space-y-4">
                  <h2 className="text-lg font-bold">Configuração de Captura e Entrega</h2>
                  <p className="text-sm text-muted-foreground">Defina como coletar dados e o que entregar ao lead.</p>
                </div>

                {/* Base fields info */}
                <div className="p-4 rounded-xl border border-border/60 bg-muted/30 space-y-3">
                  <p className="text-sm font-semibold text-foreground">Campos base do formulário</p>
                  <div className="flex gap-2">
                    <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-medium">
                      Nome (obrigatório)
                    </span>
                    <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-medium">
                      Email (obrigatório)
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Esses campos são coletados automaticamente em todo Lead Magnet.</p>
                </div>

                {/* Extra fields */}
                <div className="space-y-4">
                  <div className="space-y-1">
                    <p className="text-base font-semibold text-foreground">Campos adicionais</p>
                    <p className="text-sm text-muted-foreground">Adicione campos extras para qualificar seus leads (ex: Telefone, Empresa).</p>
                  </div>
                  <FormFieldsBuilder productId={initialProduct.id} />
                </div>

                {/* Delivery */}
                <div className="p-5 border border-border/60 bg-card rounded-xl space-y-5 mt-2">
                  <p className="text-base font-semibold text-foreground">Entrega pós-captura</p>
                   <div className="flex gap-2 mb-4">
                      <Button 
                        variant={form.deliveryType === "url" ? "default" : "outline"} 
                        onClick={() => updateForm({deliveryType: "url"})}
                        className="flex-1"
                      >
                         <Link2 className="w-4 h-4 mr-2" /> Redirecionar URL
                      </Button>
                      <Button 
                        variant={form.deliveryType === "file" ? "default" : "outline"} 
                        onClick={() => updateForm({deliveryType: "file"})}
                        className="flex-1"
                      >
                         <UploadCloud className="w-4 h-4 mr-2" /> Enviar Arquivo
                      </Button>
                   </div>

                   {form.deliveryType === "url" ? (
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold">Link de Redirecionamento</Label>
                        <Input 
                          placeholder="https://sua-pagina-oficial.com"
                          value={form.deliveryUrl} onChange={e => updateForm({deliveryUrl: e.target.value})}
                        />
                        <p className="text-xs text-muted-foreground">O usuário será redirecionado automaticamente após enviar os dados.</p>
                      </div>
                   ) : (
                      <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-border/60 rounded-xl bg-muted/10 text-center">
                         <UploadCloud className="w-8 h-8 text-muted-foreground/50 mb-3" />
                         <p className="text-sm font-medium text-foreground">Upload de Arquivo Digital</p>
                         <p className="text-xs text-muted-foreground mt-1">Gere arquivos em PDF, planilhas ou vídeos. Uma URL de download interno será gerada após salvar.</p>
                      </div>
                   )}
                </div>

                {/* Email confirmation */}
                <div className={cn("rounded-xl border bg-card transition-all", openEmail ? "border-border" : "border-border/50")}>
                   <div className="flex items-center gap-3 p-4 cursor-pointer select-none" onClick={() => setOpenEmail(!openEmail)}>
                      <div className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-primary/10 text-primary">
                         <Mail className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                         <p className="text-sm font-medium text-foreground">Email de Confirmação</p>
                         <p className="text-xs text-muted-foreground mt-0.5">Disparado automaticamente após a inscrição</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch checked={true} disabled />
                        {openEmail ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                   </div>

                   {openEmail && (
                     <div className="px-4 pb-4 border-t border-border/30 pt-4 space-y-4">
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold">Assunto do E-mail</Label>
                          <Input 
                            value={form.confirmationSubject}
                            onChange={e => updateForm({confirmationSubject: e.target.value})}
                          />
                        </div>
                        <div className="space-y-2">
                           <Label className="text-xs font-semibold">Mensagem Personalizada</Label>
                           <RichTextEditor
                             value={form.confirmationBody}
                             onChange={v => updateForm({confirmationBody: v})}
                             variables={[
                               { label: "Nome do Cliente", value: "nome_cliente" },
                               { label: "Seu Nome", value: "meu_nome" },
                               { label: "Nome do Produto", value: "nome_produto" },
                             ]}
                             minHeight="140px"
                           />
                        </div>
                     </div>
                   )}
                </div>

                {/* Locked Drip Flows */}
                <div className="rounded-xl border border-border/50 bg-card p-4 flex items-center gap-3 opacity-60 grayscale cursor-not-allowed">
                    <div className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-muted text-muted-foreground">
                       <Mail className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                       <div className="flex items-center gap-2">
                         <p className="text-sm font-medium text-foreground">Fluxos de E-mail Automáticos (Drip)</p>
                         <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold transition-colors border-transparent bg-secondary text-secondary-foreground h-5 gap-1"><Lock className="w-3 h-3"/> Pro</span>
                       </div>
                       <p className="text-xs text-muted-foreground mt-0.5">Sequências para nutrir leads automaticamente</p>
                    </div>
                </div>

                {/* Reviews */}
                <ReviewsBuilder productId={initialProduct.id} />
             </TabsContent>

          </Tabs>

          {/* Footer Save Area */}
          <div className="flex items-center justify-between pt-6 mt-6 border-t border-border/40 pb-10">
             <Button variant="outline" onClick={() => saveMutation.mutate("DRAFT")}>
               <Save className="h-4 w-4 mr-2" /> Salvar Rascunho
             </Button>

             {tab !== "config" ? (
               <Button onClick={handleNext}>
                 Avançar <span className="ml-2">→</span>
               </Button>
             ) : (
               <Button className="gap-2" onClick={() => saveMutation.mutate("PUBLISHED")}>
                 <Rocket className="h-4 w-4" /> Publicar Lead Magnet
               </Button>
             )}
          </div>
        </div>

        {/* Right - Preview */}
        <MobilePreview />
      </div>
    </div>
  );
}
