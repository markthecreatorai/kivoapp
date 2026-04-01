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
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          if (id.includes("react") || id.includes("scheduler")) return "vendor-react";
          if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
          if (id.includes("@supabase") || id.includes("@tanstack/react-query")) return "vendor-data";
          if (id.includes("zxcvbn")) return "vendor-zxcvbn";
          if (id.includes("@radix-ui")) return "vendor-radix";

          return "vendor";
        },
      },
    },
  },
}));
