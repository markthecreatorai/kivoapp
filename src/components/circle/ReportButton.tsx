import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Flag } from "lucide-react";
import { toast } from "sonner";

interface ReportButtonProps {
  communityId: string;
  reporterId: string;
  postId?: string;
  commentId?: string;
  targetMemberId?: string;
  variant?: "ghost" | "outline";
  size?: "sm" | "icon";
  className?: string;
}

const REASONS = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Assédio / Bullying" },
  { value: "inappropriate", label: "Conteúdo impróprio" },
  { value: "misinformation", label: "Desinformação" },
  { value: "other", label: "Outro" },
];

export default function ReportButton({
  communityId, reporterId, postId, commentId, targetMemberId, variant = "ghost", size = "sm", className
}: ReportButtonProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("spam");
  const [details, setDetails] = useState("");

  const report = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("community_reports" as any).insert({
        community_id: communityId,
        reporter_id: reporterId,
        post_id: postId || null,
        comment_id: commentId || null,
        target_member_id: targetMemberId || null,
        reason,
        details: details.trim() || null,
        status: "PENDING",
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Denúncia enviada. Nossa equipe irá analisar.");
      setOpen(false);
      setDetails("");
      setReason("spam");
    },
    onError: () => toast.error("Erro ao enviar denúncia"),
  });

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)} className={className}>
        <Flag className="h-3.5 w-3.5" />
        {size !== "icon" && <span className="ml-1">Denunciar</span>}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Denunciar conteúdo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Motivo</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Detalhes (opcional)</Label>
              <Textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Descreva o problema..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => report.mutate()} disabled={report.isPending}>Enviar denúncia</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
