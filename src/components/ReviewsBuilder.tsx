import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  MessageSquare, Plus, Trash2, Edit2, User, Star, MoreVertical, RefreshCw
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";

interface Review {
  id: string;
  product_id: string;
  author_name: string;
  author_avatar_url: string | null;
  rating: number;
  content: string;
  is_approved: boolean;
  created_at: string;
}

export function ReviewsBuilder({ productId }: { productId: string }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [openModal, setOpenModal] = useState(false);
  
  const [editingReview, setEditingReview] = useState<Review | null>(null);

  const [form, setForm] = useState({
    author_name: "",
    author_avatar_url: "",
    rating: 5,
    content: "",
    is_approved: true
  });

  const generateDicebearAvatar = (name: string) => {
    return `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(name.trim() || 'avatar')}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
  };

  const loadReviews = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("product_reviews")
        .select("*")
        .eq("product_id", productId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Erro ao carregar validações:", error);
      } else {
        setReviews(data || []);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (productId) {
      loadReviews();
    }
  }, [productId]);

  const resetForm = () => {
    setForm({
      author_name: "",
      author_avatar_url: "",
      rating: 5,
      content: "",
      is_approved: true
    });
    setEditingReview(null);
  };

  const handleOpenNew = () => {
    resetForm();
    setOpenModal(true);
  };

  const handleEdit = (rev: Review) => {
    setForm({
      author_name: rev.author_name,
      author_avatar_url: rev.author_avatar_url || "",
      rating: rev.rating,
      content: rev.content,
      is_approved: rev.is_approved
    });
    setEditingReview(rev);
    setOpenModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Remover este depoimento? O cliente deixará de vê-lo.")) return;
    
    setIsSaving(true);
    const { error } = await supabase
      .from("product_reviews")
      .delete()
      .eq("id", id);
      
    setIsSaving(false);
    if (error) {
      toast.error("Erro ao remover: " + error.message);
    } else {
      toast.success("Depoimento deletado.");
      setReviews(reviews.filter(r => r.id !== id));
    }
  };

  const toggleApproval = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase.from("product_reviews").update({ is_approved: !currentStatus }).eq("id", id);
    if (!error) {
       setReviews(reviews.map(r => r.id === id ? { ...r, is_approved: !currentStatus } : r));
       if (!currentStatus) toast.success("Review visível no checkout.");
       else toast.info("Review ocultada.");
    }
  };

  const handleSave = async () => {
    if (!form.author_name.trim()) {
      toast.error("Nome do autor é obrigatório.");
      return;
    }
    if (!form.content.trim()) {
      toast.error("Texto do depoimento é obrigatório.");
      return;
    }
    
    setIsSaving(true);
    
    const payload = {
      product_id: productId,
      author_name: form.author_name,
      author_avatar_url: form.author_avatar_url.trim() || generateDicebearAvatar(form.author_name),
      rating: form.rating,
      content: form.content,
      is_approved: form.is_approved
    };

    if (editingReview) {
      const { error, data } = await supabase
        .from("product_reviews")
        .update(payload)
        .eq("id", editingReview.id)
        .select()
        .single();
        
      if (error) toast.error("Erro ao atualizar: " + error.message);
      else {
        toast.success("Depoimento atualizado!");
        setReviews(reviews.map(r => r.id === editingReview.id ? data : r));
        setOpenModal(false);
      }
    } else {
      const { error, data } = await supabase
        .from("product_reviews")
        .insert(payload)
        .select()
        .single();
        
      if (error) {
         if (error.code === '42P01') {
            toast.error("Tabela product_reviews não foi criada. Por favor, execute o SQL no Lovable.");
         } else {
            toast.error("Erro ao criar: " + error.message);
         }
      } else {
        toast.success("Novo depoimento adicionado!");
        setReviews([data, ...reviews]);
        setOpenModal(false);
      }
    }
    setIsSaving(false);
  };

  const StarRatingSelector = ({ value, onChange }: { value: number, onChange: (v: number) => void }) => {
    return (
       <div className="flex gap-1">
          {[1,2,3,4,5].map((s) => (
             <button
               key={s}
               onClick={() => onChange(s)}
               className={cn("p-1 transition-transform hover:scale-110", s <= value ? "text-yellow-400" : "text-muted")}
             >
                <Star className="w-8 h-8 fill-current" />
             </button>
          ))}
       </div>
    );
  };

  if (isLoading) {
    return (
       <div className="flex flex-col items-center justify-center p-8 border rounded-xl bg-card border-border/50 animate-pulse text-muted-foreground gap-2">
           <RefreshCw className="w-5 h-5 animate-spin" />
           <p className="text-sm font-medium">Carregando Provas Sociais...</p>
       </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-4 rounded-xl border border-indigo-500/30 bg-indigo-50/30 dark:bg-indigo-900/10">
         <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 flex items-center justify-center">
                 <MessageSquare className="w-5 h-5" />
             </div>
             <div>
                <h3 className="text-sm font-bold text-foreground">Depoimentos ({reviews.length})</h3>
                <p className="text-xs text-muted-foreground">Exibidos abaixo do botão de compra no seu checkout.</p>
             </div>
         </div>
         <Button onClick={handleOpenNew} size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 gap-2">
            <Plus className="w-4 h-4" /> Adicionar Review
         </Button>
      </div>

      {reviews.length === 0 ? (
        <div className="p-8 border-2 border-dashed border-border rounded-xl text-center bg-card">
           <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3 text-muted-foreground">
              <Star className="w-6 h-6" />
           </div>
           <p className="text-sm font-semibold text-foreground mb-1">Nenhum depoimento cadastrado</p>
           <p className="text-xs text-muted-foreground max-w-[250px] mx-auto">Adicione mensagens de alunos/clientes reais (com 5 estrelas) para engatilhar mais aprovações.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
           {reviews.map((rev) => (
              <div key={rev.id} className={cn("flex flex-col rounded-xl border p-4 bg-card shadow-sm transition-all relative group", !rev.is_approved && "opacity-60 grayscale")}>
                 <div className="flex justify-between items-start mb-3">
                    <div className="flex gap-0.5 text-yellow-500">
                       {Array.from({length: 5}).map((_, i) => (
                           <Star key={i} className={cn("w-3.5 h-3.5", i < rev.rating ? "fill-current" : "text-muted fill-transparent")} />
                       ))}
                    </div>
                    <div className="flex items-center border rounded-full bg-muted/30 px-2 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                       <button onClick={() => toggleApproval(rev.id, rev.is_approved)} className="px-1" title={rev.is_approved ? "Ocultar" : "Mostrar"}>
                           <Switch checked={rev.is_approved} className="scale-75 data-[state=checked]:bg-green-500" />
                       </button>
                       <div className="w-px h-3 bg-border mx-1" />
                       <button onClick={() => handleEdit(rev)} className="p-1 text-muted-foreground hover:text-indigo-600 transition-colors">
                           <Edit2 className="w-3.5 h-3.5" />
                       </button>
                       <button onClick={() => handleDelete(rev.id)} className="p-1 text-muted-foreground hover:text-red-500 transition-colors">
                           <Trash2 className="w-3.5 h-3.5" />
                       </button>
                    </div>
                 </div>
                 
                 <p className="text-sm font-medium italic text-zinc-700 dark:text-zinc-300 leading-relaxed line-clamp-4 flex-1 mb-4">"{rev.content}"</p>
                 
                 <div className="flex items-center gap-2 mt-auto pt-3 border-t border-border/50">
                     <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center overflow-hidden border">
                         {rev.author_avatar_url ? (
                             <img src={rev.author_avatar_url} alt={rev.author_name} className="w-full h-full object-cover" />
                         ) : <User className="w-4 h-4 text-muted-foreground" />}
                     </div>
                     <div className="flex flex-col">
                        <span className="text-xs font-bold leading-tight">{rev.author_name}</span>
                        <span className="text-[10px] flex items-center gap-1 text-green-600 dark:text-green-500 font-semibold"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> Compra Verificada</span>
                     </div>
                 </div>
              </div>
           ))}
        </div>
      )}

      {/* MODAL DE CRIAÇÃO/EDIÇÃO */}
      <Dialog open={openModal} onOpenChange={setOpenModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingReview ? "Editar Depoimento" : "Adicionar Prova Social"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            
            <div className="flex flex-col items-center justify-center py-2 space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nota do Cliente *</Label>
              <StarRatingSelector value={form.rating} onChange={v => setForm({...form, rating: v})} />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Nome do Autor *</Label>
              <Input
                placeholder="Ex: Ana Silva"
                value={form.author_name}
                onChange={(e) => setForm({ ...form, author_name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Foto do Autor (Opcional)</Label>
              <Input
                placeholder="URL da foto (caso vazio, geraremos um avatar fofo)"
                value={form.author_avatar_url}
                onChange={(e) => setForm({ ...form, author_avatar_url: e.target.value })}
              />
              {form.author_avatar_url && (
                 <div className="flex mt-2">
                    <img src={form.author_avatar_url} alt="Preview" className="w-10 h-10 rounded-full border shadow-sm object-cover" onError={(e) => (e.currentTarget.src = generateDicebearAvatar(form.author_name))} />
                 </div>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Mensagem / Relato *</Label>
              <Textarea
                placeholder='"O curso de vendas transformou a minha vida! Receita dobrou..."'
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                rows={4}
                className="resize-none"
              />
              <p className="text-[10px] text-muted-foreground text-right">{form.content.length} caracteres</p>
            </div>

            <div className="flex items-center justify-between p-3 border rounded-xl bg-card">
               <Label className="text-sm font-semibold cursor-pointer">Visível ao Público?</Label>
               <Switch checked={form.is_approved} onCheckedChange={(v) => setForm({...form, is_approved: v})} />
            </div>

          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenModal(false)} className="w-full sm:w-auto">Cancelar</Button>
            <Button onClick={handleSave} disabled={isSaving} className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white">
              {isSaving ? (
                 <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Salvando...</>
              ) : (
                 "Gravar Depoimento"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
