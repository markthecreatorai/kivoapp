import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
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

// ─── Template definitions (no third-party brand names) ───────────────────────
// layout: 'classic' | 'hero' | 'banner' | 'minimal'
const TEMPLATES = [
  {
    key: "noir",
    name: "Noir",
    font: "Plus Jakarta Sans",
    primary: "#1a1a1a",
    secondary: "#ffffff",
    bg: "#0d0d0d",
    text: "#f5f5f5",
    cardBg: "#1e1e1e",
    layout: "minimal",
  },
  {
    key: "terra",
    name: "Terra",
    font: "Noto Serif Display",
    primary: "#A07850",
    secondary: "#ffffff",
    bg: "#fdf8f3",
    text: "#2d1f0e",
    cardBg: "#f0e8dc",
    layout: "classic",
  },
  {
    key: "petala",
    name: "Pétala",
    font: "Poppins",
    primary: "#E8869A",
    secondary: "#B8D4F0",
    bg: "#fff0f4",
    text: "#4a1530",
    cardBg: "#ffe4ed",
    layout: "hero",
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
    layout: "minimal",
  },
  {
    key: "classic",
    name: "Kivo Classic",
    font: "Plus Jakarta Sans",
    primary: "#1A9E5A",
    secondary: "#ffffff",
    bg: "#f8fffe",
    text: "#0a2e1a",
    cardBg: "#e6f7ef",
    layout: "classic",
  },
  {
    key: "coaching",
    name: "Coaching",
    font: "Libre Baskerville",
    primary: "#FF2D6B",
    secondary: "#FFD6E3",
    bg: "#fff5f8",
    text: "#1a0010",
    cardBg: "#ffe0eb",
    layout: "hero",
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
    layout: "minimal",
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
    layout: "banner",
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
    layout: "classic",
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
    layout: "minimal",
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
    layout: "banner",
  },
] as const;

type Template = typeof TEMPLATES[number];

// ─── Fonts & button styles ────────────────────────────────────────────────────
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
const MOCK_BANNER = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80";

// ─── LAYOUT A: Classic (circular avatar, centered) ────────────────────────────
function ClassicCard({ t }: { t: Template }) {
  return (
    <div className="w-full h-full flex flex-col overflow-hidden relative" style={{ backgroundColor: t.bg }}>
      {/* Notch */}
      <div className="flex justify-center pt-2.5 pb-1 flex-shrink-0 relative z-10">
        <div className="w-10 h-1 rounded-full opacity-20" style={{ backgroundColor: t.text }} />
      </div>
      <div className="flex flex-col items-center px-3 flex-1 overflow-hidden relative z-10">
        {/* Avatar */}
        <div className="w-14 h-14 rounded-full mt-2 mb-2 shrink-0 shadow-md border-2" style={{ borderColor: t.bg }}>
          <img src={MOCK_AVATAR} className="w-full h-full object-cover rounded-full" alt="avatar" />
        </div>
        <div className="text-[11px] font-bold mb-0.5 text-center" style={{ color: t.text, fontFamily: t.font }}>Lucas Carrijo</div>
        <div className="text-[7.5px] mb-3 opacity-60 text-center" style={{ color: t.text }}>Creator & Entrepreneur</div>
        {/* Social dots */}
        <div className="flex gap-2 mb-4">
          {[0, 1, 2].map(i => <div key={i} className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: t.text, opacity: 0.15 }} />)}
        </div>
        {/* Card 1 - full */}
        <div className="w-full rounded-xl overflow-hidden mb-2 shadow-sm border" style={{ backgroundColor: t.cardBg, borderColor: t.primary + '20' }}>
          <div className="w-full h-9 bg-black/5" />
          <div className="px-2.5 py-2">
            <div className="w-16 h-1.5 rounded-full mb-2" style={{ backgroundColor: t.text, opacity: 0.4 }} />
            <div className="w-full h-6 rounded-[6px] flex items-center justify-center transition-all hover:opacity-90" style={{ backgroundColor: t.primary }}>
              <span className="text-white text-[7px] font-bold tracking-wide">COMPRAR AGORA</span>
            </div>
          </div>
        </div>
        {/* Card 2 - list style */}
        <div className="w-full rounded-xl px-2.5 py-2 flex items-center gap-2 shadow-sm border" style={{ backgroundColor: t.cardBg, borderColor: t.primary + '20' }}>
          <div className="w-6 h-7 rounded-[4px] bg-black/5 shrink-0" />
          <div className="flex-1">
            <div className="w-12 h-1.5 rounded-full mb-1" style={{ backgroundColor: t.text, opacity: 0.4 }} />
            <div className="w-8 h-1 rounded-full" style={{ backgroundColor: t.text, opacity: 0.2 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── LAYOUT B: Hero (Top gradient fading into BG, avatar over gradient) ────────
function HeroCard({ t }: { t: Template }) {
  return (
    <div className="w-full h-full flex flex-col overflow-hidden relative" style={{ backgroundColor: t.bg }}>
      {/* Gradient Hero */}
      <div className="absolute top-0 left-0 right-0 h-28" style={{ background: `linear-gradient(to bottom, ${t.primary}ee, ${t.bg})` }} />
      {/* Notch */}
      <div className="flex justify-center pt-2.5 pb-1 flex-shrink-0 relative z-10">
        <div className="w-10 h-1 rounded-full bg-black/10" />
      </div>
      
      <div className="flex flex-col items-center px-3 pt-3 flex-1 overflow-hidden relative z-10">
        {/* Avatar */}
        <div className="w-16 h-16 rounded-full mb-2 shrink-0 shadow-lg border-2" style={{ borderColor: t.bg }}>
          <img src={MOCK_AVATAR} className="w-full h-full object-cover rounded-full" alt="avatar" />
        </div>
        <div className="text-[12px] font-bold mb-0.5 text-center" style={{ color: t.text, fontFamily: t.font }}>Lucas Carrijo</div>
        <div className="text-[8px] mb-3 opacity-60 text-center" style={{ color: t.text }}>I help you build your dream store 🚀</div>
        
        {/* Links */}
        <div className="w-full flex gap-1.5 mb-3">
          <div className="flex-1 rounded-full py-1.5 flex justify-center items-center shadow-sm border text-[6px] font-bold" style={{ borderColor: t.primary + '30', backgroundColor: t.cardBg, color: t.text }}>INSTAGRAM</div>
          <div className="flex-1 rounded-full py-1.5 flex justify-center items-center shadow-sm border text-[6px] font-bold" style={{ borderColor: t.primary + '30', backgroundColor: t.cardBg, color: t.text }}>YOUTUBE</div>
        </div>

        {/* Big visual block */}
        <div className="w-full rounded-[14px] overflow-hidden shadow-sm border" style={{ backgroundColor: t.cardBg, borderColor: t.primary + '20' }}>
          <div className="w-full h-[60px] relative">
            <img src={MOCK_BANNER} className="w-full h-full object-cover" />
            <div className="absolute bottom-2 left-2 text-white font-bold text-[8px] drop-shadow-md">Mentoria Elite</div>
          </div>
          <div className="px-2.5 py-2">
            <div className="w-full h-6 rounded-[8px] flex items-center justify-center transition-all bg-gradient-to-r" style={{ backgroundImage: `linear-gradient(to right, ${t.primary}, ${t.secondary})` }}>
              <span className="text-white text-[7px] font-bold">INSCREVER-SE</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── LAYOUT C: Banner (Full Cover image overlay with white text) ──────────────
function BannerCard({ t }: { t: Template }) {
  return (
    <div className="w-full h-full flex flex-col overflow-hidden relative" style={{ backgroundColor: t.bg }}>
      {/* Banner / Cover */}
      <div className="absolute top-0 left-0 right-0 h-[140px] z-0">
        <img src={MOCK_BANNER} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0820] to-transparent opacity-90" style={{ '--tw-gradient-from': `${t.bg} var(--tw-gradient-from-position)` } as any} />
      </div>

      {/* Notch */}
      <div className="flex justify-center pt-2.5 pb-1 flex-shrink-0 relative z-10">
        <div className="w-10 h-1 rounded-full bg-white/30" />
      </div>

      <div className="flex flex-col px-3 pt-[60px] flex-1 overflow-hidden relative z-10">
        {/* Text over banner */}
        <div className="pb-4">
          <div className="text-[16px] font-bold leading-none mb-1 shadow-sm" style={{ color: '#fff', fontFamily: t.font }}>Lucas Carrijo</div>
          <div className="text-[8px] opacity-80" style={{ color: '#fff' }}>@lucascarrijo</div>
        </div>

        {/* Content list */}
        <div className="flex flex-col gap-2 relative z-20">
          {[1,2].map(i => (
             <div key={i} className="w-full rounded-xl px-2.5 py-2.5 flex items-center gap-2.5 shadow-md border backdrop-blur-md" style={{ backgroundColor: t.cardBg, borderColor: 'rgba(255,255,255,0.05)' }}>
               <div className="w-7 h-7 rounded-lg overflow-hidden shrink-0 bg-black/20">
                 <img src={MOCK_AVATAR} className="w-full h-full object-cover opacity-80" />
               </div>
               <div className="flex-1">
                 <div className="w-16 h-1.5 rounded-full mb-1.5" style={{ backgroundColor: t.text, opacity: 0.8 }} />
                 <div className="w-8 h-1 rounded-full" style={{ backgroundColor: t.text, opacity: 0.4 }} />
               </div>
               <div className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center opacity-80" style={{ backgroundColor: t.primary }}>
                 <svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
               </div>
             </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── LAYOUT D: Minimal (Clean, small inline avatar, refined UI) ───────────────
function MinimalCard({ t }: { t: Template }) {
  return (
    <div className="w-full h-full flex flex-col overflow-hidden relative" style={{ backgroundColor: t.bg }}>
      {/* Notch */}
      <div className="flex justify-center pt-2.5 pb-2 flex-shrink-0 relative z-10">
        <div className="w-10 h-1 rounded-full opacity-10" style={{ backgroundColor: t.text }} />
      </div>
      
      <div className="flex flex-col px-4 pt-1 flex-1 overflow-hidden relative z-10">
        {/* Compact Header */}
        <div className="flex flex-col items-center mb-5">
          <div className="w-10 h-10 rounded-full mb-2 shrink-0 border" style={{ borderColor: t.text + '20' }}>
            <img src={MOCK_AVATAR} className="w-full h-full object-cover rounded-full" />
          </div>
          <div className="text-[12px] font-bold text-center" style={{ color: t.text, fontFamily: t.font }}>Lucas Carrijo</div>
        </div>

        {/* Subtle Links Blocks */}
        <div className="space-y-2">
          <div className="w-full rounded-[10px] px-3 py-2.5 flex items-center justify-between border" style={{ backgroundColor: t.cardBg, borderColor: t.text + '10' }}>
             <div className="text-[7.5px] font-bold" style={{ color: t.text }}>Meus Serviços</div>
             <div className="w-3 h-3 rounded-sm flex items-center justify-center" style={{ backgroundColor: t.text + '10' }}>
               <svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke={t.text} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
             </div>
          </div>
          
          <div className="w-full rounded-[10px] overflow-hidden border" style={{ backgroundColor: t.cardBg, borderColor: t.text + '10' }}>
             <div className="w-full h-[50px] bg-black/5 flex items-center justify-center">
               <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={t.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity={0.3}><circle cx="12" cy="12" r="10"/><path d="m10 8 6 4-6 4Z"/></svg>
             </div>
             <div className="px-3 py-2 flex items-center justify-between">
               <div className="font-bold text-[7.5px]" style={{ color: t.text }}>YouTube Masterclass</div>
               <div className="px-2 py-0.5 rounded-sm text-[5px] font-bold uppercase tracking-wider text-white" style={{ backgroundColor: t.primary }}>Assistir</div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ThemeCard({ template }: { template: Template }) {
  if (template.layout === "hero") return <HeroCard t={template} />;
  if (template.layout === "banner") return <BannerCard t={template} />;
  if (template.layout === "minimal") return <MinimalCard t={template} />;
  return <ClassicCard t={template} />;
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
      <span className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider">{label}</span>
      <button
        ref={btnRef}
        onClick={() => setOpen(v => !v)}
        className={cn(
          "w-11 h-11 rounded-[12px] border-2 transition-all shadow-sm hover:scale-105 active:scale-95 focus:outline-none",
          open ? "border-primary ring-2 ring-primary/20" : "border-[#e5e7eb]"
        )}
        style={{ backgroundColor: value }}
        aria-label={label}
      />
      {open && (
        <div ref={popRef} className="absolute top-[calc(100%+8px)] left-0 z-50 w-[232px] bg-white border border-[#e5e7eb] shadow-2xl rounded-2xl p-4 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[12px] font-bold text-[#111827]">{label}</span>
            <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-[#f3f4f6] text-[#9ca3af] hover:text-[#111827] transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <label className="block w-full h-24 rounded-xl overflow-hidden cursor-pointer border border-[#ececec] mb-3 relative shadow-sm">
            <input type="color" value={value} onChange={e => commit(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
            <div className="w-full h-full" style={{ backgroundColor: value }} />
            <div className="absolute bottom-2 right-2 bg-black/30 backdrop-blur-sm text-white text-[10px] font-mono px-2 py-0.5 rounded-md pointer-events-none">{value.toUpperCase()}</div>
          </label>
          <div className="grid grid-cols-6 gap-1.5 mb-3">
            {COLOR_PRESETS.map(c => (
              <button key={c} onClick={() => commit(c)} className={cn("w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 focus:outline-none shadow-sm", value.toLowerCase() === c.toLowerCase() ? "border-primary ring-2 ring-primary/40 scale-110" : "border-white/80")} style={{ backgroundColor: c }} />
            ))}
          </div>
          <div className="flex items-center gap-2 bg-[#f3f4f6] rounded-xl px-3 py-2">
            <div className="w-4 h-4 rounded-md border border-[#e5e7eb] shrink-0" style={{ backgroundColor: value }} />
            <span className="text-[#9ca3af] text-[12px] font-mono">#</span>
            <input type="text" value={hex.replace("#", "").toUpperCase()} onChange={e => { const raw = `#${e.target.value}`; setHex(raw); if (/^#[0-9A-Fa-f]{6}$/.test(raw)) onChange(raw); }} maxLength={6} className="flex-1 bg-transparent text-[12px] font-mono text-[#111827] focus:outline-none uppercase" placeholder="000000" spellCheck={false} />
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
      <span className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider">Font</span>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between px-3 py-0 rounded-[12px] border border-[#e5e7eb] bg-white hover:bg-[#fafafa] transition-all focus:outline-none shadow-sm text-left h-11"
      >
        <span className="text-[13px] font-semibold text-[#111827] truncate" style={{ fontFamily: value }}>{value}</span>
        <ChevronRight className={cn("w-4 h-4 text-[#9ca3af] shrink-0 transition-transform", open && "rotate-90")} />
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-[#e5e7eb] shadow-2xl rounded-[16px] z-50 p-1.5 animate-in fade-in slide-in-from-top-2 max-h-60 overflow-y-auto">
          {FONTS.map(font => (
            <button key={font.value} onClick={() => { onChange(font.value); setOpen(false); }} className={cn("w-full flex items-center justify-between px-3 py-2 rounded-[10px] text-left transition-colors hover:bg-[#f3f4f6]", value === font.value && "bg-primary/5")}>
              <span className="text-[15px] font-semibold text-[#111827]" style={{ fontFamily: font.value }}>{font.label}</span>
              {value === font.value && <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 ml-2" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Flat Coverflow Slider (no rotateY, no perspective — scale + opacity only) ─
function CoverflowSlider({ selectedKey, onSelect }: { selectedKey: string; onSelect: (key: string) => void }) {
  const currentIndex = Math.max(0, TEMPLATES.findIndex(t => t.key === selectedKey));
  const isNavigating = useRef(false);

  const goTo = useCallback((index: number) => {
    if (isNavigating.current) return;
    isNavigating.current = true;
    const n = TEMPLATES.length;
    const bounded = ((index % n) + n) % n;
    onSelect(TEMPLATES[bounded].key);
    // Lock for transition duration
    setTimeout(() => { isNavigating.current = false; }, 420);
  }, [onSelect]);

  // Card spacing in px (center-to-center)
  const SPACING = 152;

  return (
    <div className="flex flex-col items-center select-none" style={{ overflow: "visible" }}>
      {/* Stage — flat, no perspective, overflow hidden to clip far cards */}
      <div
        className="relative w-full"
        style={{ height: 370, overflow: "hidden" }}
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
                // Pure 2D: only translateX + scale, no rotateY, no perspective
                transform: `translate(calc(-50% + ${offset * SPACING}px), -50%) scale(${scale})`,
                opacity,
                zIndex,
                transition: "transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.4s ease",
              }}
              className={cn(
                "rounded-[22px] overflow-hidden focus:outline-none border-0",
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

      {/* Theme name + navigation arrows */}
      <div className="flex items-center gap-5 mt-3">
        <button
          onClick={() => goTo(currentIndex - 1)}
          className="p-1.5 text-[#9ca3af] hover:text-[#374151] transition-colors focus:outline-none"
          aria-label="Tema anterior"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-[17px] font-semibold text-[#111827] min-w-[150px] text-center">
          {TEMPLATES[currentIndex].name}
        </span>
        <button
          onClick={() => goTo(currentIndex + 1)}
          className="p-1.5 text-[#9ca3af] hover:text-[#374151] transition-colors focus:outline-none"
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
    if (theme) {
      setCurrentTheme({
        template_key: theme.template_key || "noir",
        primary_color: theme.primary_color || "#1a1a1a",
        secondary_color: theme.secondary_color || "#ffffff",
        background_color: theme.background_color || "#0d0d0d",
        text_color: theme.text_color || "#f5f5f5",
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

  // Selecting a template instantly applies its defaults (sync — no timeout)
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
      setCurrentTheme(updated);  // synchronous state update
      onUpdate(updated);         // propagates to preview immediately
    }
  };

  const handleFontChange = (font: string) => {
    handleChange("font_body", font);
    handleChange("font_heading", font);
  };

  return (
    <div className="pb-20">

      {/* 1. Flat Coverflow Slider */}
      <div className="mb-10">
        <CoverflowSlider
          selectedKey={currentTheme.template_key || "noir"}
          onSelect={handleTemplateSelect}
        />
      </div>

      {/* 2. Colors + Font — same horizontal row */}
      <div className="flex items-start gap-6 px-1">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-[#111827]">Colors</span>
          <div className="flex flex-wrap items-center gap-3">
            <ColorSwatchPicker
              label="Primary"
              value={currentTheme.primary_color || "#1a1a1a"}
              onChange={c => handleChange("primary_color", c)}
            />
            <ColorSwatchPicker
              label="Background"
              value={currentTheme.background_color || "#0d0d0d"}
              onChange={c => handleChange("background_color", c)}
            />
            <ColorSwatchPicker
              label="Text"
              value={currentTheme.text_color || "#1a1a1a"}
              onChange={c => handleChange("text_color", c)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5 flex-1">
          <span className="text-[13px] font-semibold text-[#111827]">Font</span>
          <FontDropdown
            value={currentTheme.font_body || "Plus Jakarta Sans"}
            onChange={handleFontChange}
          />
        </div>
      </div>

      {/* 3. Button Styles */}
      <div className="mt-8 px-1">
        <span className="text-[13px] font-semibold text-[#111827] block mb-3">Button Style</span>
        <div className="grid grid-cols-3 gap-3">
          {BUTTON_STYLES.map(style => {
            const sel = currentTheme.button_style === style.value;
            return (
                <button
                key={style.value}
                onClick={() => handleChange("button_style", style.value)}
                className={cn(
                  "py-4 rounded-[14px] border-2 bg-white flex flex-col items-center gap-3 transition-all focus:outline-none",
                  sel ? "border-primary shadow-[0_0_0_3px_rgba(249,66,58,0.09)]" : "border-[#e5e7eb] hover:border-[#d1d5db] hover:bg-[#fafafa]"
                )}
              >
                <div
                  className="w-[calc(100%-20px)] h-7 flex items-center justify-center text-[11px] font-bold text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ backgroundColor: currentTheme.primary_color || "#1a1a1a", borderRadius: style.radius }}
                >
                  Comprar
                </div>
                <span className={cn("text-[11px] font-semibold", sel ? "text-primary" : "text-[#6b7280]")}>{style.label}</span>
              </button>
            );
          })}
        </div>
      </div>

    </div>
  );
}
