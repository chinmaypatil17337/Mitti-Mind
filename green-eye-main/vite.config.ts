import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    // Forward chatbot calls to the Flask backend in ../chatbot (same-origin, so its session cookie works)
    proxy: {
      "/chatbot-api": {
        target: process.env.CHATBOT_BACKEND_URL || "http://localhost:5000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/chatbot-api/, ""),
      },
    },
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    
  },
}));
