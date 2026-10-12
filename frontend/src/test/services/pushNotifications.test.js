import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getToken: vi.fn(),
    getFirebaseMessaging: vi.fn(),
    registerPush: vi.fn(),
}));

vi.mock("firebase/messaging", () => ({
    getToken: mocks.getToken,
    onMessage: vi.fn(),
}));

vi.mock("../../services/firebase", () => ({
    getFirebaseMessaging: mocks.getFirebaseMessaging,
    getVapidKey: vi.fn(() => "test-vapid-key"),
    isFirebaseConfigured: vi.fn(() => true),
}));

vi.mock("../../api/notifications", () => ({
    notificationApi: {
        registerPush: mocks.registerPush,
    },
}));

import { syncPushToken } from "../../services/pushNotifications";

describe("push token synchronization", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        Object.defineProperty(window, "Notification", {
            configurable: true,
            value: { permission: "granted" },
        });
        Object.defineProperty(navigator, "serviceWorker", {
            configurable: true,
            value: {
                getRegistration: vi.fn().mockResolvedValue({}),
                register: vi.fn(),
            },
        });

        mocks.getFirebaseMessaging.mockResolvedValue({});
        mocks.getToken.mockResolvedValue("test-fcm-token");
        mocks.registerPush.mockResolvedValue({});
    });

    it("re-registers a locally saved token with the backend", async () => {
        localStorage.setItem("imp_fcm_token", "test-fcm-token");

        await expect(syncPushToken()).resolves.toBe("test-fcm-token");

        expect(mocks.registerPush).toHaveBeenCalledOnce();
        expect(mocks.registerPush).toHaveBeenCalledWith("test-fcm-token");
    });
});
