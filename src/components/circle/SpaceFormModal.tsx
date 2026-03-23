import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const EMOJI_OPTIONS = ["💬", "📢", "❓", "🏆", "🎯", "💡", "🔥", "📚", "🎨", "🛠️", "🎮", "📸", "🎵", "🌍", "💰", "🤝", "📊", "🧠", "⚡", "🌟"];

const COLOR_OPTIONS = [
  "#FA4B38", "#3B82F6", "#10B981", "#F59E0B",
  "#EF4444", "#EC4899", "#8B5CF6", "#06B6D4",
];

interface SpaceFormModalProps {
  communityId: string;
  spacesCount: number;
  onClose: () => void;
  space?: any; // If provided, we're editing
}

export default function SpaceFormModal({ communityId, spacesCount, onClose, space }: SpaceFormModalProps) {
  const queryClient = useQueryClient();
  const isEditing = !!space;

  const [emoji, setEmoji] = useState(space?.emoji || "💬");
  const [name, setName] = useState(space?.name || "");
  const [slug, setSlug] = useState(space?.slug || "");
  const [description, setDescription] = useState(space?.description || "");
  const [color, setColor] = useState(space?.color || "#6C3CE1");
  const [onlyAdmins, setOnlyAdmins] = useState(space?.only_admins_can_post || false);
  const [isVisible, setIsVisible] = useState(space?.is_visible ?? true);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Auto-generate slug from name
  const handleNameChange = (val: string) => {
    setName(val.slice(0, 30));
    if (!isEditing || slug === generateSlug(name)) {
      setSlug(generateSlug(val));
    }
  };

  function generateSlug(text: string) {
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50);
  }

  const createSpace = useMutation({
    mutationFn: async () => {
      if (!name.trim() || !slug.trim()) throw new Error("Nome obrigatório");
      const { error } = await supabase.from("community_spaces").insert({
        community_id: communityId,
        name: name.trim(),
        slug: slug.trim(),
        emoji,
        description: description.trim() || null,
        color,
        only_admins_can_post: onlyAdmins,
        is_visible: isVisible,
        position: spacesCount,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circle-spaces"] });
      queryClient.invalidateQueries({ queryKey: ["circle-admin-spaces"] });
      toast.success("Espaço criado!");
      onClose();
    },
    onError: (e: any) => toast.error(e.message || "Erro ao criar espaço"),
  });

  const updateSpace = useMutation({
    mutationFn: async () => {
      if (!space || !name.trim()) throw new Error("Missing");
      const { error } = await supabase.from("community_spaces").update({
        name: name.trim(),
        slug: slug.trim(),
        emoji,
        description: description.trim() || null,
        color,
        only_admins_can_post: onlyAdmins,
        is_visible: isVisible,
      }).eq("id", space.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circle-spaces"] });
      queryClient.invalidateQueries({ queryKey: ["circle-admin-spaces"] });
      toast.success("Espaço atualizado!");
      onClose();
    },
    onError: () => toast.error("Erro ao atualizar espaço"),
  });

  const deleteSpace = useMutation({
    mutationFn: async () => {
      if (!space) throw new Error("Missing");
      // Find the default space to move posts to
      const { data: defaultSpace } = await supabase
        .from("community_spaces")
        .select("id")
        .eq("community_id", communityId)
        .eq("is_default", true)
        .single();

      if (defaultSpace) {
        // Move posts to default space
        await supabase
          .from("community_posts")
          .update({ space_id: defaultSpace.id })
          .eq("space_id", space.id);
      }

      const { error } = await supabase.from("community_spaces").delete().eq("id", space.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circle-spaces"] });
      queryClient.invalidateQueries({ queryKey: ["circle-admin-spaces"] });
      toast.success("Espaço excluído! Posts movidos para o espaço Geral.");
      onClose();
    },
    onError: () => toast.error("Erro ao excluir espaço"),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Espaço" : "Novo Espaço"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Emoji picker */}
          <div>
            <Label className="text-xs">Emoji</Label>
            <div className="mt-1.5">
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="h-12 w-12 rounded-xl border border-border flex items-center justify-center text-2xl hover:bg-muted transition-colors"
              >
                {emoji}
              </button>
              {showEmojiPicker && (
                <div className="mt-2 p-2 border border-border rounded-lg bg-card grid grid-cols-10 gap-1">
                  {EMOJI_OPTIONS.map((e) => (
                    <button
                      key={e}
                      onClick={() => { setEmoji(e); setShowEmojiPicker(false); }}
                      className={cn(
                        "h-8 w-8 rounded flex items-center justify-center text-lg hover:bg-muted transition-colors",
                        emoji === e && "bg-primary/10 ring-1 ring-primary"
                      )}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Name */}
          <div>
            <Label className="text-xs">Nome do espaço</Label>
            <Input
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="ex: Dúvidas Técnicas"
              maxLength={30}
              className="mt-1.5"
            />
            <p className="text-[10px] text-muted-foreground mt-1">{name.length}/30</p>
          </div>

          {/* Slug */}
          <div>
            <Label className="text-xs">Slug (URL)</Label>
            <Input
              value={slug}
              onChange={(e) => setSlug(generateSlug(e.target.value))}
              placeholder="duvidas-tecnicas"
              className="mt-1.5 font-mono text-xs"
            />
          </div>

          {/* Description */}
          <div>
            <Label className="text-xs">Descrição</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 200))}
              placeholder="Descreva o propósito deste espaço..."
              rows={2}
              maxLength={200}
              className="mt-1.5"
            />
            <p className="text-[10px] text-muted-foreground mt-1">{description.length}/200</p>
          </div>

          {/* Color */}
          <div>
            <Label className="text-xs">Cor de destaque</Label>
            <div className="flex gap-2 mt-1.5">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn(
                    "h-7 w-7 rounded-full border-2 transition-transform",
                    color === c ? "border-foreground scale-110" : "border-transparent"
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Somente admins podem postar</Label>
              <Switch checked={onlyAdmins} onCheckedChange={setOnlyAdmins} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Visível para membros</Label>
              <Switch checked={isVisible} onCheckedChange={setIsVisible} />
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {/* Delete button (editing only, not default) */}
          {isEditing && (
            space.is_default ? (
              <p className="text-[10px] text-muted-foreground mr-auto">Espaço padrão não pode ser excluído</p>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-destructive mr-auto">
                    <Trash2 className="h-4 w-4 mr-1.5" />Excluir
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir espaço "{space.name}"?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Os posts deste espaço serão movidos para o espaço "Geral". Esta ação não pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteSpace.mutate()}>Excluir</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )
          )}

          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() => isEditing ? updateSpace.mutate() : createSpace.mutate()}
            disabled={!name.trim() || !slug.trim() || createSpace.isPending || updateSpace.isPending}
          >
            <Save className="h-4 w-4 mr-1.5" />
            {isEditing ? "Salvar" : "Criar Espaço"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
