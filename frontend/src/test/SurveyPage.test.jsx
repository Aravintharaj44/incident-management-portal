import { describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "./test-utils";
import SurveyPage from "../pages/survey/SurveyPage";

const mocks = vi.hoisted(() => ({ get: vi.fn(), submit: vi.fn() }));
vi.mock("../api", () => ({ surveyApi: mocks }));

const renderSurvey = (route) => renderWithProviders(
    <Routes><Route path="/survey/:token" element={<SurveyPage />} /></Routes>,
    { route }
);

describe("SurveyPage", () => {
    it("shows an unavailable state when a survey cannot be loaded", async () => {
        mocks.get.mockRejectedValueOnce(new Error("Survey link has expired"));
        renderSurvey("/survey/expired");
        expect(await screen.findByText("Survey unavailable")).toBeInTheDocument();
        expect(screen.getByText(/Survey link has expired/)).toBeInTheDocument();
    });

    it("shows a completed survey without allowing a second submission", async () => {
        mocks.get.mockResolvedValueOnce({ data: { survey: { status: "completed" } } });
        renderSurvey("/survey/complete");
        expect(await screen.findByText(/feedback has been successfully submitted/i)).toBeInTheDocument();
        expect(mocks.submit).not.toHaveBeenCalled();
    });
});
