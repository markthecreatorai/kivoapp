import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { ctaTextColor } from "@/lib/storefront-tokens";
import type { StorefrontTheme } from "@/pages/StorefrontEditor";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

// ─── Google Fonts ─────────────────────────────────────────────────────────────
if (typeof document !== "undefined" && !document.getElementById("kivo-fonts-link")) {
  const link = document.createElement("link");
  link.id = "kivo-fonts-link";
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&family=Poppins:wght@400;600;700&family=Noto+Serif+Display:ital,wght@0,400;0,600;1,400&family=Inter:wght@400;600;700&family=Fraunces:ital,wght@0,400;0,700;1,700&family=Urbanist:wght@400;600;700&family=Libre+Baskerville:wght@400;700&family=Montserrat:wght@400;600;700&family=Playfair+Display:wght@400;600;700&display=swap";
  document.head.appendChild(link);
}

// ─── Template definitions ────────────────────────────────────────────────────
// All templates share the SAME structural layout. Only skin varies.
const TEMPLATES = [
  { key: "noir",       name: "Noir",           font: "Plus Jakarta Sans", primary: "#1a1a1a", secondary: "#ffffff", bg: "#0d0d0d", text: "#f5f5f5", cardBg: "#1e1e1e" },
  { key: "terra",      name: "Terra",          font: "Noto Serif Display", primary: "#A07850", secondary: "#ffffff", bg: "#fdf8f3", text: "#2d1f0e", cardBg: "#f0e8dc" },
  { key: "petala",     name: "Pétala",         font: "Poppins",           primary: "#E8869A", secondary: "#B8D4F0", bg: "#fff0f4", text: "#4a1530", cardBg: "#ffe4ed" },
  { key: "moderno",    name: "Moderno",        font: "Poppins",           primary: "#5C4EFF", secondary: "#ffffff", bg: "#ffffff", text: "#111111", cardBg: "#f4f2ff" },
  { key: "classic",    name: "Kivo Classic",   font: "Plus Jakarta Sans", primary: "#1A9E5A", secondary: "#ffffff", bg: "#f8fffe", text: "#0a2e1a", cardBg: "#e6f7ef" },
  { key: "coaching",   name: "Coaching",       font: "Libre Baskerville", primary: "#FF2D6B", secondary: "#FFD6E3", bg: "#fff5f8", text: "#1a0010", cardBg: "#ffe0eb" },
  { key: "eclipse",    name: "Eclipse",        font: "Urbanist",          primary: "#7B2FFF", secondary: "#D4B0FF", bg: "#12002e", text: "#f0e8ff", cardBg: "#1e0050" },
  { key: "spotlight",  name: "Spotlight",      font: "Fraunces",          primary: "#4A40FF", secondary: "#FFF5E6", bg: "#0a0820", text: "#f5f0ff", cardBg: "#161230" },
  { key: "material",   name: "Material",       font: "Plus Jakarta Sans", primary: "#FF3D8A", secondary: "#FFB5D0", bg: "#ffffff", text: "#1a001a", cardBg: "#ffe4f0" },
  { key: "nightview",  name: "Nightview",      font: "Plus Jakarta Sans", primary: "#00F5C3", secondary: "#0D0D1A", bg: "#0D0D1A", text: "#e0fff8", cardBg: "#131326" },
  { key: "minima",     name: "Minima",         font: "Inter",             primary: "#3B50FF", secondary: "#ffffff", bg: "#ffffff", text: "#111111", cardBg: "#f0f2ff" },
] as const;

type Template = typeof TEMPLATES[number];

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

const BUTTON_STYLES = [
  { value: "rounded", label: "Arredondado", radius: "8px" },
  { value: "pill", label: "Pílula", radius: "9999px" },
  { value: "square", label: "Quadrado", radius: "0px" },
];

const COLOR_PRESETS = [
  "#F9423A", "#6366f1", "#0284C7", "#059669",
  "#f59e0b", "#9333ea", "#0f172a", "#ffffff",
  "#ec4899", "#14b8a6", "#FF2D6B", "#00F5C3",
];

const MOCK_AVATAR = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=128&h=128&q=80";

// ─── Unified Template Preview Card ───────────────────────────────────────────
// All templates share the exact same layout structure: avatar → name → bio → social → product card → link.
// Only colors/fonts/radius change (skin).
function ThemeCard({ template: t }: { template: Template }) {
  const btnRadius = "6px"; // always rounded in mini preview
  const ctaText = ctaTextColor(t.primary);

  return (
    <div className="w-full h-full flex flex-col overflow-hidden" style={{ backgroundColor: t.bg }}>
      {/* Header: centered avatar + name + bio */}
      <div className="flex flex-col items-center px-3 pt-5 shrink-0">
        <div className="w-12 h-12 rounded-full mb-1.5 shrink-0 shadow-md ring-2 ring-white/80 overflow-hidden">
          <img src={MOCK_AVATAR} className="w-full h-full object-cover" alt="" />
        </div>
        <div className="text-[10px] font-bold text-center leading-tight" style={{ color: t.text, fontFamily: t.font }}>
          Lucas Carrijo
        </div>
        <div className="text-[6.5px] mt-0.5 opacity-60 text-center" style={{ color: t.text }}>
          Creator & Entrepreneur
        </div>
        {/* Social icons placeholder */}
        <div className="flex gap-1 mt-1.5 mb-2.5">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: t.text + '12' }}>
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t.text, opacity: 0.35 }} />
            </div>
          ))}
        </div>
      </div>

      {/* Product card */}
      <div className="px-3 flex-1 overflow-hidden flex flex-col gap-1.5">
        <div className="w-full rounded-lg overflow-hidden border" style={{ borderColor: t.text + '15' }}>
          <div className="w-full h-[38px]" style={{ backgroundColor: t.cardBg }} />
          <div className="p-1.5">
            <div className="w-16 h-1 rounded-full mb-0.5" style={{ backgroundColor: t.text, opacity: 0.3 }} />
            <div className="w-10 h-0.5 rounded-full mb-1.5" style={{ backgroundColor: t.text, opacity: 0.15 }} />
            <div
              className="w-full h-[18px] rounded flex items-center justify-center"
              style={{ backgroundColor: t.primary, borderRadius: btnRadius }}
            >
              <span className="text-[5.5px] font-bold" style={{ color: ctaText }}>Ver produto</span>
            </div>
          </div>
        </div>

        {/* Link block */}
        <div className="w-full rounded-lg py-1.5 border text-center" style={{ borderColor: t.primary }}>
          <span className="text-[6px] font-medium" style={{ color: t.text }}>Link externo</span>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center py-1.5">
        <span className="text-[4.5px] opacity-30" style={{ color: t.text }}>Feito com ❤️ na Kivo</span>
      </div>
    </div>
  );
}

// ─── Color Swatch Picker ──────────────────────────────────────────────────────
function ColorSwatchPicker({ label, value, onChange }: { label: string; value: string; onChange: (c: string) => void }) {
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
      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
      <button
        ref={btnRef}
        onClick={() => setOpen(v => !v)}
        className={cn(
          "w-11 h-11 rounded-xl border-2 transition-all shadow-sm hover:scale-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2",
          open ? "border-primary ring-2 ring-primary/20" : "border-border"
        )}
        style={{ backgroundColor: value }}
        aria-label={label}
      />
      {open && (
        <div ref={popRef} className="absolute top-[calc(100%+8px)] left-0 z-50 w-[232px] bg-popover border border-border shadow-2xl rounded-2xl p-4 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-foreground">{label}</span>
            <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <label className="block w-full h-24 rounded-xl overflow-hidden cursor-pointer border border-border mb-3 relative shadow-sm">
            <input type="color" value={value} onChange={e => commit(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
            <div className="w-full h-full" style={{ backgroundColor: value }} />
            <div className="absolute bottom-2 right-2 bg-black/30 backdrop-blur-sm text-white text-[10px] font-mono px-2 py-0.5 rounded-md pointer-events-none">{value.toUpperCase()}</div>
          </label>
          <div className="grid grid-cols-6 gap-1.5 mb-3">
            {COLOR_PRESETS.map(c => (
              <button key={c} onClick={() => commit(c)} className={cn("w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-primary/40 shadow-sm", value.toLowerCase() === c.toLowerCase() ? "border-primary ring-2 ring-primary/40 scale-110" : "border-white/80")} style={{ backgroundColor: c }} />
            ))}
          </div>
          <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2">
            <div className="w-4 h-4 rounded-md border border-border shrink-0" style={{ backgroundColor: value }} />
            <span className="text-muted-foreground text-xs font-mono">#</span>
            <input type="text" value={hex.replace("#", "").toUpperCase()} onChange={e => { const raw = `#${e.target.value}`; setHex(raw); if (/^#[0-9A-Fa-f]{6}$/.test(raw)) onChange(raw); }} maxLength={6} className="flex-1 bg-transparent text-xs font-mono text-foreground focus:outline-none uppercase" placeholder="000000" spellCheck={false} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Font Dropdown ────────────────────────────────────────────────────────────
function FontDropdown({ value, onChange }: { value: string; onChange: (f: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="flex flex-col gap-1.5 relative flex-1" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between px-3 py-0 rounded-xl border border-border bg-background hover:bg-muted/50 transition-all focus-visible:ring-2 focus-visible:ring-primary/30 shadow-sm text-left h-11"
      >
        <span className="text-[13px] font-semibold text-foreground truncate" style={{ fontFamily: value }}>{value}</span>
        <ChevronRight className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform", open && "rotate-90")} />
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-popover border border-border shadow-2xl rounded-2xl z-50 p-1.5 animate-in fade-in slide-in-from-top-2 max-h-60 overflow-y-auto">
          {FONTS.map(font => (
            <button key={font.value} onClick={() => { onChange(font.value); setOpen(false); }} className={cn("w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors hover:bg-muted", value === font.value && "bg-primary/5")}>
              <span className="text-sm font-semibold text-foreground" style={{ fontFamily: font.value }}>{font.label}</span>
              {value === font.value && <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 ml-2" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Flat Coverflow Slider ────────────────────────────────────────────────────
function CoverflowSlider({ selectedKey, onSelect }: { selectedKey: string; onSelect: (key: string) => void }) {
  const currentIndex = Math.max(0, TEMPLATES.findIndex(t => t.key === selectedKey));
  const isNavigating = useRef(false);

  const goTo = useCallback((index: number) => {
    if (isNavigating.current) return;
    isNavigating.current = true;
    const n = TEMPLATES.length;
    const bounded = ((index % n) + n) % n;
    onSelect(TEMPLATES[bounded].key);
    setTimeout(() => { isNavigating.current = false; }, 420);
  }, [onSelect]);

  const CARD_SPACING = 152;

  return (
    <div className="flex flex-col items-center select-none" style={{ overflow: "visible" }}>
      <div
        className="relative w-full"
        style={{
          height: 370,
          overflow: "hidden",
          maskImage: "linear-gradient(to right, transparent, black 12%, black 88%, transparent), linear-gradient(to bottom, transparent, black 8%, black 92%, transparent)",
          maskComposite: "intersect",
          WebkitMaskImage: "linear-gradient(to right, transparent, black 12%, black 88%, transparent), linear-gradient(to bottom, transparent, black 8%, black 92%, transparent)",
          WebkitMaskComposite: "source-in" as any,
        }}
      >
        {TEMPLATES.map((template, index) => {
          let offset = index - currentIndex;
          const n = TEMPLATES.length;
          if (offset > n / 2) offset -= n;
          if (offset < -n / 2) offset += n;
          const abs = Math.abs(offset);
          if (abs > 3) return null;

          const isCenter = offset === 0;
          const scale = isCenter ? 1.07 : Math.max(0.64, 1 - abs * 0.135);
          const opacity = isCenter ? 1 : Math.max(0.18, 1 - abs * 0.28);
          const zIndex = 10 - abs;

          return (
            <button
              key={template.key}
              onClick={() => !isCenter && goTo(index)}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: `translate(calc(-50% + ${offset * CARD_SPACING}px), -50%) scale(${scale})`,
                opacity,
                zIndex,
                transition: "transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.4s ease",
              }}
              className={cn(
                "rounded-[22px] overflow-hidden focus-visible:ring-2 focus-visible:ring-primary/40 border-0",
                isCenter
                  ? "cursor-default shadow-[0_24px_60px_rgba(0,0,0,0.22)]"
                  : "cursor-pointer shadow-[0_10px_30px_rgba(0,0,0,0.10)] hover:opacity-90"
              )}
            >
              <div style={{ width: 190, height: 330 }}>
                <ThemeCard template={template} />
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-5 mt-3">
        <button
          onClick={() => goTo(currentIndex - 1)}
          className="p-1.5 text-muted-foreground hover:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-primary/30 rounded-lg"
          aria-label="Tema anterior"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-base font-semibold text-foreground min-w-[150px] text-center">
          {TEMPLATES[currentIndex].name}
        </span>
        <button
          onClick={() => goTo(currentIndex + 1)}
          className="p-1.5 text-muted-foreground hover:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-primary/30 rounded-lg"
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
    template_key: theme?.template_key || "noir",
    primary_color: theme?.primary_color || "#1a1a1a",
    secondary_color: theme?.secondary_color || "#ffffff",
    background_color: theme?.background_color || "#0d0d0d",
    text_color: theme?.text_color || "#f5f5f5",
    font_heading: theme?.font_heading || "Plus Jakarta Sans",
    font_body: theme?.font_body || "Plus Jakarta Sans",
    button_style: theme?.button_style || "rounded",
  });

  useEffect(() => {
    if (!theme) return;
    setCurrentTheme(prev => {
      const next = {
        template_key: theme.template_key || "noir",
        primary_color: theme.primary_color || "#1a1a1a",
        secondary_color: theme.secondary_color || "#ffffff",
        background_color: theme.background_color || "#0d0d0d",
        text_color: theme.text_color || "#f5f5f5",
        font_heading: theme.font_heading || "Plus Jakarta Sans",
        font_body: theme.font_body || "Plus Jakarta Sans",
        button_style: theme.button_style || "rounded",
      };
      const keys = Object.keys(next) as (keyof typeof next)[];
      const changed = keys.some(k => prev[k] !== next[k]);
      return changed ? next : prev;
    });
  }, [theme]);

  const handleChange = (field: keyof StorefrontTheme, value: string) => {
    const updated = { ...currentTheme, [field]: value };
    setCurrentTheme(updated);
    onUpdate(updated);
  };

  const handleTemplateSelect = useCallback((templateKey: string) => {
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
  }, [currentTheme, onUpdate]);

  const handleFontChange = (font: string) => {
    handleChange("font_body", font);
    handleChange("font_heading", font);
  };

  return (
    <div className="pb-20">

      {/* 1. Template Slider */}
      <div className="mb-10">
        <CoverflowSlider
          selectedKey={currentTheme.template_key || "noir"}
          onSelect={handleTemplateSelect}
        />
      </div>

      {/* 2. Cores + Fonte */}
      <div className="flex items-start gap-6 px-1">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-foreground">Cores</span>
          <div className="flex flex-wrap items-center gap-3">
            <ColorSwatchPicker
              label="Primária"
              value={currentTheme.primary_color || "#1a1a1a"}
              onChange={c => handleChange("primary_color", c)}
            />
            <ColorSwatchPicker
              label="Fundo"
              value={currentTheme.background_color || "#0d0d0d"}
              onChange={c => handleChange("background_color", c)}
            />
            <ColorSwatchPicker
              label="Texto"
              value={currentTheme.text_color || "#1a1a1a"}
              onChange={c => handleChange("text_color", c)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5 flex-1">
          <span className="text-[13px] font-semibold text-foreground">Fonte</span>
          <FontDropdown
            value={currentTheme.font_body || "Plus Jakarta Sans"}
            onChange={handleFontChange}
          />
        </div>
      </div>

      {/* 3. Estilo de Botão */}
      <div className="mt-8 px-1">
        <span className="text-[13px] font-semibold text-foreground block mb-3">Estilo do Botão</span>
        <div className="grid grid-cols-3 gap-3">
          {BUTTON_STYLES.map(style => {
            const sel = currentTheme.button_style === style.value;
            const btnTextColor = ctaTextColor(currentTheme.primary_color || "#1a1a1a");
            return (
              <button
                key={style.value}
                onClick={() => handleChange("button_style", style.value)}
                className={cn(
                  "py-4 rounded-xl border-2 bg-card flex flex-col items-center gap-3 transition-all focus-visible:ring-2 focus-visible:ring-primary/30",
                  sel ? "border-primary shadow-[0_0_0_3px_rgba(249,66,58,0.09)]" : "border-border hover:border-muted-foreground/30 hover:bg-muted/30"
                )}
              >
                <div
                  className="w-[calc(100%-20px)] h-8 flex items-center justify-center text-[11px] font-bold shadow-sm transition-all min-h-[32px]"
                  style={{ backgroundColor: currentTheme.primary_color || "#1a1a1a", borderRadius: style.radius, color: btnTextColor }}
                >
                  Comprar
                </div>
                <span className={cn("text-[11px] font-semibold", sel ? "text-primary" : "text-muted-foreground")}>{style.label}</span>
              </button>
            );
          })}
        </div>
      </div>

    </div>
  );
}
