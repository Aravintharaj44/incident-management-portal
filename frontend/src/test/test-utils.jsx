import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App as AntApp } from "antd";
import { AuthContext } from "../context/authContextObject";

/**
 * Renders a component wrapped in the providers your real app tree supplies:
 * Router (with a controllable starting URL), Ant Design's App (for message/
 * modal context), and AuthContext (with a fake value you control per test).
 */
export const renderWithProviders = (
    ui,
    {
        route = "/",
        authValue = {
            user: null,
            isLoading: false,
            isAuthenticated: false,
            login: vi.fn(),
            register: vi.fn(),
            completeGoogleLogin: vi.fn(),
            logout: vi.fn(),
        },
        ...renderOptions
    } = {}
) => {
    return render(
        <MemoryRouter initialEntries={[route]}>
            <AntApp>
                <AuthContext.Provider value={authValue}>{ui}</AuthContext.Provider>
            </AntApp>
        </MemoryRouter>,
        renderOptions
    );
};

export * from "@testing-library/react";