import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Plus, Copy, Trash2, Clock, Link2, Users, Mail, Upload } from "lucide-react";
import { toast } from "sonner";
import { useInviteLinks } from "@/hooks/useInviteLinks";

interface Props {
  community: any;
  member: any;
}

export default function AdminInviteTab({ community, member }: Props) {
  const queryClient = useQueryClient();
  const { inviteLinks, createLink, deactivateLink, copyLink } = useInviteLinks(
    community.id,
    member?.id || ""
  );

  const [requireApproval, setRequireApproval] = useState(community.require_approval ?? false);
  const [csvEmails, setCsvEmails] = useState("");
  const [singleInviteEmail, setSingleInviteEmail] = useState("");
  const [selectedInviteIds, setSelectedInviteIds] = useState<string[]>([]);
  const [inviteStatusFilter, setInviteStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [newMaxUses, setNewMaxUses] = useState<number | "">("");
  const [newExpiresDays, setNewExpiresDays] = useState<number | "">("");

  const parsedEmails = useMemo(() => {
    return Array.from(
      new Set(
        csvEmails
          .split(/\r?\n|,|;/)
          .map((s) => s.trim().toLowerCase())
          .filter((s) => s.includes("@") && s.includes("."))
      )
    );
  }, [csvEmails]);

  const saveApproval = useMutation({
    mutationFn: async (val: boolean) => {
      const { error } = await supabase
        .from("communities")
        .update({ require_approval: val })
        .eq("id", community.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community"] });
      toast.success("Configuração salva!");
    },
    onError: () => toast.error("Erro ao salvar"),
  });

  const handleApprovalToggle = (val: boolean) => {
    setRequireApproval(val);
    saveApproval.mutate(val);
  };

  const filteredInviteLinks = inviteLinks.filter((l: any) =>
    inviteStatusFilter === "all" ? true : inviteStatusFilter === "active" ? !!l.is_active : !l.is_active
  );

  const topInviteLinks = [...inviteLinks]
    .sort((a: any, b: any) => (b.uses_count || 0) - (a.uses_count || 0))
    .slice(0, 3);

  const copySelectedLinks = async () => {
    const selected = filteredInviteLinks.filter((l: any) => selectedInviteIds.includes(l.id));
    if (!selected.length) return;
    const text = selected
      .map((l: any) => `${window.location.origin}/join/${community.slug}?invite=${l.code}`)
      .join("\n");
    await navigator.clipboard.writeText(text);
    toast.success(`Copiados ${selected.length} links`);
  };

  const createAdvancedLink = () => {
    const expires_at = newExpiresDays
      ? new Date(Date.now() + Number(newExpiresDays) * 24 * 60 * 60 * 1000).toISOString()
      : undefined;
    createLink.mutate({
      max_uses: newMaxUses ? Number(newMaxUses) : undefined,
      expires_at,
    });
    setNewMaxUses("");
    setNewExpiresDays("");
  };

  const bulkDeactivateInvites = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await (supabase as any)
        .from("community_invite_links")
        .update({ is_active: false })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      setSelectedInviteIds([]);
      queryClient.invalidateQueries({ queryKey: ["invite-links", community.id] });
      toast.success("Links selecionados desativados");
    },
    onError: () => toast.error("Não foi possível desativar em lote"),
  });

  const sendSingleEmailInvite = useMutation({
    mutationFn: async () => {
      const email = singleInviteEmail.trim().toLowerCase();
      if (!email || !email.includes("@") || !email.includes(".")) throw new Error("E-mail inválido");
      const created = await createLink.mutateAsync({});
      const code = created?.code as string;
      const url = `${window.location.origin}/join/${community.slug}?invite=${code}`;
      return { email, url };
    },
    onSuccess: ({ email, url }) => {
      const subject = encodeURIComponent(`Convite para ${community.name}`);
      const body = encodeURIComponent(`Oi! Você foi convidado para entrar em ${community.name}.\n\nAcesse: ${url}`);
      window.open(`mailto:${email}?subject=${subject}&body=${body}`, "_blank");
      navigator.clipboard.writeText(url).catch(() => {});
      toast.success("Convite preparado no seu e-mail e link copiado");
      setSingleInviteEmail("");
    },
    onError: (e: any) => toast.error(e?.message || "Falha ao preparar convite"),
  });

  const bulkInviteImport = useMutation({
    mutationFn: async () => {
      if (!parsedEmails.length) throw new Error("Nenhum e-mail válido");
      const rows: Array<{ email: string; code: string; url: string }> = [];
      for (const email of parsedEmails) {
        const created = await createLink.mutateAsync({});
        const code = created?.code as string;
        const url = `${window.location.origin}/join/${community.slug}?invite=${code}`;
        rows.push({ email, code, url });
      }
      return rows;
    },
    onSuccess: (rows) => {
      const header = ["email", "invite_code", "invite_url"];
      const csv = [
        header.join(","),
        ...rows.map((r) => [r.email, r.code, r.url].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")),
      ].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `invites-${community.slug}.csv`;
      link.click();
      toast.success(`Importados ${rows.length} e-mails e gerado CSV de convites`);
      setCsvEmails("");
    },
    onError: (e: any) => toast.error(e?.message || "Falha no import"),
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-1">Invite</h2>
        <p className="text-sm text-gray-500">
          Gerencie como novos membros entram na sua comunidade.
        </p>
      </div>

      {/* Approval Setting */}
      <div className="flex items-center justify-between py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center">
            <Users className="h-4.5 w-4.5 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">Aprovação manual</p>
            <p className="text-xs text-gray-500">Aprovar novos membros antes de dar acesso</p>
          </div>
        </div>
        <Switch
          checked={requireApproval}
          onCheckedChange={handleApprovalToggle}
          disabled={saveApproval.isPending}
        />
      </div>

      {/* Invite Links */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-gray-400" />
            <h3 className="text-base font-semibold text-gray-900">Links de Convite</h3>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={createAdvancedLink}
            disabled={createLink.isPending}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Criar link
          </Button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Compartilhe links para que novos membros entrem sem precisar de aprovação manual.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
          <Input
            type="number"
            min={1}
            placeholder="Máx. usos (opcional)"
            value={newMaxUses}
            onChange={(e) => setNewMaxUses(e.target.value ? Number(e.target.value) : "")}
          />
          <Input
            type="number"
            min={1}
            placeholder="Expira em X dias"
            value={newExpiresDays}
            onChange={(e) => setNewExpiresDays(e.target.value ? Number(e.target.value) : "")}
          />
          <Button variant="outline" onClick={createAdvancedLink} disabled={createLink.isPending}>
            Criar com regras
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          <div className="rounded-lg border p-2"><p className="text-[10px] text-gray-500">Total</p><p className="text-sm font-semibold">{inviteLinks.length}</p></div>
          <div className="rounded-lg border p-2"><p className="text-[10px] text-gray-500">Ativos</p><p className="text-sm font-semibold">{inviteLinks.filter((l: any) => l.is_active).length}</p></div>
          <div className="rounded-lg border p-2"><p className="text-[10px] text-gray-500">Desativados</p><p className="text-sm font-semibold">{inviteLinks.filter((l: any) => !l.is_active).length}</p></div>
          <div className="rounded-lg border p-2"><p className="text-[10px] text-gray-500">Usos</p><p className="text-sm font-semibold">{inviteLinks.reduce((a: number, l: any) => a + (l.uses_count || 0), 0)}</p></div>
        </div>

        {topInviteLinks.length > 0 && (
          <div className="mb-3 rounded-lg border p-2">
            <p className="text-[11px] text-gray-500 mb-1">Top convites por uso</p>
            <div className="space-y-1">
              {topInviteLinks.map((l: any) => (
                <div key={l.id} className="text-xs text-gray-700 flex items-center justify-between">
                  <span className="font-mono">{l.code}</span>
                  <span>{l.uses_count || 0} usos</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Button size="sm" variant={inviteStatusFilter === "all" ? "default" : "outline"} onClick={() => setInviteStatusFilter("all")}>Todos</Button>
          <Button size="sm" variant={inviteStatusFilter === "active" ? "default" : "outline"} onClick={() => setInviteStatusFilter("active")}>Ativos</Button>
          <Button size="sm" variant={inviteStatusFilter === "inactive" ? "default" : "outline"} onClick={() => setInviteStatusFilter("inactive")}>Desativados</Button>

          <Button size="sm" variant="outline" onClick={() => setSelectedInviteIds(filteredInviteLinks.map((l: any) => l.id))}>Selecionar visíveis</Button>
          <Button size="sm" variant="outline" onClick={() => setSelectedInviteIds([])}>Limpar seleção</Button>

          {selectedInviteIds.length > 0 && (
            <>
              <Button size="sm" variant="outline" onClick={copySelectedLinks}>
                Copiar selecionados ({selectedInviteIds.length})
              </Button>
              <Button size="sm" variant="destructive" onClick={() => bulkDeactivateInvites.mutate(selectedInviteIds)}>
                Desativar selecionados ({selectedInviteIds.length})
              </Button>
            </>
          )}
        </div>

        {filteredInviteLinks.length === 0 ? (
          <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <Link2 className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Nenhum link de convite criado ainda.</p>
            <Button
              size="sm"
              variant="outline"
              onClick={createAdvancedLink}
              className="mt-3 gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Criar primeiro link
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredInviteLinks.map((link: any) => (
              <div
                key={link.id}
                className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all ${
                  link.is_active
                    ? "bg-white border-gray-200 hover:border-gray-300"
                    : "bg-gray-50 border-gray-100 opacity-60"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedInviteIds.includes(link.id)}
                  onChange={(e) => {
                    setSelectedInviteIds((prev) =>
                      e.target.checked ? Array.from(new Set([...prev, link.id])) : prev.filter((id) => id !== link.id)
                    );
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-xs font-mono text-gray-700 bg-gray-100 px-2 py-1 rounded-lg">
                      {`/join/${community.slug}?invite=${link.code}`}
                    </code>
                    {!link.is_active && (
                      <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                        Desativado
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {link.uses_count || 0}
                      {link.max_uses ? `/${link.max_uses}` : ""} usos
                    </span>
                    {link.expires_at && (
                      <span>
                        Expira: {new Date(link.expires_at).toLocaleDateString("pt-BR")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {link.is_active && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-gray-400 hover:text-gray-700"
                      onClick={() => copyLink(link.code, community.slug)}
                      title="Copiar link"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {link.is_active && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-400 hover:text-red-600"
                      onClick={() => deactivateLink.mutate(link.id)}
                      title="Desativar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CSV Import */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Upload className="h-5 w-5 text-gray-400" />
          <h3 className="text-base font-semibold text-gray-900">Importar CSV (e-mails)</h3>
        </div>
        <Input
          placeholder="Cole e-mails separados por vírgula ou linha"
          value={csvEmails}
          onChange={(e) => setCsvEmails(e.target.value)}
        />
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-gray-400">{parsedEmails.length} e-mails válidos</p>
          <Button variant="outline" onClick={() => bulkInviteImport.mutate()} disabled={bulkInviteImport.isPending || parsedEmails.length === 0}>
            {bulkInviteImport.isPending ? "Importando..." : "Gerar convites CSV"}
          </Button>
        </div>
      </div>

      {/* Email Invite */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Mail className="h-5 w-5 text-gray-400" />
          <h3 className="text-base font-semibold text-gray-900">Convidar por e-mail</h3>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="email@exemplo.com"
            className="flex-1"
            value={singleInviteEmail}
            onChange={(e) => setSingleInviteEmail(e.target.value)}
          />
          <Button variant="outline" onClick={() => sendSingleEmailInvite.mutate()} disabled={sendSingleEmailInvite.isPending}>
            {sendSingleEmailInvite.isPending ? "Preparando..." : "Enviar convite"}
          </Button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Abrimos seu cliente de e-mail com o convite pronto e copiamos o link para fallback.
        </p>
      </div>
    </div>
  );
}
