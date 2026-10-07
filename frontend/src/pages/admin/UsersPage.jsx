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
 * Support-agent designation options.
 *
 * These values must match the backend constants:
 * L1, L2, L3
 */
const DESIGNATION_OPTIONS = [
    { value: "L1", label: "L1 - Level 1 Support" },
    { value: "L2", label: "L2 - Level 2 Support" },
    { value: "L3", label: "L3 - Level 3 Support" },
];

const UsersPage = () => {
    const { user: currentUser } = useAuth();
    const { message, modal } = App.useApp();

    const [users, setUsers] = useState([]);
    const [pagination, setPagination] = useState({
        page: 1,
        limit: 10,
        total: 0,
    });
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
        [debouncedSearch, roleFilter, activeFilter]
    );

    useEffect(() => {
        load(1);
    }, [load]);

    /**
     * Create user.
     *
     * designation is included in values automatically because
     * it is part of the Form.
     */
    const handleCreate = async (values) => {
        setSaving(true);

        try {
            const payload = {
                ...values,
                designation:
                    values.role === ROLES.AGENT
                        ? values.designation || null
                        : null,
            };

            await userApi.create(payload);

            message.success(`${values.name} can now sign in`);

            setCreateOpen(false);
            createForm.resetFields();
            createForm.setFieldsValue({
                role: ROLES.USER,
                designation: null,
            });

            load(1);
        } catch (error) {
            if (error.errors?.length) {
                createForm.setFields(
                    error.errors.map((item) => ({
                        name: item.field,
                        errors: [item.message],
                    }))
                );
            }

            message.error(error.message);
        } finally {
            setSaving(false);
        }
    };

    /**
     * Update user.
     */
    const handleEdit = async (values) => {
        setSaving(true);

        try {
            const payload = {
                ...values,
                designation:
                    values.role === ROLES.AGENT
                        ? values.designation || null
                        : null,
            };

            await userApi.update(editing._id, payload);

            message.success("User updated");

            setEditing(null);
            editForm.resetFields();

            load(pagination.page);
        } catch (error) {
            if (error.errors?.length) {
                editForm.setFields(
                    error.errors.map((item) => ({
                        name: item.field,
                        errors: [item.message],
                    }))
                );
            }

            message.error(error.message);
        } finally {
            setSaving(false);
        }
    };

    const handleReset = async (values) => {
        setSaving(true);

        try {
            await userApi.resetPassword(
                resetting._id,
                values.newPassword
            );

            message.success(
                `Password reset for ${resetting.name}`
            );

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
            title: activating
                ? `Reactivate ${record.name}?`
                : `Deactivate ${record.name}?`,
            content: activating
                ? "They will be able to sign in again immediately."
                : "They will be signed out and blocked from signing in. Their incidents and history are kept.",
            okText: activating
                ? "Reactivate"
                : "Deactivate",
            okButtonProps: {
                danger: !activating,
            },
            onOk: async () => {
                try {
                    await userApi.update(record._id, {
                        isActive: activating,
                    });

                    message.success(
                        activating
                            ? "Account reactivated"
                            : "Account deactivated"
                    );

                    load(pagination.page);
                } catch (error) {
                    message.error(error.message);
                    throw error;
                }
            },
        });
    };

    /**
     * Open edit modal and populate all editable fields.
     */
    const openEditModal = (record) => {
        setEditing(record);

        editForm.setFieldsValue({
            name: record.name,
            role: record.role,
            designation: record.designation || null,
        });
    };

    const columns = [
        {
            title: "User",
            key: "user",
            render: (_value, record) => (
                <Space size={8}>
                    <UserBadge
                        user={record}
                        showEmail
                    />

                    {record._id === currentUser?.id && (
                        <Text type="secondary">
                            (you)
                        </Text>
                    )}
                </Space>
            ),
        },

        {
            title: "Role",
            dataIndex: "role",
            width: 150,
            render: (role) => (
                <RoleTag role={role} />
            ),
        },

        /**
         * Show L1/L2/L3 designation in the user list.
         */
        {
            title: "Designation",
            dataIndex: "designation",
            width: 180,
            responsive: ["md"],
            render: (designation, record) =>
                record.role === ROLES.AGENT &&
                designation ? (
                    <Text strong>
                        {designation}
                    </Text>
                ) : (
                    <Text type="secondary">
                        —
                    </Text>
                ),
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
                        disabled={
                            record._id ===
                            currentUser?.id
                        }
                        onChange={() =>
                            toggleActive(record)
                        }
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
                    <Tooltip
                        title={formatDateTime(value)}
                    >
                        <Text
                            type="secondary"
                            style={{
                                fontSize: 12,
                            }}
                        >
                            {fromNow(value)}
                        </Text>
                    </Tooltip>
                ) : (
                    <Text
                        type="secondary"
                        style={{
                            fontSize: 12,
                        }}
                    >
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
                <Text
                    type="secondary"
                    style={{
                        fontSize: 12,
                    }}
                >
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
                        onClick={() =>
                            openEditModal(record)
                        }
                    >
                        Edit
                    </Button>

                    <Button
                        size="small"
                        icon={<KeyOutlined />}
                        onClick={() =>
                            setResetting(record)
                        }
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
                subtitle="Create accounts, set roles, designations, and enable or disable access."
                extra={[
                    <Button
                        key="refresh"
                        icon={<ReloadOutlined />}
                        onClick={() =>
                            load(pagination.page)
                        }
                    >
                        Refresh
                    </Button>,

                    <Button
                        key="new"
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => {
                            createForm.resetFields();
                            createForm.setFieldsValue({
                                role: ROLES.USER,
                                designation: null,
                            });
                            setCreateOpen(true);
                        }}
                    >
                        Add user
                    </Button>,
                ]}
            />

            <Card
                size="small"
                style={{ marginBottom: 16 }}
            >
                <Space wrap size={12}>
                    <Input
                        allowClear
                        prefix={
                            <SearchOutlined
                                style={{
                                    color: "#bfbfbf",
                                }}
                            />
                        }
                        placeholder="Search name or email"
                        value={search}
                        onChange={(event) =>
                            setSearch(
                                event.target.value
                            )
                        }
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
                            {
                                value: "true",
                                label: "Active only",
                            },
                            {
                                value: "false",
                                label: "Deactivated only",
                            },
                        ]}
                    />
                </Space>
            </Card>

            <Card
                styles={{
                    body: { padding: 0 },
                }}
            >
                <Table
                    rowKey="_id"
                    columns={columns}
                    dataSource={users}
                    loading={loading}
                    scroll={{ x: 1050 }}
                    rowClassName={(record) =>
                        record.isActive
                            ? ""
                            : "row-inactive"
                    }
                    pagination={{
                        current: pagination.page,
                        pageSize: pagination.limit,
                        total: pagination.total,
                        showSizeChanger: true,
                        showTotal: (total) =>
                            `${total} user(s)`,
                        style: {
                            padding: "0 16px",
                        },
                    }}
                    onChange={(
                        tablePagination
                    ) =>
                        load(
                            tablePagination.current,
                            tablePagination.pageSize
                        )
                    }
                />
            </Card>

            {/* ============================================================
                 CREATE USER
                ============================================================ */}

            <Modal
                title={
                    <Space>
                        <UserAddOutlined />
                        Add a user
                    </Space>
                }
                open={createOpen}
                onCancel={() => {
                    setCreateOpen(false);
                    createForm.resetFields();
                }}
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
                    initialValues={{
                        role: ROLES.USER,
                        designation: null,
                    }}
                >
                    <Form.Item
                        name="name"
                        label="Full name"
                        rules={[
                            {
                                required: true,
                                message:
                                    "A name is required",
                            },
                        ]}
                    >
                        <Input placeholder="Jane Doe" />
                    </Form.Item>

                    <Form.Item
                        name="email"
                        label="Email"
                        rules={[
                            {
                                required: true,
                                message:
                                    "An email is required",
                            },
                            {
                                type: "email",
                                message:
                                    "Not a valid email address",
                            },
                        ]}
                    >
                        <Input placeholder="jane@company.com" />
                    </Form.Item>

                    <Form.Item
                        name="password"
                        label="Temporary password"
                        rules={[
                            {
                                required: true,
                                message:
                                    "A password is required",
                            },
                            {
                                min: 6,
                                message:
                                    "At least 6 characters",
                            },
                            {
                                pattern: /[A-Za-z]/,
                                message:
                                    "Must contain a letter",
                            },
                            {
                                pattern: /[0-9]/,
                                message:
                                    "Must contain a number",
                            },
                        ]}
                        extra="Share this with the user and ask them to change it after signing in."
                    >
                        <Input.Password />
                    </Form.Item>

                    <Form.Item
                        name="role"
                        label="Role"
                        rules={[
                            {
                                required: true,
                                message:
                                    "Please select a role",
                            },
                        ]}
                    >
                        <Select
                            options={ROLE_OPTIONS}
                            onChange={(value) => {
                                if (
                                    value !==
                                    ROLES.AGENT
                                ) {
                                    createForm.setFieldValue(
                                        "designation",
                                        null
                                    );
                                }
                            }}
                        />
                    </Form.Item>

                    {/*
                     * Designation is shown only for support agents.
                     */}
                    <Form.Item
                        noStyle
                        shouldUpdate={(prev, current) =>
                            prev.role !==
                            current.role
                        }
                    >
                        {({ getFieldValue }) => {
                            const role =
                                getFieldValue(
                                    "role"
                                );

                            if (
                                role !== ROLES.AGENT
                            ) {
                                return null;
                            }

                            return (
                                <Form.Item
                                    name="designation"
                                    label="Designation"
                                    rules={[
                                        {
                                            required: true,
                                            message:
                                                "Please select a designation",
                                        },
                                    ]}
                                    extra="This determines the support level used for incident assignment."
                                >
                                    <Select
                                        placeholder="Select support level"
                                        options={
                                            DESIGNATION_OPTIONS
                                        }
                                    />
                                </Form.Item>
                            );
                        }}
                    </Form.Item>
                </Form>
            </Modal>

            {/* ============================================================
                 EDIT USER
                ============================================================ */}

            <Modal
                title={`Edit ${
                    editing?.name || "user"
                }`}
                open={Boolean(editing)}
                onCancel={() => {
                    setEditing(null);
                    editForm.resetFields();
                }}
                onOk={() => editForm.submit()}
                confirmLoading={saving}
                okText="Save changes"
                destroyOnHidden
            >
                <Form
                    form={editForm}
                    layout="vertical"
                    onFinish={handleEdit}
                    requiredMark={false}
                >
                    <Form.Item
                        name="name"
                        label="Full name"
                        rules={[
                            {
                                required: true,
                                message:
                                    "A name is required",
                            },
                        ]}
                    >
                        <Input />
                    </Form.Item>

                    <Form.Item
                        name="role"
                        label="Role"
                        rules={[
                            {
                                required: true,
                                message:
                                    "Please select a role",
                            },
                        ]}
                        extra={
                            editing?._id ===
                            currentUser?.id
                                ? "You cannot change your own role."
                                : "Demoting an agent requires their open incidents to be reassigned first."
                        }
                    >
                        <Select
                            options={ROLE_OPTIONS}
                            disabled={
                                editing?._id ===
                                currentUser?.id
                            }
                            onChange={(value) => {
                                if (
                                    value !==
                                    ROLES.AGENT
                                ) {
                                    editForm.setFieldValue(
                                        "designation",
                                        null
                                    );
                                }
                            }}
                        />
                    </Form.Item>

                    {/*
                     * Designation is shown only for support agents.
                     *
                     * Existing designation is loaded by
                     * openEditModal().
                     */}
                    <Form.Item
                        noStyle
                        shouldUpdate={(prev, current) =>
                            prev.role !==
                            current.role
                        }
                    >
                        {({ getFieldValue }) => {
                            const role =
                                getFieldValue(
                                    "role"
                                );

                            if (
                                role !== ROLES.AGENT
                            ) {
                                return null;
                            }

                            return (
                                <Form.Item
                                    name="designation"
                                    label="Designation"
                                    rules={[
                                        {
                                            required: true,
                                            message:
                                                "Please select a designation",
                                        },
                                    ]}
                                    extra="This determines the support level used for incident assignment."
                                >
                                    <Select
                                        placeholder="Select support level"
                                        options={
                                            DESIGNATION_OPTIONS
                                        }
                                    />
                                </Form.Item>
                            );
                        }}
                    </Form.Item>
                </Form>
            </Modal>

            {/* ============================================================
                 RESET PASSWORD
                ============================================================ */}

            <Modal
                title={`Reset password for ${
                    resetting?.name || ""
                }`}
                open={Boolean(resetting)}
                onCancel={() => {
                    setResetting(null);
                    resetForm.resetFields();
                }}
                onOk={() => resetForm.submit()}
                confirmLoading={saving}
                okText="Reset password"
                destroyOnHidden
            >
                <Form
                    form={resetForm}
                    layout="vertical"
                    onFinish={handleReset}
                    requiredMark={false}
                >
                    <Form.Item
                        name="newPassword"
                        label="New password"
                        rules={[
                            {
                                required: true,
                                message:
                                    "A password is required",
                            },
                            {
                                min: 6,
                                message:
                                    "At least 6 characters",
                            },
                            {
                                pattern: /[A-Za-z]/,
                                message:
                                    "Must contain a letter",
                            },
                            {
                                pattern: /[0-9]/,
                                message:
                                    "Must contain a number",
                            },
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

