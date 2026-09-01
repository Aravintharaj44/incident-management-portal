import { useCallback, useEffect, useState } from "react";
import {
    App,
    Alert,
    Button,
    DatePicker,
    Form,
    Input,
    Modal,
    Select,
    Space,
    Table,
    Tag,
    Tooltip,
    Typography,
} from "antd";
import dayjs from "dayjs";
import { actionItemApi, userApi } from "../../api";
import { useAuth } from "../../hooks/useAuth";
import UserBadge from "../common/UserBadge";
import {
    ACTION_ITEM_STATUS_LABELS,
    ACTION_ITEM_STATUS_COLORS,
    ACTION_ITEM_STATUS_OPTIONS,
} from "../../utils/constants";

const { TextArea } = Input;
const { Text } = Typography;

/**
 * V4 - RCA Action Items tracker (FR4-07..10).
 *
 * Renders the action items hanging off one approved RCA. Staff-only: the
 * server enforces the rules - an Admin may create/reassign/delete items, a
 * Support Agent may update the items they own (or unassigned ones).
 */
const ActionItemsPanel = ({ rcaId }) => {
    const { message } = App.useApp();
    const { isStaff, isAdmin } = useAuth();
    const [items, setItems] = useState(null);
    const [loading, setLoading] = useState(false);
    const [owners, setOwners] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form] = Form.useForm();

    const load = useCallback(async () => {
        if (!rcaId) return;
        setLoading(true);
        try {
            const res = await actionItemApi.list({ rcaId, limit: 100 });
            setItems(res.data.items);
        } catch (err) {
            message.error(err.message);
        } finally {
            setLoading(false);
        }
    }, [rcaId, message]);

    useEffect(() => {
        // The state updates happen after an await, so this is not the
        // synchronous cascade the rule guards against.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
    }, [load]);

    useEffect(() => {
        if (!isStaff) return;
        userApi.assignable()
            .then((res) => setOwners(res.data.users || []))
            .catch(() => setOwners([]));
    }, [isStaff]);

    if (!isStaff) {
        return <Alert type="info" showIcon message="Action items are visible to administrators and support agents only." />;
    }

    const ownerOptions = owners.map((owner) => ({ value: owner._id, label: owner.name }));

    const openCreate = () => {
        setEditing(null);
        form.resetFields();
        form.setFieldsValue({ dueDate: dayjs().add(7, "day") });
        setShowModal(true);
    };

    const openUpdate = (item) => {
        setEditing(item);
        form.resetFields();
        form.setFieldsValue({
            status: item.status,
            dueDate: dayjs(item.dueDate),
            completionNote: item.completionNote || "",
        });
        setShowModal(true);
    };

    const submit = async () => {
        const values = await form.validateFields();
        try {
            if (editing) {
                await actionItemApi.changeStatus(editing._id, {
                    status: values.status,
                    completionNote: values.completionNote?.trim() || undefined,
                });
                message.success("Action item updated");
            } else {
                await actionItemApi.create({
                    rcaId,
                    description: values.description,
                    ownerId: values.ownerId,
                    dueDate: values.dueDate.toISOString(),
                });
                message.success("Action item created");
            }
            setShowModal(false);
            load();
        } catch (err) {
            message.error(err.message);
        }
    };

    const reassign = async (item, ownerId) => {
        try {
            await actionItemApi.changeOwner(item._id, { ownerId });
            message.success("Action item reassigned");
            load();
        } catch (err) {
            message.error(err.message);
        }
    };

    const columns = [
        {
            title: "Status",
            dataIndex: "status",
            width: 100,
            render: (status) => (
                <Tag color={ACTION_ITEM_STATUS_COLORS[status]}>{ACTION_ITEM_STATUS_LABELS[status]}</Tag>
            ),
        },
        {
            title: "Action item",
            dataIndex: "description",
            render: (description, item) => (
                <>
                    <div>{description}</div>
                    {item.completionNote && (
                        <Tooltip title="Closure evidence (FR4-10)">
                            <Text type="secondary" style={{ fontSize: 12, display: "block" }}>
                                Evidence: {item.completionNote}
                            </Text>
                        </Tooltip>
                    )}
                </>
            ),
        },
        {
            title: "Owner",
            dataIndex: "ownerId",
            width: 200,
            render: (owner, item) =>
                isAdmin && owner ? (
                    <Select
                        size="small"
                        style={{ minWidth: 150 }}
                        value={owner._id}
                        onChange={(ownerId) => reassign(item, ownerId)}
                        options={ownerOptions}
                    />
                ) : (
                    <UserBadge user={owner} />
                ),
        },
        {
            title: "Due",
            dataIndex: "dueDate",
            width: 110,
            render: (dueDate, item) => {
                const overdue = item.status !== "done" && dayjs(dueDate).isBefore(dayjs(), "day");
                return (
                    <Text type={overdue ? "danger" : "secondary"}>
                        {dayjs(dueDate).format("MMM D, YYYY")}
                    </Text>
                );
            },
        },
        {
            title: "",
            key: "actions",
            width: 90,
            render: (_, item) => (
                <Button size="small" onClick={() => openUpdate(item)}>Update</Button>
            ),
        },
    ];

    const totals = (items || []).reduce(
        (acc, item) => {
            acc[item.status] = (acc[item.status] || 0) + 1;
            return acc;
        },
        { open: 0, in_progress: 0, done: 0, overdue: 0 }
    );

    return (
        <>
            <Space style={{ marginBottom: 8 }} wrap>
                <Text strong>Action items</Text>
                {ACTION_ITEM_STATUS_OPTIONS.map((option) => (
                    <Tag key={option.value} color={ACTION_ITEM_STATUS_COLORS[option.value]}>
                        {option.label}: {totals[option.value] || 0}
                    </Tag>
                ))}
            </Space>
            {isAdmin && (
                <div style={{ marginBottom: 8 }}>
                    <Button type="primary" size="small" onClick={openCreate}>Add action item</Button>
                </div>
            )}
            <Table
                rowKey="_id"
                size="small"
                loading={loading}
                columns={columns}
                dataSource={items || []}
                pagination={false}
            />
            <Modal
                open={showModal}
                title={editing ? "Update action item" : "Add action item"}
                onCancel={() => setShowModal(false)}
                onOk={submit}
                okText={editing ? "Save" : "Create"}
                destroyOnClose
            >
                <Form form={form} layout="vertical" requiredMark={false}>
                    {!editing && (
                        <>
                            <Form.Item
                                name="description"
                                label="Description"
                                rules={[{ required: true, min: 10, message: "Use at least 10 characters" }]}
                            >
                                <TextArea rows={3} placeholder="What needs to be done?" />
                            </Form.Item>
                            <Form.Item name="ownerId" label="Owner" rules={[{ required: true }]}>
                                <Select options={ownerOptions} placeholder="Select an owner" />
                            </Form.Item>
                        </>
                    )}
                    {editing && (
                        <Form.Item name="status" label="Status" rules={[{ required: true }]}>
                            <Select options={ACTION_ITEM_STATUS_OPTIONS} />
                        </Form.Item>
                    )}
                    <Form.Item name="dueDate" label="Due date" rules={[{ required: true }]}>
                        <DatePicker style={{ width: "100%" }} disabled={Boolean(editing)} />
                    </Form.Item>
                    {editing && (
                        <Form.Item name="completionNote" label="Completion note (closure evidence)">
                            <TextArea rows={2} placeholder="Optional note recorded when the item is completed" />
                        </Form.Item>
                    )}
                </Form>
            </Modal>
        </>
    );
};

export default ActionItemsPanel;