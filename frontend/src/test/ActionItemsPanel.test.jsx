import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "./test-utils";
import ActionItemsPanel from "../components/actionItems/ActionItemsPanel";

const mocks = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), changeStatus: vi.fn(), changeOwner: vi.fn(), assignable: vi.fn() }));
vi.mock("../api", () => ({
    actionItemApi: { list: mocks.list, create: mocks.create, changeStatus: mocks.changeStatus, changeOwner: mocks.changeOwner },
    userApi: { assignable: mocks.assignable },
}));

describe("ActionItemsPanel", () => {
    it("does not expose action items to an end user", () => {
        mocks.list.mockResolvedValue({ data: { items: [] } });
        mocks.assignable.mockResolvedValue({ data: { users: [] } });
        renderWithProviders(<ActionItemsPanel rcaId="rca-1" />, { authValue: { user: { id: "user-1", role: "user" }, isStaff: false, isAdmin: false } });
        expect(screen.getByText(/visible to administrators and support agents only/i)).toBeInTheDocument();
    });
});
