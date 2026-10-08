import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useLocation } from "react-router-dom";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "./test-utils";
import AppLayout from "../components/layout/AppLayout";

vi.mock("../components/layout/NotificationBell", () => ({ default: () => <span>Notifications</span> }));

const LocationProbe = () => <output>{useLocation().pathname}</output>;

describe("AppLayout logout", () => {
    it("offers logout to an authenticated user, calls logout, and redirects after confirmation", async () => {
        const user = userEvent.setup();
        const logout = vi.fn();
        renderWithProviders(
            <Routes>
                <Route element={<AppLayout />}>
                    <Route path="/dashboard" element={<LocationProbe />} />
                    <Route path="/login" element={<LocationProbe />} />
                </Route>
            </Routes>,
            { route: "/dashboard", authValue: { user: { id: "user-1", name: "Asha Agent", email: "asha@example.com", role: "agent" }, isStaff: true, isAdmin: false, logout } }
        );

        await user.click(screen.getByText("AA"));
        await user.click(await screen.findByText("Sign out"));
        expect(await screen.findByRole("dialog")).toHaveTextContent("Sign out?");
        await user.click(screen.getByRole("button", { name: "Sign out" }));

        expect(logout).toHaveBeenCalledOnce();
        expect(screen.getByText("/login")).toBeInTheDocument();
    });
});

