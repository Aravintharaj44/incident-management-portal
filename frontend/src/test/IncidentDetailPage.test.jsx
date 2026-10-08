import { describe, expect, it, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "./test-utils";
import IncidentDetailPage from "../pages/IncidentDetailPage";

const mocks = vi.hoisted(() => ({ get: vi.fn(), assignmentOptions: vi.fn(), updateStatus: vi.fn(), assign: vi.fn(), categories: vi.fn(), problemList: vi.fn() }));
vi.mock("../api", () => ({
    incidentApi: { get: mocks.get, assignmentOptions: mocks.assignmentOptions, updateStatus: mocks.updateStatus, assign: mocks.assign, update: vi.fn(), remove: vi.fn(), linkProblem: vi.fn(), unlinkProblem: vi.fn() },
    categoryApi: { list: mocks.categories },
    problemApi: { list: mocks.problemList },
}));
vi.mock("../components/incidents/AcknowledgePanel", () => ({ default: () => null }));
vi.mock("../components/incidents/ActiveOnCallAlert", () => ({ default: () => null }));
vi.mock("../components/incidents/AttachmentPanel", () => ({ default: () => <div>Attachments panel</div> }));
vi.mock("../components/incidents/LinkedIncidentPanel", () => ({ default: () => <div>Linked incidents panel</div> }));
vi.mock("../components/incidents/RcaPanel", () => ({ default: () => <div>RCA panel</div> }));
vi.mock("../components/incidents/IncidentKBArticles", () => ({ default: () => <div>KB articles panel</div> }));

const incident = { _id: "incident-1", incidentNumber: "INC-1001", title: "VPN disconnects", description: "Finance users lose their VPN connection.", status: "new", priority: "high", category: { _id: "cat-network", name: "Network" }, department: { _id: "dept-it", title: "IT Operations" }, assignedTo: { _id: "agent-1", name: "Asha Agent", role: "agent" }, reportedBy: { _id: "user-1", name: "Ravi Reporter", role: "user" }, createdAt: "2025-01-01T00:00:00.000Z", dueBy: "2025-01-02T00:00:00.000Z", intakeSource: "portal", isAcknowledged: true };
const payload = () => ({ data: { incident, comments: [{ _id: "comment-1", message: "Investigating", createdAt: "2025-01-01", author: { _id: "agent-1", name: "Asha Agent", role: "agent" } }], activity: [], attachments: [], permissions: { canAssign: true, canChangeStatus: true, canEdit: false, canDelete: false, canUseInternalNotes: true, canManageLinks: false, canManageProblems: false }, correlation: {}, rca: null, problem: null } });
const renderDetail = (authValue = { isStaff: true, isAdmin: true }) => renderWithProviders(<Routes><Route path="/incidents/:id" element={<IncidentDetailPage />} /></Routes>, { route: "/incidents/incident-1", authValue });

describe("IncidentDetailPage", () => {
    beforeEach(() => {
        mocks.get.mockReset(); mocks.assignmentOptions.mockReset(); mocks.updateStatus.mockReset(); mocks.assign.mockReset();
        mocks.get.mockResolvedValue(payload());
        mocks.assignmentOptions.mockResolvedValue({ data: { departments: [{ _id: "dept-it", title: "IT Operations", members: [{ _id: "agent-1", name: "Asha Agent", role: "agent" }] }] } });
        mocks.categories.mockResolvedValue({ data: { categories: [] } });
    });

    it("loads incident details and the comments section", async () => {
        renderDetail();
        expect(await screen.findByRole("heading", { name: "VPN disconnects" })).toBeInTheDocument();
        expect(screen.getAllByText("INC-1001").length).toBeGreaterThan(0);
        expect(screen.getAllByText("High").length).toBeGreaterThan(0);
        expect(screen.getByText("Network")).toBeInTheDocument();
        expect(screen.getAllByText("IT Operations")[0]).toBeInTheDocument();
        expect(screen.getAllByText("Asha Agent").length).toBeGreaterThan(0);
        expect(screen.getByText("Investigating")).toBeInTheDocument();
    });

    it("shows loading while the incident request is pending", () => {
        mocks.get.mockReturnValue(new Promise(() => {}));
        renderDetail();
        expect(screen.getByText("Loading incident...")).toBeInTheDocument();
    });

    it("shows a recoverable detail API error", async () => {
        mocks.get.mockRejectedValueOnce(new Error("Incident was not found"));
        renderDetail();
        expect(await screen.findByText("Could not open this incident")).toBeInTheDocument();
        expect(screen.getByText("Incident was not found")).toBeInTheDocument();
    });

    it("displays authorized assignment controls and updates an allowed status", async () => {
        const user = userEvent.setup();
        mocks.updateStatus.mockResolvedValueOnce({});
        mocks.get.mockResolvedValueOnce({ data: { ...payload().data, incident: { ...incident, assignedTo: null } } });
        renderDetail();
        expect(await screen.findByText("Assignment")).toBeInTheDocument();
        expect(screen.getByText(/Only active members of the assigned department can be assigned/)).toBeInTheDocument();
        mocks.assign.mockResolvedValueOnce({});
        const assignmentControls = await screen.findAllByRole("combobox");
       await user.click(assignmentControls.at(-1));
        await user.click(await screen.findByText("Asha Agent (Agent)", { selector: ".ant-select-item-option-content" }));
        await waitFor(() => expect(mocks.assign).toHaveBeenCalledWith("incident-1", { department: "dept-it", assignedTo: "agent-1" }));
        await user.click(screen.getByRole("button", { name: /Move to In Progress/ }));
        await waitFor(() => expect(mocks.updateStatus).toHaveBeenCalledWith("incident-1", { status: "in_progress" }));
    });
    it("prevents an admin from selecting a member before a department is selected", async () => {
        mocks.get.mockResolvedValueOnce({ data: { ...payload().data, incident: { ...incident, department: null, assignedTo: null } } });
        renderDetail();
        await screen.findByText("Assignment");
        const disabledMemberControl = screen.getByText("Select a department first");
        expect(disabledMemberControl.closest(".ant-select")).toHaveClass("ant-select-disabled");
        expect(mocks.assign).not.toHaveBeenCalled();
    });
});

