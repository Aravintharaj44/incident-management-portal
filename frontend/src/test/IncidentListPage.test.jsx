import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "./test-utils";
import IncidentListPage from "../pages/IncidentListPage";

const mocks = vi.hoisted(() => ({ list: vi.fn(), categories: vi.fn(), assignable: vi.fn(), exportCsv: vi.fn() }));
vi.mock("../api", () => ({
    incidentApi: { list: mocks.list, exportCsv: mocks.exportCsv },
    categoryApi: { list: mocks.categories },
    userApi: { assignable: mocks.assignable },
}));

const page = { page: 1, limit: 10, total: 1 };
const incident = { _id: "incident-1", incidentNumber: "INC-1001", title: "VPN disconnects", status: "new", priority: "high", createdAt: "2025-01-01T00:00:00.000Z", category: { name: "Network" } };

describe("IncidentListPage", () => {
    beforeEach(() => {
        mocks.categories.mockResolvedValue({ data: { categories: [] } });
        mocks.assignable.mockResolvedValue({ data: { users: [] } });
    });

    it("renders incident number, title, status, priority, and detail link", async () => {
        mocks.list.mockResolvedValueOnce({ data: { items: [incident], pagination: page } });
        renderWithProviders(<IncidentListPage />, { authValue: { isStaff: false } });
        expect(await screen.findByText("INC-1001")).toBeInTheDocument();
        expect(screen.getByText("VPN disconnects")).toBeInTheDocument();
        expect(screen.getByText("New")).toBeInTheDocument();
        expect(screen.getByText("High")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "INC-1001" })).toHaveAttribute("href", "/incidents/incident-1");
        expect(mocks.list).toHaveBeenCalledWith({ page: 1, limit: 10 });
    });

    it("shows the empty-state action when no incidents match", async () => {
        mocks.list.mockResolvedValueOnce({ data: { items: [], pagination: { ...page, total: 0 } } });
        renderWithProviders(<IncidentListPage />, { authValue: { isStaff: false } });
        expect(await screen.findByText("No incidents match these filters.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Raise an incident" })).toBeInTheDocument();
    });

    it("shows a recoverable API error", async () => {
        mocks.list.mockRejectedValueOnce(new Error("Incident service unavailable"));
        renderWithProviders(<IncidentListPage />, { authValue: { isStaff: false } });
        expect(await screen.findByText("Could not load this data")).toBeInTheDocument();
        expect(screen.getByText("Incident service unavailable")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Try again/i })).toBeInTheDocument();
    });

    it("uses URL filter parameters in the incident query", async () => {
        mocks.list.mockResolvedValueOnce({ data: { items: [], pagination: { ...page, total: 0 } } });
        renderWithProviders(<IncidentListPage />, { route: "/incidents?status=new&priority=high&page=2&limit=20", authValue: { isStaff: false } });
        await screen.findByText("No incidents match these filters.");
        expect(mocks.list).toHaveBeenCalledWith({ status: ["new"], priority: ["high"], page: 2, limit: 20 });
    });
});
