import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App as AntApp, ConfigProvider } from "antd";
import enGB from "antd/locale/en_GB";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext";
import { themeConfig } from "./theme";
import "./index.css";

/**
 * Provider stack, outermost first:
 *
 *   ConfigProvider - design tokens and locale for every antd component
 *   AntApp         - context for message/modal/notification, so App.useApp()
 *                    works and those popups inherit the theme (the static
 *                    message.xxx() calls do not)
 *   BrowserRouter  - routing
 *   AuthProvider   - needs the router, because it redirects on logout
 */
createRoot(document.getElementById("root")).render(
    <StrictMode>
        <ConfigProvider theme={themeConfig} locale={enGB}>
            <AntApp>
                <BrowserRouter>
                    <AuthProvider>
                        <App />
                    </AuthProvider>
                </BrowserRouter>
            </AntApp>
        </ConfigProvider>
    </StrictMode>
);
