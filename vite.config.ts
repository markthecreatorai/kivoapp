import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            // Heavy, truly independent libs — safe to split
            if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
            if (id.includes("@tiptap") || id.includes("prosemirror")) return "vendor-editor";
            if (id.includes("date-fns")) return "vendor-date";
            // Everything else (react, radix, supabase, lucide, etc.)
            // stays in the default chunk graph — no forced split that
            // can break module evaluation order.
          }
        },
      },
    },
  },
}));
