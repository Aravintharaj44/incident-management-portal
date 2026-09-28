import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "./test-utils";
import CommentThread from "../components/incidents/CommentThread";

globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

const mocks = vi.hoisted(() => ({ add: vi.fn(), remove: vi.fn() }));
vi.mock("../api", () => ({ commentApi: mocks }));

describe("CommentThread", () => {
    const staff = { user: { id: "agent-1", name: "Asha Agent", role: "agent" }, isStaff: true, isAdmin: false };

    it("does not submit a whitespace-only comment", async () => {
        const user = userEvent.setup();
        renderWithProviders(<CommentThread incidentId="inc-1" />, { authValue: staff });
        await user.type(screen.getByPlaceholderText(/Add a comment/i), "   ");
        expect(screen.getByRole("button", { name: /Post comment$/ })).toBeDisabled();
        expect(mocks.add).not.toHaveBeenCalled();
    });

    it("posts a trimmed internal note and refreshes the thread", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        mocks.add.mockResolvedValueOnce({});
        renderWithProviders(<CommentThread incidentId="inc-1" canUseInternalNotes onChange={onChange} />, { authValue: staff });
        await user.type(screen.getByPlaceholderText(/Add a comment/i), "  Investigating now.  ");
        await user.click(screen.getByLabelText("Internal note"));
        await user.click(screen.getByRole("button", { name: /Add internal note$/ }));
        expect(mocks.add).toHaveBeenCalledWith("inc-1", { message: "Investigating now.", isInternal: true });
        expect(onChange).toHaveBeenCalledOnce();
    });

    it("identifies existing internal notes", () => {
        renderWithProviders(<CommentThread incidentId="inc-1" comments={[{ _id: "comment-1", message: "Private update", isInternal: true, createdAt: "2025-01-01", author: { _id: "agent-1", name: "Asha Agent", role: "agent" } }]} />, { authValue: staff });
        expect(screen.getByText("Private update")).toBeInTheDocument();
        expect(screen.getByText("Internal note")).toBeInTheDocument();
    });
});

