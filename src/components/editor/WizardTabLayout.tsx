import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Save, ChevronRight, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";

export interface WizardTab {
  key: string;
  label: string;
}

interface WizardTabLayoutProps {
  tabs: WizardTab[];
  activeTab: string;
  onTabChange: (key: string) => void;
  children: ReactNode;
  preview?: ReactNode;
  // Sticky bar
  onSaveDraft: () => void;
  onNext?: () => void;
  onPublish?: () => void;
  isLastTab?: boolean;
  canPublish?: boolean;
  isSaving?: boolean;
  saveLabel?: string;
  // Status indicator slot
  statusIndicator?: ReactNode;
}

export function WizardTabLayout({
  tabs,
  activeTab,
  onTabChange,
  children,
  preview,
  onSaveDraft,
  onNext,
  onPublish,
  isLastTab = false,
  canPublish = true,
  isSaving = false,
  saveLabel = "Salvar rascunho",
  statusIndicator,
}: WizardTabLayoutProps) {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex flex-col lg:flex-row gap-10">
        {/* Left: tabs + content */}
        <div className="flex-1 min-w-0">
          <Tabs value={activeTab} onValueChange={onTabChange} className="w-full">
            <TabsList className="bg-muted/50 p-1 w-full flex mb-6">
              {tabs.map((t) => (
                <TabsTrigger key={t.key} value={t.key} className="flex-1 text-xs sm:text-sm">
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {children}
          </Tabs>

          {/* Sticky action bar */}
          <div className="sticky bottom-0 z-20 mt-6 -mx-4 sm:-mx-6 px-4 sm:px-6 py-4 bg-background/95 backdrop-blur border-t border-border/50">
            <div className="flex items-center justify-between gap-3">
              <div className="shrink-0">{statusIndicator}</div>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onSaveDraft}
                  disabled={isSaving}
                  className="gap-2"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saveLabel}
                </Button>
                {!isLastTab && onNext && (
                  <Button size="sm" onClick={onNext} className="gap-2">
                    Próximo <ChevronRight className="h-4 w-4" />
                  </Button>
                )}
                {isLastTab && onPublish && (
                  <Button
                    size="sm"
                    onClick={onPublish}
                    disabled={!canPublish || isSaving}
                    className="gap-2"
                  >
                    <Rocket className="h-4 w-4" />
                    Publicar curso
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right: preview panel */}
        {preview}
      </div>
    </div>
  );
}
