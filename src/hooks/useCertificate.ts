import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { trackEvent } from "@/lib/tracking";

interface CertificateData {
  id: string;
  member_id: string;
  course_id: string;
  community_id: string;
  student_name: string;
  course_name: string;
  creator_name: string | null;
  hours: number;
  certificate_code: string;
  issued_at: string;
}

export function useCertificate(memberId: string | null, courseId: string | null) {
  const queryClient = useQueryClient();

  const { data: certificate, isLoading } = useQuery({
    queryKey: ["circle-certificate", memberId, courseId],
    queryFn: async () => {
      if (!memberId || !courseId) return null;
      const { data } = await (supabase as any)
        .from("circle_certificates")
        .select("*")
        .eq("member_id", memberId)
        .eq("course_id", courseId)
        .maybeSingle();
      return data as CertificateData | null;
    },
    enabled: !!memberId && !!courseId,
  });

  const generateCertificate = useMutation({
    mutationFn: async ({
      communityId,
      studentName,
      courseName,
      creatorName,
      hours,
    }: {
      communityId: string;
      studentName: string;
      courseName: string;
      creatorName?: string;
      hours?: number;
    }) => {
      if (!memberId || !courseId) throw new Error("Missing member/course");

      const { data, error } = await (supabase as any)
        .from("circle_certificates")
        .insert({
          member_id: memberId,
          course_id: courseId,
          community_id: communityId,
          student_name: studentName,
          course_name: courseName,
          creator_name: creatorName || null,
          hours: hours || 0,
        })
        .select()
        .single();

      if (error) {
        // Already exists (unique constraint)
        if (error.code === "23505") {
          const { data: existing } = await (supabase as any)
            .from("circle_certificates")
            .select("*")
            .eq("member_id", memberId)
            .eq("course_id", courseId)
            .maybeSingle();
          return existing as CertificateData;
        }
        throw error;
      }
      return data as CertificateData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circle-certificate", memberId, courseId] });
      toast.success("Certificado emitido! 🎓");
    },
    onError: (err: any) => toast.error(err.message),
  });

  return { certificate, isLoading, generateCertificate };
}

/** Generate a certificate PDF as a downloadable blob */
export function generateCertificatePDF(cert: CertificateData): Promise<Blob> {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    const W = 1122; // A4 landscape-ish
    const H = 794;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;

    // Background
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, W, H);

    // Border
    ctx.strokeStyle = "#6366F1";
    ctx.lineWidth = 8;
    ctx.strokeRect(30, 30, W - 60, H - 60);

    // Inner border
    ctx.strokeStyle = "#A5B4FC";
    ctx.lineWidth = 2;
    ctx.strokeRect(45, 45, W - 90, H - 90);

    // Title
    ctx.fillStyle = "#6366F1";
    ctx.font = "bold 42px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText("CERTIFICADO DE CONCLUSÃO", W / 2, 140);

    // Decorative line
    ctx.strokeStyle = "#6366F1";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 200, 160);
    ctx.lineTo(W / 2 + 200, 160);
    ctx.stroke();

    // "Certificamos que"
    ctx.fillStyle = "#64748B";
    ctx.font = "18px Georgia, serif";
    ctx.fillText("Certificamos que", W / 2, 220);

    // Student name
    ctx.fillStyle = "#1E293B";
    ctx.font = "bold 36px Georgia, serif";
    ctx.fillText(cert.student_name, W / 2, 280);

    // Course text
    ctx.fillStyle = "#64748B";
    ctx.font = "18px Georgia, serif";
    ctx.fillText("concluiu com êxito o curso", W / 2, 340);

    // Course name
    ctx.fillStyle = "#6366F1";
    ctx.font = "bold 30px Georgia, serif";
    ctx.fillText(cert.course_name, W / 2, 390);

    // Hours
    if (cert.hours > 0) {
      ctx.fillStyle = "#64748B";
      ctx.font = "16px Georgia, serif";
      ctx.fillText(`Carga horária: ${cert.hours}h`, W / 2, 430);
    }

    // Date
    const date = new Date(cert.issued_at).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    ctx.fillStyle = "#64748B";
    ctx.font = "16px Georgia, serif";
    ctx.fillText(`Emitido em ${date}`, W / 2, 480);

    // Creator name
    if (cert.creator_name) {
      ctx.strokeStyle = "#94A3B8";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(W / 2 - 120, 580);
      ctx.lineTo(W / 2 + 120, 580);
      ctx.stroke();

      ctx.fillStyle = "#1E293B";
      ctx.font = "bold 18px Georgia, serif";
      ctx.fillText(cert.creator_name, W / 2, 610);

      ctx.fillStyle = "#94A3B8";
      ctx.font = "14px Georgia, serif";
      ctx.fillText("Instrutor(a)", W / 2, 635);
    }

    // Certificate code
    ctx.fillStyle = "#94A3B8";
    ctx.font = "12px monospace";
    ctx.textAlign = "left";
    ctx.fillText(`Código: ${cert.certificate_code}`, 65, H - 60);

    ctx.textAlign = "right";
    const verifyUrl = `${window.location.origin}/verify/${cert.certificate_code}`;
    ctx.fillText(`Verificar em: ${verifyUrl}`, W - 65, H - 60);

    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
    }, "image/png");
  });
}
