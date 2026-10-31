import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_DEV_API_TARGET || "http://127.0.0.1:8000";
  return {
    plugins: [react(), tailwindcss(), {
      name: "widget-brand-icon",
      generateBundle() {
        // Script nhúng độc lập cần URL cố định; ảnh gốc vẫn nằm nguyên trong img.
        this.emitFile({
          type: "asset",
          fileName: "img/logo-2.png",
          source: readFileSync(new URL("./img/logo-2.png", import.meta.url)),
        });
      },
    }],
    server: {
      port: 5173,
      // Image editors lock temporary save files; they are not frontend source.
      watch: { ignored: ["**/*.pdnSave"] },
      proxy: {
        "/api": apiTarget,
        "/health": apiTarget,
      },
    },
  };
});
