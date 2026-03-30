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
        "snap-center flex-shrink-0 rounded-[22px] p-2 transition-all duration-300 relative text-left group focus:outline-none",
        "w-[140px]",
        isSelected
          ? "bg-primary/8 ring-2 ring-primary ring-offset-2 ring-offset-background shadow-xl scale-[1.02]"
          : "hover:scale-[1.04] hover:shadow-lg"
      )}
    >
      {/* Mini phone shell */}
      <div
        className="w-full rounded-[18px] overflow-hidden shadow-lg border-2 flex flex-col"
        style={{ 
          backgroundColor: bg, 
          height: 240,
          borderColor: isSelected ? 'rgba(249, 66, 58, 0.2)' : 'rgba(0, 0, 0, 0.06)'
        }}
      >
        {/* Notch */}
        <div className="flex justify-center pt-2 pb-1.5 flex-shrink-0">
          <div className="w-12 h-1.5 bg-black/40 rounded-full" />
        </div>

        {/* Scrollable area */}
        <div className="flex-1 flex flex-col items-center px-2.5 pb-2.5 overflow-hidden">
          {/* Avatar */}
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[11px] font-bold mt-1.5 mb-1.5 shrink-0 shadow-md"
            style={{ backgroundColor: primary }}
          >
            K
          </div>

          {/* Name */}
          <div
            className="text-[8px] font-bold leading-none mb-1 truncate w-full text-center"
            style={{ color: text }}
          >
            Lucas Carrijo
          </div>

          {/* Bio */}
          <div
            className="text-[6.5px] leading-tight mb-2.5 opacity-60 text-center line-clamp-1"
            style={{ color: text }}
          >
            Creator & entrepreneur
          </div>

          {/* Social icons row */}
          <div className="flex gap-1.5 mb-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-4 h-4 rounded-full opacity-30"
                style={{ backgroundColor: text }}
              />
            ))}
          </div>

          {/* Product card 1 */}
          <div
            className="w-full rounded-[6px] mb-2 overflow-hidden shadow-md"
            style={{ backgroundColor: template.cardBg }}
          >
            <div className="w-full h-7 opacity-30" style={{ backgroundColor: primary }} />
            <div className="px-2 py-1.5">
              <div className="w-12 h-1.5 rounded-full mb-1.5" style={{ backgroundColor: text, opacity: 0.6 }} />
              <div
                className="w-full h-4 rounded-[4px] flex items-center justify-center"
                style={{ backgroundColor: primary }}
              >
                <span className="text-white text-[5px] font-bold">Comprar</span>
              </div>
            </div>
          </div>

          {/* Product card 2 */}
          <div
            className="w-full rounded-[6px] overflow-hidden shadow-md"
            style={{ backgroundColor: template.cardBg }}
          >
            <div className="px-2 py-1.5 flex items-center gap-1.5">
              <div className="w-5 h-6 rounded-sm flex-shrink-0" style={{ backgroundColor: primary, opacity: 0.4 }} />
              <div className="flex-1">
                <div className="w-10 h-1 rounded-full" style={{ backgroundColor: text, opacity: 0.5 }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Template name label */}
      <div className="flex items-center justify-between mt-3 px-1">
        <span
          className={cn(
            "text-[12px] font-bold",
            isSelected ? "text-primary" : "text-[#111827]"
          )}
        >
          {template.name}
        </span>
        {isSelected && (
          <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-md">
            <Check className="w-3 h-3 text-white" />
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
    <div className="flex flex-col gap-2 relative">
      <span className="text-[11px] font-bold text-[#6b7280] uppercase tracking-wider">{label}</span>

      {/* Swatch button */}
      <button
        ref={anchorRef}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full h-16 rounded-[16px] border-2 transition-all shadow-sm hover:scale-[1.02] active:scale-[0.98] focus:outline-none",
          open ? "border-primary ring-2 ring-primary/30 shadow-md" : "border-transparent hover:border-[#ececec]"
        )}
        style={{ backgroundColor: value }}
        aria-label={`Editar cor ${label}`}
      />

      {/* HEX label below */}
      <span className="text-[11px] font-mono text-[#9ca3af] text-center font-semibold">{value.toUpperCase()}</span>

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
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-bold text-[#111827]">Escolha um estilo</h3>
            <p className="text-[12px] text-[#6b7280] mt-1">
              Ponto de partida visual da sua loja
            </p>
          </div>
          {/* Gallery navigation */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => scrollGallery('left')}
              className="w-8 h-8 rounded-full bg-[#f3f4f6] hover:bg-[#e5e7eb] flex items-center justify-center text-[#6b7280] hover:text-[#111827] transition-all shadow-sm"
              aria-label="Anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => scrollGallery('right')}
              className="w-8 h-8 rounded-full bg-[#f3f4f6] hover:bg-[#e5e7eb] flex items-center justify-center text-[#6b7280] hover:text-[#111827] transition-all shadow-sm"
              aria-label="Próximo"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div
          ref={galleryRef}
          className="flex gap-4 overflow-x-auto pb-4 snap-x pr-2 no-scrollbar scroll-smooth"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
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
        <div className="mb-5">
          <h3 className="text-[14px] font-bold text-[#111827]">Cores</h3>
          <p className="text-[12px] text-[#6b7280] mt-1">
            Clique para personalizar cada cor do tema
          </p>
        </div>

        <div className="grid grid-cols-3 gap-5">
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
        <div className="mb-5">
          <h3 className="text-[14px] font-bold text-[#111827]">Tipografia</h3>
          <p className="text-[12px] text-[#6b7280] mt-1">
            A fonte que representa a sua voz
          </p>
        </div>

        <div className="relative">
          <button
            className="w-full flex items-center justify-between p-5 rounded-[18px] border border-[#ececec] bg-white hover:bg-[#fafafa] transition-all focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-sm"
            onClick={() => setFontDropdownOpen(!fontDropdownOpen)}
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-[12px] bg-[#f3f4f6] flex items-center justify-center text-[#6b7280] flex-shrink-0">
                <Type className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="text-[10px] text-[#9ca3af] font-semibold uppercase tracking-wider mb-1">Fonte principal</p>
                <p
                  className="text-[20px] font-bold leading-tight text-[#111827]"
                  style={{ fontFamily: currentTheme.font_body }}
                >
                  Lucas Carrijo
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="text-[12px] text-[#6b7280] font-semibold">{currentTheme.font_body}</span>
              <ChevronDown
                className={cn("w-4 h-4 text-[#9ca3af] transition-transform", fontDropdownOpen && "rotate-180")}
              />
            </div>
          </button>

          {fontDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-2 p-2 bg-white border border-[#ececec] shadow-2xl rounded-[18px] z-50 animate-in fade-in slide-in-from-top-2">
              {FONTS.map(font => (
                <button
                  key={font.value}
                  onClick={() => {
                    handleChange('font_body', font.value);
                    handleChange('font_heading', font.value);
                    setFontDropdownOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-3.5 rounded-[14px] hover:bg-[#f3f4f6] text-left transition-colors group",
                    currentTheme.font_body === font.value && "bg-primary/5 text-primary"
                  )}
                >
                  <span
                    className="text-[22px] font-bold leading-tight text-[#111827]"
                    style={{ fontFamily: font.value }}
                  >
                    Lucas Carrijo
                  </span>
                  <div className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        "text-[12px] font-semibold",
                        currentTheme.font_body === font.value ? "text-primary" : "text-[#6b7280]"
                      )}
                    >
                      {font.label}
                    </span>
                    {currentTheme.font_body === font.value && (
                      <Check className="w-4 h-4 text-primary" />
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
        <div className="mb-5">
          <h3 className="text-[14px] font-bold text-[#111827]">Estilo dos Botões</h3>
          <p className="text-[12px] text-[#6b7280] mt-1">
            O formato dos seus elementos de ação
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {BUTTON_STYLES.map((style) => {
            const isSelected = currentTheme.button_style === style.value;
            return (
              <button
                key={style.value}
                onClick={() => handleChange('button_style', style.value)}
                className={cn(
                  "p-5 rounded-[18px] border-2 bg-white flex flex-col items-center justify-center gap-4 transition-all focus:outline-none hover:shadow-md",
                  isSelected
                    ? "border-primary shadow-[0_0_0_4px_rgba(249,66,58,0.12)] bg-primary/5"
                    : "border-[#ececec] hover:border-[#d4d4d4] hover:bg-[#fafafa]"
                )}
              >
                {/* Button preview */}
                <div
                  className="w-full h-10 flex items-center justify-center text-[12px] font-bold text-white transition-all shadow-sm"
                  style={{
                    backgroundColor: currentTheme.primary_color || '#F9423A',
                    borderRadius: style.radius
                  }}
                >
                  Comprar
                </div>
                <span
                  className={cn(
                    "text-[12px] font-bold",
                    isSelected ? "text-primary" : "text-[#6b7280]"
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
