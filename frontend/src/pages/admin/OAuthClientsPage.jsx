import { useCallback, useEffect, useState } from "react";
import {
    App,
    Button,
    Card,
    Descriptions,
    Form,
    Input,
    Modal,
    Popconfirm,
    Select,
    Space,
    Table,
    Tag,
    Tooltip,
    Typography,
} from "antd";
import {
    CopyOutlined,
    EyeOutlined,
    KeyOutlined,
    PlusOutlined,
    ReloadOutlined,
    SearchOutlined,
} from "@ant-design/icons";
import { oauthClientsApi, userApi } from "../../api";
import PageHeader from "../../components/common/PageHeader";
import { useDebounce } from "../../hooks/useDebounce";
import { formatDateTime, fromNow } from "../../utils/format";
import { OAUTH_SCOPE_LABELS, OAUTH_SCOPE_OPTIONS } from "../../utils/constants";

const { Text } = Typography;
const { TextArea } = Input;

/**
 * FR5-10 - OAuth API Client management (Admin only).
 *
 * Administrators can create, view, edit and revoke OAuth clients that
 * external systems use to access the public REST API via the
 * client-credentials grant.
 */
const OAuthClientsPage = () => {
    const { message } = App.useApp();

    const [clients, setClients] = useState([]);
    const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0 });
    const [loading, setLoading] = useState(true);

    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState();
    const debouncedSearch = useDebounce(search, 400);

    const [createOpen, setCreateOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [viewing, setViewing] = useState(null);
    const [saving, setSaving] = useState(false);

    const [createForm] = Form.useForm();
    const [editForm] = Form.useForm();

    const [createdSecret, setCreatedSecret] = useState(null);

    const [staffUsers, setStaffUsers] = useState([]);

    useEffect(() => {
        let cancelled = false;

        const fetchUsers = async () => {
            try {
                const response = await userApi.assignable();
                if (!cancelled) setStaffUsers(response.data.users);
            } catch {
                // Silently fail - the dropdown will be empty
            }
        };

        fetchUsers();
        return () => { cancelled = true; };
    }, []);

    const load = useCallback(
        async (page = 1, limit = pagination.limit) => {
            setLoading(true);

            try {
                const response = await oauthClientsApi.list({
                    page,
                    limit,
                    search: debouncedSearch || undefined,
                    isActive: statusFilter,
                });

                setClients(response.data.items);
                setPagination(response.data.pagination);
            } catch (error) {
                message.error(error.message);
            } finally {
                setLoading(false);
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [debouncedSearch, statusFilter]
    );

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load(1);
    }, [load]);



    const handleCreate = async (values) => {
        setSaving(true);

        try {
            const response = await oauthClientsApi.create({
                name: values.name,
                description: values.description || undefined,
                user: values.user,
                scopes: values.scopes,
            });

            const { client, clientSecret } = response.data;
            setCreatedSecret({ clientId: client.clientId, clientSecret, name: client.name });
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
            await oauthClientsApi.update(editing.id, {
                name: values.name,
                description: values.description || undefined,
                scopes: values.scopes,
            });
            message.success("Client updated");
            setEditing(null);
            load(pagination.page);
        } catch (error) {
            if (error.errors?.length) {
                editForm.setFields(
                    error.errors.map((item) => ({ name: item.field, errors: [item.message] }))
                );
            }
            message.error(error.message);
        } finally {
            setSaving(false);
        }
    };

    const handleRevoke = async (record) => {
        try {
            await oauthClientsApi.revoke(record.id);
            message.success(`Client "${record.name}" revoked`);
            load(pagination.page);
        } catch (error) {
            message.error(error.message);
        }
    };

    const handleReactivate = async (record) => {
        try {
            await oauthClientsApi.update(record.id, { isActive: true });
            message.success(`Client "${record.name}" reactivated`);
            load(pagination.page);
        } catch (error) {
            message.error(error.message);
        }
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text).then(
            () => message.success("Copied to clipboard"),
            () => message.error("Failed to copy")
        );
    };

    const columns = [
        {
            title: "Client Name",
            dataIndex: "name",
            ellipsis: true,
            render: (name, record) => (
                <div>
                    <Text strong>{name}</Text>
                    {record.description && (
                        <Text type="secondary" style={{ display: "block", fontSize: 12 }}>
                            {record.description}
                        </Text>
                    )}
                </div>
            ),
        },
        {
            title: "Client ID",
            dataIndex: "clientId",
            width: 240,
            responsive: ["lg"],
            render: (clientId) => (
                <Tooltip title={clientId}>
                    <Text
                        code
                        copyable={{ text: clientId }}
                        style={{ fontSize: 12 }}
                    >
                        {clientId}
                    </Text>
                </Tooltip>
            ),
        },
        {
            title: "Scopes",
            dataIndex: "scopes",
            width: 260,
            responsive: ["xl"],
            render: (scopes) => (
                <Space size={[4, 4]} wrap>
                    {scopes?.map((scope) => (
                        <Tag key={scope} color="blue">
                            {OAUTH_SCOPE_LABELS[scope] || scope}
                        </Tag>
                    ))}
                </Space>
            ),
        },
        {
            title: "Status",
            dataIndex: "isActive",
            width: 110,
            render: (isActive, record) => (
                <Tooltip
                    title={
                        record.revokedAt
                            ? `Revoked ${fromNow(record.revokedAt)}`
                            : isActive
                              ? "Active - can obtain tokens"
                              : "Inactive"
                    }
                >
                    <Tag color={isActive ? "green" : "red"}>
                        {isActive ? "Active" : "Revoked"}
                    </Tag>
                </Tooltip>
            ),
        },
        {
            title: "Created",
            dataIndex: "createdAt",
            width: 140,
            responsive: ["lg"],
            render: (value) => (
                <Tooltip title={formatDateTime(value)}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {fromNow(value)}
                    </Text>
                </Tooltip>
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
                        icon={<EyeOutlined />}
                        onClick={() => setViewing(record)}
                    >
                        View
                    </Button>
                    <Button
                        size="small"
                        onClick={() => {
                            setEditing(record);
                            editForm.setFieldsValue({
                                name: record.name,
                                description: record.description,
                                scopes: record.scopes,
                            });
                        }}
                    >
                        Edit
                    </Button>
                    {record.isActive ? (
                        <Popconfirm
                            title="Revoke this client?"
                            description="The client will no longer be able to obtain new OAuth access tokens."
                            okText="Revoke"
                            okButtonProps={{ danger: true }}
                            onConfirm={() => handleRevoke(record)}
                        >
                            <Button size="small" danger icon={<KeyOutlined />} />
                        </Popconfirm>
                    ) : (
                        <Tooltip title="Reactivate this client">
                            <Button
                                size="small"
                                type="primary"
                                onClick={() => handleReactivate(record)}
                            >
                                Reactivate
                            </Button>
                        </Tooltip>
                    )}
                </Space>
            ),
        },
    ];

    const staffUserOptions = staffUsers.map((u) => ({
        value: u._id,
        label: `${u.name} (${u.email})`,
    }));

    return (
        <>
            <PageHeader
                title="API Clients"
                subtitle="Manage OAuth clients that access the public REST API."
                extra={[
                    <Button
                        key="refresh"
                        icon={<ReloadOutlined />}
                        onClick={() => load(pagination.page)}
                    >
                        Refresh
                    </Button>,
                    <Button
                        key="new"
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => setCreateOpen(true)}
                    >
                        Create client
                    </Button>,
                ]}
            />

            <Card size="small" style={{ marginBottom: 16 }}>
                <Space wrap size={12}>
                    <Input
                        allowClear
                        prefix={<SearchOutlined style={{ color: "#bfbfbf" }} />}
                        placeholder="Search name or client ID"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        style={{ width: 280 }}
                    />

                    <Select
                        allowClear
                        placeholder="Status"
                        style={{ width: 170 }}
                        value={statusFilter}
                        onChange={setStatusFilter}
                        options={[
                            { value: "true", label: "Active only" },
                            { value: "false", label: "Revoked only" },
                        ]}
                    />
                </Space>
            </Card>

            <Card styles={{ body: { padding: 0 } }}>
                <Table
                    rowKey="id"
                    columns={columns}
                    dataSource={clients}
                    loading={loading}
                    scroll={{ x: 900 }}
                    rowClassName={(record) => (record.isActive ? "" : "row-inactive")}
                    pagination={{
                        current: pagination.page,
                        pageSize: pagination.limit,
                        total: pagination.total,
                        showSizeChanger: true,
                        showTotal: (total) => `${total} client(s)`,
                        style: { padding: "0 16px" },
                    }}
                    onChange={(tablePagination) =>
                        load(tablePagination.current, tablePagination.pageSize)
                    }
                />
            </Card>

            {/* --- Create Client Modal ------------------------------------ */}
            <Modal
                title="Create API Client"
                open={createOpen}
                onCancel={() => setCreateOpen(false)}
                onOk={() => createForm.submit()}
                confirmLoading={saving}
                okText="Create client"
                destroyOnHidden
                width={560}
            >
                <Form
                    form={createForm}
                    layout="vertical"
                    onFinish={handleCreate}
                    requiredMark={false}
                >
                    <Form.Item
                        name="name"
                        label="Client Name"
                        rules={[
                            { required: true, message: "A name is required" },
                            { min: 2, max: 120, message: "Between 2 and 120 characters" },
                        ]}
                    >
                        <Input placeholder="e.g. External Ticket Integration" autoFocus />
                    </Form.Item>

                    <Form.Item
                        name="description"
                        label="Description"
                        rules={[{ max: 500, message: "Up to 500 characters" }]}
                    >
                        <TextArea
                            rows={3}
                            showCount
                            maxLength={500}
                            placeholder="What is this client used for?"
                        />
                    </Form.Item>

                    <Form.Item
                        name="user"
                        label="Service Account"
                        rules={[{ required: true, message: "Select a service account" }]}
                        extra="The portal account whose permissions this client will use. Must be an admin or support agent."
                    >
                        <Select
                            showSearch
                            placeholder="Select a staff user"
                            options={staffUserOptions}
                            filterOption={(input, option) =>
                                option.label.toLowerCase().includes(input.toLowerCase())
                            }
                        />
                    </Form.Item>

                    <Form.Item
                        name="scopes"
                        label="Allowed Scopes"
                        rules={[{ required: true, message: "Select at least one scope" }]}
                        extra="Which API capabilities this client is allowed to request."
                    >
                        <Select
                            mode="multiple"
                            placeholder="Select scopes"
                            options={OAUTH_SCOPE_OPTIONS}
                            optionFilterProp="label"
                        />
                    </Form.Item>
                </Form>
            </Modal>

            {/* --- Secret Display Modal ----------------------------------- */}
            <Modal
                title="Client Created Successfully"
                open={Boolean(createdSecret)}
                onCancel={() => setCreatedSecret(null)}
                footer={
                    <Button type="primary" onClick={() => setCreatedSecret(null)}>
                        I have saved the secret
                    </Button>
                }
                width={560}
            >
                {createdSecret && (
                    <div>
                        <div
                            style={{
                                marginBottom: 16,
                                padding: "12px 16px",
                                borderRadius: 6,
                                background: "#fff7e6",
                                border: "1px solid #ffd591",
                            }}
                        >
                            <Text strong style={{ color: "#d46b08" }}>
                                Important: The client secret is shown only once.
                            </Text>
                            <br />
                            <Text type="secondary" style={{ fontSize: 13 }}>
                                Store it securely before closing this dialog. You will not be able
                                to see it again.
                            </Text>
                        </div>

                        <div style={{ marginBottom: 12 }}>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                Client Name
                            </Text>
                            <br />
                            <Text strong>{createdSecret.name}</Text>
                        </div>

                        <div style={{ marginBottom: 12 }}>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                Client ID
                            </Text>
                            <br />
                            <Space>
                                <Text code>{createdSecret.clientId}</Text>
                                <Button
                                    size="small"
                                    icon={<CopyOutlined />}
                                    onClick={() => copyToClipboard(createdSecret.clientId)}
                                >
                                    Copy
                                </Button>
                            </Space>
                        </div>

                        <div style={{ marginBottom: 12 }}>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                Client Secret
                            </Text>
                            <br />
                            <Space>
                                <Text code copyable={{ text: createdSecret.clientSecret }}>
                                    {createdSecret.clientSecret}
                                </Text>
                            </Space>
                        </div>
                    </div>
                )}
            </Modal>

            {/* --- View Client Modal -------------------------------------- */}
            <Modal
                title="Client Details"
                open={Boolean(viewing)}
                onCancel={() => setViewing(null)}
                footer={
                    <Button onClick={() => setViewing(null)}>Close</Button>
                }
                width={600}
            >
                {viewing && (
                    <Descriptions bordered column={1} size="small">
                        <Descriptions.Item label="Client Name">
                            {viewing.name}
                        </Descriptions.Item>
                        <Descriptions.Item label="Client ID">
                            <Text code copyable={{ text: viewing.clientId }}>
                                {viewing.clientId}
                            </Text>
                        </Descriptions.Item>
                        <Descriptions.Item label="Description">
                            {viewing.description || <Text type="secondary">-</Text>}
                        </Descriptions.Item>
                        <Descriptions.Item label="Scopes">
                            <Space size={[4, 4]} wrap>
                                {viewing.scopes?.map((scope) => (
                                    <Tag key={scope} color="blue">
                                        {OAUTH_SCOPE_LABELS[scope] || scope}
                                    </Tag>
                                ))}
                            </Space>
                        </Descriptions.Item>
                        <Descriptions.Item label="Status">
                            <Tag color={viewing.isActive ? "green" : "red"}>
                                {viewing.isActive ? "Active" : "Revoked"}
                            </Tag>
                        </Descriptions.Item>
                        <Descriptions.Item label="Created At">
                            {formatDateTime(viewing.createdAt)}
                        </Descriptions.Item>
                        <Descriptions.Item label="Updated At">
                            {formatDateTime(viewing.updatedAt)}
                        </Descriptions.Item>
                        {viewing.revokedAt && (
                            <Descriptions.Item label="Revoked At">
                                {formatDateTime(viewing.revokedAt)}
                            </Descriptions.Item>
                        )}
                        {viewing.user && (
                            <Descriptions.Item label="Service Account">
                                {viewing.user.name} ({viewing.user.email})
                            </Descriptions.Item>
                        )}
                    </Descriptions>
                )}
            </Modal>

            {/* --- Edit Client Modal -------------------------------------- */}
            <Modal
                title={`Edit ${editing?.name || "client"}`}
                open={Boolean(editing)}
                onCancel={() => setEditing(null)}
                onOk={() => editForm.submit()}
                confirmLoading={saving}
                okText="Save changes"
                destroyOnHidden
                width={560}
            >
                <Form
                    form={editForm}
                    layout="vertical"
                    onFinish={handleEdit}
                    requiredMark={false}
                >
                    <Form.Item
                        name="name"
                        label="Client Name"
                        rules={[
                            { required: true, message: "A name is required" },
                            { min: 2, max: 120, message: "Between 2 and 120 characters" },
                        ]}
                    >
                        <Input />
                    </Form.Item>

                    <Form.Item
                        name="description"
                        label="Description"
                        rules={[{ max: 500, message: "Up to 500 characters" }]}
                    >
                        <TextArea rows={3} showCount maxLength={500} />
                    </Form.Item>

                    <Form.Item
                        name="scopes"
                        label="Allowed Scopes"
                        rules={[{ required: true, message: "Select at least one scope" }]}
                        extra="Changing scopes affects future token requests. Existing tokens keep their originally granted scopes."
                    >
                        <Select
                            mode="multiple"
                            placeholder="Select scopes"
                            options={OAUTH_SCOPE_OPTIONS}
                            optionFilterProp="label"
                        />
                    </Form.Item>
                </Form>
            </Modal>
        </>
    );
};

export default OAuthClientsPage;
