import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test-utils";
import GoogleCallbackPage from "../../pages/GoogleCallbackPage";
import ForbiddenPage from "../../pages/ForbiddenPage";
import NotFoundPage from "../../pages/NotFoundPage";

const auth = (overrides = {}) => ({ user: null, completeGoogleLogin: vi.fn(), ...overrides });

const renderRoutes = (ui, route, authValue = auth()) => renderWithProviders(
    <Routes>
        <Route path="*" element={ui} />
        <Route path="/dashboard" element={<div>Dashboard destination</div>} />
        <Route path="/login" element={<div>Login destination</div>} />
        <Route path="/incidents" element={<div>Incidents destination</div>} />
    </Routes>,
    { route, authValue }
);

describe("public and fallback pages", () => {
    it("explains a rejected Google sign-in", () => {
        renderRoutes(<GoogleCallbackPage />, "/auth/google/callback?error=access_denied");
        expect(screen.getByText("Google sign-in did not complete")).toBeInTheDocument();
        expect(screen.getByText(/You denied the sign-in request/)).toBeInTheDocument();
    });

    it("completes Google sign-in and navigates to the dashboard", async () => {
        const completeGoogleLogin = vi.fn().mockResolvedValue({});
        renderRoutes(<GoogleCallbackPage />, "/auth/google/callback?token=google-token", auth({ completeGoogleLogin }));
        expect(await screen.findByText("Dashboard destination")).toBeInTheDocument();
        expect(completeGoogleLogin).toHaveBeenCalledWith("google-token");
    });

    it("shows the signed-in role on the forbidden page and routes to incidents", async () => {
        const user = userEvent.setup();
        renderRoutes(<ForbiddenPage />, "/forbidden", auth({ user: { role: "user" } }));
        expect(screen.getByText(/signed in as End User/)).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "View incidents" }));
        expect(screen.getByText("Incidents destination")).toBeInTheDocument();
    });

    it("returns a missing route to the dashboard", async () => {
        const user = userEvent.setup();
        renderRoutes(<NotFoundPage />, "/missing");
        expect(screen.getByText("That page does not exist.")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Back to dashboard" }));
        expect(screen.getByText("Dashboard destination")).toBeInTheDocument();
    });
});