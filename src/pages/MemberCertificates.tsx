import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthProvider";
import { generateCertificatePDF } from "@/hooks/useCertificate";
import { trackEvent } from "@/lib/tracking";
import { Award, Download, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function MemberCertificates() {
  const { user } = useAuth();

  useEffect(() => {
    trackEvent("member_certificates_viewed");
  }, []);

  // Get all member IDs for this user across communities
  const { data: memberIds = [] } = useQuery({
    queryKey: ["my-member-ids", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("community_members")
        .select("id")
        .eq("user_id", user.id);
      return (data || []).map((m: any) => m.id);
    },
    enabled: !!user,
  });

  const { data: certificates = [], isLoading } = useQuery({
    queryKey: ["my-certificates", memberIds],
    queryFn: async () => {
      if (!memberIds.length) return [];
      const { data } = await (supabase as any)
        .from("circle_certificates")
        .select("*")
        .in("member_id", memberIds)
        .order("issued_at", { ascending: false });
      return data || [];
    },
    enabled: memberIds.length > 0,
  });

  const handleDownload = async (cert: any) => {
    trackEvent("certificate_downloaded", { certificate_id: cert.id });
    const blob = await generateCertificatePDF(cert);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `certificado-${cert.certificate_code}.png`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
        <div className="flex items-center gap-3 mb-6">
          <Award className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Meus Certificados</h1>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : certificates.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <Award className="h-12 w-12 text-muted-foreground/40 mx-auto" />
            <p className="text-muted-foreground">
              Você ainda não possui certificados. Complete um curso para receber o seu!
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {certificates.map((cert: any) => (
              <div
                key={cert.id}
                className="bg-card border rounded-xl p-5 space-y-3 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate">{cert.course_name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(cert.issued_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-xs">
                    {cert.hours > 0 ? `${cert.hours}h` : "—"}
                  </Badge>
                </div>

                {cert.creator_name && (
                  <p className="text-xs text-muted-foreground">
                    Instrutor: <span className="font-medium text-foreground">{cert.creator_name}</span>
                  </p>
                )}

                <p className="text-xs font-mono text-muted-foreground">
                  Código: {cert.certificate_code}
                </p>

                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => handleDownload(cert)}>
                    <Download className="h-3.5 w-3.5 mr-1" /> Baixar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs"
                    asChild
                  >
                    <a href={`/verify/${cert.certificate_code}`} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
