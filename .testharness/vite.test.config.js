import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  root: path.resolve(__dirname, ".."),
  plugins: [react()],
  resolve: {
    alias: [
      // Swap the real Supabase layer for the in-memory stub.
      { find: /^\.\/db\.js$/, replacement: path.resolve(__dirname, "db-stub.js") },
    ],
  },
  build: { outDir: path.resolve(__dirname, "dist-test"), emptyOutDir: true },
});
