import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Copy, Trash2, Clock, Link2, Users, Mail } from "lucide-react";
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
            onClick={() => createLink.mutate({})}
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

        {inviteLinks.length === 0 ? (
          <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <Link2 className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Nenhum link de convite criado ainda.</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => createLink.mutate({})}
              className="mt-3 gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Criar primeiro link
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {inviteLinks.map((link: any) => (
              <div
                key={link.id}
                className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all ${
                  link.is_active
                    ? "bg-white border-gray-200 hover:border-gray-300"
                    : "bg-gray-50 border-gray-100 opacity-60"
                }`}
              >
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

      {/* Email Invite */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Mail className="h-5 w-5 text-gray-400" />
          <h3 className="text-base font-semibold text-gray-900">Convidar por e-mail</h3>
        </div>
        <div className="flex gap-2">
          <Input placeholder="email@exemplo.com" className="flex-1" />
          <Button variant="outline">Enviar convite</Button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          O convidado receberá um e-mail com link direto para entrar na comunidade.
        </p>
      </div>
    </div>
  );
}
