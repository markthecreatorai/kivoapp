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
  Lock
} from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import { FormFieldsBuilder } from "@/components/FormFieldsBuilder";
import { ReviewsBuilder } from "@/components/ReviewsBuilder";

export default function CollectEmailsFlow({
  initialProduct,
  setSaving,
}: {
  initialProduct: any;
  setSaving: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("thumbnail");
  
  // Local Form State
  const [form, setForm] = useState({
    name: initialProduct.name || "",
    shortDescription: initialProduct.short_description || "",
    ctaText: initialProduct.listing_button_text || "Inscrever-se",
    thumbnailUrl: initialProduct.thumbnail_url || "",
    // Aba Produto (Entrega)
    deliveryType: initialProduct.delivery_mode || "url", // url | file
    deliveryUrl: initialProduct.delivery_url || "",
    // Aba Opções
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
    if (tab === "thumbnail") {
      if (!form.name.trim()) { toast.error("Informe título"); return; }
      setTab("produto");
    } else if (tab === "produto") {
      setTab("opcoes");
    }
  };

  const MobilePreview = () => (
    <div className="hidden lg:block w-[320px] shrink-0 sticky top-24">
      <p className="text-xs font-medium text-muted-foreground mb-3 text-center">
        Preview em tempo real
      </p>
      
      {/* Fake Phone */}
      <div className="w-[320px] h-[600px] bg-black rounded-[40px] p-2 shadow-xl flex flex-col justify-start">
        <div className="w-full h-full rounded-[32px] overflow-hidden bg-white dark:bg-zinc-950 flex flex-col relative overflow-y-auto">
          {/* Notch */}
          <div className="w-32 h-6 bg-black absolute top-0 inset-x-0 mx-auto rounded-b-xl z-20"></div>

          {/* Content Preview */}
          {tab === "thumbnail" && (
            <div className="p-4 pt-10">
              <div className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-sm">
                <div className="h-40 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                  {form.thumbnailUrl ? (
                    <img src={form.thumbnailUrl} className="w-full h-full object-cover" />
                  ) : <ImageIcon className="h-8 w-8 text-zinc-300 dark:text-zinc-600" />}
                </div>
                <div className="p-4 space-y-2 text-center">
                  <p className="font-bold text-lg text-zinc-900 dark:text-zinc-100 leading-tight">
                    {form.name || "Título aqui"}
                  </p>
                  <p className="text-sm text-zinc-500 line-clamp-2">
                    {form.shortDescription || "Breve descrição sobre o que será entregue."}
                  </p>
                  <div className="pt-2">
                    <div className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-medium text-sm">
                      {form.ctaText || "Inscrever"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {(tab === "produto" || tab === "opcoes") && (
            <div className="p-4 pt-10 h-full flex flex-col">
              {form.thumbnailUrl && <img src={form.thumbnailUrl} className="w-full h-40 object-cover rounded-xl mb-4" />}
              <p className="font-bold text-lg mb-1">{form.name}</p>
              <p className="text-sm text-zinc-500 mb-6">{form.shortDescription}</p>
              
              {/* Form simulado */}
              <div className="space-y-3 mt-auto">
                 <div className="space-y-1">
                   <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Nome</p>
                   <div className="h-10 border rounded-lg bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800" />
                 </div>
                 <div className="space-y-1">
                   <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Email</p>
                   <div className="h-10 border rounded-lg bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800" />
                 </div>
                 <div className="pt-2">
                    <div className="w-full py-3 rounded-xl bg-indigo-600 text-white font-medium text-center shadow-lg shadow-indigo-600/20">
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
        
        {/* Lado Esquerdo - Abas */}
        <div className="flex-1 min-w-0">
          <Tabs value={tab} onValueChange={setTab} className="mb-8">
             <TabsList className="bg-muted/50 p-1 w-full flex mb-6">
                <TabsTrigger value="thumbnail" className="flex-1 text-xs">1. Thumbnail</TabsTrigger>
                <TabsTrigger value="produto" className="flex-1 text-xs">2. Produto</TabsTrigger>
                <TabsTrigger value="opcoes" className="flex-1 text-xs">3. Opções</TabsTrigger>
             </TabsList>

             {/* ABA: THUMBNAIL */}
             <TabsContent value="thumbnail" className="space-y-6 animate-in fade-in">
                <div className="space-y-4">
                  <h2 className="text-lg font-bold">Thumbnail / Vitrine</h2>
                  <p className="text-sm text-muted-foreground">Esta é a capa que será exibida publicamente na sua loja Kivo para capturar inscrições.</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Imagem de Capa (URL)</Label>
                  <Input 
                    placeholder="Cole o link da imagem (ex: https://...)" 
                    value={form.thumbnailUrl} onChange={e => updateForm({thumbnailUrl: e.target.value})}
                  />
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
                  <Label className="text-sm font-semibold">Texto do Botão no Formulário</Label>
                  <Input 
                    placeholder="Inscrever-se agora" 
                    maxLength={30}
                    value={form.ctaText} onChange={e => updateForm({ctaText: e.target.value})}
                  />
                </div>
             </TabsContent>

             {/* ABA: PRODUTO */}
             <TabsContent value="produto" className="space-y-6 animate-in fade-in">
                <div className="space-y-4">
                  <h2 className="text-lg font-bold">Configuração da Entrega</h2>
                  <p className="text-sm text-muted-foreground">O que o usuário recebe ou para onde ele é encaminhado após preencher o e-mail?</p>
                </div>

                <div className="p-5 border border-border/60 bg-card rounded-xl space-y-5">
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
                        <Label className="text-sm font-semibold">Link Mágico (URL de Redirecionamento)</Label>
                        <Input 
                          placeholder="https://sua-pagina-oficial.com"
                          value={form.deliveryUrl} onChange={e => updateForm({deliveryUrl: e.target.value})}
                        />
                        <p className="text-xs text-muted-foreground">O usuário será empurrado para esta página automaticamente após enviar os dados.</p>
                      </div>
                   ) : (
                      <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-border/60 rounded-xl bg-muted/10 text-center">
                         <UploadCloud className="w-8 h-8 text-muted-foreground/50 mb-3" />
                         <p className="text-sm font-medium text-foreground">Upload de Lead Magnet via Arquivo Digital</p>
                         <p className="text-xs text-muted-foreground mt-1">Gere arquivos em PDF, planilhas ou vídeos. Uma URL de download interno será gerada após salvar as alterações da aba.</p>
                      </div>
                   )}
                 </div>

                 {/* Campos Adicionais */}
                 <div className="space-y-4 pt-4 mt-6 border-t border-border/40">
                   <div className="space-y-1">
                     <p className="text-base font-semibold text-foreground">Campos do Formulário</p>
                     <p className="text-sm text-muted-foreground">Adicione campos para qualificar seus leads (ex: Telefone, Nome da Empresa).</p>
                   </div>
                   <FormFieldsBuilder productId={initialProduct.id} />
                 </div>
              </TabsContent>

             {/* ABA: OPÇÕES */}
             <TabsContent value="opcoes" className="space-y-6 animate-in fade-in">
                <div className="space-y-4">
                  <h2 className="text-lg font-bold">Opções Pós-Envio</h2>
                  <p className="text-sm text-muted-foreground">Engaje seus leads com automação nativa.</p>
                </div>

                <div className="space-y-3">
                   {/* Colapsável: Confirmação */}
                   <div className={cn("rounded-xl border bg-card transition-all", openEmail ? "border-border" : "border-border/50")}>
                      <div className="flex items-center gap-3 p-4 cursor-pointer select-none" onClick={() => setOpenEmail(!openEmail)}>
                         <div className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-primary/10 text-primary">
                            <Mail className="h-4 w-4" />
                         </div>
                         <div className="flex-1">
                            <p className="text-sm font-medium text-foreground">Email de Confirmação e Boas Vindas</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Disparado no exato instante de conversão do lead</p>
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
                             <Textarea 
                               value={form.confirmationBody}
                               onChange={e => updateForm({confirmationBody: e.target.value})}
                               rows={6}
                               className="resize-none font-mono text-sm leading-relaxed"
                             />
                             <p className="text-xs text-muted-foreground">Variáveis aceitas: {'{nome_cliente}'}</p>
                           </div>
                        </div>
                      )}
                   </div>

                   {/* Email Flows Placeholder (Locked) */}
                   <div className="rounded-xl border border-border/50 bg-card p-4 flex items-center gap-3 opacity-60 grayscale cursor-not-allowed">
                       <div className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-muted text-muted-foreground">
                          <Mail className="h-4 w-4" />
                       </div>
                       <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-foreground">Fluxos de E-mail Automáticos (Drip)</p>
                            <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80 h-5 gap-1"><Lock className="w-3 h-3"/> Pro</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">Agende sequências de dias pra nutrir esse lead na Kivo</p>
                       </div>
                   </div>

                   {/* Avaliações / Depoimentos (Prova Social) */}
                   <ReviewsBuilder productId={initialProduct.id} />
                </div>
             </TabsContent>

          </Tabs>

          {/* Footer Save Area */}
          <div className="flex items-center justify-between pt-6 mt-6 border-t border-border/40 pb-10">
             <Button variant="outline" onClick={() => saveMutation.mutate("DRAFT")}>
               <Save className="h-4 w-4 mr-2" /> Salvar Rascunho
             </Button>

             {tab !== "opcoes" ? (
               <Button onClick={handleNext} className="bg-primary text-primary-foreground max-w-[200px] w-full">
                 Próximo Passo &rarr;
               </Button>
             ) : (
               <Button onClick={() => saveMutation.mutate("PUBLISHED")} className="bg-indigo-600 text-white hover:bg-indigo-700 max-w-[200px] w-full shadow-md">
                 <Rocket className="h-4 w-4 mr-2" />
                 Lançar Formulário
               </Button>
             )}
          </div>
        </div>

        {/* Lado Direito - Preview */}
        <MobilePreview />
      </div>
    </div>
  );
}
