import { Zap, Instagram } from "lucide-react";

export default function AutoDM() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <Zap className="h-8 w-8 text-primary" />
      </div>
      <h1 className="text-2xl font-bold text-foreground">AutoDM</h1>
      <p className="max-w-md text-muted-foreground">
        Conecte seu Instagram e automatize mensagens diretas para novos seguidores, comentários e muito mais.
      </p>
      <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
        Em breve
      </span>
    </div>
  );
}
