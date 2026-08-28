import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
    plugins: [react()],

    server: {
        port: 5173,
        /**
         * Proxying /api means the browser talks to the same origin as the app
         * during development, so CORS never comes into play locally. The
         * axios base URL still points at the API directly by default; set
         * SVRVER_API_URL=/api/v1 to route through this proxy instead.
         */
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
        // antd on its own exceeds the 500 kB default. The chunks below are
        // deliberately sized and cached separately, so the warning is noise.
        chunkSizeWarningLimit: 1500,
        rollupOptions: {
            output: {
                /**
                 * Split the heavy third-party code out of the app bundle.
                 * antd and the charting library change far less often than our
                 * own code, so this keeps them cached across deployments.
                 *
                 * Vite 8 bundles with rolldown, which requires the function
                 * form of manualChunks rather than an object map.
                 */
                manualChunks: (id) => {
                    if (!id.includes("node_modules")) return undefined;

                    // @antv/* is the engine behind @ant-design/charts and is
                    // by far the biggest dependency. Keeping it in the charts
                    // chunk means it is only downloaded when a chart is shown,
                    // rather than landing in a catch-all the login page pulls in.
                    if (id.includes("@antv")) return "vendor-charts";
                    // lodash and d3 arrive only as charting dependencies - no
                    // app code imports them - so they ride along with the
                    // charts chunk instead of loading on the login screen.
                    if (id.includes("node_modules/lodash")) return "vendor-charts";
                    if (id.includes("node_modules/d3-")) return "vendor-charts";
                    if (id.includes("@ant-design/charts")) return "vendor-charts";
                    if (id.includes("@ant-design/plots")) return "vendor-charts";
                    if (id.includes("@ant-design/graphs")) return "vendor-charts";
                    // antd is a thin layer over the rc-* / @rc-component
                    // family, so those belong in the same chunk as antd itself
                    // rather than in the catch-all.
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
