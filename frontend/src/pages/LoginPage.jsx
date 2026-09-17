import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import {
    Alert,
    App,
    Button,
    Card,
    Checkbox,
    Divider,
    Form,
    Input,
    Space,
    Typography,
} from "antd";
import {
    LockOutlined,
    MailOutlined,
    SafetyCertificateOutlined,
} from "@ant-design/icons";
import { useAuth } from "../hooks/useAuth";
import AuthShell from "../components/layout/AuthShell";
import { googleAuthStartUrl, zohoAuthStartUrl } from "../api";
import { ZohoIcon } from '../components/zohoIcon/zohoIcon';
const { Title, Text, Paragraph } = Typography;

/** Small inline "G" so the SSO button looks familiar without a new icon dependency. */
const GoogleGlyph = () => (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
        <path
            fill="#EA4335"
            d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
        />
        <path
            fill="#4285F4"
            d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
        />
        <path
            fill="#FBBC05"
            d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
        />
        <path
            fill="#34A853"
            d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
        />
    </svg>
);

/** The demo accounts created by `npm run seed`, offered as one-click fills. */
const DEMO_ACCOUNTS = [
    { role: "Admin", email: "admin@zybisys.com" },
    { role: "Support Agent", email: "rahul.agent@zybisys.com" },
    { role: "End User", email: "karthik@zybisys.com" },
];

const LoginPage = () => {
    const [form] = Form.useForm();
    const { login, isAuthenticated } = useAuth();
    const { message } = App.useApp();
    const navigate = useNavigate();
    const location = useLocation();

    const [submitting, setSubmitting] = useState(false);
    const [googleStarting, setGoogleStarting] = useState(false);
    const [zohoStarting, setZohoStarting] = useState(false); // ← this was missing
    const [error, setError] = useState(null);

    // Already signed in - skip the form entirely.
    if (isAuthenticated) return <Navigate to="/dashboard" replace />;

    const handleSubmit = async (values) => {
        setSubmitting(true);
        setError(null);

        try {
            const user = await login({ email: values.email, password: values.password });

            message.success(`Welcome back, ${user.name}`);

            // Return them to wherever the guard intercepted them.
            const destination = location.state?.from?.pathname || "/dashboard";
            navigate(destination, { replace: true });
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const fillDemo = (email) => {
        form.setFieldsValue({ email, password: "Password123" });
        setError(null);
    };

    const handleGoogleStart = () => {
        if (!googleStarting) {
            setGoogleStarting(true);
            setError(null);
            // Full-page navigation: the browser follows the redirect to Google.
            window.location.assign(googleAuthStartUrl);
        }
    };
    const handleZohoStart = () => {
        if (!zohoStarting) {
            setZohoStarting(true);
            setError(null);
            window.location.assign(zohoAuthStartUrl);
        }
    };


    return (
        <AuthShell>
            <Card style={{ width: "100%", maxWidth: 420 }} variant="borderless">
                <Space orientation="vertical" size={4} style={{ width: "100%", marginBottom: 24 }}>
                    <SafetyCertificateOutlined style={{ fontSize: 32, color: "#1677ff" }} />
                    <Title level={3} style={{ margin: 0 }}>
                        Sign in
                    </Title>
                    <Text type="secondary">Access the Incident Management Portal</Text>
                </Space>

                {error && (
                    <Alert
                        type="error"
                        message={error}
                        showIcon
                        closable
                        onClose={() => setError(null)}
                        style={{ marginBottom: 16 }}
                    />
                )}

                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSubmit}
                    requiredMark={false}
                    initialValues={{ remember: true }}
                    size="large"
                >
                    <Form.Item
                        name="email"
                        label="Email"
                        rules={[
                            { required: true, message: "Please enter your email" },
                            { type: "email", message: "That does not look like a valid email" },
                        ]}
                    >
                        <Input
                            prefix={<MailOutlined style={{ color: "#bfbfbf" }} />}
                            placeholder="you@company.com"
                            autoComplete="email"
                            autoFocus
                        />
                    </Form.Item>

                    <Form.Item
                        name="password"
                        label="Password"
                        rules={[{ required: true, message: "Please enter your password" }]}
                    >
                        <Input.Password
                            prefix={<LockOutlined style={{ color: "#bfbfbf" }} />}
                            placeholder="Your password"
                            autoComplete="current-password"
                        />
                    </Form.Item>

                    <Form.Item name="remember" valuePropName="checked" style={{ marginBottom: 16 }}>
                        <Checkbox>Keep me signed in</Checkbox>
                    </Form.Item>

                    <Button type="primary" htmlType="submit" block loading={submitting}>
                        Sign in
                    </Button>
                </Form>

                <Divider plain style={{ margin: "20px 0 12px" }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        or
                    </Text>
                </Divider>

                <div style={{ display: "flex", gap: 8 }}>
                    <Button
                        size="large"
                        icon={<GoogleGlyph />}
                        loading={googleStarting}
                        onClick={handleGoogleStart}
                        disabled={submitting}
                        style={{
                            flex: 1,
                            minWidth: 0,
                            height: "auto",
                            whiteSpace: "normal",
                            textAlign: "center",
                            padding: "8px 6px",
                            fontSize: 12,
                            lineHeight: 1.2,
                        }}
                    >
                        Continue with Google
                    </Button>
                    <Button
                        size="large"
                        icon={<ZohoIcon style={{ fontSize: '18px' }} />}
                        loading={zohoStarting}
                        onClick={handleZohoStart}
                        disabled={submitting}
                        style={{
                            flex: 1,
                            minWidth: 0,
                            height: "auto",
                            whiteSpace: "normal",
                            textAlign: "center",
                            padding: "8px 6px",
                            fontSize: 12,
                            lineHeight: 1.2,
                        }}
                    >
                        Continue with Zoho
                    </Button>
                </div>

                <Divider plain style={{ margin: "20px 0 12px" }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        Demo accounts
                    </Text>
                </Divider>

                <Space wrap size={8} style={{ width: "100%", justifyContent: "center" }}>
                    {DEMO_ACCOUNTS.map((account) => (
                        <Button key={account.email} size="small" onClick={() => fillDemo(account.email)}>
                            {account.role}
                        </Button>
                    ))}
                </Space>

                <Paragraph
                    type="secondary"
                    style={{ fontSize: 11, textAlign: "center", marginTop: 8, marginBottom: 0 }}
                >
                    Seeded password: Password123
                </Paragraph>

                <Divider style={{ margin: "16px 0" }} />

                <Text style={{ display: "block", textAlign: "center" }}>
                    No account yet? <Link to="/register">Create one</Link>
                </Text>
            </Card>
        </AuthShell>
    );
};

export default LoginPage;
