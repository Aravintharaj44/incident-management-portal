import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    App,
    Button,
    Card,
    Form,
    Input,
    Modal,
    Popconfirm,
    Space,
    Switch,
    Table,
    Tag,
    Tooltip,
    Typography,
} from "antd";
import { DeleteOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { categoryApi } from "../../api";
import PageHeader from "../../components/common/PageHeader";
import { formatDate } from "../../utils/format";

const { Text } = Typography;
const { TextArea } = Input;

/**
 * Category master list (FR-13) - Admin only.
 *
 * A category in use is never hard-deleted: the API deactivates it instead, so
 * historical incidents keep a meaningful label while the category disappears
 * from the "raise an incident" dropdown.
 */
const CategoriesPage = () => {
    const { message } = App.useApp();
    const navigate = useNavigate();

    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form] = Form.useForm();

    const load = useCallback(async () => {
        setLoading(true);

        try {
            // The counts drive the "in use" column and the delete warning.
            const response = await categoryApi.withCounts();
            setCategories(response.data.categories);
        } catch (error) {
            message.error(error.message);
        } finally {
            setLoading(false);
        }
    }, [message]);

    useEffect(() => {
        // The state updates here happen after an await, so this is not the
        // synchronous cascade the rule guards against - it cannot see past
        // the async boundary.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
    }, [load]);

    const openCreate = () => {
        setEditing(null);
        form.resetFields();
        setModalOpen(true);
    };

    const openEdit = (category) => {
        setEditing(category);
        form.setFieldsValue({
            name: category.name,
            description: category.description,
        });
        setModalOpen(true);
    };

    const handleSubmit = async (values) => {
        setSaving(true);

        try {
            if (editing) {
                await categoryApi.update(editing._id, values);
                message.success(`"${values.name}" updated`);
            } else {
                await categoryApi.create(values);
                message.success(`"${values.name}" added`);
            }

            setModalOpen(false);
            load();
        } catch (error) {
            if (error.errors?.length) {
                form.setFields(
                    error.errors.map((item) => ({ name: item.field, errors: [item.message] }))
                );
            }
            message.error(error.message);
        } finally {
            setSaving(false);
        }
    };

    const toggleActive = async (category, isActive) => {
        try {
            await categoryApi.update(category._id, { isActive });
            message.success(isActive ? "Category reactivated" : "Category deactivated");
            load();
        } catch (error) {
            // Deactivating is refused while open incidents still use it.
            message.error(error.message);
        }
    };

    const handleDelete = async (category) => {
        try {
            const response = await categoryApi.remove(category._id);
            message.success(response.message);
            load();
        } catch (error) {
            message.error(error.message);
        }
    };

    const columns = [
        {
            title: "Category",
            dataIndex: "name",
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
            title: "Incidents",
            dataIndex: "incidentCount",
            width: 120,
            sorter: (a, b) => a.incidentCount - b.incidentCount,
            render: (count, record) =>
                count > 0 ? (
                    <Tooltip title="View incidents in this category">
                        <Tag
                            color="blue"
                            style={{ cursor: "pointer" }}
                            onClick={() => navigate(`/incidents?category=${record._id}`)}
                        >
                            {count}
                        </Tag>
                    </Tooltip>
                ) : (
                    <Text type="secondary">0</Text>
                ),
        },
        {
            title: "Available",
            dataIndex: "isActive",
            width: 130,
            render: (isActive, record) => (
                <Tooltip
                    title={
                        isActive
                            ? "Shown in the incident form"
                            : "Hidden from the incident form"
                    }
                >
                    <Switch
                        checked={isActive}
                        onChange={(checked) => toggleActive(record, checked)}
                        checkedChildren="Yes"
                        unCheckedChildren="No"
                    />
                </Tooltip>
            ),
        },
        {
            title: "Created",
            dataIndex: "createdAt",
            width: 130,
            responsive: ["lg"],
            render: (value) => (
                <Text type="secondary" style={{ fontSize: 12 }}>
                    {formatDate(value)}
                </Text>
            ),
        },
        {
            title: "Actions",
            key: "actions",
            width: 150,
            render: (_value, record) => (
                <Space size={4}>
                    <Button size="small" onClick={() => openEdit(record)}>
                        Edit
                    </Button>

                    <Popconfirm
                        title={
                            record.incidentCount > 0
                                ? "Deactivate this category?"
                                : "Delete this category?"
                        }
                        description={
                            record.incidentCount > 0
                                ? `${record.incidentCount} incident(s) use it, so it will be deactivated rather than deleted.`
                                : "It has never been used, so it will be removed permanently."
                        }
                        okText={record.incidentCount > 0 ? "Deactivate" : "Delete"}
                        okButtonProps={{ danger: true }}
                        onConfirm={() => handleDelete(record)}
                    >
                        <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <>
            <PageHeader
                title="Categories"
                subtitle="The list users choose from when raising an incident."
                extra={[
                    <Button key="refresh" icon={<ReloadOutlined />} onClick={load} loading={loading}>
                        Refresh
                    </Button>,
                    <Button key="new" type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                        Add category
                    </Button>,
                ]}
            />

            <Card styles={{ body: { padding: 0 } }}>
                <Table
                    rowKey="_id"
                    columns={columns}
                    dataSource={categories}
                    loading={loading}
                    pagination={false}
                    scroll={{ x: 700 }}
                    rowClassName={(record) => (record.isActive ? "" : "row-inactive")}
                />
            </Card>

            <Modal
                title={editing ? `Edit "${editing.name}"` : "Add a category"}
                open={modalOpen}
                onCancel={() => setModalOpen(false)}
                onOk={() => form.submit()}
                confirmLoading={saving}
                okText={editing ? "Save changes" : "Add category"}
                destroyOnHidden
            >
                <Form form={form} layout="vertical" onFinish={handleSubmit} requiredMark={false}>
                    <Form.Item
                        name="name"
                        label="Name"
                        rules={[
                            { required: true, message: "A name is required" },
                            { min: 2, max: 60, message: "Between 2 and 60 characters" },
                        ]}
                    >
                        <Input placeholder="e.g. Network" autoFocus />
                    </Form.Item>

                    <Form.Item
                        name="description"
                        label="Description"
                        rules={[{ max: 200, message: "Up to 200 characters" }]}
                        extra="Shown as a hint when a user picks this category."
                    >
                        <TextArea
                            rows={3}
                            showCount
                            maxLength={200}
                            placeholder="What kind of issue belongs here?"
                        />
                    </Form.Item>
                </Form>
            </Modal>
        </>
    );
};

export default CategoriesPage;
