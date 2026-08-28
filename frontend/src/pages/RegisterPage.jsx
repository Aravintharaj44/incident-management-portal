import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Alert, App, Button, Card, Divider, Form, Input, Space, Typography } from "antd";
import { LockOutlined, MailOutlined, UserAddOutlined, UserOutlined } from "@ant-design/icons";
import { useAuth } from "../hooks/useAuth";
import AuthShell from "../components/layout/AuthShell";

const { Title, Text } = Typography;

/**
 * Self-registration (FR-01).
 *
 * Always produces an End User account - elevated roles are granted by an Admin
 * from the user administration screen, and the server enforces that regardless
 * of what this form sends.
 */
const RegisterPage = () => {
    const [form] = Form.useForm();
    const { register, isAuthenticated } = useAuth();
    const { message } = App.useApp();
    const navigate = useNavigate();

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    if (isAuthenticated) return <Navigate to="/dashboard" replace />;

    const handleSubmit = async (values) => {
        setSubmitting(true);
        setError(null);

        try {
            const user = await register({
                name: values.name,
                email: values.email,
                password: values.password,
            });

            message.success(`Welcome, ${user.name}. Your account is ready.`);
            navigate("/dashboard", { replace: true });
        } catch (err) {
            // 422 carries per-field messages; surface them on the fields.
            if (err.errors?.length) {
                form.setFields(
                    err.errors.map((item) => ({ name: item.field, errors: [item.message] }))
                );
            }
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AuthShell>
            <Card style={{ width: "100%", maxWidth: 440 }} variant="borderless">
                <Space orientation="vertical" size={4} style={{ width: "100%", marginBottom: 24 }}>
                    <UserAddOutlined style={{ fontSize: 32, color: "#1677ff" }} />
                    <Title level={3} style={{ margin: 0 }}>
                        Create your account
                    </Title>
                    <Text type="secondary">
                        You will be able to raise incidents and track your own tickets.
                    </Text>
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
                    size="large"
                >
                    <Form.Item
                        name="name"
                        label="Full name"
                        rules={[
                            { required: true, message: "Please enter your name" },
                            { min: 2, max: 80, message: "Name must be 2 to 80 characters" },
                        ]}
                    >
                        <Input
                            prefix={<UserOutlined style={{ color: "#bfbfbf" }} />}
                            placeholder="Jane Doe"
                            autoFocus
                        />
                    </Form.Item>

                    <Form.Item
                        name="email"
                        label="Work email"
                        rules={[
                            { required: true, message: "Please enter your email" },
                            { type: "email", message: "That does not look like a valid email" },
                        ]}
                    >
                        <Input
                            prefix={<MailOutlined style={{ color: "#bfbfbf" }} />}
                            placeholder="you@company.com"
                            autoComplete="email"
                        />
                    </Form.Item>

                    {/*
                      These rules mirror the server's password policy exactly.
                      The client copy is for fast feedback only - the API
                      re-checks every one of them.
                    */}
                    <Form.Item
                        name="password"
                        label="Password"
                        rules={[
                            { required: true, message: "Please choose a password" },
                            { min: 6, message: "At least 6 characters" },
                            {
                                pattern: /[A-Za-z]/,
                                message: "Must contain at least one letter",
                            },
                            { pattern: /[0-9]/, message: "Must contain at least one number" },
                        ]}
                        hasFeedback
                    >
                        <Input.Password
                            prefix={<LockOutlined style={{ color: "#bfbfbf" }} />}
                            placeholder="At least 6 characters, with a letter and a number"
                            autoComplete="new-password"
                        />
                    </Form.Item>

                    <Form.Item
                        name="confirmPassword"
                        label="Confirm password"
                        dependencies={["password"]}
                        hasFeedback
                        rules={[
                            { required: true, message: "Please confirm your password" },
                            ({ getFieldValue }) => ({
                                validator: (_rule, value) =>
                                    !value || getFieldValue("password") === value
                                        ? Promise.resolve()
                                        : Promise.reject(new Error("The passwords do not match")),
                            }),
                        ]}
                    >
                        <Input.Password
                            prefix={<LockOutlined style={{ color: "#bfbfbf" }} />}
                            placeholder="Re-enter your password"
                            autoComplete="new-password"
                        />
                    </Form.Item>

                    <Button type="primary" htmlType="submit" block loading={submitting}>
                        Create account
                    </Button>
                </Form>

                <Divider style={{ margin: "20px 0 16px" }} />

                <Text style={{ display: "block", textAlign: "center" }}>
                    Already registered? <Link to="/login">Sign in</Link>
                </Text>
            </Card>
        </AuthShell>
    );
};

export default RegisterPage;
