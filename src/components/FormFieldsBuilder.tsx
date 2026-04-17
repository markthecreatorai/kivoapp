// =============================================================
// FormFieldsBuilder — CRUD de campos adicionais (sprint 1).
// Usa modelo canônico de `formFieldsSchema`. Persiste em
// `product_form_fields` (custom only). Sistema fields (Nome,
// Email) sempre garantidos no topo, não removíveis/editáveis.
// =============================================================

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AlertCircle,
  GripVertical,
  Plus,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  ADDITIONAL_FIELD_TYPES,
  FIELD_TYPE_LABELS,
  REQUIRES_OPTIONS,
  addField as addFieldOp,
  buildSystemFields,
  ensureSystemFields,
  removeField as removeFieldOp,
  setRequired as setRequiredOp,
  slugifyKey,
  updateField as updateFieldOp,
  validateFieldDraft,
  type FieldDraftInput,
  type FormField,
  type FormFieldType,
} from "@/features/product-editor/formFieldsSchema";

interface DbRow {
  id: string;
  product_id: string;
  field_key: string;
  field_type: FormFieldType;
  label: string;
  placeholder: string | null;
  is_required: boolean;
  is_system: boolean;
  options: string[] | null;
  sort_order: number;
}

function rowToField(r: DbRow): FormField {
  return {
    id: r.id,
    field_key: r.field_key,
    field_type: r.field_type,
    label: r.label,
    placeholder: r.placeholder ?? undefined,
    is_required: r.is_required,
    is_system: r.is_system,
    options: r.options ?? undefined,
    order: r.sort_order,
  };
}

export interface FormFieldsBuilderProps {
  productId: string;
  /** Notifica o pai a cada mudança — usado para refletir no preview. */
  onChange?: (fields: FormField[]) => void;
}

export function FormFieldsBuilder({
  productId,
  onChange,
}: FormFieldsBuilderProps) {
  const queryClient = useQueryClient();
  const [fields, setFields] = useState<FormField[]>(() => buildSystemFields());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<FieldDraftInput>({
    label: "",
    field_type: "text",
    placeholder: "",
    is_required: false,
    options: [],
  });
  const [optionInput, setOptionInput] = useState("");

  const { data: dbFields } = useQuery({
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
      return (data as DbRow[]) ?? [];
    },
    enabled: !!productId,
  });

  useEffect(() => {
    if (!dbFields) return;
    const customs = dbFields.filter((r) => !r.is_system).map(rowToField);
    setFields(ensureSystemFields(customs));
  }, [dbFields]);

  // Notifica preview/parent
  useEffect(() => {
    onChange?.(fields);
  }, [fields, onChange]);

  const persist = useMutation({
    mutationFn: async (next: FormField[]) => {
      const customs = next.filter((f) => !f.is_system);
      const { error: delErr } = await (supabase as any)
        .from("product_form_fields")
        .delete()
        .eq("product_id", productId)
        .eq("is_system", false);
      if (delErr) throw delErr;

      if (customs.length > 0) {
        const insertRows = customs.map((f, i) => ({
          product_id: productId,
          field_key: f.field_key || slugifyKey(f.label),
          field_type: f.field_type,
          label: f.label,
          placeholder: f.placeholder ?? null,
          is_required: f.is_required,
          is_system: false,
          options: f.options ?? null,
          sort_order: i + 2,
        }));
        const { error: insErr } = await (supabase as any)
          .from("product_form_fields")
          .insert(insertRows);
        if (insErr) throw insErr;
      }
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["productFormFields", productId],
      }),
    onError: (err: any) => {
      toast.error("Erro ao salvar campos: " + (err.message ?? "desconhecido"));
    },
  });

  const apply = (next: FormField[]) => {
    setFields(next);
    persist.mutate(next);
  };

  // ── Dialog handlers ────────────────────────────────────
  const openAdd = () => {
    setEditingId(null);
    setDraft({
      label: "",
      field_type: "text",
      placeholder: "",
      is_required: false,
      options: [],
    });
    setOptionInput("");
    setDialogOpen(true);
  };

  const openEdit = (f: FormField) => {
    if (f.is_system) return;
    setEditingId(f.id);
    setDraft({
      label: f.label,
      field_type: f.field_type as Exclude<FormFieldType, "email">,
      placeholder: f.placeholder ?? "",
      is_required: f.is_required,
      options: f.options ?? [],
    });
    setOptionInput("");
    setDialogOpen(true);
  };

  const validation = validateFieldDraft(draft);

  const handleSubmitDraft = () => {
    if (!validation.isValid) {
      toast.error(
        validation.errors.label ??
          validation.errors.options ??
          "Verifique o formulário.",
      );
      return;
    }
    let next: FormField[];
    if (editingId) {
      next = updateFieldOp(fields, editingId, {
        label: draft.label.trim(),
        field_type: draft.field_type,
        placeholder: draft.placeholder?.trim() || undefined,
        is_required: draft.is_required,
        options: REQUIRES_OPTIONS.includes(draft.field_type)
          ? draft.options ?? []
          : undefined,
        field_key: slugifyKey(draft.label),
      });
    } else {
      next = addFieldOp(fields, {
        label: draft.label.trim(),
        field_type: draft.field_type,
        placeholder: draft.placeholder?.trim() || undefined,
        is_required: draft.is_required,
        options: draft.options ?? [],
      });
    }
    apply(next);
    setDialogOpen(false);
  };

  const handleRemove = (id: string) => apply(removeFieldOp(fields, id));
  const handleToggleRequired = (id: string, val: boolean) =>
    apply(setRequiredOp(fields, id, val));

  // Options inside dialog
  const addOption = () => {
    const v = optionInput.trim();
    if (!v) return;
    setDraft((p) => ({ ...p, options: [...(p.options ?? []), v] }));
    setOptionInput("");
  };
  const removeOption = (idx: number) =>
    setDraft((p) => ({
      ...p,
      options: (p.options ?? []).filter((_, i) => i !== idx),
    }));

  const showOptions = useMemo(
    () => REQUIRES_OPTIONS.includes(draft.field_type),
    [draft.field_type],
  );

  return (
    <div className="space-y-4">
      {/* Lista */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {fields.map((field) => (
          <div
            key={field.id}
            data-testid={`field-row-${field.field_key}`}
            className={cn(
              "flex items-center gap-3 p-3 border-b border-border/50 last:border-0",
              field.is_system ? "bg-muted/30" : "bg-card hover:bg-muted/20",
            )}
          >
            <div className="opacity-40">
              <GripVertical className="w-4 h-4" />
            </div>

            <div className="flex-1 flex flex-col md:flex-row md:items-center gap-2 md:gap-4 min-w-0">
              <div className="flex items-center gap-2 truncate">
                <span className="font-medium text-sm text-foreground truncate">
                  {field.label}
                </span>
                {field.is_required && (
                  <span className="text-destructive text-xs font-bold shrink-0">
                    *
                  </span>
                )}
                {field.is_system && (
                  <Badge
                    variant="secondary"
                    className="px-1.5 py-0 h-5 text-[10px] shrink-0"
                  >
                    Travado
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground ml-auto hidden md:block">
                {FIELD_TYPE_LABELS[field.field_type]}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {!field.is_system && (
                <>
                  <div className="hidden sm:flex items-center gap-1.5">
                    <Label className="text-[10px] text-muted-foreground">
                      Obrigatório
                    </Label>
                    <Switch
                      checked={field.is_required}
                      onCheckedChange={(v) => handleToggleRequired(field.id, v)}
                      aria-label={`Tornar ${field.label} obrigatório`}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={() => openEdit(field)}
                    aria-label={`Editar ${field.label}`}
                  >
                    <Settings2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => handleRemove(field.id)}
                    aria-label={`Remover ${field.label}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <Button
        variant="outline"
        className="w-full gap-2 border-dashed h-12"
        onClick={openAdd}
      >
        <Plus className="w-4 h-4" /> Adicionar campo
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar campo" : "Novo campo"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="ff-type">Tipo de campo</Label>
              <Select
                value={draft.field_type}
                onValueChange={(v) =>
                  setDraft((p) => ({ ...p, field_type: v as FormFieldType }))
                }
              >
                <SelectTrigger id="ff-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ADDITIONAL_FIELD_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {FIELD_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ff-label">Nome do campo *</Label>
              <Input
                id="ff-label"
                placeholder="Ex: Telefone, Empresa, Cargo..."
                value={draft.label}
                maxLength={60}
                aria-invalid={!!validation.errors.label}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, label: e.target.value }))
                }
              />
              {validation.errors.label && (
                <p role="alert" className="text-xs text-destructive">
                  {validation.errors.label}
                </p>
              )}
            </div>

            {(["text", "phone"] as FormFieldType[]).includes(
              draft.field_type,
            ) && (
              <div className="space-y-2">
                <Label htmlFor="ff-placeholder">Placeholder (opcional)</Label>
                <Input
                  id="ff-placeholder"
                  placeholder="Ex: (00) 00000-0000"
                  value={draft.placeholder ?? ""}
                  maxLength={80}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, placeholder: e.target.value }))
                  }
                />
              </div>
            )}

            {showOptions && (
              <div className="space-y-3 p-3 bg-muted/30 rounded-lg border border-border">
                <Label>Opções *</Label>
                <div className="flex gap-2">
                  <Input
                    aria-label="Nova opção"
                    placeholder="Adicionar opção..."
                    className="h-8 text-sm"
                    value={optionInput}
                    onChange={(e) => setOptionInput(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" &&
                      (e.preventDefault(), addOption())
                    }
                  />
                  <Button type="button" size="sm" onClick={addOption}>
                    Adicionar
                  </Button>
                </div>
                {(draft.options?.length ?? 0) > 0 ? (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {draft.options!.map((opt, i) => (
                      <div
                        key={`${opt}-${i}`}
                        className="flex items-center gap-1 bg-background border px-2 py-1 rounded-md text-sm shadow-sm text-foreground"
                      >
                        {opt}
                        <button
                          type="button"
                          aria-label={`Remover opção ${opt}`}
                          onClick={() => removeOption(i)}
                          className="ml-1 text-muted-foreground hover:text-destructive"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Adicione pelo menos uma opção.
                  </p>
                )}
                {validation.errors.options && (
                  <p role="alert" className="text-xs text-destructive">
                    {validation.errors.options}
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <div>
                <Label>Obrigatório</Label>
                <p className="text-xs text-muted-foreground">
                  O cliente não pode pular este campo.
                </p>
              </div>
              <Switch
                checked={draft.is_required}
                onCheckedChange={(v) =>
                  setDraft((p) => ({ ...p, is_required: v }))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmitDraft} disabled={!validation.isValid}>
              {editingId ? "Salvar alterações" : "Adicionar campo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
