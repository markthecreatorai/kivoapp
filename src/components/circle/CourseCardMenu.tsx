import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  MoreHorizontal, Pencil, Copy, Trash2, Archive, ArchiveRestore,
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

export default function CourseCardMenu({ course, onEdit }: CourseCardMenuProps) {
  const queryClient = useQueryClient();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

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

  const archiveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("circle_courses")
        .update({ is_published: !course.is_published })
        .eq("id", course.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circle-courses"] });
      toast.success(course.is_published ? "Curso arquivado!" : "Curso publicado!");
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
    <>
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
          <DropdownMenuItem onClick={() => duplicateMutation.mutate()}>
            <Copy className="h-4 w-4 mr-2" /> Duplicar curso
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => archiveMutation.mutate()}>
            {course.is_published ? (
              <><Archive className="h-4 w-4 mr-2" /> Arquivar</>
            ) : (
              <><ArchiveRestore className="h-4 w-4 mr-2" /> Publicar</>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" /> Excluir curso
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir curso</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este curso? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMutation.mutate()}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
