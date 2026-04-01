import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { useAuth } from "@/contexts/AuthProvider";
import { useUpdateMemberProfile } from "@/hooks/useUpdateMemberProfile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  User, Bell, Shield, Camera, Save, Loader2,
  Lock, Mail, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const DEFAULT_NOTIFICATIONS = {
  likes: true,
  comments: true,
  dms: true,
  events: true,
  announcements: true,
};

export default function CircleSettings() {
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Community
  const { data: community } = useQuery({
    queryKey: ["community", currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace) return null;
      const { data } = await supabase.from("communities").select("*").eq("workspace_id", currentWorkspace.id).maybeSingle();
      return data;
    },
    enabled: !!currentWorkspace,
  });

  // Member
  const { data: member, refetch: refetchMember } = useQuery({
    queryKey: ["circle-member-settings", community?.id, user?.id],
    queryFn: async () => {
      if (!community || !user) return null;
      const { data } = await supabase
        .from("community_members")
        .select("*")
        .eq("community_id", community.id)
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!community && !!user,
  });

  const { updateProfile, uploadAvatar } = useUpdateMemberProfile(
    member?.id || "",
    community?.id || ""
  );

  const [form, setForm] = useState<{
    display_name: string;
    bio: string;
    notifications: typeof DEFAULT_NOTIFICATIONS;
  } | null>(null);

  // Initialize form when member loads
  if (member && !form) {
    setForm({
      display_name: member.display_name || "",
      bio: (member as any).bio || "",
      notifications: {
        ...DEFAULT_NOTIFICATIONS,
        ...((member as any).notification_preferences || {}),
      },
    });
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    const url = await uploadAvatar(file);
    if (url) {
      await updateProfile.mutateAsync({ avatar_url: url });
      await refetchMember();
    }
    setUploadingAvatar(false);
  };

  const handleSaveProfile = async () => {
    if (!form) return;
    setSaving(true);
    try {
      await updateProfile.mutateAsync({
        display_name: form.display_name,
        bio: form.bio,
        notification_preferences: form.notifications,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const newPwd = fd.get("new_password") as string;
    const confirm = fd.get("confirm_password") as string;
    if (newPwd !== confirm) { toast.error("As senhas não coincidem"); return; }
    if (newPwd.length < 6) { toast.error("Mínimo de 6 caracteres"); return; }
    const { error } = await supabase.auth.updateUser({ password: newPwd });
    if (error) toast.error(error.message);
    else toast.success("Senha alterada com sucesso!");
    (e.target as HTMLFormElement).reset();
  };

  if (!member || !form) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="px-4 md:px-8 py-6 max-w-2xl mx-auto w-full">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Gerencie seu perfil e preferências</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="mb-6">
          <TabsTrigger value="profile" className="gap-2"><User className="h-4 w-4" />Perfil</TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2"><Bell className="h-4 w-4" />Notificações</TabsTrigger>
          <TabsTrigger value="account" className="gap-2"><Shield className="h-4 w-4" />Conta</TabsTrigger>
        </TabsList>

        {/* ─── Profile Tab ─── */}
        <TabsContent value="profile" className="space-y-6">
          <Card className="p-6 space-y-5">
            {/* Avatar */}
            <div className="flex items-center gap-4">
              <div className="relative">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={member.avatar_url || ""} />
                  <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
                    {(member.display_name || user?.email || "U").charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-primary flex items-center justify-center shadow-lg hover:bg-primary/90 transition-colors"
                >
                  {uploadingAvatar ? (
                    <Loader2 className="h-3.5 w-3.5 text-primary-foreground animate-spin" />
                  ) : (
                    <Camera className="h-3.5 w-3.5 text-primary-foreground" />
                  )}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                  id="avatar-upload"
                />
              </div>
              <div>
                <p className="font-semibold text-foreground">{member.display_name}</p>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="text-xs text-primary hover:underline mt-1"
                >
                  Alterar foto
                </button>
              </div>
            </div>

            <Separator />

            {/* Display name */}
            <div className="space-y-1.5">
              <Label htmlFor="display-name">Nome exibido</Label>
              <Input
                id="display-name"
                value={form.display_name}
                onChange={(e) => setForm((p) => p && ({ ...p, display_name: e.target.value }))}
                placeholder="Seu nome na comunidade"
                className="h-10"
              />
              <p className="text-xs text-muted-foreground">Este é o nome que outros membros verão.</p>
            </div>

            {/* Bio */}
            <div className="space-y-1.5">
              <Label htmlFor="bio">Bio curta</Label>
              <Textarea
                id="bio"
                value={form.bio}
                onChange={(e) => setForm((p) => p && ({ ...p, bio: e.target.value }))}
                placeholder="Conte um pouco sobre você..."
                rows={3}
                maxLength={200}
              />
              <p className="text-xs text-muted-foreground text-right">{form.bio.length}/200</p>
            </div>

            <Button onClick={handleSaveProfile} disabled={saving} className="w-full sm:w-auto" id="save-profile">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar perfil
            </Button>
          </Card>
        </TabsContent>

        {/* ─── Notifications Tab ─── */}
        <TabsContent value="notifications" className="space-y-4">
          <Card className="p-6 space-y-0">
            <h3 className="font-semibold text-foreground mb-4">Preferências de notificação</h3>
            <div className="flex flex-wrap gap-2 mb-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setForm((p) => p && ({ ...p, notifications: { likes: true, comments: true, dms: true, events: true, announcements: true } }))}
              >
                Ativar tudo
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setForm((p) => p && ({ ...p, notifications: { likes: false, comments: true, dms: true, events: false, announcements: true } }))}
              >
                Somente importantes
              </Button>
            </div>
            {(
              [
                { key: "likes", label: "Curtidas", description: "Quando alguém curtir seus posts ou comentários" },
                { key: "comments", label: "Comentários", description: "Quando alguém comentar nos seus posts" },
                { key: "dms", label: "Mensagens diretas", description: "Quando você receber uma mensagem privada" },
                { key: "events", label: "Eventos", description: "Lembretes de eventos e novas criações" },
                { key: "announcements", label: "Anúncios", description: "Comunicados importantes do admin" },
              ] as const
            ).map((item, i, arr) => (
              <div key={item.key}>
                <div className="flex items-center justify-between py-4">
                  <div>
                    <p className="font-medium text-foreground text-sm">{item.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                  </div>
                  <Switch
                    id={`notif-${item.key}`}
                    checked={form.notifications[item.key]}
                    onCheckedChange={(v) =>
                      setForm((p) => p && ({
                        ...p,
                        notifications: { ...p.notifications, [item.key]: v },
                      }))
                    }
                  />
                </div>
                {i < arr.length - 1 && <Separator />}
              </div>
            ))}
            <div className="pt-2">
              <Button onClick={handleSaveProfile} disabled={saving} id="save-notifications">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Salvar preferências
              </Button>
            </div>
          </Card>
        </TabsContent>

        {/* ─── Account Tab ─── */}
        <TabsContent value="account" className="space-y-4">
          {/* Email info */}
          <Card className="p-6 space-y-3">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Mail className="h-4 w-4" /> Email da conta
            </h3>
            <p className="text-sm text-foreground bg-muted rounded-lg px-3 py-2">{user?.email}</p>
            <p className="text-xs text-muted-foreground">Para alterar seu email, entre em contato com o suporte.</p>
          </Card>

          {/* Change password */}
          <Card className="p-6">
            <h3 className="font-semibold text-foreground flex items-center gap-2 mb-4">
              <Lock className="h-4 w-4" /> Alterar senha
            </h3>
            <form onSubmit={handleChangePassword} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-password" className="text-sm">Nova senha</Label>
                <Input
                  id="new-password"
                  name="new_password"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password" className="text-sm">Confirmar nova senha</Label>
                <Input
                  id="confirm-password"
                  name="confirm_password"
                  type="password"
                  placeholder="Repita a senha"
                  className="h-10"
                />
              </div>
              <Button type="submit" variant="outline" id="change-password">
                <Lock className="h-4 w-4 mr-2" /> Alterar senha
              </Button>
            </form>
          </Card>

          {/* Danger zone */}
          <Card className="p-6 border-destructive/20">
            <h3 className="font-semibold text-destructive flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4" /> Zona de perigo
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Sair da comunidade removerá seu acesso ao feed, cursos e eventos. Seus dados serão mantidos.
            </p>
            <Button
              variant="destructive"
              size="sm"
              onClick={async () => {
                if (!confirm("Tem certeza que deseja sair da comunidade?")) return;
                await supabase.from("community_members").update({ status: "LEFT" } as any).eq("id", member.id);
                toast.success("Você saiu da comunidade.");
                window.location.href = "/dashboard";
              }}
            >
              Sair da comunidade
            </Button>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
