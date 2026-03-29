import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UpdateProfileData {
  display_name?: string;
  bio?: string;
  avatar_url?: string;
  notification_preferences?: {
    likes: boolean;
    comments: boolean;
    dms: boolean;
    events: boolean;
    announcements: boolean;
  };
}

export function useUpdateMemberProfile(memberId: string, communityId: string) {
  const queryClient = useQueryClient();

  const updateProfile = useMutation({
    mutationFn: async (data: UpdateProfileData) => {
      const { error } = await supabase
        .from("community_members")
        .update(data as any)
        .eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circle-member", communityId] });
      toast.success("Perfil atualizado!");
    },
    onError: (err: any) => toast.error(err.message || "Erro ao atualizar perfil"),
  });

  const uploadAvatar = async (file: File): Promise<string | null> => {
    const ext = file.name.split(".").pop();
    const path = `avatars/${memberId}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("community").upload(path, file, { upsert: true });
    if (error) {
      toast.error("Erro ao enviar avatar");
      return null;
    }
    const { data } = supabase.storage.from("community").getPublicUrl(path);
    return data.publicUrl;
  };

  return { updateProfile, uploadAvatar };
}
