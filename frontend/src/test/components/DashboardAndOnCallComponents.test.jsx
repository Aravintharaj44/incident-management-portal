import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test-utils";
import StatCard from "../../components/dashboard/StatCard";
import { CategoryColumn, StatusPie, TrendLine } from "../../components/dashboard/Charts";
import AcknowledgePanel from "../../components/incidents/AcknowledgePanel";
import ActiveOnCallAlert from "../../components/incidents/ActiveOnCallAlert";

const acknowledge = vi.hoisted(() => vi.fn());
vi.mock("../../api/onCallApi", () => ({ acknowledgeOnCallIncident: acknowledge }));
vi.mock("@ant-design/charts", () => ({ Pie: () => <div>pie chart</div>, Column: () => <div>column chart</div>, Line: () => <div>line chart</div> }));

describe("dashboard and on-call components", () => {
    it("renders statistic props and its dashboard hint", () => {
        renderWithProviders(<StatCard title="Open incidents" value={4} hint="Requires attention" icon={<span>!</span>} />);
        expect(screen.getByText("Open incidents")).toBeInTheDocument();
        expect(screen.getByText("4")).toBeInTheDocument();
        expect(screen.getByText("Requires attention")).toBeInTheDocument();
    });

    it("uses useful empty states when dashboard chart series have no data", () => {
        renderWithProviders(<><StatusPie data={[]} /><CategoryColumn data={[{ label: "Network", count: 0 }]} /><TrendLine data={[]} /></>);
        expect(screen.getAllByText("No incidents yet")).toHaveLength(2);
        expect(screen.getByText("No activity in this period")).toBeInTheDocument();
    });

    it("acknowledges an unacknowledged incident and calls refresh", async () => {
        const user = userEvent.setup();
        const refresh = vi.fn();
        acknowledge.mockResolvedValue({});
        renderWithProviders(<AcknowledgePanel incident={{ _id: "inc-1", escalationLevel: 2 }} onRefresh={refresh} />);
        expect(screen.getByText("Unacknowledged")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: /acknowledge incident/i }));
        expect(acknowledge).toHaveBeenCalledWith("inc-1");
        expect(refresh).toHaveBeenCalled();
    });

    it("hides acknowledged alerts and renders an active critical alert", () => {
        const { rerender } = renderWithProviders(<ActiveOnCallAlert incident={{ _id: "inc-1", title: "Database down", priority: "P1", createdAt: new Date().toISOString(), department: { title: "Operations" } }} />);
        expect(screen.getByText(/critical on-call alert: database down/i)).toBeInTheDocument();
        rerender(<ActiveOnCallAlert incident={{ _id: "inc-1", acknowledgedAt: "2025-01-01" }} />);
        expect(screen.queryByText(/critical on-call alert/i)).not.toBeInTheDocument();
    });
});
