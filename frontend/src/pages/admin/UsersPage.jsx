import { useCallback, useEffect, useState } from "react";
import {
    App,
    Button,
    Card,
    Form,
    Input,
    Modal,
    Select,
    Space,
    Switch,
    Table,
    Tooltip,
    Typography,
} from "antd";
import {
    KeyOutlined,
    PlusOutlined,
    ReloadOutlined,
    SearchOutlined,
    UserAddOutlined,
} from "@ant-design/icons";
import { userApi } from "../../api";
import { useAuth } from "../../hooks/useAuth";
import PageHeader from "../../components/common/PageHeader";
import { RoleTag } from "../../components/common/Tags";
import UserBadge from "../../components/common/UserBadge";
import { useDebounce } from "../../hooks/useDebounce";
import { ROLE_OPTIONS, ROLES } from "../../utils/constants";
import { formatDateTime, fromNow } from "../../utils/format";

const { Text } = Typography;

/**
 * User administration (FR-13) - Admin only.
 *
 * Deactivation replaces deletion throughout: incidents, comments and audit
 * entries reference users, so removing the row would break the history the
 * portal exists to preserve.
 */
const UsersPage = () => {
    const { user: currentUser } = useAuth();
    const { message, modal } = App.useApp();

    const [users, setUsers] = useState([]);
    const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0 });
    const [loading, setLoading] = useState(true);

    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState();
    const [activeFilter, setActiveFilter] = useState();

    const debouncedSearch = useDebounce(search, 400);

    const [createOpen, setCreateOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [resetting, setResetting] = useState(null);
    const [saving, setSaving] = useState(false);

    const [createForm] = Form.useForm();
    const [editForm] = Form.useForm();
    const [resetForm] = Form.useForm();

    const load = useCallback(
        async (page = 1, limit = pagination.limit) => {
            setLoading(true);

            try {
                const response = await userApi.list({
                    page,
                    limit,
                    search: debouncedSearch || undefined,
                    role: roleFilter,
                    isActive: activeFilter,
                });

                setUsers(response.data.items);
                setPagination(response.data.pagination);
            } catch (error) {
                message.error(error.message);
            } finally {
                setLoading(false);
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [debouncedSearch, roleFilter, activeFilter]
    );

    useEffect(() => {
        // The state updates here happen after an await, so this is not the
        // synchronous cascade the rule guards against - it cannot see past
        // the async boundary.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load(1);
    }, [load]);

    const handleCreate = async (values) => {
        setSaving(true);

        try {
            await userApi.create(values);
            message.success(`${values.name} can now sign in`);
            setCreateOpen(false);
            createForm.resetFields();
            load(1);
        } catch (error) {
            if (error.errors?.length) {
                createForm.setFields(
                    error.errors.map((item) => ({ name: item.field, errors: [item.message] }))
                );
            }
            message.error(error.message);
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = async (values) => {
        setSaving(true);

        try {
            await userApi.update(editing._id, values);
            message.success("User updated");
            setEditing(null);
            load(pagination.page);
        } catch (error) {
            message.error(error.message);
        } finally {
            setSaving(false);
        }
    };

    const handleReset = async (values) => {
        setSaving(true);

        try {
            await userApi.resetPassword(resetting._id, values.newPassword);
            message.success(`Password reset for ${resetting.name}`);
            setResetting(null);
            resetForm.resetFields();
        } catch (error) {
            message.error(error.message);
        } finally {
            setSaving(false);
        }
    };

    const toggleActive = (record) => {
        const activating = !record.isActive;

        modal.confirm({
            title: activating ? `Reactivate ${record.name}?` : `Deactivate ${record.name}?`,
            content: activating
                ? "They will be able to sign in again immediately."
                : "They will be signed out and blocked from signing in. Their incidents and history are kept.",
            okText: activating ? "Reactivate" : "Deactivate",
            okButtonProps: { danger: !activating },
            onOk: async () => {
                try {
                    await userApi.update(record._id, { isActive: activating });
                    message.success(activating ? "Account reactivated" : "Account deactivated");
                    load(pagination.page);
                } catch (error) {
                    // The API refuses to deactivate an agent who still holds
                    // open work - surface exactly why.
                    message.error(error.message);
                    throw error;
                }
            },
        });
    };

    const columns = [
        {
            title: "User",
            key: "user",
            render: (_value, record) => (
                <Space size={8}>
                    <UserBadge user={record} showEmail />
                    {record._id === currentUser?.id && <Text type="secondary">(you)</Text>}
                </Space>
            ),
        },
        {
            title: "Role",
            dataIndex: "role",
            width: 150,
            render: (role) => <RoleTag role={role} />,
        },
        {
            title: "Status",
            dataIndex: "isActive",
            width: 120,
            render: (isActive, record) => (
                <Tooltip
                    title={
                        record._id === currentUser?.id
                            ? "You cannot deactivate your own account"
                            : isActive
                              ? "Click to deactivate"
                              : "Click to reactivate"
                    }
                >
                    <Switch
                        checked={isActive}
                        disabled={record._id === currentUser?.id}
                        onChange={() => toggleActive(record)}
                        checkedChildren="Active"
                        unCheckedChildren="Off"
                    />
                </Tooltip>
            ),
        },
        {
            title: "Last signed in",
            dataIndex: "lastLoginAt",
            width: 170,
            responsive: ["lg"],
            render: (value) =>
                value ? (
                    <Tooltip title={formatDateTime(value)}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {fromNow(value)}
                        </Text>
                    </Tooltip>
                ) : (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        Never
                    </Text>
                ),
        },
        {
            title: "Joined",
            dataIndex: "createdAt",
            width: 140,
            responsive: ["xl"],
            render: (value) => (
                <Text type="secondary" style={{ fontSize: 12 }}>
                    {formatDateTime(value)}
                </Text>
            ),
        },
        {
            title: "Actions",
            key: "actions",
            width: 170,
            render: (_value, record) => (
                <Space size={4}>
                    <Button
                        size="small"
                        onClick={() => {
                            setEditing(record);
                            editForm.setFieldsValue({
                                name: record.name,
                                role: record.role,
                            });
                        }}
                    >
                        Edit
                    </Button>
                    <Button
                        size="small"
                        icon={<KeyOutlined />}
                        onClick={() => setResetting(record)}
                    >
                        Password
                    </Button>
                </Space>
            ),
        },
    ];

    return (
        <>
            <PageHeader
                title="Users"
                subtitle="Create accounts, set roles, and enable or disable access."
                extra={[
                    <Button key="refresh" icon={<ReloadOutlined />} onClick={() => load(pagination.page)}>
                        Refresh
                    </Button>,
                    <Button
                        key="new"
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => setCreateOpen(true)}
                    >
                        Add user
                    </Button>,
                ]}
            />

            <Card size="small" style={{ marginBottom: 16 }}>
                <Space wrap size={12}>
                    <Input
                        allowClear
                        prefix={<SearchOutlined style={{ color: "#bfbfbf" }} />}
                        placeholder="Search name or email"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        style={{ width: 260 }}
                    />

                    <Select
                        allowClear
                        placeholder="Role"
                        style={{ width: 180 }}
                        options={ROLE_OPTIONS}
                        value={roleFilter}
                        onChange={setRoleFilter}
                    />

                    <Select
                        allowClear
                        placeholder="Account status"
                        style={{ width: 170 }}
                        value={activeFilter}
                        onChange={setActiveFilter}
                        options={[
                            { value: "true", label: "Active only" },
                            { value: "false", label: "Deactivated only" },
                        ]}
                    />
                </Space>
            </Card>

            <Card styles={{ body: { padding: 0 } }}>
                <Table
                    rowKey="_id"
                    columns={columns}
                    dataSource={users}
                    loading={loading}
                    scroll={{ x: 900 }}
                    rowClassName={(record) => (record.isActive ? "" : "row-inactive")}
                    pagination={{
                        current: pagination.page,
                        pageSize: pagination.limit,
                        total: pagination.total,
                        showSizeChanger: true,
                        showTotal: (total) => `${total} user(s)`,
                        style: { padding: "0 16px" },
                    }}
                    onChange={(tablePagination) =>
                        load(tablePagination.current, tablePagination.pageSize)
                    }
                />
            </Card>

            {/* --- Create ------------------------------------------------ */}
            <Modal
                title={
                    <Space>
                        <UserAddOutlined />
                        Add a user
                    </Space>
                }
                open={createOpen}
                onCancel={() => setCreateOpen(false)}
                onOk={() => createForm.submit()}
                confirmLoading={saving}
                okText="Create user"
                destroyOnHidden
            >
                <Form
                    form={createForm}
                    layout="vertical"
                    onFinish={handleCreate}
                    requiredMark={false}
                    initialValues={{ role: ROLES.USER }}
                >
                    <Form.Item
                        name="name"
                        label="Full name"
                        rules={[{ required: true, message: "A name is required" }]}
                    >
                        <Input placeholder="Jane Doe" />
                    </Form.Item>

                    <Form.Item
                        name="email"
                        label="Email"
                        rules={[
                            { required: true, message: "An email is required" },
                            { type: "email", message: "Not a valid email address" },
                        ]}
                    >
                        <Input placeholder="jane@company.com" />
                    </Form.Item>

                    <Form.Item
                        name="password"
                        label="Temporary password"
                        rules={[
                            { required: true, message: "A password is required" },
                            { min: 6, message: "At least 6 characters" },
                            { pattern: /[A-Za-z]/, message: "Must contain a letter" },
                            { pattern: /[0-9]/, message: "Must contain a number" },
                        ]}
                        extra="Share this with the user and ask them to change it after signing in."
                    >
                        <Input.Password />
                    </Form.Item>

                    <Form.Item name="role" label="Role" rules={[{ required: true }]}>
                        <Select options={ROLE_OPTIONS} />
                    </Form.Item>
                </Form>
            </Modal>

            {/* --- Edit -------------------------------------------------- */}
            <Modal
                title={`Edit ${editing?.name || "user"}`}
                open={Boolean(editing)}
                onCancel={() => setEditing(null)}
                onOk={() => editForm.submit()}
                confirmLoading={saving}
                okText="Save changes"
                destroyOnHidden
            >
                <Form form={editForm} layout="vertical" onFinish={handleEdit} requiredMark={false}>
                    <Form.Item
                        name="name"
                        label="Full name"
                        rules={[{ required: true, message: "A name is required" }]}
                    >
                        <Input />
                    </Form.Item>

                    <Form.Item
                        name="role"
                        label="Role"
                        extra={
                            editing?._id === currentUser?.id
                                ? "You cannot change your own role."
                                : "Demoting an agent requires their open incidents to be reassigned first."
                        }
                    >
                        <Select
                            options={ROLE_OPTIONS}
                            disabled={editing?._id === currentUser?.id}
                        />
                    </Form.Item>
                </Form>
            </Modal>

            {/* --- Reset password ---------------------------------------- */}
            <Modal
                title={`Reset password for ${resetting?.name || ""}`}
                open={Boolean(resetting)}
                onCancel={() => setResetting(null)}
                onOk={() => resetForm.submit()}
                confirmLoading={saving}
                okText="Reset password"
                destroyOnHidden
            >
                <Form form={resetForm} layout="vertical" onFinish={handleReset} requiredMark={false}>
                    <Form.Item
                        name="newPassword"
                        label="New password"
                        rules={[
                            { required: true, message: "A password is required" },
                            { min: 6, message: "At least 6 characters" },
                            { pattern: /[A-Za-z]/, message: "Must contain a letter" },
                            { pattern: /[0-9]/, message: "Must contain a number" },
                        ]}
                        extra="The user is not emailed automatically - pass this on securely."
                    >
                        <Input.Password autoComplete="new-password" />
                    </Form.Item>
                </Form>
            </Modal>
        </>
    );
};

export default UsersPage;
