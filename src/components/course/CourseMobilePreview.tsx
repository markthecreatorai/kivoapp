import { BookOpen, Play, Lock } from "lucide-react";

interface CourseMobilePreviewProps {
  title: string;
  description: string;
  heroImageUrl: string | null;
  bgColor: string;
  highlightColor: string;
  titleFont: string;
  modulesCount?: number;
  lessonsCount?: number;
}

export function CourseMobilePreview({
  title,
  description,
  heroImageUrl,
  bgColor,
  highlightColor,
  titleFont,
  modulesCount = 0,
  lessonsCount = 0,
}: CourseMobilePreviewProps) {
  // Strip HTML for plain-text preview
  const plainDesc = description
    ? description.replace(/<[^>]*>/g, "").slice(0, 160)
    : "";

  return (
    <div className="hidden lg:block w-[340px] shrink-0">
      <p className="text-xs font-medium text-muted-foreground mb-3 text-center">
        Preview em tempo real
      </p>

      {/* Phone shell */}
      <div className="w-[340px] h-[680px] bg-black rounded-[44px] p-3 shadow-2xl mx-auto">
        {/* Notch */}
        <div className="w-28 h-5 bg-black mx-auto rounded-b-xl relative z-10" />

        {/* Screen */}
        <div
          className="w-full rounded-[32px] overflow-hidden relative -mt-3"
          style={{
            backgroundColor: bgColor,
            height: "calc(100% + 12px)",
          }}
        >
          <div className="overflow-y-auto h-full scrollbar-none">
            {/* Hero */}
            {heroImageUrl ? (
              <div className="relative">
                <img
                  src={heroImageUrl}
                  alt="Hero"
                  className="w-full aspect-[16/9] object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
              </div>
            ) : (
              <div
                className="w-full aspect-[16/9] flex items-center justify-center"
                style={{ backgroundColor: highlightColor + "22" }}
              >
                <BookOpen className="h-10 w-10" style={{ color: highlightColor }} />
              </div>
            )}

            {/* Content */}
            <div className="px-4 pt-4 pb-8 space-y-3">
              <h2
                className="text-base font-bold leading-tight"
                style={{
                  fontFamily: titleFont,
                  color: bgColor === "#ffffff" || bgColor === "#f8fafc" || bgColor === "#f1f5f9" || bgColor === "#e2e8f0"
                    ? "#0f172a"
                    : "#ffffff",
                }}
              >
                {title || "Título do curso"}
              </h2>

              {plainDesc && (
                <p
                  className="text-[11px] leading-relaxed opacity-70"
                  style={{
                    color: bgColor === "#ffffff" || bgColor === "#f8fafc" || bgColor === "#f1f5f9" || bgColor === "#e2e8f0"
                      ? "#334155"
                      : "#e2e8f0",
                  }}
                >
                  {plainDesc}
                </p>
              )}

              {/* Stats */}
              <div className="flex items-center gap-3 pt-1">
                <div
                  className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full"
                  style={{ backgroundColor: highlightColor + "20", color: highlightColor }}
                >
                  <BookOpen className="h-3 w-3" />
                  {modulesCount} módulos
                </div>
                <div
                  className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full"
                  style={{ backgroundColor: highlightColor + "20", color: highlightColor }}
                >
                  <Play className="h-3 w-3" />
                  {lessonsCount} aulas
                </div>
              </div>

              {/* Fake module cards */}
              <div className="space-y-2 pt-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="rounded-lg p-3 flex items-center gap-3"
                    style={{
                      backgroundColor:
                        bgColor === "#ffffff" || bgColor === "#f8fafc" || bgColor === "#f1f5f9" || bgColor === "#e2e8f0"
                          ? "#f1f5f9"
                          : "rgba(255,255,255,0.08)",
                    }}
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: highlightColor + "30" }}
                    >
                      {i <= modulesCount ? (
                        <Play className="h-3 w-3" style={{ color: highlightColor }} />
                      ) : (
                        <Lock className="h-3 w-3 opacity-40" style={{ color: highlightColor }} />
                      )}
                    </div>
                    <div className="flex-1 space-y-1">
                      <div
                        className="h-2.5 rounded-full w-3/4"
                        style={{
                          backgroundColor:
                            bgColor === "#ffffff" || bgColor === "#f8fafc" || bgColor === "#f1f5f9" || bgColor === "#e2e8f0"
                              ? "#cbd5e1"
                              : "rgba(255,255,255,0.15)",
                        }}
                      />
                      <div
                        className="h-2 rounded-full w-1/2"
                        style={{
                          backgroundColor:
                            bgColor === "#ffffff" || bgColor === "#f8fafc" || bgColor === "#f1f5f9" || bgColor === "#e2e8f0"
                              ? "#e2e8f0"
                              : "rgba(255,255,255,0.08)",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* CTA button */}
              <button
                className="w-full py-2.5 rounded-lg text-xs font-semibold text-white mt-3 transition-opacity hover:opacity-90"
                style={{ backgroundColor: highlightColor }}
              >
                Começar agora
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
