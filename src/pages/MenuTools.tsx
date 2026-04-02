import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Grid3X3 } from "lucide-react";
import { getMenuToolsState, menuToolItems, setMenuToolsState } from "@/lib/menuTools";

export default function MenuTools() {
  const [toolsState, setToolsState] = useState<Record<string, boolean>>(() => getMenuToolsState());

  useEffect(() => {
    const sync = () => setToolsState(getMenuToolsState());
    window.addEventListener("kivo:menu-tools-updated", sync as EventListener);
    return () => window.removeEventListener("kivo:menu-tools-updated", sync as EventListener);
  }, []);

  const enabledCount = useMemo(
    () => menuToolItems.filter((item) => toolsState[item.id] !== false).length,
    [toolsState]
  );

  const toggleTool = (id: string, enabled: boolean) => {
    const next = { ...toolsState, [id]: enabled };
    setToolsState(next);
    setMenuToolsState(next);
  };

  const enableAll = () => {
    const next = Object.fromEntries(menuToolItems.map((item) => [item.id, true]));
    setToolsState(next);
    setMenuToolsState(next);
  };

  return (
    <div className="p-4 md:p-5 max-w-3xl mx-auto space-y-5 pb-24 lg:pb-5">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold text-foreground flex items-center gap-2">
          <Grid3X3 className="h-5 w-5" />
          Ver mais
        </h1>
        <p className="text-sm text-muted-foreground">
          Escolha quais ferramentas devem aparecer no menu lateral. Ativas: {enabledCount}/{menuToolItems.length}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Ferramentas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {menuToolItems.map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.url}</p>
              </div>
              <Switch
                checked={toolsState[item.id] !== false}
                onCheckedChange={(enabled) => toggleTool(item.id, enabled)}
              />
            </div>
          ))}

          <div className="pt-2">
            <Button variant="outline" size="sm" onClick={enableAll}>
              Ativar todas
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
