import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  base: "/",
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    minify: "terser",
  },
});
