import { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface StepCardProps {
  stepNumber: number;
  title: string;
  description?: string;
  completed?: boolean;
  children: ReactNode;
  className?: string;
}

export function StepCard({ stepNumber, title, description, completed, children, className }: StepCardProps) {
  return (
    <div className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)}>
      <div className="flex items-center gap-3 p-5 pb-3">
        <span
          className={cn(
            "flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold shrink-0 transition-colors",
            completed
              ? "bg-green-600 text-white"
              : "bg-primary text-primary-foreground"
          )}
        >
          {completed ? <Check className="h-3.5 w-3.5" /> : stepNumber}
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-bold leading-tight">{title}</h3>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
      </div>
      <div className="px-5 pb-5 pt-1">{children}</div>
    </div>
  );
}
