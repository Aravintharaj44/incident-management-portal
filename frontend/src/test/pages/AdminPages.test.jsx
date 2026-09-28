import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test-utils";
import CategoriesPage from "../../pages/admin/CategoriesPage";
import DepartmentsPage from "../../pages/admin/DepartmentsPage";
import IntakeFailuresPage from "../../pages/admin/IntakeFailuresPage";
import OAuthClientsPage from "../../pages/admin/OAuthClientsPage";
import UsersPage from "../../pages/admin/UsersPage";

const api = vi.hoisted(() => ({
    categories: vi.fn(), categoryList: vi.fn(), categoryCreate: vi.fn(), categoryUpdate: vi.fn(), categoryRemove: vi.fn(),
    departments: vi.fn(), departmentGet: vi.fn(), departmentCreate: vi.fn(), departmentUpdate: vi.fn(), departmentRemove: vi.fn(),
    users: vi.fn(), userCreate: vi.fn(), userUpdate: vi.fn(), resetPassword: vi.fn(), assignable: vi.fn(),
    intake: vi.fn(), resolve: vi.fn(), dismiss: vi.fn(),
    clients: vi.fn(), clientCreate: vi.fn(), clientUpdate: vi.fn(), clientRevoke: vi.fn(),
}));

vi.mock("../../api", () => ({
    categoryApi: { withCounts: api.categories, list: api.categoryList, create: api.categoryCreate, update: api.categoryUpdate, remove: api.categoryRemove },
    departmentApi: { list: api.departments, get: api.departmentGet, create: api.departmentCreate, update: api.departmentUpdate, remove: api.departmentRemove },
    userApi: { list: api.users, create: api.userCreate, update: api.userUpdate, resetPassword: api.resetPassword, assignable: api.assignable },
    intakeApi: { list: api.intake, resolve: api.resolve, dismiss: api.dismiss },
    oauthClientsApi: { list: api.clients, create: api.clientCreate, update: api.clientUpdate, revoke: api.clientRevoke },
}));

const page = { page: 1, limit: 10, total: 0 };
beforeEach(() => {
    vi.clearAllMocks();
    api.categories.mockResolvedValue({ data: { categories: [{ _id: "cat-1", name: "Network", description: "Network events", isActive: true, incidentCount: 0, createdAt: "2025-01-01" }] } });
    api.categoryList.mockResolvedValue({ data: { categories: [] } });
    api.categoryCreate.mockResolvedValue({}); api.categoryUpdate.mockResolvedValue({}); api.categoryRemove.mockResolvedValue({ message: "Deleted" });
    api.departments.mockResolvedValue({ data: { departments: [{ _id: "dep-1", title: "Operations", description: "Handles incidents", categories: [], memberCount: 0, isActive: true, createdAt: "2025-01-01" }] } });
    api.departmentGet.mockResolvedValue({ data: { department: { categories: [], members: [] } } }); api.departmentCreate.mockResolvedValue({}); api.departmentUpdate.mockResolvedValue({}); api.departmentRemove.mockResolvedValue({});
    api.users.mockResolvedValue({ data: { items: [{ _id: "user-1", name: "Asha Admin", email: "asha@example.test", role: "admin", isActive: true }], pagination: page } });
    api.userCreate.mockResolvedValue({}); api.userUpdate.mockResolvedValue({}); api.resetPassword.mockResolvedValue({}); api.assignable.mockResolvedValue({ data: { users: [] } });
    api.intake.mockResolvedValue({ data: { items: [{ _id: "log-1", source: "email", vendor: "Mail", errorReason: "Missing title", status: "Failed", createdAt: "2025-01-01" }] } }); api.resolve.mockResolvedValue({}); api.dismiss.mockResolvedValue({});
    api.clients.mockResolvedValue({ data: { items: [{ id: "client-1", name: "Monitor", clientId: "client-id", scopes: [], isActive: true, createdAt: "2025-01-01" }], pagination: page } }); api.clientCreate.mockResolvedValue({ data: { client: { name: "New", clientId: "id" }, clientSecret: "secret" } }); api.clientUpdate.mockResolvedValue({}); api.clientRevoke.mockResolvedValue({});
});

describe("admin pages", () => {
    it("lists categories and submits a new category through the real form", async () => {
        const user = userEvent.setup();
        renderWithProviders(<CategoriesPage />);
        expect(await screen.findByText("Network")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: /add category/i }));
        await user.type(screen.getByLabelText("Name"), "Security");
        await user.click(screen.getByRole("button", { name: /^add category$/i }));
        expect(api.categoryCreate).toHaveBeenCalledWith(expect.objectContaining({ name: "Security" }));
    }, 10000);

    it("renders departments and their empty member state", async () => {
        renderWithProviders(<DepartmentsPage />);
        expect(await screen.findByText("Operations")).toBeInTheDocument();
        expect(screen.getByText("0")).toBeInTheDocument();
        expect(api.departments).toHaveBeenCalled();
    });

    it("renders intake failures and resolves a failed record", async () => {
        const user = userEvent.setup();
        renderWithProviders(<IntakeFailuresPage />);
        expect(await screen.findByText("Missing title")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Resolve" }));
        expect(api.resolve).toHaveBeenCalledWith("log-1");
    });

    it("renders API clients and exposes search input", async () => {
        renderWithProviders(<OAuthClientsPage />);
        expect(await screen.findByText("Monitor")).toBeInTheDocument();
        expect(screen.getByPlaceholderText("Search name or client ID")).toBeInTheDocument();
    });

    it("renders users with current-user identity and account controls", async () => {
        renderWithProviders(<UsersPage />, { authValue: { user: { id: "user-1", role: "admin" }, isLoading: false, isAuthenticated: true } });
        expect(await screen.findByText("Asha Admin")).toBeInTheDocument();
        expect(screen.getByText("(you)")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /add user/i })).toBeInTheDocument();
    });
});
