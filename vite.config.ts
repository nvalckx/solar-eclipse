import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative asset URLs work for both the repository root and a GitHub Pages project site.
  base: "./",
  plugins: [react()],
  optimizeDeps: {
    exclude: ["maplibre-gl"],
  },
});
