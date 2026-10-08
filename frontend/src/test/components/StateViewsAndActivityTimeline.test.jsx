import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test-utils";
import { EmptyView, ErrorView, LoadingView } from "../../components/common/StateViews";
import ActivityTimeline from "../../components/incidents/ActivityTimeline";

describe("shared state views", () => {
    it("renders a loading message", () => {
        renderWithProviders(<LoadingView tip="Loading records..." />);
        expect(screen.getByText("Loading records...")).toBeInTheDocument();
    });

    it("renders an error and invokes its retry action", async () => {
        const user = userEvent.setup();
        const retry = vi.fn();
        renderWithProviders(<ErrorView error={new Error("Network unavailable")} onRetry={retry} />);
        expect(screen.getByText("Network unavailable")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: /Try again/ }));
        expect(retry).toHaveBeenCalledOnce();
    });

    it("renders an empty-state action", () => {
        renderWithProviders(<EmptyView description="No records" action={<button>Create record</button>} />);
        expect(screen.getByText("No records")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Create record" })).toBeInTheDocument();
    });
});

describe("ActivityTimeline", () => {
    it("renders its empty state", () => {
        renderWithProviders(<ActivityTimeline />);
        expect(screen.getByText("No activity recorded yet")).toBeInTheDocument();
    });

    it("renders a formatted activity entry", () => {
        renderWithProviders(<ActivityTimeline activity={[{
            _id: "activity-1",
            action: "status_changed",
            performedBy: { name: "Asha Agent" },
            oldValue: "new",
            newValue: "in_progress",
            note: "Starting investigation",
            createdAt: "2025-01-01T00:00:00.000Z",
        }]} />);
        expect(screen.getByText("Asha Agent")).toBeInTheDocument();
        expect(screen.getByRole("img", { name: "swap" })).toBeInTheDocument();
        expect(screen.getByText("Starting investigation")).toBeInTheDocument();
        expect(screen.getByText("new")).toBeInTheDocument();
        expect(screen.getByText("in_progress")).toBeInTheDocument();
    });
});