import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const pagesBase = process.env.GITHUB_PAGES_BASE_PATH || "/tce-go-dashboard";
const base = process.env.GITHUB_PAGES === "1"
  ? `${pagesBase.replace(/\/$/, "")}/`
  : "/";

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
