import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test-utils";
import KbListPage from "../../pages/kb/KbListPage";
import KbCreateEditPage from "../../pages/kb/KbCreateEditPage";
import KbDetailPage from "../../pages/kb/KbDetailPage";

const api = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), feedback: vi.fn(), categories: vi.fn() }));
vi.mock("../../api", () => ({ kbApi: { list: api.list, get: api.get, create: api.create, update: api.update, feedback: api.feedback, remove: vi.fn() }, categoryApi: { list: api.categories } }));
vi.mock("../../components/editor/RichTextEditor", () => ({ default: ({ value, onChange, placeholder }) => <textarea aria-label="Body editor" value={value || ""} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /> }));
vi.mock("react-router-dom", async (importOriginal) => ({ ...(await importOriginal()), useParams: () => ({ id: "article-1" }) }));

beforeEach(() => {
    vi.clearAllMocks();
    api.list.mockResolvedValue({ data: { items: [{ _id: "article-1", title: "Reset your VPN", status: "published", categories: [{ name: "Network" }], authorID: { name: "Asha" }, helpfulnessRatio: "100%", createdAt: "2025-01-01" }], pagination: { page: 1, limit: 10, total: 1 } } });
    api.categories.mockResolvedValue({ data: { categories: [{ _id: "cat-1", name: "Network", isActive: true }] } });
    api.create.mockResolvedValue({ data: { article: { _id: "article-2" } } });
    api.get.mockResolvedValue({ data: { article: { _id: "article-1", title: "Reset your VPN", body: "<p>Restart the VPN client.</p>", status: "published", authorID: { name: "Asha" }, categories: [{ _id: "cat-1", name: "Network" }], tags: ["vpn"], helpfulCount: 2, notHelpfulCount: 0, helpfulnessRatio: "100%", createdAt: "2025-01-01" }, userFeedback: null, permissions: { canEdit: true, canManage: true } } });
    api.feedback.mockResolvedValue({ data: { article: { title: "Reset your VPN" }, userFeedback: "helpful" } });
});

describe("knowledge base pages", () => {
    it("lists published articles and staff search/create controls", async () => {
        renderWithProviders(<KbListPage />, { authValue: { user: { role: "support_agent" }, isStaff: true, isLoading: false, isAuthenticated: true } });
        expect(await screen.findByText("Reset your VPN")).toBeInTheDocument();
        expect(screen.getByPlaceholderText("Search title, body or tags")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /new article/i })).toBeInTheDocument();
    });

    it("loads and updates an article using its real edit form", async () => {
        const user = userEvent.setup();
        renderWithProviders(<KbCreateEditPage />);
        expect(await screen.findByRole("button", { name: /update article/i })).toBeInTheDocument();
        await user.clear(screen.getByLabelText("Title"));
        await user.type(screen.getByLabelText("Title"), "VPN reset instructions");
        await user.click(screen.getByRole("button", { name: /update article/i }));
        expect(api.update).toHaveBeenCalledWith("article-1", expect.objectContaining({ title: "VPN reset instructions" }));
    });

    it("displays an article and records helpful feedback", async () => {
        const user = userEvent.setup();
        renderWithProviders(<KbDetailPage />);
        expect(await screen.findByText("Restart the VPN client.")).toBeInTheDocument();
        expect(screen.getByText("Network")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: /^like Helpful$/i }));
        expect(api.feedback).toHaveBeenCalledWith("article-1", "helpful");
        expect(await screen.findByText("Your feedback: Helpful")).toBeInTheDocument();
    });
});
