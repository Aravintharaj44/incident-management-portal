import { describe, expect, it } from "vitest";
import { Route, Routes } from "react-router-dom";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test-utils";
import ProtectedRoute from "../../routes/ProtectedRoute";
import RoleRoute from "../../routes/RoleRoute";

const auth = (overrides = {}) => ({
    user: null,
    isLoading: false,
    isAuthenticated: false,
    ...overrides,
});

const ProtectedHarness = () => (
    <Routes>
        <Route element={<ProtectedRoute />}>
            <Route path="/secure" element={<div>Protected content</div>} />
        </Route>
        <Route path="/login" element={<div>Login destination</div>} />
    </Routes>
);

const RoleHarness = () => (
    <Routes>
        <Route element={<RoleRoute allowedRoles={["admin", "agent"]} />}>
            <Route path="/staff" element={<div>Staff content</div>} />
        </Route>
        <Route path="/login" element={<div>Login destination</div>} />
        <Route path="/forbidden" element={<div>Forbidden destination</div>} />
    </Routes>
);

describe("route guards", () => {
    it("keeps protected content hidden while the session is loading", () => {
        renderWithProviders(<ProtectedHarness />, { route: "/secure", authValue: auth({ isLoading: true }) });
        expect(screen.getByText("Loading your session...")).toBeInTheDocument();
        expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    });

    it("redirects an unauthenticated visitor to login", () => {
        renderWithProviders(<ProtectedHarness />, { route: "/secure", authValue: auth() });
        expect(screen.getByText("Login destination")).toBeInTheDocument();
    });

    it("renders a staff route for an allowed role", () => {
        renderWithProviders(<RoleHarness />, { route: "/staff", authValue: auth({ user: { role: "agent" }, isAuthenticated: true }) });
        expect(screen.getByText("Staff content")).toBeInTheDocument();
    });

    it("redirects an end user from a staff route", () => {
        renderWithProviders(<RoleHarness />, { route: "/staff", authValue: auth({ user: { role: "user" }, isAuthenticated: true }) });
        expect(screen.getByText("Forbidden destination")).toBeInTheDocument();
    });
});