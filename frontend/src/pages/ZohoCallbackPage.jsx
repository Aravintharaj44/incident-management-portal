import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Button, Card, Result, Space, Spin, Typography } from "antd";
import { useAuth } from "../hooks/useAuth";
import AuthShell from "../components/layout/AuthShell";

const { Title } = Typography;

const ZOHO_LOGIN_ERRORS = {
    not_configured: "Zoho sign-in has not been configured by the administrator. Please use your portal password or contact support.",
    access_denied: "You denied the sign-in request. No changes were made to your account.",
    invalid_state: "The security check did not match. Please try signing in again.",
    invalid_request: "The sign-in request was not valid. Please try again.",
    token_exchange_failed: "Zoho could not complete the sign-in. Please try again.",
    verification_failed: "Zoho's identity could not be verified. Please try again.",
    unverified_email: "Your Zoho account does not have a verified email address we can use to sign you in.",
    account_inactive: "This account has been deactivated. Contact your administrator.",
    email_in_use: "This email address is already linked to a different Zoho account.",
    not_provisioned: "Your account has not been provisioned yet. Contact your administrator.",
};

const ZohoCallbackPage = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [error, setError] = useState(null);
    const { completeGoogleLogin } = useAuth(); // generic SSO-completion helper, reused as-is
    const navigate = useNavigate();

    const token = searchParams.get("token");
    const errorCode = searchParams.get("error");

    const errorText = useMemo(
        () =>
            errorCode ? ZOHO_LOGIN_ERRORS[errorCode] || ZOHO_LOGIN_ERRORS.invalid_request : null,
        [errorCode]
    );

    useEffect(() => {
        if (!token || error || errorCode) return;

        const finishLogin = async () => {
            try {
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
                        title="Signing you in with Zoho..."
                        subTitle="Almost there - setting up your session."
                    />
                ) : (
                    <>
                        <Title level={4} style={{ marginTop: 0 }}>
                            Zoho sign-in did not complete
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

export default ZohoCallbackPage;