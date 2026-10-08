import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test-utils";
import ProfilePage from "../../pages/ProfilePage";

const userRecord = {
    name: "Jane Doe",
    email: "jane@example.com",
    role: "user",
    isActive: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    lastLoginAt: null,
};

const auth = (overrides = {}) => ({
    user: userRecord,
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
    ...overrides,
});

describe("ProfilePage", () => {
    it("displays the signed-in user and account state", () => {
        renderWithProviders(<ProfilePage />, { authValue: auth() });
        expect(screen.getByRole("heading", { name: "Jane Doe" })).toBeInTheDocument();
        expect(screen.getByText("jane@example.com")).toBeInTheDocument();
        expect(screen.getByText("End User")).toBeInTheDocument();
        expect(screen.getByText("Active")).toBeInTheDocument();
    });

    it("updates the display name", async () => {
        const user = userEvent.setup();
        const updateProfile = vi.fn().mockResolvedValue({});
        renderWithProviders(<ProfilePage />, { authValue: auth({ updateProfile }) });
        const nameInput = screen.getByRole("textbox", { name: "Full name" });
        await user.clear(nameInput);
        await user.type(nameInput, "Jane Smith");
        await user.click(screen.getByRole("button", { name: /Save$/ }));
        expect(updateProfile).toHaveBeenCalledWith({ name: "Jane Smith" });
    });

    it("validates matching passwords before submitting", async () => {
        const user = userEvent.setup();
        const changePassword = vi.fn();
        renderWithProviders(<ProfilePage />, { authValue: auth({ changePassword }) });
        const passwordInputs = screen.getAllByLabelText(/password/i);
        await user.type(passwordInputs[0], "oldpass1");
        await user.type(passwordInputs[1], "newpass1");
        await user.type(passwordInputs[2], "different1");
        await user.click(screen.getByRole("button", { name: /Change password$/ }));
        expect(await screen.findByText("The passwords do not match")).toBeInTheDocument();
        expect(changePassword).not.toHaveBeenCalled();
    });
});