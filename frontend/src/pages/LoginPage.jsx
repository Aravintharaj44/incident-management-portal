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

const { Title, Text, Paragraph } = Typography;

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
