import { describe, expect, it, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "./test-utils";
import LoginPage from "../pages/LoginPage";

vi.mock("../api", () => ({
    googleAuthStartUrl: "http://localhost:5000/auth/google",
    zohoAuthStartUrl: "http://localhost:5000/auth/zoho",
    authApi: { login: vi.fn() },
}));

describe("LoginPage", () => {
    beforeEach(() => { window.location.assign = vi.fn(); });

    it("renders the sign-in form", () => {
        renderWithProviders(<LoginPage />);
        expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
        expect(screen.getByPlaceholderText("you@company.com")).toBeInTheDocument();
        expect(screen.getByPlaceholderText("Your password")).toBeInTheDocument();
    });

    it("redirects to Google's OAuth start URL when clicked", async () => {
        const user = userEvent.setup();
        renderWithProviders(<LoginPage />);
        await user.click(screen.getByText("Continue with Google"));
        expect(window.location.assign).toHaveBeenCalledWith("http://localhost:5000/auth/google");
    });

    it("redirects to Zoho's OAuth start URL when clicked", async () => {
        const user = userEvent.setup();
        renderWithProviders(<LoginPage />);
        await user.click(screen.getByText("Continue with Zoho"));
        expect(window.location.assign).toHaveBeenCalledWith("http://localhost:5000/auth/zoho");
    });

    it("shows a validation error when submitting an empty form", async () => {
        const user = userEvent.setup();
        renderWithProviders(<LoginPage />);
        await user.click(screen.getByRole("button", { name: "Sign in" }));
        expect(await screen.findByText("Please enter your email")).toBeInTheDocument();
    });

    it("fills demo credentials when a demo account button is clicked", async () => {
        const user = userEvent.setup();
        renderWithProviders(<LoginPage />);
        await user.click(screen.getByText("Admin"));
        expect(screen.getByPlaceholderText("you@company.com")).toHaveValue("admin@zybisys.com");
        expect(screen.getByPlaceholderText("Your password")).toHaveValue("Password123");
    });

    it("shows an API authentication error, remains on login, and clears loading", async () => {
        const user = userEvent.setup();
        const login = vi.fn().mockRejectedValue(new Error("Invalid email or password"));
        renderWithProviders(<LoginPage />, { authValue: { login, isAuthenticated: false } });
        await user.type(screen.getByPlaceholderText("you@company.com"), "user@example.com");
        await user.type(screen.getByPlaceholderText("Your password"), "wrong-password");
        await user.click(screen.getByRole("button", { name: "Sign in" }));

        expect(await screen.findByText("Invalid email or password")).toBeInTheDocument();
        expect(login).toHaveBeenCalledWith({ email: "user@example.com", password: "wrong-password" });
        expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Sign in" })).not.toHaveAttribute("disabled");
    });
});
