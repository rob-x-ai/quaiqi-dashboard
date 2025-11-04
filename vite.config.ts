import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

export default defineConfig(({ mode }) => {
  const port = Number(process.env.PORT ?? 5173);
  const apiPort = Number(process.env.API_PROXY_PORT ?? 4000);
  const shouldProxyApi = port !== 3000;

  return {
    server: {
      host: "::",
      port,
      proxy: shouldProxyApi
        ? {
            "/api": {
              target: `http://localhost:${apiPort}`,
              changeOrigin: true,
            },
          }
        : undefined,
    },
    plugins: [
      react(),
      mode === "development" && componentTagger(),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
