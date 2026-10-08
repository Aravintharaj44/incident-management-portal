import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test-utils";
import ProblemsPage from "../../pages/problems/ProblemsPage";
import ProblemCreatePage from "../../pages/problems/ProblemCreatePage";
import ProblemDetailPage from "../../pages/problems/ProblemDetailPage";
import KnownErrorsPage from "../../pages/problems/KnownErrorsPage";

const api = vi.hoisted(() => ({ problems: vi.fn(), getProblem: vi.fn(), createProblem: vi.fn(), knownErrors: vi.fn(), knownError: vi.fn(), assignable: vi.fn(), incidents: vi.fn() }));
vi.mock("../../api", () => ({
    problemApi: { list: api.problems, get: api.getProblem, create: api.createProblem, updateStatus: vi.fn(), updateOwner: vi.fn(), update: vi.fn(), linkIncident: vi.fn(), unlinkIncident: vi.fn(), unlinkKb: vi.fn(), remove: vi.fn() },
    knownErrorApi: { list: api.knownErrors, get: api.knownError },
    userApi: { assignable: api.assignable }, incidentApi: { list: api.incidents }, kbApi: { list: vi.fn(), linkToProblem: vi.fn() },
}));
vi.mock("../../components/problems/ProblemRcaPanel", () => ({ default: () => <div>RCA panel</div> }));
vi.mock("../../components/incidents/KbLinkPanel", () => ({ default: () => <div>Knowledge links</div> }));
vi.mock("../../components/incidents/ActivityTimeline", () => ({ default: () => <div>Activity history</div> }));
vi.mock("react-router-dom", async (importOriginal) => ({ ...(await importOriginal()), useParams: () => ({ id: "problem-1" }) }));

const pagination = { page: 1, limit: 10, total: 1 };
beforeEach(() => {
    vi.clearAllMocks();
    api.assignable.mockResolvedValue({ data: { users: [{ _id: "owner-1", name: "Ravi Agent", email: "ravi@example.test" }] } });
    api.incidents.mockResolvedValue({ data: { items: [] } });
    api.problems.mockResolvedValue({ data: { items: [{ _id: "problem-1", problemNumber: "PRB-001", title: "VPN outage", status: "investigating", category: { name: "Network" }, ownerId: null, createdAt: "2025-01-01" }], pagination } });
    api.createProblem.mockResolvedValue({ data: { problem: { _id: "problem-2", problemNumber: "PRB-002" } } });
    api.knownErrors.mockResolvedValue({ data: { items: [{ _id: "problem-1", problemNumber: "PRB-001", title: "VPN workaround", status: "known_error", category: { name: "Network" }, workaround: "Restart client", updatedAt: "2025-01-01" }], pagination } });
    api.knownError.mockResolvedValue({ data: { problem: { problemNumber: "PRB-001", title: "VPN workaround", status: "known_error", category: { name: "Network" } }, rca: null, incidents: [] } });
    api.getProblem.mockResolvedValue({ data: { problem: { _id: "problem-1", problemNumber: "PRB-001", title: "VPN outage", description: "Users cannot connect to VPN.", workaround: "Use backup gateway", status: "investigating", ownerId: { name: "Ravi Agent" }, category: { name: "Network" }, createdAt: "2025-01-01" }, incidents: [], rca: null, activity: [], permissions: { canManage: true, isAdmin: true } } });
});

describe("problem management pages", () => {
    it("lists problems with filters and a navigable creation action", async () => {
        renderWithProviders(<ProblemsPage />);
        expect(await screen.findByText("VPN outage")).toBeInTheDocument();
        expect(screen.getByPlaceholderText("Search title, reference or workaround")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /create problem/i })).toBeInTheDocument();
    });

    it("validates and submits the create-problem form", async () => {
        const user = userEvent.setup();
        renderWithProviders(<ProblemCreatePage />);
        await user.click(screen.getByRole("button", { name: /create problem/i }));
        expect(await screen.findByText("A title is required")).toBeInTheDocument();
        await user.type(screen.getByLabelText("Title"), "VPN connectivity failure");
        await user.type(screen.getByLabelText("Description"), "A recurring failure affects remote workers.");
        await user.click(screen.getByRole("button", { name: /create problem/i }));
        expect(api.createProblem).toHaveBeenCalledWith(expect.objectContaining({ title: "VPN connectivity failure" }));
    });

    it("opens a known-error record from the searchable catalogue", async () => {
        const user = userEvent.setup();
        renderWithProviders(<KnownErrorsPage />);
        expect(await screen.findByText("VPN workaround")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "PRB-001" }));
        expect(await screen.findByText("Owner Unassigned")).toBeInTheDocument();
        expect(api.knownError).toHaveBeenCalledWith("problem-1");
    });

    it("loads a problem detail with management, activity and knowledge sections", async () => {
        const user = userEvent.setup();
        renderWithProviders(<ProblemDetailPage />);
        expect(await screen.findByText("Users cannot connect to VPN.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /edit Edit/i })).toBeInTheDocument();
        await user.click(screen.getByRole("tab", { name: "Root cause analysis" }));
        expect(screen.getByText("RCA panel")).toBeInTheDocument();
        await user.click(screen.getByRole("tab", { name: "KB Article" }));
        expect(screen.getByText("Knowledge links")).toBeInTheDocument();
    });
});