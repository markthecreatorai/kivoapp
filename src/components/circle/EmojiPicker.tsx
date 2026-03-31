import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

const CATEGORIES = [
  { id: "recent", icon: "🕐", label: "Recent" },
  { id: "smileys", icon: "😊", label: "Smileys & People" },
  { id: "animals", icon: "🐶", label: "Animals & Nature" },
  { id: "plants", icon: "🌱", label: "Plants" },
  { id: "food", icon: "🍔", label: "Food & Drink" },
  { id: "activities", icon: "⚽", label: "Activities" },
  { id: "travel", icon: "🚗", label: "Travel & Places" },
  { id: "objects", icon: "💡", label: "Objects" },
  { id: "symbols", icon: "🎵", label: "Symbols" },
  { id: "flags", icon: "🏳️", label: "Flags" },
] as const;

const EMOJI_DATA: Record<string, string[]> = {
  smileys: [
    "😀","😁","😂","🤣","😃","😄","😅","😆","😉","😊","😋","😎","😍","🥰","😘",
    "😗","😙","🥲","😚","😜","🤪","😝","🤑","🤗","🤭","🫢","🤫","🤔","🫡","🤐",
    "🤨","😐","😑","😶","🫥","😏","😒","🙄","😬","🤥","😌","😔","😪","🤤","😴",
    "😷","🤒","🤕","🤢","🤮","🥵","🥶","🥴","😵","🤯","🤠","🥳","🥸","😎","🤓",
    "🧐","😕","🫤","😟","🙁","😮","😯","😲","😳","🥺","🥹","😦","😧","😨","😰",
    "😥","😢","😭","😱","😖","😣","😞","😓","😩","😫","🥱","😤","😡","😠","🤬",
    "😈","👿","💀","☠️","💩","🤡","👹","👺","👻","👽","👾","🤖","😺","😸","😹",
    "😻","😼","😽","🙀","😿","😾","👋","🤚","🖐️","✋","🖖","🫱","🫲","🫳","🫴",
    "👌","🤌","🤏","✌️","🤞","🫰","🤟","🤘","🤙","👈","👉","👆","🖕","👇","☝️",
    "🫵","👍","👎","✊","👊","🤛","🤜","👏","🙌","🫶","👐","🤲","🤝","🙏",
  ],
  animals: [
    "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐻‍❄️","🐨","🐯","🦁","🐮","🐷",
    "🐸","🐵","🙈","🙉","🙊","🐒","🐔","🐧","🐦","🐤","🐣","🐥","🦆","🦅",
    "🦉","🦇","🐺","🐗","🐴","🦄","🐝","🪱","🐛","🦋","🐌","🐞","🐜","🪰",
    "🪲","🪳","🦟","🦗","🕷️","🦂","🐢","🐍","🦎","🦖","🦕","🐙","🦑","🦐",
    "🦞","🦀","🐡","🐠","🐟","🐬","🐳","🐋","🦈","🐊","🐅","🐆","🦓","🦍",
    "🦧","🐘","🦛","🦏","🐪","🐫","🦒","🦘","🦬","🐃","🐂","🐄","🐎","🐖",
  ],
  plants: [
    "🌱","🌿","☘️","🍀","🎋","🎍","🍃","🍂","🍁","🌾","🌺","🌻","🌹","🥀",
    "🌷","🌼","🌸","💐","🪻","🪷","🪹","🪺","🌵","🎄","🌲","🌳","🌴","🪵",
    "🪨","🍄","🌰","🐚","🪸","🌎","🌍","🌏","🌕","🌖","🌗","🌘","🌑","🌒",
    "🌓","🌔","🌙","🌚","🌛","🌜","☀️","🌝","🌞","⭐","🌟","🌠","☁️","⛅",
    "🌤️","🌥️","🌦️","🌧️","🌨️","🌩️","🌪️","🌫️","🌬️","🌈","☔","❄️","☃️","⛄","🔥",
  ],
  food: [
    "🍔","🍟","🍕","🌭","🥪","🌮","🌯","🫔","🥙","🧆","🥚","🍳","🥘","🍲",
    "🫕","🥣","🥗","🍿","🧈","🧂","🥫","🍝","🍜","🍛","🍣","🍱","🥟","🦪",
    "🍤","🍙","🍚","🍘","🍥","🥠","🥮","🍢","🍡","🍧","🍨","🍦","🥧","🧁",
    "🍰","🎂","🍮","🍭","🍬","🍫","🍩","🍪","🌰","🥜","🍯","🥛","🍼","☕",
    "🫖","🍵","🧃","🥤","🧋","🍶","🍺","🍻","🥂","🍷","🥃","🍸","🍹","🧉","🍾",
  ],
  activities: [
    "⚽","🏀","🏈","⚾","🥎","🎾","🏐","🏉","🥏","🎱","🪀","🏓","🏸","🏒",
    "🏑","🥍","🏏","🪃","🥅","⛳","🪁","🏹","🎣","🤿","🥊","🥋","🎽","🛹",
    "🛼","🛷","⛸️","🥌","🎿","⛷️","🏂","🪂","🏋️","🤸","🤺","🤾","🏌️","🏇",
    "🧘","🏄","🏊","🤽","🚣","🧗","🚵","🚴","🏆","🥇","🥈","🥉","🏅","🎖️",
    "🎗️","🎪","🎭","🎨","🎬","🎤","🎧","🎼","🎹","🥁","🪘","🎷","🎺","🪗","🎸","🎻",
  ],
  travel: [
    "🚗","🚕","🚙","🚌","🚎","🏎️","🚓","🚑","🚒","🚐","🛻","🚚","🚛","🚜",
    "🛵","🏍️","🛺","🚲","🛴","🚏","🛣️","🛤️","⛽","🛞","🚨","🚥","🚦","🛑",
    "🚧","⚓","🛟","⛵","🚤","🛳️","⛴️","🛥️","🚢","✈️","🛩️","🛫","🛬","🪂",
    "💺","🚁","🚟","🚠","🚡","🛰️","🚀","🛸","🏠","🏡","🏢","🏣","🏤","🏥",
    "🏦","🏨","🏩","🏪","🏫","🏬","🏭","🏯","🏰","💒","🗼","🗽","⛪","🕌","🛕",
  ],
  objects: [
    "💡","🔦","🕯️","💎","🔧","🪛","🔨","⛏️","🪚","🔩","⚙️","🪤","🧲","🔫",
    "💣","🪓","🔪","🗡️","⚔️","🛡️","🚬","⚰️","🪦","⚱️","🏺","🔮","📿","🧿",
    "🪬","💈","⚗️","🔭","🔬","🕳️","🩹","🩺","🩻","🩼","💊","💉","🩸","🧬",
    "🦠","🧫","🧪","🌡️","🧹","🪠","🧺","🧻","🚽","🚰","🚿","🛁","🛀","🪥",
    "🪒","🧴","🪮","🧽","🪣","🧯","🛒","🚬","📱","💻","⌨️","🖥️","🖨️","🖱️",
  ],
  symbols: [
    "🎵","🎶","🎼","❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❤️‍🔥",
    "❤️‍🩹","❣️","💕","💞","💓","💗","💖","💘","💝","💟","☮️","✝️","☪️","🕉️",
    "☸️","✡️","🔯","🕎","☯️","☦️","🛐","⛎","♈","♉","♊","♋","♌","♍","♎",
    "♏","♐","♑","♒","♓","🆔","⚛️","🉑","☢️","☣️","📴","📳","🈶","🈚","🈸",
    "🈺","🈷️","✴️","🆚","💮","🉐","㊙️","㊗️","🈴","🈵","🈹","🈲","🅰️","🅱️",
  ],
  flags: [
    "🏳️","🏴","🏁","🚩","🏳️‍🌈","🏳️‍⚧️","🇧🇷","🇺🇸","🇬🇧","🇫🇷","🇩🇪","🇪🇸",
    "🇮🇹","🇵🇹","🇯🇵","🇰🇷","🇨🇳","🇮🇳","🇷🇺","🇨🇦","🇦🇺","🇲🇽","🇦🇷","🇨🇱",
    "🇨🇴","🇵🇪","🇻🇪","🇪🇨","🇺🇾","🇵🇾","🇧🇴","🇨🇺","🇩🇴","🇬🇹","🇭🇳","🇸🇻",
    "🇳🇮","🇨🇷","🇵🇦","🇰🇪","🇳🇬","🇿🇦","🇪🇬","🇲🇦","🇹🇷","🇸🇦","🇦🇪","🇮🇱",
  ],
};

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
}

export default function EmojiPicker({ onSelect }: EmojiPickerProps) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("smileys");

  const allEmojis = useMemo(() => Object.entries(EMOJI_DATA).flatMap(([cat, emojis]) => emojis.map(e => ({ emoji: e, category: cat }))), []);

  const filtered = useMemo(() => {
    if (!search.trim()) return null;
    return allEmojis.filter(e => e.emoji.includes(search));
  }, [search, allEmojis]);

  const displayEmojis = filtered ? filtered.map(e => e.emoji) : (EMOJI_DATA[activeCategory] || []);
  const displayLabel = filtered ? "Resultados" : CATEGORIES.find(c => c.id === activeCategory)?.label || "";

  return (
    <div className="w-[260px] bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
      {/* Search */}
      <div className="p-2 border-b border-border">
        <div className="flex items-center gap-1.5 bg-muted/50 rounded-md px-2 py-1.5">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search"
            className="flex-1 text-xs bg-transparent outline-none text-foreground placeholder:text-muted-foreground/60"
            autoFocus
          />
        </div>
      </div>

      {/* Category tabs */}
      {!search && (
        <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-border overflow-x-auto">
          {CATEGORIES.filter(c => c.id !== "recent").map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`p-1 rounded text-sm hover:bg-muted/60 transition-colors shrink-0 ${
                activeCategory === cat.id ? "bg-muted" : ""
              }`}
              title={cat.label}
            >
              {cat.icon}
            </button>
          ))}
        </div>
      )}

      {/* Category label */}
      <div className="px-2.5 pt-1.5 pb-0.5">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{displayLabel}</span>
      </div>

      {/* Emoji grid */}
      <ScrollArea className="h-[220px]">
        <div className="grid grid-cols-7 gap-0.5 px-1.5 pb-2">
          {displayEmojis.map((emoji, i) => (
            <button
              key={`${emoji}-${i}`}
              onClick={() => onSelect(emoji)}
              className="h-8 w-8 flex items-center justify-center text-lg rounded hover:bg-muted/60 transition-colors"
            >
              {emoji}
            </button>
          ))}
        </div>
        {displayEmojis.length === 0 && (
          <p className="text-center text-xs text-muted-foreground py-6">Nenhum emoji encontrado</p>
        )}
      </ScrollArea>
    </div>
  );
}
