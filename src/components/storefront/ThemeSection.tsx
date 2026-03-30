import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { StorefrontTheme } from "@/pages/StorefrontEditor";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

// ─── Google Fonts preload ─────────────────────────────────────────────────────
// Inject a <link> for all Stan fonts once
const FONT_LINK_ID = "stan-fonts-link";
if (typeof document !== "undefined" && !document.getElementById(FONT_LINK_ID)) {
  const link = document.createElement("link");
  link.id = FONT_LINK_ID;
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&family=Poppins:wght@400;600;700&family=Noto+Serif+Display:wght@400;600;700&family=Inter:wght@400;600;700&family=Fraunces:wght@400;600;700&family=Urbanist:wght@400;600;700&family=Libre+Baskerville:wght@400;700&family=Montserrat:wght@400;600;700&family=Playfair+Display:wght@400;600;700&display=swap";
  document.head.appendChild(link);
}

// ─── Stan's 11 themes ─────────────────────────────────────────────────────────
const TEMPLATES = [
  {
    key: "stone",
    name: "The Stone",
    font: "Plus Jakarta Sans",
    primary: "#000000",
    secondary: "#ffffff",
    bg: "#0d0d0d",
    text: "#ffffff",
    cardBg: "#1a1a1a",
    // Gradient used in the slider card preview
    gradientFrom: "#1a1a1a",
    gradientTo: "#0d0d0d",
    accentLight: "#333333",
  },
  {
    key: "tyla",
    name: "The Tyla",
    font: "Noto Serif Display",
    primary: "#A07850",
    secondary: "#ffffff",
    bg: "#fdf8f3",
    text: "#2d1f0e",
    cardBg: "#f0e8dc",
    gradientFrom: "#f0e8dc",
    gradientTo: "#fdf8f3",
    accentLight: "#A07850",
  },
  {
    key: "kels",
    name: "The Kels",
    font: "Poppins",
    primary: "#FFB5C5",
    secondary: "#B8D4F0",
    bg: "#fff0f4",
    text: "#4a1530",
    cardBg: "#ffe4ed",
    gradientFrom: "#ffe4ed",
    gradientTo: "#e8f0ff",
    accentLight: "#FFB5C5",
  },
  {
    key: "moderno",
    name: "Moderno",
    font: "Poppins",
    primary: "#5C4EFF",
    secondary: "#ffffff",
    bg: "#ffffff",
    text: "#111111",
    cardBg: "#f4f2ff",
    gradientFrom: "#f4f2ff",
    gradientTo: "#ffffff",
    accentLight: "#5C4EFF",
  },
  {
    key: "classic",
    name: "Stan Classic",
    font: "Plus Jakarta Sans",
    primary: "#1A9E5A",
    secondary: "#ffffff",
    bg: "#f8fffe",
    text: "#0a2e1a",
    cardBg: "#e6f7ef",
    gradientFrom: "#e6f7ef",
    gradientTo: "#f8fffe",
    accentLight: "#1A9E5A",
  },
  {
    key: "coach",
    name: "Coach Trish",
    font: "Libre Baskerville",
    primary: "#FF2D6B",
    secondary: "#FFD6E3",
    bg: "#fff5f8",
    text: "#1a0010",
    cardBg: "#ffe0eb",
    gradientFrom: "#ffe0eb",
    gradientTo: "#fff5f8",
    accentLight: "#FF2D6B",
  },
  {
    key: "eclipse",
    name: "Eclipse",
    font: "Urbanist",
    primary: "#7B2FFF",
    secondary: "#D4B0FF",
    bg: "#12002e",
    text: "#f0e8ff",
    cardBg: "#1e0050",
    gradientFrom: "#1e0050",
    gradientTo: "#12002e",
    accentLight: "#7B2FFF",
  },
  {
    key: "spotlight",
    name: "Spotlight",
    font: "Fraunces",
    primary: "#4A40FF",
    secondary: "#FFF5E6",
    bg: "#0a0820",
    text: "#f5f0ff",
    cardBg: "#161230",
    gradientFrom: "#161230",
    gradientTo: "#0a0820",
    accentLight: "#4A40FF",
  },
  {
    key: "material",
    name: "Material",
    font: "Plus Jakarta Sans",
    primary: "#FF3D8A",
    secondary: "#FFB5D0",
    bg: "#ffffff",
    text: "#1a001a",
    cardBg: "#ffe4f0",
    gradientFrom: "#ffe4f0",
    gradientTo: "#ffffff",
    accentLight: "#FF3D8A",
  },
  {
    key: "nightview",
    name: "Nightview",
    font: "Plus Jakarta Sans",
    primary: "#00F5C3",
    secondary: "#0D0D1A",
    bg: "#0D0D1A",
    text: "#e0fff8",
    cardBg: "#131326",
    gradientFrom: "#131326",
    gradientTo: "#0D0D1A",
    accentLight: "#00F5C3",
  },
  {
    key: "minima",
    name: "Minima",
    font: "Inter",
    primary: "#3B50FF",
    secondary: "#ffffff",
    bg: "#ffffff",
    text: "#111111",
    cardBg: "#f0f2ff",
    gradientFrom: "#f0f2ff",
    gradientTo: "#ffffff",
    accentLight: "#3B50FF",
  },
];

// ─── Available fonts ──────────────────────────────────────────────────────────
const FONTS = [
  { value: "Plus Jakarta Sans", label: "Plus Jakarta Sans" },
  { value: "Poppins", label: "Poppins" },
  { value: "Noto Serif Display", label: "Noto Serif Display" },
  { value: "Inter", label: "Inter" },
  { value: "Fraunces", label: "Fraunces" },
  { value: "Urbanist", label: "Urbanist" },
  { value: "Libre Baskerville", label: "Libre Baskerville" },
  { value: "Montserrat", label: "Montserrat" },
  { value: "Playfair Display", label: "Playfair Display" },
];

// ─── Button Styles ────────────────────────────────────────────────────────────
const BUTTON_STYLES = [
  { value: "rounded", label: "Arredondado", radius: "8px" },
  { value: "pill", label: "Pílula", radius: "9999px" },
  { value: "square", label: "Quadrado", radius: "0px" },
];

// ─── Color presets ────────────────────────────────────────────────────────────
const COLOR_PRESETS = [
  "#F9423A", "#6366f1", "#0284C7", "#059669",
  "#f59e0b", "#9333ea", "#0f172a", "#ffffff",
  "#ec4899", "#14b8a6", "#FF2D6B", "#00F5C3",
];

// ─── Mini phone card for 3D coverflow ────────────────────────────────────────
function ThemeCard({ template }: { template: typeof TEMPLATES[number] }) {
  const isDark = template.bg.startsWith("#0") || template.bg.startsWith("#1") || template.bg.startsWith("#12");
  return (
    <div
      className="w-full h-full flex flex-col overflow-hidden"
      style={{ background: `linear-gradient(160deg, ${template.gradientFrom}, ${template.gradientTo})` }}
    >
      {/* Top notch */}
      <div className="flex justify-center pt-2.5 pb-1.5 flex-shrink-0">
        <div className="w-10 h-1 rounded-full" style={{ background: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)" }} />
      </div>

      {/* Content */}
      <div className="flex flex-col items-center px-3 flex-1 overflow-hidden">
        {/* Avatar */}
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-white text-[13px] font-bold mt-2 mb-2 shrink-0 shadow-lg"
          style={{ backgroundColor: template.primary }}
        >
          LC
        </div>

        {/* Name */}
        <div
          className="text-[10px] font-bold mb-0.5 text-center"
          style={{ color: template.text, fontFamily: template.font }}
        >
          Lucas Carrijo
        </div>
        <div
          className="text-[7.5px] mb-3 opacity-60 text-center"
          style={{ color: template.text }}
        >
          Creator & Entrepreneur
        </div>

        {/* Social dots */}
        <div className="flex gap-1.5 mb-3.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-4 h-4 rounded-full"
              style={{ backgroundColor: template.primary, opacity: 0.7 }}
            />
          ))}
        </div>

        {/* Product card */}
        <div
          className="w-full rounded-lg overflow-hidden mb-2 shadow-md"
          style={{ backgroundColor: template.cardBg }}
        >
          <div
            className="w-full h-8"
            style={{ backgroundColor: template.primary, opacity: 0.35 }}
          />
          <div className="px-2 py-1.5">
            <div className="w-14 h-1.5 rounded-full mb-1.5" style={{ backgroundColor: template.text, opacity: 0.4 }} />
            <div
              className="w-full h-5 rounded-[5px] flex items-center justify-center"
              style={{ backgroundColor: template.primary }}
            >
              <span className="text-white text-[6px] font-bold">Comprar</span>
            </div>
          </div>
        </div>

        {/* Second product — list style */}
        <div
          className="w-full rounded-lg px-2 py-1.5 flex items-center gap-1.5 shadow-md"
          style={{ backgroundColor: template.cardBg }}
        >
          <div
            className="w-5 h-6 rounded-sm flex-shrink-0"
            style={{ backgroundColor: template.primary, opacity: 0.4 }}
          />
          <div className="flex-1">
            <div className="w-10 h-1 rounded-full" style={{ backgroundColor: template.text, opacity: 0.3 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Color Swatch Picker ──────────────────────────────────────────────────────
function ColorSwatchPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (c: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState(value);
  const popRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { setHex(value); }, [value]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        popRef.current && !popRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const commit = (c: string) => { setHex(c); onChange(c); };

  return (
    <div className="flex flex-col gap-1.5 relative">
      <span className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider">{label}</span>
      <button
        ref={btnRef}
        onClick={() => setOpen(v => !v)}
        className={cn(
          "w-12 h-12 rounded-[14px] border-2 transition-all shadow-sm hover:scale-105 active:scale-95 focus:outline-none",
          open ? "border-primary ring-2 ring-primary/20" : "border-[#e5e7eb] hover:border-[#d1d5db]"
        )}
        style={{ backgroundColor: value }}
        aria-label={`Cor: ${label}`}
      />

      {open && (
        <div
          ref={popRef}
          className="absolute top-[calc(100%+8px)] left-0 z-50 w-[240px] bg-white border border-[#e5e7eb] shadow-2xl rounded-2xl p-4 animate-in fade-in slide-in-from-top-2"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[12px] font-bold text-[#111827]">{label}</span>
            <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-[#f3f4f6] text-[#9ca3af] hover:text-[#111827] transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Native color picker */}
          <label className="block w-full h-28 rounded-xl overflow-hidden cursor-pointer border border-[#ececec] mb-3 relative shadow-sm">
            <input
              type="color"
              value={value}
              onChange={e => commit(e.target.value)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div className="w-full h-full" style={{ backgroundColor: value }} />
            <div className="absolute bottom-2 right-2 bg-black/30 backdrop-blur-sm text-white text-[10px] font-mono px-2 py-0.5 rounded-md pointer-events-none">
              {value.toUpperCase()}
            </div>
          </label>

          {/* Presets */}
          <div className="grid grid-cols-6 gap-1.5 mb-3">
            {COLOR_PRESETS.map(c => (
              <button
                key={c}
                onClick={() => commit(c)}
                className={cn(
                  "w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 focus:outline-none",
                  value.toLowerCase() === c.toLowerCase()
                    ? "border-primary ring-2 ring-primary/40 scale-110"
                    : "border-white/80 shadow-sm"
                )}
                style={{ backgroundColor: c }}
                title={c.toUpperCase()}
              />
            ))}
          </div>

          {/* HEX input */}
          <div className="flex items-center gap-2 bg-[#f3f4f6] rounded-xl px-3 py-2">
            <div className="w-4 h-4 rounded-md border border-[#e5e7eb] flex-shrink-0 shadow-sm" style={{ backgroundColor: value }} />
            <span className="text-[#9ca3af] text-[12px] font-mono">#</span>
            <input
              type="text"
              value={hex.replace("#", "").toUpperCase()}
              onChange={e => {
                const raw = `#${e.target.value}`;
                setHex(raw);
                if (/^#[0-9A-Fa-f]{6}$/.test(raw)) onChange(raw);
              }}
              maxLength={6}
              className="flex-1 bg-transparent text-[12px] font-mono text-[#111827] focus:outline-none uppercase"
              placeholder="000000"
              spellCheck={false}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Font Dropdown ────────────────────────────────────────────────────────────
function FontDropdown({
  value,
  onChange,
}: {
  value: string;
  onChange: (f: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="flex flex-col gap-1.5 relative flex-1" ref={ref}>
      <span className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider">Font</span>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between px-3 py-2.5 rounded-[14px] border border-[#e5e7eb] bg-white hover:bg-[#fafafa] transition-all focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-sm text-left h-12"
      >
        <span
          className="text-[14px] font-semibold text-[#111827] truncate"
          style={{ fontFamily: value }}
        >
          {value}
        </span>
        <ChevronRight
          className={cn("w-4 h-4 text-[#9ca3af] flex-shrink-0 transition-transform", open && "rotate-90")}
        />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-[#e5e7eb] shadow-2xl rounded-[18px] z-50 p-1.5 animate-in fade-in slide-in-from-top-2 max-h-72 overflow-y-auto">
          {FONTS.map(font => (
            <button
              key={font.value}
              onClick={() => { onChange(font.value); setOpen(false); }}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2.5 rounded-[12px] text-left transition-colors hover:bg-[#f3f4f6]",
                value === font.value && "bg-primary/5"
              )}
            >
              <span
                className="text-[16px] font-semibold text-[#111827] truncate"
                style={{ fontFamily: font.value }}
              >
                {font.label}
              </span>
              {value === font.value && (
                <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0 ml-2" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 3D Coverflow Slider ──────────────────────────────────────────────────────
function CoverflowSlider({
  selectedKey,
  onSelect,
}: {
  selectedKey: string;
  onSelect: (key: string) => void;
}) {
  const selectedIndex = TEMPLATES.findIndex(t => t.key === selectedKey);
  const currentIndex = selectedIndex >= 0 ? selectedIndex : 0;

  const goTo = useCallback((index: number) => {
    const bounded = ((index % TEMPLATES.length) + TEMPLATES.length) % TEMPLATES.length;
    onSelect(TEMPLATES[bounded].key);
  }, [onSelect]);

  const getCardStyle = (index: number): React.CSSProperties => {
    const diff = index - currentIndex;

    // Wrap-around: pick the shortest path
    const totalItems = TEMPLATES.length;
    let offset = diff;
    if (offset > totalItems / 2) offset -= totalItems;
    if (offset < -totalItems / 2) offset += totalItems;

    const absOffset = Math.abs(offset);

    if (absOffset > 3) {
      return { display: "none" };
    }

    const translateX = offset * 155;
    const translateZ = -Math.min(absOffset * 90, 240);
    const rotateY = offset * 28;
    const scale = offset === 0 ? 1 : Math.max(0.7, 1 - absOffset * 0.12);
    const opacity = offset === 0 ? 1 : Math.max(0.25, 1 - absOffset * 0.32);
    const zIndex = 10 - absOffset;

    return {
      transform: `translateX(${translateX}px) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`,
      opacity,
      zIndex,
      transition: "transform 0.38s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.38s ease, box-shadow 0.38s ease",
      position: "absolute",
    };
  };

  return (
    <div className="flex flex-col items-center select-none">
      {/* 3D Stage */}
      <div
        className="relative flex items-center justify-center"
        style={{
          width: "100%",
          height: 380,
          perspective: "900px",
          perspectiveOrigin: "50% 45%",
        }}
      >
        {TEMPLATES.map((template, index) => {
          const diff = index - currentIndex;
          let offset = diff;
          const totalItems = TEMPLATES.length;
          if (offset > totalItems / 2) offset -= totalItems;
          if (offset < -totalItems / 2) offset += totalItems;
          const absOffset = Math.abs(offset);

          if (absOffset > 3) return null;

          const isCenter = offset === 0;
          const cardStyle = getCardStyle(index);

          return (
            <button
              key={template.key}
              onClick={() => goTo(index)}
              style={cardStyle}
              className={cn(
                "flex-shrink-0 focus:outline-none",
                "rounded-[22px] overflow-hidden",
                isCenter ? "cursor-default shadow-[0_30px_70px_-10px_rgba(0,0,0,0.35)]" : "cursor-pointer shadow-[0_15px_40px_-10px_rgba(0,0,0,0.2)] hover:opacity-80"
              )}
            >
              <div style={{ width: 190, height: 330 }}>
                <ThemeCard template={template} />
              </div>
            </button>
          );
        })}
      </div>

      {/* Theme name + arrows */}
      <div className="flex items-center gap-5 mt-2">
        <button
          onClick={() => goTo(currentIndex - 1)}
          className="p-1.5 text-[#9ca3af] hover:text-[#111827] transition-colors focus:outline-none"
          aria-label="Tema anterior"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <span className="text-[17px] font-semibold text-[#111827] min-w-[140px] text-center">
          {TEMPLATES[currentIndex].name}
        </span>

        <button
          onClick={() => goTo(currentIndex + 1)}
          className="p-1.5 text-[#9ca3af] hover:text-[#111827] transition-colors focus:outline-none"
          aria-label="Próximo tema"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
interface ThemeSectionProps {
  theme: StorefrontTheme | null | undefined;
  storefrontId: string;
  onUpdate: (data: Partial<StorefrontTheme>) => void;
}

export function ThemeSection({ theme, storefrontId, onUpdate }: ThemeSectionProps) {
  const [currentTheme, setCurrentTheme] = useState<Partial<StorefrontTheme>>({
    template_key: theme?.template_key || "stone",
    primary_color: theme?.primary_color || "#000000",
    secondary_color: theme?.secondary_color || "#ffffff",
    background_color: theme?.background_color || "#0d0d0d",
    text_color: theme?.text_color || "#ffffff",
    font_heading: theme?.font_heading || "Plus Jakarta Sans",
    font_body: theme?.font_body || "Plus Jakarta Sans",
    button_style: theme?.button_style || "rounded",
  });

  useEffect(() => {
    if (theme) {
      setCurrentTheme({
        template_key: theme.template_key || "stone",
        primary_color: theme.primary_color || "#000000",
        secondary_color: theme.secondary_color || "#ffffff",
        background_color: theme.background_color || "#0d0d0d",
        text_color: theme.text_color || "#ffffff",
        font_heading: theme.font_heading || "Plus Jakarta Sans",
        font_body: theme.font_body || "Plus Jakarta Sans",
        button_style: theme.button_style || "rounded",
      });
    }
  }, [theme]);

  const handleChange = (field: keyof StorefrontTheme, value: string) => {
    const updated = { ...currentTheme, [field]: value };
    setCurrentTheme(updated);
    onUpdate(updated);
  };

  // When a template is selected from the coverflow, auto-apply its defaults
  const handleTemplateSelect = (templateKey: string) => {
    const tpl = TEMPLATES.find(t => t.key === templateKey);
    if (tpl) {
      const updated = {
        ...currentTheme,
        template_key: templateKey,
        primary_color: tpl.primary,
        secondary_color: tpl.secondary,
        background_color: tpl.bg,
        text_color: tpl.text,
        font_body: tpl.font,
        font_heading: tpl.font,
      };
      setCurrentTheme(updated);
      onUpdate(updated);
    }
  };

  const handleFontChange = (font: string) => {
    handleChange("font_body", font);
    handleChange("font_heading", font);
  };

  return (
    <div className="pb-20">

      {/* ── 1. Coverflow Slider ── */}
      <div className="mb-10">
        <CoverflowSlider
          selectedKey={currentTheme.template_key || "stone"}
          onSelect={handleTemplateSelect}
        />
      </div>

      {/* ── 2. Colors + Font row ── */}
      <div className="flex items-start gap-8 px-1">
        {/* Colors */}
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-[#111827]">Colors</span>
          <div className="flex items-center gap-3">
            <ColorSwatchPicker
              label="Primary"
              value={currentTheme.primary_color || "#000000"}
              onChange={(c) => handleChange("primary_color", c)}
            />
            <ColorSwatchPicker
              label="Background"
              value={currentTheme.background_color || "#ffffff"}
              onChange={(c) => handleChange("background_color", c)}
            />
          </div>
        </div>

        {/* Font */}
        <div className="flex flex-col gap-2 flex-1">
          <span className="text-[13px] font-semibold text-[#111827]">Font</span>
          <FontDropdown
            value={currentTheme.font_body || "Plus Jakarta Sans"}
            onChange={handleFontChange}
          />
        </div>
      </div>

      {/* ── 3. Button Styles ── */}
      <div className="mt-8 px-1">
        <span className="text-[13px] font-semibold text-[#111827] block mb-3">Button Style</span>
        <div className="grid grid-cols-3 gap-3">
          {BUTTON_STYLES.map((style) => {
            const isSelected = currentTheme.button_style === style.value;
            return (
              <button
                key={style.value}
                onClick={() => handleChange("button_style", style.value)}
                className={cn(
                  "py-4 rounded-[16px] border-2 bg-white flex flex-col items-center justify-center gap-3 transition-all focus:outline-none",
                  isSelected
                    ? "border-primary shadow-[0_0_0_3px_rgba(249,66,58,0.10)]"
                    : "border-[#e5e7eb] hover:border-[#d1d5db] hover:bg-[#fafafa]"
                )}
              >
                <div
                  className="w-[calc(100%-20px)] h-8 flex items-center justify-center text-[11px] font-bold text-white shadow-sm"
                  style={{
                    backgroundColor: currentTheme.primary_color || "#000000",
                    borderRadius: style.radius,
                  }}
                >
                  Comprar
                </div>
                <span className={cn("text-[12px] font-semibold", isSelected ? "text-primary" : "text-[#6b7280]")}>
                  {style.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

    </div>
  );
}
