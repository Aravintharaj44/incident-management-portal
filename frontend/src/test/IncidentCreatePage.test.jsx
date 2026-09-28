import { describe, expect, it, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "./test-utils";
import IncidentCreatePage from "../pages/IncidentCreatePage";

const mocks = vi.hoisted(() => ({ create: vi.fn(), categories: vi.fn(), upload: vi.fn() }));
vi.mock("../api", () => ({
    incidentApi: { create: mocks.create },
    categoryApi: { list: mocks.categories },
    attachmentApi: { upload: mocks.upload },
}));
const Destination = () => <div>Incident detail destination</div>;
const renderCreate = () => renderWithProviders(
    <Routes><Route path="/incidents/new" element={<IncidentCreatePage />} /><Route path="/incidents/:id" element={<Destination />} /></Routes>,
    { route: "/incidents/new" }
);

describe("IncidentCreatePage", () => {
    beforeEach(() => mocks.categories.mockResolvedValue({ data: { categories: [{ _id: "cat-network", name: "Network" }] } }));

    it("renders the creation form and validates required fields", async () => {
        const user = userEvent.setup();
        renderCreate();
        expect(screen.getByRole("heading", { name: "Raise an incident" })).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/VPN disconnects every few minutes/)).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: /Submit incident/ }));
        expect(await screen.findByText("Please summarise the issue")).toBeInTheDocument();
    });

    it("creates an incident and navigates to its detail page", async () => {
        const user = userEvent.setup();
        mocks.create.mockResolvedValueOnce({ data: { incident: { _id: "incident-1", incidentNumber: "INC-1001" } } });
        renderCreate();
        await user.type(screen.getByPlaceholderText(/VPN disconnects every few minutes/), "VPN disconnects for finance");
        await user.type(screen.getByPlaceholderText(/Steps to reproduce/), "VPN disconnects while finance users submit reports.");
        await user.click(await screen.getAllByRole("combobox")[0]);
        await user.click(await screen.findByText("Network", { selector: ".ant-select-item-option-content" }));
        await user.click(screen.getByRole("button", { name: /Submit incident/ }));

        expect(mocks.create).toHaveBeenCalledWith({ title: "VPN disconnects for finance", description: "VPN disconnects while finance users submit reports.", category: "cat-network", priority: "medium" });
        expect(await screen.findByText("Incident detail destination")).toBeInTheDocument();
    });

    it("shows an API error and restores the submit control", async () => {
        const user = userEvent.setup();
        mocks.create.mockRejectedValueOnce(new Error("Could not create incident"));
        renderCreate();
        await user.type(screen.getByPlaceholderText(/VPN disconnects every few minutes/), "VPN disconnects for finance");
        await user.type(screen.getByPlaceholderText(/Steps to reproduce/), "VPN disconnects while finance users submit reports.");
        await user.click(await screen.getAllByRole("combobox")[0]);
        await user.click(await screen.findByText("Network", { selector: ".ant-select-item-option-content" }));
        await user.click(screen.getByRole("button", { name: /Submit incident/ }));

        expect(await screen.findByText("Could not create incident")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Submit incident/ })).not.toBeDisabled();
    });
});

