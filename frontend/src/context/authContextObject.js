import { createContext } from "react";

/**
 * The context object lives in its own module.
 *
 * Vite's fast refresh only preserves state for modules that export components
 * exclusively, so keeping the context here lets AuthContext.jsx export just
 * the provider and stay hot-reloadable.
 */
export const AuthContext = createContext(null);
