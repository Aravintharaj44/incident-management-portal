import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test-utils";
import DashboardPage from "../../pages/DashboardPage";

const mocks = vi.hoisted(() => ({ summary: vi.fn(), charts: vi.fn(), recent: vi.fn(), advanced: vi.fn(), categories: vi.fn() }));
vi.mock("../../api", () => ({
    dashboardApi: mocks,
    categoryApi: { list: mocks.categories },
    actionItemDashboardApi: { summary: vi.fn() },
    csatDashboardApi: { summary: vi.fn(), trend: vi.fn() },
}));
vi.mock("../../components/dashboard/Charts", () => ({
    StatusPie: () => <div>Status chart</div>, PriorityColumn: () => <div>Priority chart</div>,
    CategoryColumn: () => <div>Category chart</div>, TrendLine: () => <div>Trend chart</div>,
}));
vi.mock("@ant-design/charts", () => ({ Line: () => <div /> }));

const response = () => {
    mocks.summary.mockResolvedValue({ data: { counts: { open: 3, new: 1, inProgress: 1, overdue: 0, resolved: 1, total: 3 }, byStatus: [], byPriority: [] } });
    mocks.charts.mockResolvedValue({ data: { byCategory: [] } });
    mocks.recent.mockResolvedValue({ data: { overdue: [], recent: [], myQueue: [] } });
    mocks.advanced.mockResolvedValue({ data: { rootCauses: [], majorIncidents: [], performance: [], trend: [], resolution: {} } });
    mocks.categories.mockResolvedValue({ data: { categories: [] } });
};

describe("DashboardPage", () => {
    beforeEach(() => { vi.clearAllMocks(); response(); });
    it("shows a loading state while dashboard data is pending", () => {
        mocks.summary.mockReturnValue(new Promise(() => {}));
        renderWithProviders(<DashboardPage />, { authValue: { user: { name: "Jane Doe" }, isStaff: false, isAdmin: false } });
        expect(screen.getByText("Building your dashboard...")).toBeInTheDocument();
    });
    it("renders user counts and analytics after API data loads", async () => {
        renderWithProviders(<DashboardPage />, { authValue: { user: { name: "Jane Doe" }, isStaff: false, isAdmin: false } });
        expect(await screen.findByText("Good to see you, Jane")).toBeInTheDocument();
        expect(screen.getByText("Advanced analytics")).toBeInTheDocument();
        expect(screen.getByText("Status chart")).toBeInTheDocument();
        expect(mocks.charts).toHaveBeenCalledWith(30);
    });
    it("shows a recoverable error when dashboard data fails", async () => {
        mocks.summary.mockRejectedValueOnce(new Error("Dashboard unavailable"));
        renderWithProviders(<DashboardPage />, { authValue: { user: { name: "Jane Doe" }, isStaff: false, isAdmin: false } });
        expect(await screen.findByText("Dashboard unavailable")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Try again/ })).toBeInTheDocument();
    });
});