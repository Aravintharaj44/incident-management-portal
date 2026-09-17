import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Button, Card, Result, Space, Spin, Typography } from "antd";
import { useAuth } from "../hooks/useAuth";
import AuthShell from "../components/layout/AuthShell";

const { Title } = Typography;

/**
 * FR5-13 - the SPA half of the Google SSO callback.
 *
 * The backend redirects the browser to /auth/google/callback?token=... on
 * success or ?error=... on failure. The token is consumed immediately and the
 * query string is cleared so the portal JWT never lingers in the address bar.
 */

/** Error codes the backend sends in the query string, mapped to friendly text. */
const GOOGLE_LOGIN_ERRORS = {
    not_configured: "Google sign-in has not been configured by the administrator. Please use your portal password or contact support.",
    access_denied: "You denied the sign-in request. No changes were made to your account.",
    invalid_state: "The security check did not match. Please try signing in again.",
    invalid_request: "The sign-in request was not valid. Please try again.",
    token_exchange_failed: "Google could not complete the sign-in. Please try again.",
    verification_failed: "Google's identity could not be verified. Please try again.",
    unverified_email: "Your Google account does not have a verified email address we can use to sign you in.",
    account_inactive: "This account has been deactivated. Contact your administrator.",
    email_in_use: "This email address is already linked to a different Google account.",
    not_provisioned: "Your account has not been provisioned yet. Contact your administrator.",
};

const GoogleCallbackPage = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [error, setError] = useState(null);
    const { completeGoogleLogin } = useAuth();
    const navigate = useNavigate();

    const token = searchParams.get("token");
    const errorCode = searchParams.get("error");

    const errorText = useMemo(
        () =>
            errorCode ? GOOGLE_LOGIN_ERRORS[errorCode] || GOOGLE_LOGIN_ERRORS.invalid_request : null,
        [errorCode]
    );

    useEffect(() => {
        if (!token || error || errorCode) return;

        const finishLogin = async () => {
            try {
                // Consume the token first so it never lingers in the address bar.
                setSearchParams({}, { replace: true });
                await completeGoogleLogin(token);
                navigate("/dashboard", { replace: true });
            } catch (err) {
                setError(err);
            }
        };

        finishLogin();
    }, [token, errorCode, error, completeGoogleLogin, navigate, setSearchParams]);

    const signingIn = Boolean(token) && !error && !errorCode && !errorText;

    return (
        <AuthShell>
            <Card style={{ width: "100%", maxWidth: 460 }} variant="borderless">
                {signingIn ? (
                    <Result
                        icon={<Spin size="large" />}
                        title="Signing you in with Google..."
                        subTitle="Almost there - setting up your session."
                    />
                ) : (
                    <>
                        <Title level={4} style={{ marginTop: 0 }}>
                            Google sign-in did not complete
                        </Title>
                        <Alert
                            type="error"
                            showIcon
                            message={
                                errorText ||
                                error?.message ||
                                "No sign-in result was received. Please try again."
                            }
                            style={{ marginBottom: 20 }}
                        />
                        <Space wrap>
                            <Button type="primary" onClick={() => navigate("/login")}>
                                Back to sign in
                            </Button>
                        </Space>
                    </>
                )}
            </Card>
        </AuthShell>
    );
};

export default GoogleCallbackPage;