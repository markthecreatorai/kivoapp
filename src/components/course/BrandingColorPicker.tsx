import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PRESET_COLORS = [
  "#ffffff", "#f8fafc", "#f1f5f9", "#e2e8f0",
  "#0f172a", "#1e293b", "#334155", "#475569",
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899",
];

interface BrandingColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  label: string;
}

export function BrandingColorPicker({ value, onChange, label }: BrandingColorPickerProps) {
  const [hex, setHex] = useState(value);

  const handleHexChange = (v: string) => {
    setHex(v);
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      onChange(v);
    }
  };

  const selectPreset = (c: string) => {
    setHex(c);
    onChange(c);
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => {
            setHex(e.target.value);
            onChange(e.target.value);
          }}
          className="w-9 h-9 rounded-md border border-border cursor-pointer p-0.5"
        />
        <Input
          value={hex}
          onChange={(e) => handleHexChange(e.target.value)}
          placeholder="#000000"
          className="flex-1 font-mono text-xs h-9"
          maxLength={7}
        />
      </div>
      <div className="grid grid-cols-8 gap-1.5">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => selectPreset(c)}
            className={cn(
              "w-full aspect-square rounded-md border transition-all",
              value === c
                ? "ring-2 ring-primary ring-offset-1 border-primary"
                : "border-border hover:scale-110"
            )}
            style={{ backgroundColor: c }}
            title={c}
          />
        ))}
      </div>
    </div>
  );
}
