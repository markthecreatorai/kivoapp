import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Trash2, GripVertical, Save, ChevronDown, ChevronRight,
  CheckCircle2, Circle, ClipboardList,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface QuizOption {
  label: string;
  is_correct: boolean;
}

interface QuizQuestion {
  id?: string;
  quiz_id?: string;
  question_text: string;
  options: QuizOption[];
  position: number;
  points: number;
}

interface Quiz {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  passing_score: number;
  max_attempts: number;
  is_required_for_certificate: boolean;
  is_published: boolean;
  time_limit_minutes: number | null;
  position: number;
}

export default function QuizEditor({ courseId }: { courseId: string }) {
  const queryClient = useQueryClient();
  const [expandedQuizId, setExpandedQuizId] = useState<string | null>(null);

  const { data: quizzes = [], isLoading } = useQuery({
    queryKey: ["course-quizzes-admin", courseId],
    queryFn: async () => {
      const { data } = await supabase
        .from("course_quizzes")
        .select("*")
        .eq("course_id", courseId)
        .order("position");
      return (data || []) as Quiz[];
    },
  });

  const createQuiz = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("course_quizzes").insert({
        course_id: courseId,
        title: "Nova Avaliação",
        position: quizzes.length,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course-quizzes-admin", courseId] });
      toast.success("Quiz criado!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteQuiz = useMutation({
    mutationFn: async (quizId: string) => {
      const { error } = await supabase.from("course_quizzes").delete().eq("id", quizId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course-quizzes-admin", courseId] });
      toast.success("Quiz excluído");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground p-4">Carregando quizzes...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-foreground">Avaliações</h3>
          <Badge variant="secondary" className="text-xs">{quizzes.length}</Badge>
        </div>
        <Button size="sm" onClick={() => createQuiz.mutate()} disabled={createQuiz.isPending}>
          <Plus className="h-4 w-4 mr-1" /> Novo Quiz
        </Button>
      </div>

      {quizzes.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">
          Nenhuma avaliação criada. Adicione um quiz para avaliar os alunos.
        </p>
      )}

      {quizzes.map((quiz) => (
        <QuizCard
          key={quiz.id}
          quiz={quiz}
          expanded={expandedQuizId === quiz.id}
          onToggle={() => setExpandedQuizId(expandedQuizId === quiz.id ? null : quiz.id)}
          onDelete={() => { if (confirm("Excluir este quiz?")) deleteQuiz.mutate(quiz.id); }}
        />
      ))}
    </div>
  );
}

function QuizCard({ quiz, expanded, onToggle, onDelete }: {
  quiz: Quiz; expanded: boolean; onToggle: () => void; onDelete: () => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(quiz.title);
  const [description, setDescription] = useState(quiz.description || "");
  const [passingScore, setPassingScore] = useState(quiz.passing_score);
  const [maxAttempts, setMaxAttempts] = useState(quiz.max_attempts);
  const [isPublished, setIsPublished] = useState(quiz.is_published);
  const [requiredForCert, setRequiredForCert] = useState(quiz.is_required_for_certificate);
  const [timeLimit, setTimeLimit] = useState(quiz.time_limit_minutes || 0);

  const saveQuiz = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("course_quizzes").update({
        title,
        description: description || null,
        passing_score: passingScore,
        max_attempts: maxAttempts,
        is_published: isPublished,
        is_required_for_certificate: requiredForCert,
        time_limit_minutes: timeLimit > 0 ? timeLimit : null,
      }).eq("id", quiz.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course-quizzes-admin"] });
      toast.success("Quiz salvo!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
      <CardHeader className="py-3 px-4 cursor-pointer" onClick={onToggle}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <CardTitle className="text-sm">{quiz.title}</CardTitle>
            {quiz.is_published
              ? <Badge variant="default" className="text-[10px]">Publicado</Badge>
              : <Badge variant="secondary" className="text-[10px]">Rascunho</Badge>
            }
          </div>
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="px-4 pb-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Título</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Descrição</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opcional" />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nota mínima (%)</Label>
              <Input type="number" min={0} max={100} value={passingScore} onChange={(e) => setPassingScore(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Máx. tentativas</Label>
              <Input type="number" min={1} max={99} value={maxAttempts} onChange={(e) => setMaxAttempts(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tempo limite (min)</Label>
              <Input type="number" min={0} value={timeLimit} onChange={(e) => setTimeLimit(Number(e.target.value))} placeholder="0 = sem limite" />
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Switch checked={isPublished} onCheckedChange={setIsPublished} />
              <span className="text-xs text-muted-foreground">Publicado</span>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={requiredForCert} onCheckedChange={setRequiredForCert} />
              <span className="text-xs text-muted-foreground">Obrigatório p/ certificado</span>
            </div>
          </div>

          <Button size="sm" onClick={() => saveQuiz.mutate()} disabled={saveQuiz.isPending}>
            <Save className="h-3.5 w-3.5 mr-1" /> Salvar
          </Button>

          <hr className="border-border/50" />

          <QuestionsList quizId={quiz.id} />
        </CardContent>
      )}
    </Card>
  );
}

function QuestionsList({ quizId }: { quizId: string }) {
  const queryClient = useQueryClient();

  const { data: questions = [] } = useQuery({
    queryKey: ["quiz-questions", quizId],
    queryFn: async () => {
      const { data } = await supabase
        .from("course_quiz_questions")
        .select("*")
        .eq("quiz_id", quizId)
        .order("position");
      return (data || []) as unknown as (QuizQuestion & { id: string })[];
    },
  });

  const addQuestion = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("course_quiz_questions").insert({
        quiz_id: quizId,
        question_text: "Nova pergunta",
        options: [
          { label: "Opção A", is_correct: true },
          { label: "Opção B", is_correct: false },
          { label: "Opção C", is_correct: false },
          { label: "Opção D", is_correct: false },
        ],
        position: questions.length,
        points: 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quiz-questions", quizId] });
      toast.success("Pergunta adicionada");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Perguntas ({questions.length})</span>
        <Button variant="outline" size="sm" onClick={() => addQuestion.mutate()} disabled={addQuestion.isPending}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Pergunta
        </Button>
      </div>

      {questions.map((q, idx) => (
        <QuestionEditor key={q.id} question={q} index={idx} quizId={quizId} />
      ))}
    </div>
  );
}

function QuestionEditor({ question, index, quizId }: { question: QuizQuestion & { id: string }; index: number; quizId: string }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(question.question_text);
  const [points, setPoints] = useState(question.points);
  const [options, setOptions] = useState<QuizOption[]>(
    Array.isArray(question.options) ? (question.options as QuizOption[]) : []
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!options.some(o => o.is_correct)) {
        throw new Error("Marque pelo menos uma opção como correta");
      }
      const { error } = await supabase.from("course_quiz_questions").update({
        question_text: text,
        points,
        options: options as any,
      }).eq("id", question.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quiz-questions", quizId] });
      toast.success("Pergunta salva");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("course_quiz_questions").delete().eq("id", question.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quiz-questions", quizId] });
      toast.success("Pergunta removida");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateOption = (idx: number, patch: Partial<QuizOption>) => {
    setOptions(prev => prev.map((o, i) => i === idx ? { ...o, ...patch } : o));
  };

  const setCorrect = (idx: number) => {
    setOptions(prev => prev.map((o, i) => ({ ...o, is_correct: i === idx })));
  };

  const addOption = () => {
    setOptions(prev => [...prev, { label: `Opção ${String.fromCharCode(65 + prev.length)}`, is_correct: false }]);
  };

  const removeOption = (idx: number) => {
    setOptions(prev => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="border border-border/50 rounded-lg p-3 space-y-2 bg-muted/20">
      <div className="flex items-start gap-2">
        <span className="text-xs font-bold text-muted-foreground mt-2 shrink-0">{index + 1}.</span>
        <div className="flex-1 space-y-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} className="text-sm" placeholder="Pergunta..." />

          <div className="space-y-1.5">
            {options.map((opt, oi) => (
              <div key={oi} className="flex items-center gap-2">
                <button type="button" onClick={() => setCorrect(oi)} className="shrink-0">
                  {opt.is_correct
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    : <Circle className="h-4 w-4 text-muted-foreground/40" />
                  }
                </button>
                <Input
                  value={opt.label}
                  onChange={(e) => updateOption(oi, { label: e.target.value })}
                  className="text-xs h-8"
                />
                {options.length > 2 && (
                  <button type="button" onClick={() => removeOption(oi)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive/60" />
                  </button>
                )}
              </div>
            ))}
            {options.length < 6 && (
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={addOption}>
                <Plus className="h-3 w-3 mr-1" /> Opção
              </Button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Label className="text-[10px] text-muted-foreground">Pontos:</Label>
              <Input type="number" min={1} max={100} value={points} onChange={(e) => setPoints(Number(e.target.value))} className="w-16 h-7 text-xs" />
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => save.mutate()} disabled={save.isPending}>
              <Save className="h-3 w-3 mr-1" /> Salvar
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => { if (confirm("Excluir?")) remove.mutate(); }}>
              <Trash2 className="h-3 w-3 mr-1" /> Excluir
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
