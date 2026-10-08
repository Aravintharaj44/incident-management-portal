import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test-utils";
import RegisterPage from "../../pages/RegisterPage";

const Destination = () => <div>Dashboard destination</div>;

const renderRegister = (authValue) => renderWithProviders(
    <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/dashboard" element={<Destination />} />
    </Routes>,
    { route: "/register", authValue }
);

const baseAuth = (overrides = {}) => ({
    user: null,
    isLoading: false,
    isAuthenticated: false,
    register: vi.fn(),
    ...overrides,
});

describe("RegisterPage", () => {
    it("renders registration fields and validates required values", async () => {
        const user = userEvent.setup();
        renderRegister(baseAuth());
        await user.click(screen.getByRole("button", { name: "Create account" }));
        expect(await screen.findByText("Please enter your name")).toBeInTheDocument();
        expect(screen.getByText("Please enter your email")).toBeInTheDocument();
        expect(screen.getByText("Please choose a password")).toBeInTheDocument();
    });

    it("registers valid details and navigates to the dashboard", async () => {
        const user = userEvent.setup();
        const register = vi.fn().mockResolvedValue({ name: "Jane Doe" });
        renderRegister(baseAuth({ register }));
        await user.type(screen.getByPlaceholderText("Jane Doe"), "Jane Doe");
        await user.type(screen.getByPlaceholderText("you@company.com"), "jane@example.com");
        await user.type(screen.getByPlaceholderText("At least 6 characters, with a letter and a number"), "secret1");
        await user.type(screen.getByPlaceholderText("Re-enter your password"), "secret1");
        await user.click(screen.getByRole("button", { name: "Create account" }));
        expect(register).toHaveBeenCalledWith({ name: "Jane Doe", email: "jane@example.com", password: "secret1" });
        expect(await screen.findByText("Dashboard destination")).toBeInTheDocument();
    });

    it("keeps the form available and displays an API error", async () => {
        const user = userEvent.setup();
        const register = vi.fn().mockRejectedValue(new Error("Email is already registered"));
        renderRegister(baseAuth({ register }));
        await user.type(screen.getByPlaceholderText("Jane Doe"), "Jane Doe");
        await user.type(screen.getByPlaceholderText("you@company.com"), "jane@example.com");
        await user.type(screen.getByPlaceholderText("At least 6 characters, with a letter and a number"), "secret1");
        await user.type(screen.getByPlaceholderText("Re-enter your password"), "secret1");
        await user.click(screen.getByRole("button", { name: "Create account" }));
        expect(await screen.findByText("Email is already registered")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Create account" })).not.toBeDisabled();
    });
});