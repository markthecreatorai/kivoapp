import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { format, subDays, startOfMonth, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";

const periods: Array<{ label: string; value: number | "month" | "custom"; shortLabel?: string }> = [
  { label: "Hoje", value: 1 },
  { label: "7 dias", value: 7 },
  { label: "14 dias", value: 14 },
  { label: "30 dias", value: 30 },
  { label: "90 dias", value: 90 },
];

interface PeriodFilterProps {
  selectedPeriod: number | "custom";
  onPeriodChange: (period: number | "custom") => void;
  customRange?: { from: Date; to: Date } | null;
  onCustomRangeChange?: (range: { from: Date; to: Date }) => void;
}

export function PeriodFilter({
  selectedPeriod,
  onPeriodChange,
  customRange,
  onCustomRangeChange,
}: PeriodFilterProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(
    customRange ? { from: customRange.from, to: customRange.to } : undefined
  );

  const handleRangeSelect = (range: DateRange | undefined) => {
    setDateRange(range);
    if (range?.from && range?.to) {
      onCustomRangeChange?.({ from: range.from, to: range.to });
      onPeriodChange("custom");
      setCalendarOpen(false);
    }
  };

  const customLabel = customRange
    ? `${format(customRange.from, "d MMM", { locale: ptBR })} – ${format(customRange.to, "d MMM, yyyy", { locale: ptBR })}`
    : "Personalizado";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {periods.map((period) => {
        const isActive = selectedPeriod === period.value;
        return (
          <button
            key={period.label}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
              isActive
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-background text-muted-foreground border-border/60 hover:border-border hover:text-foreground hover:bg-muted/50"
            )}
            onClick={() => onPeriodChange(period.value as number)}
          >
            {period.label}
          </button>
        );
      })}

      {/* Custom Range Picker */}
      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium transition-all border inline-flex items-center gap-1.5",
              selectedPeriod === "custom"
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-background text-muted-foreground border-border/60 hover:border-border hover:text-foreground hover:bg-muted/50"
            )}
          >
            <CalendarIcon className="h-3 w-3" />
            {selectedPeriod === "custom" ? customLabel : "Personalizado"}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="p-3 border-b border-border">
            <p className="text-sm font-medium text-foreground">Selecionar período</p>
            {dateRange?.from && (
              <p className="text-xs text-muted-foreground mt-1">
                {format(dateRange.from, "d MMM yyyy", { locale: ptBR })}
                {dateRange.to && ` – ${format(dateRange.to, "d MMM yyyy", { locale: ptBR })}`}
              </p>
            )}
          </div>
          <Calendar
            mode="range"
            selected={dateRange}
            onSelect={handleRangeSelect}
            numberOfMonths={1}
            disabled={(date) => date > new Date()}
            defaultMonth={dateRange?.from || subDays(new Date(), 30)}
            className={cn("p-3 pointer-events-auto")}
            locale={ptBR}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
