import { useState } from "react";
import {
    App,
    Avatar,
    Button,
    Card,
    Col,
    Descriptions,
    Form,
    Input,
    Row,
    Space,
    Typography,
} from "antd";
import { LockOutlined, SaveOutlined, UserOutlined } from "@ant-design/icons";
import { useAuth } from "../hooks/useAuth";
import PageHeader from "../components/common/PageHeader";
import { RoleTag } from "../components/common/Tags";
import { avatarColor, formatDateTime, initials } from "../utils/format";

const { Text } = Typography;

/** The signed-in user's own profile: display name and password. */
const ProfilePage = () => {
    const { user, updateProfile, changePassword } = useAuth();
    const { message } = App.useApp();

    const [profileForm] = Form.useForm();
    const [passwordForm] = Form.useForm();

    const [savingProfile, setSavingProfile] = useState(false);
    const [savingPassword, setSavingPassword] = useState(false);

    const handleProfile = async (values) => {
        setSavingProfile(true);

        try {
            await updateProfile({ name: values.name });
            message.success("Profile updated");
        } catch (error) {
            message.error(error.message);
        } finally {
            setSavingProfile(false);
        }
    };

    const handlePassword = async (values) => {
        setSavingPassword(true);

        try {
            await changePassword({
                currentPassword: values.currentPassword,
                newPassword: values.newPassword,
            });

            message.success("Password changed");
            passwordForm.resetFields();
        } catch (error) {
            if (error.errors?.length) {
                passwordForm.setFields(
                    error.errors.map((item) => ({ name: item.field, errors: [item.message] }))
                );
            }
            message.error(error.message);
        } finally {
            setSavingPassword(false);
        }
    };

    return (
        <>
            <PageHeader title="My profile" subtitle="Your account details and password." />

            <Row gutter={[16, 16]}>
                <Col xs={24} lg={8}>
                    <Card>
                        <Space orientation="vertical" align="center" style={{ width: "100%" }}>
                            <Avatar
                                size={80}
                                style={{
                                    backgroundColor: avatarColor(user?.name),
                                    fontSize: 30,
                                }}
                            >
                                {initials(user?.name)}
                            </Avatar>

                            <Typography.Title level={4} style={{ margin: "12px 0 0" }}>
                                {user?.name}
                            </Typography.Title>

                            <Text type="secondary">{user?.email}</Text>
                            <RoleTag role={user?.role} />
                        </Space>

                        <Descriptions column={1} size="small" style={{ marginTop: 24 }} bordered>
                            <Descriptions.Item label="Account status">
                                {user?.isActive ? "Active" : "Deactivated"}
                            </Descriptions.Item>
                            <Descriptions.Item label="Member since">
                                {formatDateTime(user?.createdAt)}
                            </Descriptions.Item>
                            <Descriptions.Item label="Last signed in">
                                {user?.lastLoginAt ? formatDateTime(user.lastLoginAt) : "This session"}
                            </Descriptions.Item>
                        </Descriptions>

                        <Text
                            type="secondary"
                            style={{ fontSize: 12, display: "block", marginTop: 12 }}
                        >
                            Your role and account status are managed by an administrator.
                        </Text>
                    </Card>
                </Col>

                <Col xs={24} lg={16}>
                    <Card
                        title={
                            <Space>
                                <UserOutlined />
                                Display name
                            </Space>
                        }
                    >
                        <Form
                            form={profileForm}
                            layout="vertical"
                            onFinish={handleProfile}
                            requiredMark={false}
                            initialValues={{ name: user?.name }}
                        >
                            <Form.Item
                                name="name"
                                label="Full name"
                                rules={[
                                    { required: true, message: "A name is required" },
                                    { min: 2, max: 80, message: "Between 2 and 80 characters" },
                                ]}
                                extra="This is the name shown on your incidents and comments."
                            >
                                <Input style={{ maxWidth: 400 }} />
                            </Form.Item>

                            <Button
                                type="primary"
                                htmlType="submit"
                                icon={<SaveOutlined />}
                                loading={savingProfile}
                            >
                                Save
                            </Button>
                        </Form>
                    </Card>

                    <Card
                        title={
                            <Space>
                                <LockOutlined />
                                Change password
                            </Space>
                        }
                        style={{ marginTop: 16 }}
                    >
                        <Form
                            form={passwordForm}
                            layout="vertical"
                            onFinish={handlePassword}
                            requiredMark={false}
                            style={{ maxWidth: 400 }}
                        >
                            <Form.Item
                                name="currentPassword"
                                label="Current password"
                                rules={[{ required: true, message: "Enter your current password" }]}
                            >
                                <Input.Password autoComplete="current-password" />
                            </Form.Item>

                            <Form.Item
                                name="newPassword"
                                label="New password"
                                rules={[
                                    { required: true, message: "Choose a new password" },
                                    { min: 6, message: "At least 6 characters" },
                                    { pattern: /[A-Za-z]/, message: "Must contain a letter" },
                                    { pattern: /[0-9]/, message: "Must contain a number" },
                                ]}
                                hasFeedback
                            >
                                <Input.Password autoComplete="new-password" />
                            </Form.Item>

                            <Form.Item
                                name="confirmPassword"
                                label="Confirm new password"
                                dependencies={["newPassword"]}
                                hasFeedback
                                rules={[
                                    { required: true, message: "Confirm your new password" },
                                    ({ getFieldValue }) => ({
                                        validator: (_rule, value) =>
                                            !value || getFieldValue("newPassword") === value
                                                ? Promise.resolve()
                                                : Promise.reject(
                                                      new Error("The passwords do not match")
                                                  ),
                                    }),
                                ]}
                            >
                                <Input.Password autoComplete="new-password" />
                            </Form.Item>

                            <Button
                                type="primary"
                                htmlType="submit"
                                icon={<LockOutlined />}
                                loading={savingPassword}
                            >
                                Change password
                            </Button>
                        </Form>
                    </Card>
                </Col>
            </Row>
        </>
    );
};

export default ProfilePage;
