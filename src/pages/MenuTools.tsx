import { useEffect, useMemo, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Pin } from "lucide-react";
import { getMenuToolsState, optionalItems, setMenuToolsState } from "@/lib/menuTools";
import {
  Home, Store, DollarSign, BarChart3, Heart,
  MessagesSquare, CalendarCheck, Users, Tag, UserCheck,
  Mail, Send, Receipt, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type React from "react";

const iconMap: Record<string, React.ElementType> = {
  Home, Store, DollarSign, BarChart3, Heart,
  MessagesSquare, CalendarCheck, Users, Tag, UserCheck,
  Mail, Send, Receipt, FileText,
};

export default function MenuTools() {
  const [toolsState, setToolsState] = useState<Record<string, boolean>>(() => getMenuToolsState());

  useEffect(() => {
    const sync = () => setToolsState(getMenuToolsState());
    window.addEventListener("kivo:menu-tools-updated", sync as EventListener);
    return () => window.removeEventListener("kivo:menu-tools-updated", sync as EventListener);
  }, []);

  const enabledCount = useMemo(
    () => optionalItems.filter((item) => toolsState[item.id] === true).length,
    [toolsState]
  );

  const toggleTool = (id: string, enabled: boolean) => {
    const next = { ...toolsState, [id]: enabled };
    setToolsState(next);
    setMenuToolsState(next);
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6 pb-24 lg:pb-6">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold text-foreground">Mais opções</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Ative ferramentas para fixá-las no menu lateral. {enabledCount} ativa{enabledCount !== 1 ? "s" : ""}.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {optionalItems.map((item) => {
          const Icon = iconMap[item.icon] || Store;
          const active = toolsState[item.id] === true;
          return (
            <div
              key={item.id}
              className={cn(
                "flex items-center gap-4 rounded-xl border p-4 transition-colors",
                active ? "border-primary/30 bg-primary/5" : "border-border/60 bg-card"
              )}
            >
              <div className={cn(
                "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl",
                active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
              )}>
                <Icon className="h-5 w-5" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-semibold text-foreground">{item.title}</p>
                  {active && <Pin className="h-3 w-3 text-primary" />}
                </div>
                <p className="text-xs text-muted-foreground truncate">{item.description}</p>
              </div>

              <Switch
                checked={active}
                onCheckedChange={(enabled) => toggleTool(item.id, enabled)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
