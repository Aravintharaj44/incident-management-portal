import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
    plugins: [react()],
    test: {
        environment: "jsdom",
        globals: true,
        setupFiles: "./src/setupTests.js",
        css: true, // Ant Design components import CSS; this prevents parse errors
        coverage: {
            provider: "v8",
            reporter: ["text", "html"],
            exclude: ["node_modules/", "src/setupTests.js", "**/*.config.js"],
        },
    },

    server: {
        port: 5173,
        proxy: {
            "/api": {
                target: "http://localhost:5000",
                changeOrigin: true,
            },
        },
    },

    build: {
        outDir: "dist",
        sourcemap: false,
        chunkSizeWarningLimit: 1500,
        rollupOptions: {
            output: {
                manualChunks: (id) => {
                    if (!id.includes("node_modules")) return undefined;
                    if (id.includes("@antv")) return "vendor-charts";
                    if (id.includes("node_modules/lodash")) return "vendor-charts";
                    if (id.includes("node_modules/d3-")) return "vendor-charts";
                    if (id.includes("@ant-design/charts")) return "vendor-charts";
                    if (id.includes("@ant-design/plots")) return "vendor-charts";
                    if (id.includes("@ant-design/graphs")) return "vendor-charts";
                    if (id.includes("/antd/")) return "vendor-antd";
                    if (id.includes("@rc-component")) return "vendor-antd";
                    if (id.includes("node_modules/rc-")) return "vendor-antd";
                    if (id.includes("@ant-design/")) return "vendor-antd";
                    if (id.includes("@emotion/")) return "vendor-antd";
                    if (id.includes("/react-router")) return "vendor-react";
                    if (id.includes("/react-dom/")) return "vendor-react";
                    return "vendor";
                },
            },
        },
    },
});