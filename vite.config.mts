import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "node:path"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    port: parseInt(process.env["PORT"] || "4201"),
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4300",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: parseInt(process.env["PORT"] || "4201"),
    host: "0.0.0.0",
  },
  build: {
    outDir: "dist/appai-website",
    emptyOutDir: true,
  },
})
