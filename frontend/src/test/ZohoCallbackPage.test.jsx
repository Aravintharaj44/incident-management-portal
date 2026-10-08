import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "./test-utils";
import ZohoCallbackPage from "../pages/ZohoCallbackPage";

describe("ZohoCallbackPage", () => {
    it("explains a denied Zoho login", () => {
        renderWithProviders(<ZohoCallbackPage />, {
            route: "/auth/zoho/callback?error=access_denied",
        });

        expect(screen.getByText("Zoho sign-in did not complete")).toBeInTheDocument();
        expect(screen.getByText(/You denied the sign-in request/)).toBeInTheDocument();
    });

    it("uses the SSO completion helper for a callback token", async () => {
        const completeGoogleLogin = vi.fn().mockResolvedValue({ id: "user-1" });
        renderWithProviders(<ZohoCallbackPage />, {
            route: "/auth/zoho/callback?token=sso-token",
            authValue: { completeGoogleLogin },
        });

        await waitFor(() => expect(completeGoogleLogin).toHaveBeenCalledWith("sso-token"));
    });
});
