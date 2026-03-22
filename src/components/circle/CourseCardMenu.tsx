import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  MoreHorizontal, Pencil, ArrowLeft, ArrowRight, Copy, Eye, Share2, Trash2,
} from "lucide-react";
import { toast } from "sonner";

interface CourseCardMenuProps {
  course: {
    id: string;
    name: string;
    description: string | null;
    access_type: string;
    cover_url: string | null;
    is_published: boolean;
    position: number;
    community_id: string;
  };
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
}

export default function CourseCardMenu({ course, isFirst, isLast, onEdit }: CourseCardMenuProps) {
  const queryClient = useQueryClient();

  const moveMutation = useMutation({
    mutationFn: async (direction: "left" | "right") => {
      const newPos = direction === "left" ? course.position - 1 : course.position + 1;
      // Swap positions: find the course at the target position
      const { data: target } = await supabase
        .from("circle_courses")
        .select("id")
        .eq("community_id", course.community_id)
        .eq("position", newPos)
        .maybeSingle();

      if (target) {
        await supabase.from("circle_courses").update({ position: course.position }).eq("id", target.id);
      }
      await supabase.from("circle_courses").update({ position: newPos }).eq("id", course.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circle-courses"] });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("circle_courses").insert({
        community_id: course.community_id,
        name: course.name + " (cópia)",
        description: course.description,
        access_type: course.access_type,
        cover_url: course.cover_url,
        is_published: false,
        position: course.position + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circle-courses"] });
      toast.success("Curso duplicado!");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("circle_courses").delete().eq("id", course.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circle-courses"] });
      toast.success("Curso excluído!");
    },
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 bg-background/80 backdrop-blur-sm shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="h-4 w-4 mr-2" /> Editar curso
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => moveMutation.mutate("left")} disabled={isFirst}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Mover ←
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => moveMutation.mutate("right")} disabled={isLast}>
          <ArrowRight className="h-4 w-4 mr-2" /> Mover →
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => duplicateMutation.mutate()}>
          <Copy className="h-4 w-4 mr-2" /> Duplicar curso
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Eye className="h-4 w-4 mr-2" /> Ver como membro
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => {
          navigator.clipboard.writeText(`${window.location.origin}/circle/classroom?course=${course.id}`);
          toast.success("Link copiado!");
        }}>
          <Share2 className="h-4 w-4 mr-2" /> Compartilhar link
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => {
            if (confirm("Tem certeza que deseja excluir este curso?")) {
              deleteMutation.mutate();
            }
          }}
        >
          <Trash2 className="h-4 w-4 mr-2" /> Excluir curso
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
