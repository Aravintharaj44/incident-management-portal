// src/setupTests.js
import "@testing-library/jest-dom";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
    cleanup();
});

Object.defineProperty(window, "location", {
    value: { assign: vi.fn(), href: "" },
    writable: true,
});

// jsdom has no layout engine, so window.matchMedia doesn't exist at all.
// Ant Design's Grid/breakpoint system (used internally by many components,
// including plain <Button> in some versions) calls this on mount, so every
// test that renders an AntD component needs this stubbed.
Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),    // deprecated, but some libs still call it
        removeListener: vi.fn(), // deprecated
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })),
});
// Ant Design observes element size for layout and dropdown positioning; jsdom
// does not provide this browser API.
globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
};
