import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * STUDIO_WEB_HOST: address the dev server binds to. Set it to the Tailscale IP to reach the
 * office from another device. Defaults to loopback so nothing is exposed by accident.
 * STUDIO_SERVER_URL: the studio server (apps/server); its default port is 7420 (DEFAULT_PORT).
 */
const bindHost = process.env.STUDIO_WEB_HOST ?? "127.0.0.1";
const serverTarget = process.env.STUDIO_SERVER_URL ?? "http://127.0.0.1:7420";

export default defineConfig({
  plugins: [react()],
  server: {
    host: bindHost,
    port: 5173,
    strictPort: true,
    proxy: {
      "/ws": { target: serverTarget, ws: true, changeOrigin: true },
      "/hooks": { target: serverTarget, changeOrigin: true },
    },
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 900,
  },
});
