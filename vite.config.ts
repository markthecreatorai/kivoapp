import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

function getPackageName(id: string) {
  const match = id.split("node_modules/")[1];
  if (!match) return null;

  const parts = match.split("/");
  if (parts[0].startsWith("@")) {
    return `${parts[0]}-${parts[1]}`;
  }

  return parts[0];
}

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

          const pkg = getPackageName(id);
          if (!pkg) return "vendor";

          if (pkg.includes("react") || pkg.includes("scheduler")) return "vendor-react";
          if (pkg.includes("recharts") || pkg.includes("d3")) return "vendor-charts";
          if (pkg.includes("supabase") || pkg.includes("tanstack-react-query")) return "vendor-data";
          if (pkg.includes("radix-ui")) return "vendor-radix";

          return `vendor-${pkg.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
        },
      },
    },
  },
}));
