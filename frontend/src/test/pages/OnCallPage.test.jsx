import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test-utils";
import OnCallPage from "../../pages/admin/OnCallPage";

const mocks = vi.hoisted(() => ({ calendar: vi.fn(), assignable: vi.fn(), departments: vi.fn() }));
vi.mock("../../api/onCallApi", () => ({ getOnCallCalendar: mocks.calendar, createOnCallRoster: vi.fn() }));
vi.mock("../../api/users", () => ({ userApi: { assignable: mocks.assignable } }));
vi.mock("../../api/departments", () => ({ departmentApi: { list: mocks.departments } }));

describe("OnCallPage", () => {
    beforeEach(() => {
        mocks.calendar.mockResolvedValue({ schedules: [{ _id: "shift-1", department: "dept-1", startTime: "2025-01-01", endTime: "2025-01-02", ackWindowMinutes: 15, escalationChain: [{ step: 1, user: "agent-1" }] }] });
        mocks.assignable.mockResolvedValue({ data: { users: [{ _id: "agent-1", name: "Asha Agent" }] } });
        mocks.departments.mockResolvedValue({ data: { departments: [{ _id: "dept-1", title: "IT Operations" }] } });
    });
    it("loads rosters, departments, and escalation members", async () => {
        renderWithProviders(<OnCallPage />);
        expect(await screen.findByText("On-Call & Escalation Management")).toBeInTheDocument();
        expect(await screen.findByText("IT Operations")).toBeInTheDocument();
        expect(screen.getByText("Asha Agent")).toBeInTheDocument();
        expect(mocks.calendar).toHaveBeenCalledOnce();
    });
    it("shows the roster creation action", async () => {
        renderWithProviders(<OnCallPage />);
        expect(await screen.findByRole("button", { name: /Create Roster$/ })).toBeInTheDocument();
    });
});