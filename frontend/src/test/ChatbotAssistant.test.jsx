import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "./test-utils";
import ChatbotAssistant from "../components/chatbot/ChatbotAssistant";
import { chatbotApi } from "../api/chatbot";

vi.mock("../api/chatbot", () => ({ chatbotApi: { sendMessage: vi.fn() } }));

const menu = (message, options, conversationId = "conversation-1") => ({
    success: true,
    message: "Chatbot response",
    data: { conversationId, type: "menu", message, options },

});

describe("ChatbotAssistant", () => {
    it("renders the payload message and dynamic main-menu options", async () => {
        chatbotApi.sendMessage.mockResolvedValueOnce(menu("How can I help you?", [{ id: "SHOW_INCIDENT_MENU", label: "Incidents" }, { id: "SHOW_INFORMATION_MENU", label: "Details / Information" }]));
        const user = userEvent.setup();
        renderWithProviders(<ChatbotAssistant />);
        await user.click(screen.getByRole("button", { name: "Open Incident Assistant" }));
        expect(await screen.findByText("How can I help you?")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Incidents" })).toBeInTheDocument();
        expect(screen.queryByText("Chatbot response")).not.toBeInTheDocument();
    });

    it("adds the selected label and preserves conversationId for dynamic category menus", async () => {
        chatbotApi.sendMessage.mockResolvedValueOnce(menu("How can I help you?", [{ id: "SHOW_INCIDENT_MENU", label: "Incidents" }]))
            .mockResolvedValueOnce(menu("Please select a category.", [{ id: "CATEGORY:access", label: "Access" }]))
            .mockResolvedValueOnce({ success: true, message: "Chatbot response", data: { conversationId: "conversation-1", type: "text", message: "Please describe the issue." } });
        const user = userEvent.setup();
        renderWithProviders(<ChatbotAssistant />);
        await user.click(screen.getByRole("button", { name: "Open Incident Assistant" }));
        await user.click(await screen.findByRole("button", { name: "Incidents" }));
        expect(chatbotApi.sendMessage).toHaveBeenLastCalledWith({ action: "SHOW_INCIDENT_MENU", conversationId: "conversation-1" });
        expect(await screen.findByText("Please select a category.")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Access" }));
        expect(screen.getAllByText("Access")).toHaveLength(2);
        expect(chatbotApi.sendMessage).toHaveBeenLastCalledWith({ action: "CATEGORY:access", conversationId: "conversation-1" });
        expect(await screen.findByText("Please describe the issue.")).toBeInTheDocument();
    });
    it("selects, previews, and removes an image before sending", async () => {
        chatbotApi.sendMessage.mockResolvedValueOnce(menu("How can I help you?", []));
        const user = userEvent.setup();
        renderWithProviders(<ChatbotAssistant />);
        await user.click(screen.getByRole("button", { name: "Open Incident Assistant" }));
        const picker = document.querySelector('input[type="file"]');
        const image = new File([new Uint8Array([137, 80, 78, 71])], "error.png", { type: "image/png" });
        await user.upload(picker, image);
        expect(await screen.findByAltText("Selected image preview")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Remove image" }));
        expect(screen.queryByAltText("Selected image preview")).not.toBeInTheDocument();
    });
});
