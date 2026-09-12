import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const verification = env.VITE_GOOGLE_SITE_VERIFICATION?.trim() || "";

  return {
    plugins: [
      react(),
      {
        name: "baltan-html-seo",
        transformIndexHtml(html) {
          if (!verification) return html;
          return html.replace(
            "</head>",
            `    <meta name="google-site-verification" content="${verification}" />\n  </head>`,
          );
        },
      },
    ],
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: "http://127.0.0.1:3001",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
  };
});
