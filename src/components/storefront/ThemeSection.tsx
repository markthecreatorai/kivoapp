import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { StorefrontTheme } from "@/pages/StorefrontEditor";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Type, X } from "lucide-react";

// ─── Template definitions ─────────────────────────────────────────────────────

const TEMPLATES = [
  {
    key: 'minimal',
    name: 'Minimal',
    colors: ['#ffffff', '#F9423A', '#1a1a1a'],       // [bg, primary, text]
    cardBg: '#f5f5f5',
    accent: '#F9423A',
  },
  {
    key: 'dark',
    name: 'Dark',
    colors: ['#111827', '#6366f1', '#ffffff'],
    cardBg: '#1f2937',
    accent: '#6366f1',
  },
  {
    key: 'coral',
    name: 'Coral',
    colors: ['#FFF5F5', '#F9423A', '#1a1a1a'],
    cardBg: '#ffe4e4',
    accent: '#F9423A',
  },
  {
    key: 'ocean',
    name: 'Ocean',
    colors: ['#E0F2FE', '#0284C7', '#0c4a6e'],
    cardBg: '#bae6fd',
    accent: '#0284C7',
  },
  {
    key: 'forest',
    name: 'Forest',
    colors: ['#ECFDF5', '#059669', '#064e3b'],
    cardBg: '#a7f3d0',
    accent: '#059669',
  },
  {
    key: 'sunset',
    name: 'Sunset',
    colors: ['#fffbeb', '#f59e0b', '#78350f'],
    cardBg: '#fde68a',
    accent: '#f59e0b',
  },
  {
    key: 'lavender',
    name: 'Lavender',
    colors: ['#faf5ff', '#9333ea', '#3b0764'],
    cardBg: '#e9d5ff',
    accent: '#9333ea',
  },
  {
    key: 'slate',
    name: 'Slate',
    colors: ['#f8fafc', '#334155', '#0f172a'],
    cardBg: '#e2e8f0',
    accent: '#334155',
  },
];

// ─── Fonts & styles ───────────────────────────────────────────────────────────

const FONTS = [
  { value: 'Inter', label: 'Inter' },
  { value: 'Poppins', label: 'Poppins' },
  { value: 'Space Grotesk', label: 'Space Grotesk' },
  { value: 'DM Sans', label: 'DM Sans' },
];

const BUTTON_STYLES = [
  { value: 'rounded', label: 'Rounded', radius: '8px' },
  { value: 'pill', label: 'Pill', radius: '9999px' },
  { value: 'square', label: 'Square', radius: '0px' },
];

// ─── Preset color palette (Stan-style) ───────────────────────────────────────

const COLOR_PRESETS = [
  '#F9423A', '#6366f1', '#0284C7', '#059669',
  '#f59e0b', '#9333ea', '#0f172a', '#ffffff',
  '#ec4899', '#14b8a6', '#f97316', '#6b7280',
];

// ─── Mini Phone Preview for template gallery ─────────────────────────────────

function MiniPhoneCard({
  template,
  isSelected,
  onClick,
}: {
  template: typeof TEMPLATES[number];
  isSelected: boolean;
  onClick: () => void;
}) {
  const [bg, primary, text] = template.colors;

  return (
    <button
      onClick={onClick}
      className={cn(
        "snap-center flex-shrink-0 rounded-[20px] p-1.5 transition-all duration-300 relative text-left group focus:outline-none",
        "w-[128px]",
        isSelected
          ? "bg-primary/8 ring-2 ring-primary ring-offset-2 ring-offset-background shadow-lg"
          : "hover:scale-[1.03] hover:bg-muted/60"
      )}
    >
      {/* Mini phone shell */}
      <div
        className="w-full rounded-[16px] overflow-hidden shadow-md border border-black/8 flex flex-col"
        style={{ backgroundColor: bg, height: 220 }}
      >
        {/* Notch */}
        <div className="flex justify-center pt-1.5 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-black/50 rounded-full" />
        </div>

        {/* Scrollable area */}
        <div className="flex-1 flex flex-col items-center px-2 pb-2 overflow-hidden">
          {/* Avatar */}
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[10px] font-bold mt-1 mb-1 shrink-0 shadow-sm"
            style={{ backgroundColor: primary }}
          >
            K
          </div>

          {/* Name */}
          <div
            className="text-[7.5px] font-bold leading-none mb-0.5 truncate w-full text-center"
            style={{ color: text }}
          >
            Lucas Carrijo
          </div>

          {/* Bio */}
          <div
            className="text-[6px] leading-none mb-2 opacity-60 text-center"
            style={{ color: text }}
          >
            Creator & entrepreneur
          </div>

          {/* Social icons row */}
          <div className="flex gap-1 mb-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-3.5 h-3.5 rounded-full opacity-40"
                style={{ backgroundColor: text }}
              />
            ))}
          </div>

          {/* Product card 1 */}
          <div
            className="w-full rounded-[5px] mb-1.5 overflow-hidden shadow-sm"
            style={{ backgroundColor: template.cardBg }}
          >
            <div className="w-full h-6 opacity-30" style={{ backgroundColor: primary }} />
            <div className="px-1.5 py-1">
              <div className="w-10 h-1 rounded-full mb-1" style={{ backgroundColor: text, opacity: 0.6 }} />
              <div
                className="w-full h-3 rounded-[3px] flex items-center justify-center"
                style={{ backgroundColor: primary }}
              >
                <span className="text-white text-[4px] font-bold">Comprar</span>
              </div>
            </div>
          </div>

          {/* Product card 2 */}
          <div
            className="w-full rounded-[5px] overflow-hidden shadow-sm"
            style={{ backgroundColor: template.cardBg }}
          >
            <div className="px-1.5 py-1 flex items-center gap-1">
              <div className="w-4 h-5 rounded-sm flex-shrink-0" style={{ backgroundColor: primary, opacity: 0.4 }} />
              <div className="flex-1">
                <div className="w-8 h-1 rounded-full" style={{ backgroundColor: text, opacity: 0.5 }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Template name label */}
      <div className="flex items-center justify-between mt-2.5 px-1">
        <span
          className={cn(
            "text-[11px] font-semibold",
            isSelected ? "text-primary" : "text-foreground"
          )}
        >
          {template.name}
        </span>
        {isSelected && (
          <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center shadow-sm">
            <Check className="w-2.5 h-2.5 text-white" />
          </div>
        )}
      </div>
    </button>
  );
}

// ─── Color Swatch with Popover Picker ────────────────────────────────────────

function ColorSwatchPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState(value);
  const popoverRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Sync hex when outer value changes
  useEffect(() => {
    setHex(value);
  }, [value]);

  const handleHexInput = (raw: string) => {
    setHex(raw);
    const normalized = raw.startsWith('#') ? raw : `#${raw}`;
    if (/^#[0-9A-Fa-f]{6}$/.test(normalized)) {
      onChange(normalized);
    }
  };

  const handlePreset = (color: string) => {
    setHex(color);
    onChange(color);
  };

  const handleNativePicker = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHex(e.target.value);
    onChange(e.target.value);
  };

  return (
    <div className="flex flex-col gap-1.5 relative">
      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>

      {/* Swatch button */}
      <button
        ref={anchorRef}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full h-14 rounded-2xl border-2 transition-all shadow-sm hover:scale-[1.04] active:scale-[0.97] focus:outline-none",
          open ? "border-primary ring-2 ring-primary/30" : "border-transparent hover:border-border"
        )}
        style={{ backgroundColor: value }}
        aria-label={`Editar cor ${label}`}
      />

      {/* HEX label below */}
      <span className="text-[10px] font-mono text-muted-foreground text-center">{value.toUpperCase()}</span>

      {/* Popover */}
      {open && (
        <div
          ref={popoverRef}
          className="absolute top-[calc(100%+8px)] left-0 z-50 w-[260px] bg-popover border border-border shadow-2xl rounded-2xl p-4 animate-in fade-in slide-in-from-top-2"
        >
          {/* Close */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-[12px] font-bold text-foreground">{label}</span>
            <button
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Native color picker (big) */}
          <label className="block w-full h-36 rounded-xl overflow-hidden cursor-pointer border border-border mb-3 shadow-sm relative">
            <input
              type="color"
              value={value}
              onChange={handleNativePicker}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div
              className="w-full h-full"
              style={{ backgroundColor: value }}
            />
            <div className="absolute inset-0 flex items-end justify-end p-2 pointer-events-none">
              <div className="bg-black/30 backdrop-blur-sm text-white text-[10px] font-mono px-2 py-0.5 rounded-md">
                {value.toUpperCase()}
              </div>
            </div>
          </label>

          {/* Preset swatches */}
          <div className="grid grid-cols-6 gap-1.5 mb-3">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                onClick={() => handlePreset(c)}
                className={cn(
                  "w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 focus:outline-none shadow-sm",
                  value.toLowerCase() === c.toLowerCase()
                    ? "border-primary ring-2 ring-primary/40 scale-110"
                    : "border-white/60"
                )}
                style={{ backgroundColor: c }}
                title={c.toUpperCase()}
              />
            ))}
          </div>

          {/* HEX input */}
          <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2.5">
            <div
              className="w-5 h-5 rounded-md border border-border flex-shrink-0 shadow-sm"
              style={{ backgroundColor: value }}
            />
            <span className="text-muted-foreground text-[12px] font-mono">#</span>
            <input
              type="text"
              value={hex.replace('#', '').toUpperCase()}
              onChange={(e) => handleHexInput(`#${e.target.value}`)}
              maxLength={6}
              className="flex-1 bg-transparent text-[12px] font-mono text-foreground focus:outline-none uppercase"
              placeholder="0037C4"
              spellCheck={false}
            />
          </div>
        </div>
      )}
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
    template_key: theme?.template_key || 'minimal',
    primary_color: theme?.primary_color || '#F9423A',
    secondary_color: theme?.secondary_color || '#1a1a1a',
    background_color: theme?.background_color || '#ffffff',
    text_color: theme?.text_color || '#1a1a1a',
    font_heading: theme?.font_heading || 'Inter',
    font_body: theme?.font_body || 'Inter',
    button_style: theme?.button_style || 'rounded',
  });

  const [fontDropdownOpen, setFontDropdownOpen] = useState(false);
  const galleryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (theme) {
      setCurrentTheme({
        template_key: theme.template_key || 'minimal',
        primary_color: theme.primary_color || '#F9423A',
        secondary_color: theme.secondary_color || '#1a1a1a',
        background_color: theme.background_color || '#ffffff',
        text_color: theme.text_color || '#1a1a1a',
        font_heading: theme.font_heading || 'Inter',
        font_body: theme.font_body || 'Inter',
        button_style: theme.button_style || 'rounded',
      });
    }
  }, [theme]);

  const handleChange = (field: keyof StorefrontTheme, value: string) => {
    const updated = { ...currentTheme, [field]: value };
    setCurrentTheme(updated);
    onUpdate(updated);
  };

  const handleTemplateSelect = (templateKey: string) => {
    const template = TEMPLATES.find(t => t.key === templateKey);
    if (template) {
      const updated = {
        ...currentTheme,
        template_key: templateKey,
        background_color: template.colors[0],
        primary_color: template.colors[1],
        text_color: template.colors[2],
      };
      setCurrentTheme(updated);
      onUpdate(updated);
    }
  };

  const scrollGallery = (dir: 'left' | 'right') => {
    if (galleryRef.current) {
      galleryRef.current.scrollBy({ left: dir === 'right' ? 160 : -160, behavior: 'smooth' });
    }
  };

  return (
    <div className="space-y-10 pb-24">

      {/* ── 1. Template Gallery ── */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-[13px] font-bold text-foreground">Escolha um estilo</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Ponto de partida visual da sua loja.
            </p>
          </div>
          {/* Gallery navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => scrollGallery('left')}
              className="w-7 h-7 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => scrollGallery('right')}
              className="w-7 h-7 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div
          ref={galleryRef}
          className="flex gap-3 overflow-x-auto pb-3 snap-x pr-2 no-scrollbar scroll-smooth"
        >
          {TEMPLATES.map((template) => (
            <MiniPhoneCard
              key={template.key}
              template={template}
              isSelected={currentTheme.template_key === template.key}
              onClick={() => handleTemplateSelect(template.key)}
            />
          ))}
        </div>
      </section>

      {/* ── 2. Colors ── */}
      <section>
        <div className="mb-4">
          <h3 className="text-[13px] font-bold text-foreground">Cores</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Clique para personalizar cada cor do tema.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <ColorSwatchPicker
            label="Fundo"
            value={currentTheme.background_color || '#ffffff'}
            onChange={(c) => handleChange('background_color', c)}
          />
          <ColorSwatchPicker
            label="Botões"
            value={currentTheme.primary_color || '#F9423A'}
            onChange={(c) => handleChange('primary_color', c)}
          />
          <ColorSwatchPicker
            label="Texto"
            value={currentTheme.text_color || '#1a1a1a'}
            onChange={(c) => handleChange('text_color', c)}
          />
        </div>
      </section>

      {/* ── 3. Typography ── */}
      <section>
        <div className="mb-4">
          <h3 className="text-[13px] font-bold text-foreground">Tipografia</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            A fonte que representa a sua voz.
          </p>
        </div>

        <div className="relative">
          <button
            className="w-full flex items-center justify-between p-4 rounded-2xl border border-border bg-card hover:bg-muted/30 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-sm"
            onClick={() => setFontDropdownOpen(!fontDropdownOpen)}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center text-muted-foreground flex-shrink-0">
                <Type className="w-4 h-4" />
              </div>
              <div className="text-left">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Fonte principal</p>
                <p
                  className="text-[18px] font-bold leading-tight"
                  style={{ fontFamily: currentTheme.font_body }}
                >
                  Lucas Carrijo
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground font-medium">{currentTheme.font_body}</span>
              <ChevronDown
                className={cn("w-4 h-4 text-muted-foreground transition-transform", fontDropdownOpen && "rotate-180")}
              />
            </div>
          </button>

          {fontDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-2 p-2 bg-popover border border-border shadow-2xl rounded-2xl z-50 animate-in fade-in slide-in-from-top-2">
              {FONTS.map(font => (
                <button
                  key={font.value}
                  onClick={() => {
                    handleChange('font_body', font.value);
                    handleChange('font_heading', font.value);
                    setFontDropdownOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-3 rounded-xl hover:bg-muted text-left transition-colors group",
                    currentTheme.font_body === font.value && "bg-primary/5 text-primary"
                  )}
                >
                  <span
                    className="text-[20px] font-bold leading-tight"
                    style={{ fontFamily: font.value }}
                  >
                    Lucas Carrijo
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "text-[11px] font-medium",
                        currentTheme.font_body === font.value ? "text-primary" : "text-muted-foreground"
                      )}
                    >
                      {font.label}
                    </span>
                    {currentTheme.font_body === font.value && (
                      <Check className="w-3.5 h-3.5 text-primary" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── 4. Button Styles ── */}
      <section>
        <div className="mb-4">
          <h3 className="text-[13px] font-bold text-foreground">Estilo dos Botões</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            O formato dos seus elementos de ação.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {BUTTON_STYLES.map((style) => {
            const isSelected = currentTheme.button_style === style.value;
            return (
              <button
                key={style.value}
                onClick={() => handleChange('button_style', style.value)}
                className={cn(
                  "p-4 rounded-2xl border-2 bg-card flex flex-col items-center justify-center gap-3 transition-all focus:outline-none",
                  isSelected
                    ? "border-primary shadow-[0_0_0_4px_rgba(249,66,58,0.12)] bg-primary/5"
                    : "border-border hover:border-border/80 hover:bg-muted/50 hover:shadow-sm"
                )}
              >
                {/* Button preview */}
                <div
                  className="w-full h-9 flex items-center justify-center text-[11px] font-bold text-white transition-all shadow-sm"
                  style={{
                    backgroundColor: currentTheme.primary_color || '#F9423A',
                    borderRadius: style.radius
                  }}
                >
                  Comprar
                </div>
                <span
                  className={cn(
                    "text-[11px] font-semibold",
                    isSelected ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {style.label}
                </span>
              </button>
            );
          })}
        </div>
      </section>

    </div>
  );
}
