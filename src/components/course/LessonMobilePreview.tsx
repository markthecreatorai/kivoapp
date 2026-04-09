import {
  Video, FileText, ChevronLeft, ChevronRight, Play,
  Paperclip, Download, BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LessonMaterial } from "@/hooks/useCourseBuilder";

interface LessonMobilePreviewProps {
  title: string;
  description: string;
  videoUrl: string | null;
  materials: LessonMaterial[];
  highlightColor: string;
  bgColor: string;
  titleFont: string;
  hasPrev: boolean;
  hasNext: boolean;
  prevTitle?: string;
  nextTitle?: string;
  onPrev: () => void;
  onNext: () => void;
}

export function LessonMobilePreview({
  title,
  description,
  videoUrl,
  materials,
  highlightColor,
  bgColor,
  titleFont,
  hasPrev,
  hasNext,
  prevTitle,
  nextTitle,
  onPrev,
  onNext,
}: LessonMobilePreviewProps) {
  const isLightBg =
    bgColor === "#ffffff" || bgColor === "#f8fafc" || bgColor === "#f1f5f9" || bgColor === "#e2e8f0";
  const textColor = isLightBg ? "#0f172a" : "#ffffff";
  const mutedColor = isLightBg ? "#64748b" : "#94a3b8";
  const cardBg = isLightBg ? "#f1f5f9" : "rgba(255,255,255,0.08)";

  return (
    <div className="hidden lg:block w-[340px] shrink-0">
      <p className="text-xs font-medium text-muted-foreground mb-3 text-center">
        Preview da aula
      </p>

      {/* Phone shell */}
      <div className="w-[340px] h-[680px] bg-black rounded-[44px] p-3 shadow-2xl mx-auto">
        <div className="w-28 h-5 bg-black mx-auto rounded-b-xl relative z-10" />

        <div
          className="w-full rounded-[32px] overflow-hidden relative -mt-3"
          style={{ backgroundColor: bgColor, height: "calc(100% + 12px)" }}
        >
          <div className="overflow-y-auto h-full scrollbar-none flex flex-col">
            {/* Video area */}
            {videoUrl ? (
              <div
                className="w-full aspect-video flex items-center justify-center relative"
                style={{ backgroundColor: "#000" }}
              >
                <Play
                  className="h-10 w-10 text-white/80"
                  fill="rgba(255,255,255,0.3)"
                />
                <div
                  className="absolute bottom-2 left-3 text-[9px] font-medium px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: highlightColor, color: "#fff" }}
                >
                  Vídeo
                </div>
              </div>
            ) : (
              <div
                className="w-full aspect-video flex items-center justify-center"
                style={{ backgroundColor: highlightColor + "15" }}
              >
                <BookOpen className="h-8 w-8" style={{ color: highlightColor, opacity: 0.5 }} />
              </div>
            )}

            {/* Content */}
            <div className="px-4 pt-3 pb-4 space-y-3 flex-1">
              {/* Title */}
              <h3
                className="text-sm font-bold leading-tight"
                style={{ fontFamily: titleFont, color: highlightColor }}
              >
                {title || "Título da aula"}
              </h3>

              {/* Description */}
              {description && description.replace(/<[^>]*>/g, "").trim() ? (
                <div
                  className="text-[10px] leading-relaxed space-y-1 [&_h2]:text-xs [&_h2]:font-bold [&_ul]:list-disc [&_ul]:pl-3 [&_a]:underline"
                  style={{ color: mutedColor }}
                  dangerouslySetInnerHTML={{ __html: description }}
                />
              ) : (
                <p className="text-[10px] italic" style={{ color: mutedColor + "80" }}>
                  Adicione uma descrição...
                </p>
              )}

              {/* Materials */}
              {materials.length > 0 && (
                <div className="space-y-1 pt-1">
                  <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: mutedColor }}>
                    <Paperclip className="h-2.5 w-2.5 inline mr-0.5" />
                    Materiais ({materials.length})
                  </p>
                  {materials.map((mat) => (
                    <div
                      key={mat.id}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded text-[10px]"
                      style={{ backgroundColor: cardBg }}
                    >
                      <FileText className="h-3 w-3 shrink-0" style={{ color: highlightColor }} />
                      <span className="truncate flex-1" style={{ color: textColor }}>
                        {mat.file_name}
                      </span>
                      <Download className="h-2.5 w-2.5 shrink-0" style={{ color: mutedColor }} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Navigation footer */}
            <div
              className="px-3 py-2.5 flex items-center justify-between border-t mt-auto"
              style={{ borderColor: isLightBg ? "#e2e8f0" : "rgba(255,255,255,0.1)" }}
            >
              <button
                disabled={!hasPrev}
                onClick={onPrev}
                className="flex items-center gap-1 text-[10px] font-medium px-2 py-1.5 rounded transition-opacity disabled:opacity-30"
                style={{ color: hasPrev ? highlightColor : mutedColor }}
              >
                <ChevronLeft className="h-3 w-3" />
                <span className="max-w-[80px] truncate">{prevTitle || "Anterior"}</span>
              </button>
              <button
                disabled={!hasNext}
                onClick={onNext}
                className="flex items-center gap-1 text-[10px] font-medium px-2 py-1.5 rounded transition-opacity disabled:opacity-30"
                style={{ color: hasNext ? highlightColor : mutedColor }}
              >
                <span className="max-w-[80px] truncate">{nextTitle || "Próxima"}</span>
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
