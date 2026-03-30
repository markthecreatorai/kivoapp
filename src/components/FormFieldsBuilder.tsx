import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, GripVertical, Settings2, Trash2, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface FormField {
  id?: string;
  product_id: string;
  field_type: "text" | "email" | "phone" | "textarea" | "select" | "checkbox" | "radio";
  label: string;
  placeholder?: string | null;
  is_required: boolean;
  is_system: boolean;
  options?: string[] | null;
  sort_order: number;
}

export function FormFieldsBuilder({ productId }: { productId: string }) {
  const queryClient = useQueryClient();
  const [fields, setFields] = useState<FormField[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // Field Edit Form State
  const [editForm, setEditForm] = useState<Partial<FormField>>({
    field_type: "text",
    label: "",
    placeholder: "",
    is_required: false,
    options: [],
  });

  const [optionInput, setOptionInput] = useState("");

  const { data: dbFields, isLoading } = useQuery({
    queryKey: ["productFormFields", productId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("product_form_fields")
        .select("*")
        .eq("product_id", productId)
        .order("sort_order", { ascending: true });
      
      if (error) {
        console.error("Error fetching form fields:", error);
        return [];
      }
      return data as FormField[];
    },
    enabled: !!productId,
  });

  useEffect(() => {
    if (dbFields) {
      // Garantir que Nome e Email sempre existam visualmente caso não voltem do banco.
      const hasName = dbFields.some(f => f.is_system && f.field_type === "text" && f.label === "Nome completo");
      const hasEmail = dbFields.some(f => f.is_system && f.field_type === "email" && f.label === "E-mail");
      
      let initialFields = [...dbFields];
      
      if (!hasName || !hasEmail) {
        // Se para produtos antigos não há o system field guardado, renderizamos client-only por seguranca
        const defaultSystemFields: FormField[] = [
           { product_id: productId, field_type: "text", label: "Nome completo", is_system: true, is_required: true, sort_order: -2 },
           { product_id: productId, field_type: "email", label: "E-mail", is_system: true, is_required: true, sort_order: -1 },
        ];
        initialFields = [...defaultSystemFields, ...initialFields.filter(f => !f.is_system)];
      }

      setFields(initialFields);
    } else if (!isLoading) {
      setFields([
        { product_id: productId, field_type: "text", label: "Nome completo", is_system: true, is_required: true, sort_order: -2 },
        { product_id: productId, field_type: "email", label: "E-mail", is_system: true, is_required: true, sort_order: -1 },
      ]);
    }
  }, [dbFields, isLoading, productId]);

  const saveMutation = useMutation({
    mutationFn: async (updatedFields: FormField[]) => {
      const customFields = updatedFields.filter(f => !f.is_system);
      
      // Upsert
      const upsertData = customFields.map((f, i) => ({
        ...f,
        sort_order: i, // Remarcar a ordem baseada na lista filtrada
        product_id: productId,
        id: f.id?.includes("-") ? f.id : undefined // Ignorar IDs client-side temporary se houver
      }));

      // Delete all existing custom fields for this product to prevent orphans? 
      // Better strategy is just upsert, but we need to delete removed ones.
      // So let's do: Delete All -> Insert All. It's safer for this simple editor.
      
      const { error: deleteError } = await (supabase as any)
        .from("product_form_fields")
        .delete()
        .eq("product_id", productId)
        .eq("is_system", false);
        
      if (deleteError) throw deleteError;

      if (upsertData.length > 0) {
        const { error: insertError } = await supabase
          .from("product_form_fields")
          .insert(upsertData.map(d => {
             // Removing undefined/mock ids for insert
             const { id, ...rest } = d;
             return rest;
          }));
        if (insertError) throw insertError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["productFormFields", productId] });
      toast.success("Campos do checkout validados via Lovable DB!");
    },
    onError: (err: any) => {
       // toast.error("Por favor, rode o script SQL do FormFields na sua base de dados antes de salvar.");
       console.error(err);
    }
  });

  const applyChangesToDatabase = (newFields: FormField[]) => {
    saveMutation.mutate(newFields);
  };

  const openAddModal = () => {
    setEditForm({
      field_type: "text",
      label: "",
      placeholder: "",
      is_required: false,
      options: [],
    });
    setOptionInput("");
    setEditingIndex(null);
    setIsAdding(true);
  };

  const openEditModal = (index: number) => {
    const f = fields[index];
    if (f.is_system) return;
    setEditForm({ ...f });
    setOptionInput("");
    setEditingIndex(index);
    setIsAdding(true);
  };

  const handleSaveModal = () => {
    if (!editForm.label?.trim()) {
      toast.error("O rótulo do campo é obrigatório");
      return;
    }

    if (["select", "radio", "checkbox"].includes(editForm.field_type as string) && (!editForm.options || editForm.options.length === 0)) {
      toast.error("Adicione pelo menos uma opção");
      return;
    }

    const newField: FormField = {
      product_id: productId,
      field_type: editForm.field_type as any,
      label: editForm.label.trim(),
      placeholder: editForm.placeholder,
      is_required: editForm.is_required || false,
      is_system: false,
      options: editForm.options,
      sort_order: fields.length,
    };

    let newFields = [...fields];

    if (editingIndex !== null) {
      newField.id = fields[editingIndex].id;
      newFields[editingIndex] = newField;
    } else {
      newFields.push(newField);
    }

    setFields(newFields);
    setIsAdding(false);
    applyChangesToDatabase(newFields);
  };

  const handleRemoveField = (index: number) => {
    if (fields[index].is_system) return;
    const newFields = fields.filter((_, i) => i !== index);
    setFields(newFields);
    applyChangesToDatabase(newFields);
  };

  const addOption = () => {
    if (!optionInput.trim()) return;
    setEditForm(p => ({
      ...p,
      options: [...(p.options || []), optionInput.trim()]
    }));
    setOptionInput("");
  };

  const removeOption = (idx: number) => {
    setEditForm(p => ({
      ...p,
      options: (p.options || []).filter((_, i) => i !== idx)
    }));
  };

  const moveUp = (index: number) => {
    if (index === 0 || fields[index].is_system || fields[index - 1].is_system) return;
    const newFields = [...fields];
    [newFields[index - 1], newFields[index]] = [newFields[index], newFields[index - 1]];
    setFields(newFields);
    applyChangesToDatabase(newFields);
  };

  const moveDown = (index: number) => {
    if (index === fields.length - 1 || fields[index].is_system) return;
    const newFields = [...fields];
    [newFields[index + 1], newFields[index]] = [newFields[index], newFields[index + 1]];
    setFields(newFields);
    applyChangesToDatabase(newFields);
  };

  const getTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      text: "Texto (linha única)",
      email: "E-mail",
      phone: "Telefone / WhatsApp",
      textarea: "Texto (múltiplas linhas)",
      select: "Lista (Dropdown)",
      checkbox: "Caixas de Seleção",
      radio: "Opção Única (Radio)"
    };
    return map[type] || type;
  };

  return (
    <div className="space-y-4">
      {/* Lista de Campos */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {fields.map((field, idx) => (
          <div 
            key={field.id || `field-${idx}`} 
            className={cn(
              "flex items-center gap-3 p-3 border-b border-border/50 last:border-0",
              field.is_system ? "bg-muted/30" : "bg-card hover:bg-muted/20"
            )}
          >
            <div className="flex flex-col items-center justify-center opacity-40">
              <GripVertical className="w-4 h-4 mb-0.5" />
            </div>

            <div className="flex-1 flex flex-col md:flex-row md:items-center gap-2 md:gap-4 min-w-0">
               <div className="flex items-center gap-2 truncate">
                  <span className="font-medium text-sm text-foreground truncate">{field.label}</span>
                  {field.is_required && <span className="text-red-500 text-xs font-bold shrink-0">*</span>}
                  {field.is_system && (
                    <Badge variant="secondary" className="px-1.5 py-0 h-5 text-[10px] shrink-0">Padrão</Badge>
                  )}
               </div>
               <div className="text-xs text-muted-foreground ml-auto hidden md:block">
                  {getTypeLabel(field.field_type)}
               </div>
            </div>

            {/* Ações */}
            <div className="flex items-center gap-1 shrink-0">
               {!field.is_system && (
                 <>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => openEditModal(idx)}>
                    <Settings2 className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleRemoveField(idx)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                 </>
               )}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={isAdding} onOpenChange={setIsAdding}>
        <DialogTrigger asChild>
          <Button variant="outline" className="w-full gap-2 border-dashed h-12" onClick={openAddModal}>
            <Plus className="w-4 h-4" /> Adicionar campo extra
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>{editingIndex !== null ? "Editar Campo Extra" : "Novo Campo de Checkout"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
             <div className="space-y-2">
                <Label>Tipo de Campo</Label>
                <Select 
                  value={editForm.field_type} 
                  onValueChange={(val: any) => setEditForm(p => ({ ...p, field_type: val }))}
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Texto (linha única)</SelectItem>
                    <SelectItem value="textarea">Texto Longo (parágrafo)</SelectItem>
                    <SelectItem value="phone">WhatsApp / Telefone</SelectItem>
                    <SelectItem value="select">Lista Dropdown</SelectItem>
                    <SelectItem value="checkbox">Multipla Escolha (Caixas)</SelectItem>
                    <SelectItem value="radio">Opção Única (Bolinhas)</SelectItem>
                  </SelectContent>
                </Select>
             </div>

             <div className="space-y-2">
                <Label>Nome (Label) *</Label>
                <Input 
                   placeholder="Ex: Qual o seu link do Instagram?"
                   value={editForm.label}
                   onChange={e => setEditForm(p => ({ ...p, label: e.target.value }))}
                />
             </div>

             {["text", "textarea", "phone"].includes(editForm.field_type || "") && (
               <div className="space-y-2">
                  <Label>Texo de Ajuda (Placeholder)</Label>
                  <Input 
                     placeholder="Ex: @seuperfil"
                     value={editForm.placeholder || ""}
                     onChange={e => setEditForm(p => ({ ...p, placeholder: e.target.value }))}
                  />
               </div>
             )}

             {["select", "radio", "checkbox"].includes(editForm.field_type || "") && (
               <div className="space-y-3 p-3 bg-muted/30 rounded-lg border border-border">
                  <Label className="text-sm">Opções disponíveis</Label>
                  <div className="flex gap-2">
                     <Input 
                       placeholder="Nova opção..." 
                       className="h-8 text-sm"
                       value={optionInput}
                       onChange={e => setOptionInput(e.target.value)}
                       onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addOption())}
                     />
                     <Button type="button" size="sm" onClick={addOption}>Adicionar</Button>
                  </div>
                  {editForm.options && editForm.options.length > 0 && (
                     <div className="flex flex-wrap gap-2 mt-2">
                        {editForm.options.map((opt, i) => (
                           <div key={i} className="flex items-center gap-1 bg-background border px-2 py-1 rounded-md text-sm shadow-sm text-foreground">
                              {opt}
                              <Trash2 
                                className="w-3 h-3 ml-1 text-muted-foreground cursor-pointer hover:text-destructive" 
                                onClick={() => removeOption(i)}
                              />
                           </div>
                        ))}
                     </div>
                  )}
                  {(!editForm.options || editForm.options.length === 0) && (
                     <p className="text-xs text-muted-foreground"><AlertCircle className="inline w-3 h-3 mr-1"/>Você precisa adicionar as opções para o cliente escolher.</p>
                  )}
               </div>
             )}

             <div className="flex items-center justify-between pt-2">
                <div className="space-y-0.5">
                   <Label>Preenchimento Obrigatório</Label>
                   <p className="text-xs text-muted-foreground text-left">O cliente não pode pular o campo.</p>
                </div>
                <Switch 
                   checked={editForm.is_required}
                   onCheckedChange={v => setEditForm(p => ({ ...p, is_required: v }))}
                />
             </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsAdding(false)}>Cancelar</Button>
            <Button onClick={handleSaveModal}>Salvar Campo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
