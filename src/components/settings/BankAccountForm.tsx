import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Building2, Plus, Trash2, Star } from "lucide-react";

const BANKS = [
  { code: "001", name: "Banco do Brasil" },
  { code: "033", name: "Santander" },
  { code: "104", name: "Caixa Econômica" },
  { code: "237", name: "Bradesco" },
  { code: "341", name: "Itaú Unibanco" },
  { code: "260", name: "Nubank" },
  { code: "077", name: "Inter" },
  { code: "336", name: "C6 Bank" },
  { code: "290", name: "PagSeguro" },
  { code: "380", name: "PicPay" },
  { code: "999", name: "Outro" },
];

interface BankAccount {
  id: string;
  bank_code: string;
  bank_name: string | null;
  agency: string;
  account_number: string;
  account_type: string;
  holder_name: string;
  holder_document: string;
  is_default: boolean;
  pix_key: string | null;
  pix_key_type: string | null;
}

function maskDocument(val: string) {
  const d = val.replace(/\D/g, "");
  if (d.length <= 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, "$1.$2.$3-$4").replace(/[.-]$/, "");
  return d.slice(0, 14).replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, "$1.$2.$3/$4-$5").replace(/[./-]$/, "");
}

export function BankAccountForm() {
  const { currentWorkspace } = useWorkspace();
  const queryClient = useQueryClient();
  const workspaceId = currentWorkspace?.id;
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    bank_code: "", agency: "", account_number: "",
    account_type: "checking", holder_name: "", holder_document: "",
    pix_key: "", pix_key_type: "",
  });

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["bank-accounts", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase
        .from("bank_accounts")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("is_default", { ascending: false });
      return (data || []) as BankAccount[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const bank = BANKS.find(b => b.code === form.bank_code);
      const isFirst = accounts.length === 0;
      const { error } = await supabase.from("bank_accounts").insert({
        workspace_id: workspaceId!,
        bank_code: form.bank_code,
        bank_name: bank?.name || "Outro",
        agency: form.agency.replace(/\D/g, ""),
        account_number: form.account_number,
        account_type: form.account_type,
        holder_name: form.holder_name,
        holder_document: form.holder_document.replace(/\D/g, ""),
        is_default: isFirst,
        pix_key: form.pix_key || null,
        pix_key_type: form.pix_key_type || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Conta bancária salva!");
      queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
      setShowForm(false);
      setForm({ bank_code: "", agency: "", account_number: "", account_type: "checking", holder_name: "", holder_document: "", pix_key: "", pix_key_type: "" });
    },
    onError: (e: any) => toast.error(e.message || "Erro ao salvar"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bank_accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Conta removida");
      queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("bank_accounts").update({ is_default: false }).eq("workspace_id", workspaceId!);
      const { error } = await supabase.from("bank_accounts").update({ is_default: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Conta padrão atualizada");
      queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
    },
  });

  const isValid = form.bank_code && form.agency && form.account_number && form.holder_name && form.holder_document.replace(/\D/g, "").length >= 11;

  return (
    <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Conta Bancária para Saque</CardTitle>
        {!showForm && (
          <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {accounts.map((acc) => (
          <div key={acc.id} className="flex items-center justify-between p-3 border border-border/50 rounded-lg">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{acc.bank_name || acc.bank_code} — Ag {acc.agency} / CC {acc.account_number}</p>
                <p className="text-xs text-muted-foreground">{acc.holder_name} • {maskDocument(acc.holder_document)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {acc.is_default && <Badge variant="default" className="text-xs">Padrão</Badge>}
              {!acc.is_default && (
                <Button variant="ghost" size="sm" onClick={() => setDefaultMutation.mutate(acc.id)} title="Tornar padrão">
                  <Star className="h-4 w-4" />
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(acc.id)} className="text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}

        {accounts.length === 0 && !showForm && (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhuma conta cadastrada. Adicione para receber saques.</p>
        )}

        {showForm && (
          <div className="space-y-4 p-4 border border-border/50 rounded-lg bg-muted/30">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Banco</Label>
                <Select value={form.bank_code} onValueChange={(v) => setForm(p => ({ ...p, bank_code: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecionar banco" /></SelectTrigger>
                  <SelectContent>
                    {BANKS.map(b => <SelectItem key={b.code} value={b.code}>{b.code} — {b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo de Conta</Label>
                <Select value={form.account_type} onValueChange={(v) => setForm(p => ({ ...p, account_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="checking">Corrente</SelectItem>
                    <SelectItem value="savings">Poupança</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Agência</Label>
                <Input value={form.agency} onChange={e => setForm(p => ({ ...p, agency: e.target.value.replace(/\D/g, "").slice(0, 6) }))} placeholder="0001" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Conta (com dígito)</Label>
                <Input value={form.account_number} onChange={e => setForm(p => ({ ...p, account_number: e.target.value.slice(0, 15) }))} placeholder="12345-6" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Titular</Label>
                <Input value={form.holder_name} onChange={e => setForm(p => ({ ...p, holder_name: e.target.value }))} placeholder="Nome completo" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">CPF/CNPJ</Label>
                <Input value={maskDocument(form.holder_document)} onChange={e => setForm(p => ({ ...p, holder_document: e.target.value }))} placeholder="000.000.000-00" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Chave PIX (opcional)</Label>
                <Input value={form.pix_key} onChange={e => setForm(p => ({ ...p, pix_key: e.target.value }))} placeholder="Chave PIX para saque" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo PIX</Label>
                <Select value={form.pix_key_type} onValueChange={(v) => setForm(p => ({ ...p, pix_key_type: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cpf">CPF</SelectItem>
                    <SelectItem value="cnpj">CNPJ</SelectItem>
                    <SelectItem value="email">E-mail</SelectItem>
                    <SelectItem value="phone">Telefone</SelectItem>
                    <SelectItem value="random">Aleatória</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button size="sm" onClick={() => saveMutation.mutate()} disabled={!isValid || saveMutation.isPending}>
                {saveMutation.isPending ? "Salvando..." : "Salvar Conta"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
