import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/books":    "http://localhost:8000",
      "/audio":    "http://localhost:8000",
      "/chapters": "http://localhost:8000",
      "/health":   "http://localhost:8000",
      "/auth":     "http://localhost:8000",
      "/admin":    "http://localhost:8000",
    },
  },
});
