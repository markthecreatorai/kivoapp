import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { useAuth } from "@/contexts/AuthProvider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MessageSquare } from "lucide-react";
import { toast } from "sonner";

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("bug");
  const [severity, setSeverity] = useState("medium");
  const [submitting, setSubmitting] = useState(false);
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();

  const submit = async () => {
    if (!description.trim()) return;
    setSubmitting(true);
    try {
      await (supabase.from as any)("beta_feedback").insert({
        workspace_id: currentWorkspace?.id,
        user_id: user?.id,
        category,
        severity,
        description: description.trim(),
        page_path: window.location.pathname,
        user_agent: navigator.userAgent,
      });
      toast.success("Feedback enviado! Obrigado.");
      setDescription("");
      setOpen(false);
    } catch {
      toast.error("Erro ao enviar feedback");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="fixed bottom-24 lg:bottom-4 right-4 z-40 shadow-lg gap-2 lg:px-3 px-2 lg:h-9 h-9 min-w-0"
        >
          <MessageSquare className="w-4 h-4" />
          <span className="hidden lg:inline">Reportar problema</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reportar problema</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bug">Bug</SelectItem>
                <SelectItem value="feature">Sugestão</SelectItem>
                <SelectItem value="question">Dúvida</SelectItem>
                <SelectItem value="other">Outro</SelectItem>
              </SelectContent>
            </Select>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="critical">Crítico</SelectItem>
                <SelectItem value="high">Alto</SelectItem>
                <SelectItem value="medium">Médio</SelectItem>
                <SelectItem value="low">Baixo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Textarea
            placeholder="Descreva o problema ou sugestão..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
          />
          <Button onClick={submit} disabled={submitting || !description.trim()} className="w-full">
            {submitting ? "Enviando..." : "Enviar feedback"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
