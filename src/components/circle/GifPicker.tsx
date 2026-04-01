import { useState, useEffect, useCallback, useRef } from "react";
import { Search, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

const TENOR_V2_KEY = (import.meta as any).env?.VITE_TENOR_API_KEY || "";
const TENOR_V2_BASE = "https://tenor.googleapis.com/v2";
const TENOR_V1_BASE = "https://g.tenor.com/v1";
const TENOR_FALLBACK_KEY = "LIVDSRZULELA"; // public demo key (fallback)

interface GifResult {
  id: string;
  url: string;
  preview: string;
  width: number;
  height: number;
}

interface GifPickerProps {
  onSelect: (gifUrl: string) => void;
}

export default function GifPicker({ onSelect }: GifPickerProps) {
  const [search, setSearch] = useState("");
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchGifs = useCallback(async (query: string) => {
    setLoading(true);
    try {
      // Try Tenor v2 first when a valid key is provided
      if (TENOR_V2_KEY) {
        const endpoint = query.trim()
          ? `${TENOR_V2_BASE}/search?q=${encodeURIComponent(query)}&key=${TENOR_V2_KEY}&limit=30&media_filter=gif,tinygif&client_key=kivo`
          : `${TENOR_V2_BASE}/featured?key=${TENOR_V2_KEY}&limit=30&media_filter=gif,tinygif&client_key=kivo`;

        const res = await fetch(endpoint);
        const data = await res.json();

        if (res.ok && Array.isArray(data.results)) {
          const results: GifResult[] = data.results.map((r: any) => ({
            id: r.id,
            url: r.media_formats?.gif?.url || r.media_formats?.tinygif?.url || "",
            preview: r.media_formats?.tinygif?.url || r.media_formats?.gif?.url || "",
            width: r.media_formats?.tinygif?.dims?.[0] || 200,
            height: r.media_formats?.tinygif?.dims?.[1] || 200,
          }));
          setGifs(results.filter((g) => !!g.url));
          setLoading(false);
          return;
        }
      }

      // Fallback: Tenor v1 public demo key
      const endpointV1 = query.trim()
        ? `${TENOR_V1_BASE}/search?q=${encodeURIComponent(query)}&key=${TENOR_FALLBACK_KEY}&limit=30`
        : `${TENOR_V1_BASE}/trending?key=${TENOR_FALLBACK_KEY}&limit=30`;

      const resV1 = await fetch(endpointV1);
      const dataV1 = await resV1.json();

      const resultsV1: GifResult[] = (dataV1.results || []).map((r: any) => ({
        id: r.id,
        url: r.media?.[0]?.gif?.url || r.media?.[0]?.tinygif?.url || "",
        preview: r.media?.[0]?.tinygif?.url || r.media?.[0]?.gif?.url || "",
        width: r.media?.[0]?.tinygif?.dims?.[0] || 200,
        height: r.media?.[0]?.tinygif?.dims?.[1] || 200,
      }));

      setGifs(resultsV1.filter((g) => !!g.url));
    } catch {
      setGifs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGifs("");
  }, [fetchGifs]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchGifs(search);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, fetchGifs]);

  return (
    <div className="w-[300px] bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
      {/* Search */}
      <div className="p-2 border-b border-border">
        <div className="flex items-center gap-1.5 bg-muted/50 rounded-md px-2 py-1.5">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search GIFs"
            className="flex-1 text-xs bg-transparent outline-none text-foreground placeholder:text-muted-foreground/60"
            autoFocus
          />
        </div>
      </div>

      {/* GIF grid */}
      <ScrollArea className="h-[300px]">
        {loading && gifs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Carregando GIFs...</span>
          </div>
        ) : gifs.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-12">Nenhum GIF encontrado</p>
        ) : (
          <div className="columns-2 gap-1 p-1.5">
            {gifs.map(gif => (
              <button
                key={gif.id}
                onClick={() => onSelect(gif.url)}
                className="w-full mb-1 rounded-md overflow-hidden hover:opacity-80 transition-opacity block"
              >
                <img
                  src={gif.preview}
                  alt=""
                  className="w-full h-auto rounded-md"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Tenor attribution */}
      <div className="px-2 py-1 border-t border-border text-center">
        <span className="text-[9px] text-muted-foreground">Powered by Tenor</span>
      </div>
    </div>
  );
}
