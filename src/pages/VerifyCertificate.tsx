import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Award, CheckCircle2, XCircle, Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateCertificatePDF } from "@/hooks/useCertificate";

export default function VerifyCertificate() {
  const { code } = useParams<{ code: string }>();

  const { data: certificate, isLoading, error } = useQuery({
    queryKey: ["verify-certificate", code],
    queryFn: async () => {
      if (!code) return null;
      const { data, error } = await (supabase as any)
        .from("circle_certificates")
        .select("*")
        .eq("certificate_code", code.toUpperCase())
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!code,
  });

  const handleDownload = async () => {
    if (!certificate) return;
    const blob = await generateCertificatePDF(certificate);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `certificado-${certificate.certificate_code}.png`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const issuedDate = certificate
    ? new Date(certificate.issued_at).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {isLoading ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Verificando certificado...</p>
          </div>
        ) : certificate ? (
          <div className="bg-card border rounded-2xl p-8 shadow-lg text-center space-y-6">
            <div className="flex justify-center">
              <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
            </div>

            <div>
              <h1 className="text-2xl font-bold text-foreground">Certificado Válido</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Este certificado é autêntico e verificado
              </p>
            </div>

            <div className="bg-muted/50 rounded-xl p-5 space-y-3 text-left">
              <div>
                <p className="text-xs text-muted-foreground">Aluno(a)</p>
                <p className="font-semibold text-foreground">{certificate.student_name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Curso</p>
                <p className="font-semibold text-foreground">{certificate.course_name}</p>
              </div>
              {certificate.creator_name && (
                <div>
                  <p className="text-xs text-muted-foreground">Instrutor(a)</p>
                  <p className="font-semibold text-foreground">{certificate.creator_name}</p>
                </div>
              )}
              {certificate.hours > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground">Carga Horária</p>
                  <p className="font-semibold text-foreground">{certificate.hours}h</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">Data de Emissão</p>
                <p className="font-semibold text-foreground">{issuedDate}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Código</p>
                <p className="font-mono text-sm text-foreground">{certificate.certificate_code}</p>
              </div>
            </div>

            <Button onClick={handleDownload} className="w-full">
              <Download className="h-4 w-4 mr-2" />
              Baixar Certificado
            </Button>
          </div>
        ) : (
          <div className="bg-card border rounded-2xl p-8 shadow-lg text-center space-y-4">
            <div className="flex justify-center">
              <div className="h-16 w-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-foreground">Certificado Não Encontrado</h1>
            <p className="text-muted-foreground text-sm">
              O código informado não corresponde a nenhum certificado válido.
            </p>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground mt-6">
          Verificação fornecida por <span className="font-semibold">Kivo</span>
        </p>
      </div>
    </div>
  );
}
