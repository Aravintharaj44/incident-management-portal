import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
    Alert,
    App,
    Button,
    Card,
    Checkbox,
    Col,
    Descriptions,
    Divider,
    Form,
    Input,
    Modal,
    Row,
    Select,
    Space,
    Tabs,
    Tag,
    Typography,
} from "antd";
import {
    ArrowLeftOutlined,
    ClockCircleOutlined,
    DeleteOutlined,
    EditOutlined,
    HistoryOutlined,
    LinkOutlined,
    MessageOutlined,
    PaperClipOutlined,
    ReloadOutlined,
    UserSwitchOutlined,
} from "@ant-design/icons";
import { categoryApi, incidentApi } from "../api";
import { useAuth } from "../hooks/useAuth";
import PageHeader from "../components/common/PageHeader";
import { PriorityTag, SlaTag, StatusTag } from "../components/common/Tags";
import UserBadge from "../components/common/UserBadge";
import ActivityTimeline from "../components/incidents/ActivityTimeline";
import CommentThread from "../components/incidents/CommentThread";
import AttachmentPanel from "../components/incidents/AttachmentPanel";
import LinkedIncidentPanel from "../components/incidents/LinkedIncidentPanel";
import RcaPanel from "../components/incidents/RcaPanel";
import { ErrorView, LoadingView } from "../components/common/StateViews";
import {
    PRIORITY_OPTIONS,
    STATUS,
    STATUS_LABELS,
    STATUS_TRANSITIONS,
    TERMINAL_STATUSES,
} from "../utils/constants";
import { formatDateTime, formatDueBy, fromNow } from "../utils/format";

const { Paragraph, Text } = Typography;
const { TextArea } = Input;

const IncidentDetailPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { isStaff, isAdmin } = useAuth();
    const { message, modal } = App.useApp();

    const [payload, setPayload] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [acting, setActing] = useState(false);

    const [assignmentOptions, setAssignmentOptions] = useState([]);
    const [categories, setCategories] = useState([]);

    const [editOpen, setEditOpen] = useState(false);
    const [editForm] = Form.useForm();

    const [resolveOpen, setResolveOpen] = useState(false);
    const [resolutionNote, setResolutionNote] = useState("");
    const [updateLinkedChildren, setUpdateLinkedChildren] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await incidentApi.get(id);
            setPayload(response.data);
        } catch (err) {
            setError(err);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        // The state updates here happen after an await, so this is not the
        // synchronous cascade the rule guards against - it cannot see past
        // the async boundary.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
    }, [load]);

    // Reference data only staff can act on.
    const loadReferenceData = useCallback(async () => {
        if (!isStaff) return;

        try {
            const [assignmentResult, categoryResult] = await Promise.all([
                incidentApi.assignmentOptions(id),
                categoryApi.list(),
            ]);
            setAssignmentOptions(assignmentResult.data.departments);
            setCategories(categoryResult.data.categories);
        } catch {
            setAssignmentOptions([]);
            setCategories([]);
        }
    }, [id, isStaff]);

    useEffect(() => {
        // The state updates here happen after an await, so this is not the
        // synchronous cascade the rule guards against - it cannot see past
        // the async boundary.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadReferenceData();
    }, [loadReferenceData]);

    if (loading && !payload) return <LoadingView tip="Loading incident..." height={400} />;
    if (error) return <ErrorView error={error} onRetry={load} title="Could not open this incident" />;
    if (!payload) return null;

    const { incident, comments, activity, attachments, permissions, correlation, rca } = payload;

    /** Wraps an action so every one gets the same loading/refresh/error handling. */
    const runAction = async (action, successMessage) => {
        setActing(true);

        try {
            await action();
            if (successMessage) message.success(successMessage);
            await load();
            return true;
        } catch (err) {
            message.error(err.message);
            return false;
        } finally {
            setActing(false);
        }
    };

    const handleStatusChange = async (nextStatus) => {
        // Resolving asks for a note, so it takes the modal path instead.
        if (nextStatus === STATUS.RESOLVED) {
            setResolveOpen(true);
            return;
        }

        const isReopen =
            TERMINAL_STATUSES.includes(incident.status) && nextStatus === STATUS.IN_PROGRESS;

        const proceed = () =>
            runAction(
                () => incidentApi.updateStatus(id, { status: nextStatus }),
                `Status changed to ${STATUS_LABELS[nextStatus]}`
            );

        // Closing and reopening are the two that are awkward to undo, so both
        // ask for confirmation first.
        if (nextStatus === STATUS.CLOSED || isReopen) {
            modal.confirm({
                title: isReopen ? "Reopen this incident?" : "Close this incident?",
                content: isReopen
                    ? "It will move back to In Progress and the resolution timestamps will be cleared."
                    : "Closed incidents can still be reopened, but they leave the active queue.",
                okText: isReopen ? "Reopen" : "Close incident",
                onOk: proceed,
            });
            return;
        }

        proceed();
    };

    const handleResolve = async () => {
        const done = await runAction(
            () =>
                incidentApi.updateStatus(id, {
                    status: STATUS.RESOLVED,
                    resolutionNote: resolutionNote.trim() || undefined,
                    updateLinkedChildren,
                }),
            "Incident marked as resolved"
        );

        if (done) {
            setResolveOpen(false);
            setResolutionNote("");
            setUpdateLinkedChildren(false);
        }
    };

const handleDepartmentChange = (department) =>
        runAction(
            () => incidentApi.assign(id, { department: department || null }),
            department ? "Department selected; choose a department member" : "Department cleared"
        );

    const handleAssign = (assignedTo) => {
        if (assignedTo && !incident.department?._id) {
            message.error("Select a department before assigning an agent");
            return;
        }
        // Only an Admin decides the department; a Support Agent sends just the
        // member so the API never sees a department id they could tamper with.
        const payload = isAdmin
            ? { department: incident.department?._id || null, assignedTo: assignedTo || null }
            : { assignedTo: assignedTo || null };
        return runAction(
            () => incidentApi.assign(id, payload),
            assignedTo ? "Incident assigned" : "Incident returned to the queue"
        );
    };
    const handleEdit = async (values) => {
        const done = await runAction(
            () => incidentApi.update(id, values),
            "Incident updated"
        );
        if (done) {
            setEditOpen(false);
            // A new category can change which departments are valid, so refresh
            // the reference data the assignment dropdowns come from.
            loadReferenceData();
        }
    };

    const handleDelete = () => {
        modal.confirm({
            title: `Delete ${incident.incidentNumber}?`,
            content:
                "This permanently removes the incident along with its comments, activity log and attachments. This cannot be undone.",
            okText: "Delete permanently",
            okButtonProps: { danger: true },
            onOk: async () => {
                try {
                    await incidentApi.remove(id);
                    message.success(`${incident.incidentNumber} was deleted`);
                    navigate("/incidents", { replace: true });
                } catch (err) {
                    message.error(err.message);
                }
            },
        });
    };

    const openEdit = () => {
        editForm.setFieldsValue({
            title: incident.title,
            description: incident.description,
            category: incident.category?._id,
            priority: incident.priority,
        });
        setEditOpen(true);
    };

    // Only the transitions the server would accept are offered.
    const allowedTransitions = STATUS_TRANSITIONS[incident.status] || [];

    return (
        <>
            <PageHeader
                breadcrumbs={[
                    { label: "Incidents", to: "/incidents" },
                    { label: incident.incidentNumber },
                ]}
                title={incident.title}
                subtitle={
                    <>
                        {incident.incidentNumber} - raised by{" "}
                        {incident.reportedBy?.name} {fromNow(incident.createdAt)}
                    </>
                }
                tags={
                    <Space size={8} wrap>
                        <StatusTag status={incident.status} />
                        <PriorityTag priority={incident.priority} />
                        <SlaTag incident={incident} />
                    </Space>
                }
                extra={[
                    <Button
                        key="back"
                        icon={<ArrowLeftOutlined />}
                        onClick={() => navigate("/incidents")}
                    >
                        Back
                    </Button>,
                    <Button key="refresh" icon={<ReloadOutlined />} onClick={load} loading={loading}>
                        Refresh
                    </Button>,
                    permissions.canEdit && (
                        <Button key="edit" icon={<EditOutlined />} onClick={openEdit}>
                            Edit
                        </Button>
                    ),
                    permissions.canDelete && (
                        <Button key="delete" danger icon={<DeleteOutlined />} onClick={handleDelete}>
                            Delete
                        </Button>
                    ),
                ].filter(Boolean)}
            />

            {incident.isOverdue && (
                <Alert
                    type="error"
                    showIcon
                    icon={<ClockCircleOutlined />}
                    message="This incident has breached its SLA target"
                    description={`Target resolution was ${formatDateTime(incident.dueBy)} (${formatDueBy(incident.dueBy, true)}).`}
                    style={{ marginBottom: 16 }}
                />
            )}

            <Row gutter={[16, 16]}>
                {/* --- Main column --------------------------------------- */}
                <Col xs={24} lg={16}>
                    <Card title="Description">
                        <Paragraph style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>
                            {incident.description}
                        </Paragraph>

                        {incident.resolutionNote && (
                            <>
                                <Divider />
                                <Text strong>Resolution</Text>
                                <Paragraph
                                    style={{ whiteSpace: "pre-wrap", marginTop: 8, marginBottom: 0 }}
                                >
                                    {incident.resolutionNote}
                                </Paragraph>
                            </>
                        )}
                    </Card>

                    <Card style={{ marginTop: 16 }} styles={{ body: { paddingTop: 8 } }}>
                        <Tabs
                            items={[
                                {
                                    key: "comments",
                                    label: (
                                        <Space size={6}>
                                            <MessageOutlined />
                                            Comments
                                            {comments.length > 0 && (
                                                <Tag style={{ margin: 0 }}>{comments.length}</Tag>
                                            )}
                                        </Space>
                                    ),
                                    children: (
                                        <CommentThread
                                            incidentId={id}
                                            comments={comments}
                                            canUseInternalNotes={permissions.canUseInternalNotes}
                                            onChange={load}
                                        />
                                    ),
                                },
                                {
                                    key: "attachments",
                                    label: (
                                        <Space size={6}>
                                            <PaperClipOutlined />
                                            Attachments
                                            {attachments.length > 0 && (
                                                <Tag style={{ margin: 0 }}>{attachments.length}</Tag>
                                            )}
                                        </Space>
                                    ),
                                    children: (
                                        <AttachmentPanel
                                            incidentId={id}
                                            attachments={attachments}
                                            canUpload
                                            onChange={load}
                                        />
                                    ),
                                },
                                {
                                    key: "links",
                                    label: (
                                        <Space size={6}>
                                            <LinkOutlined />
                                            Linked incidents
                                        </Space>
                                    ),
                                    children: (
                                        <LinkedIncidentPanel
                                            incidentId={id}
                                            canManageLinks={permissions.canManageLinks}
                                            onChange={load}
                                        />
                                    ),
                                },
                                {
                                    key: "rca",
                                    label: "Root cause analysis",
                                    children: <RcaPanel incidentId={id} rca={rca} onChange={load} />,
                                },
                                {
                                    key: "activity",
                                    label: (
                                        <Space size={6}>
                                            <HistoryOutlined />
                                            Activity
                                            {activity.length > 0 && (
                                                <Tag style={{ margin: 0 }}>{activity.length}</Tag>
                                            )}
                                        </Space>
                                    ),
                                    children: <ActivityTimeline activity={activity} />,
                                },
                            ]}
                        />
                    </Card>
                </Col>

                {/* --- Side column: details and actions ------------------- */}
                <Col xs={24} lg={8}>
                    <Card title="Details" size="small">
                        <Descriptions column={1} size="small" bordered>
                            <Descriptions.Item label="Reference">
                                {incident.incidentNumber}
                            </Descriptions.Item>
                            <Descriptions.Item label="Status">
                                <StatusTag status={incident.status} />
                            </Descriptions.Item>
                            <Descriptions.Item label="Priority">
                                <PriorityTag priority={incident.priority} />
                            </Descriptions.Item>
                            <Descriptions.Item label="Category">
                                {incident.category?.name || "-"}
                            </Descriptions.Item>
                            <Descriptions.Item label="Reported by">
                                <UserBadge user={incident.reportedBy} />
                            </Descriptions.Item>
                            <Descriptions.Item label="Department">
                                {incident.department?.title || "Unassigned"}
                            </Descriptions.Item>
                            <Descriptions.Item label="Assigned to">
                                <UserBadge user={incident.assignedTo} />
                            </Descriptions.Item>
                            <Descriptions.Item label="Raised">
                                {formatDateTime(incident.createdAt)}
                            </Descriptions.Item>
                            <Descriptions.Item label="SLA target">
                                <Space orientation="vertical" size={2}>
                                    <span>{formatDateTime(incident.dueBy)}</span>
                                    <SlaTag incident={incident} />
                                </Space>
                            </Descriptions.Item>
                            {incident.resolvedAt && (
                                <Descriptions.Item label="Resolved">
                                    {formatDateTime(incident.resolvedAt)}
                                </Descriptions.Item>
                            )}
                            {incident.closedAt && (
                                <Descriptions.Item label="Closed">
                                    {formatDateTime(incident.closedAt)}
                                </Descriptions.Item>
                            )}
                        </Descriptions>
                    </Card>

                    {/* Assignment (FR-05) */}
                    {permissions.canAssign && (
                        <Card
                            title={
                                <Space size={6}>
                                    <UserSwitchOutlined />
                                    Assignment
                                </Space>
                            }
                            size="small"
                            style={{ marginTop: 16 }}
                        >
<Space orientation="vertical" size={10} style={{ width: "100%" }}>
                                <Text type="secondary" style={{ fontSize: 12 }}>Department</Text>
                                {isAdmin ? (
                                    <Select style={{ width: "100%" }} placeholder="Select department for this category" allowClear showSearch optionFilterProp="label" loading={acting} value={incident.department?._id} onChange={handleDepartmentChange} options={assignmentOptions.map((department) => ({ value: department._id, label: department.title }))} />
                                ) : (
                                    <Text strong>{incident.department?.title || "Unassigned"}</Text>
                                )}
                                <Text type="secondary" style={{ fontSize: 12 }}>Assigned to</Text>
                                {isAdmin ? (
                                    <Select style={{ width: "100%" }} placeholder={incident.department ? "Assign to a department member" : "Select a department first"} allowClear showSearch optionFilterProp="label" loading={acting} disabled={!incident.department?._id} value={incident.assignedTo?._id} onChange={handleAssign} options={(assignmentOptions.find((department) => department._id === incident.department?._id)?.members || []).map((agent) => ({ value: agent._id, label: `${agent.name} (${agent.role === "admin" ? "Admin" : "Agent"})` }))} />
                                ) : incident.department ? (
                                    <Select style={{ width: "100%" }} placeholder="Assign to a department member" allowClear showSearch optionFilterProp="label" loading={acting} value={incident.assignedTo?._id} onChange={handleAssign} options={(assignmentOptions.find((department) => department._id === incident.department?._id)?.members || []).map((agent) => ({ value: agent._id, label: `${agent.name} (${agent.role === "admin" ? "Admin" : "Agent"})` }))} />
                                ) : (
                                    <Alert type="info" showIcon message="Admin must assign a department before a member can be assigned." />
                                )}
                            </Space>
                            <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 8 }}>
                                Only active members of the assigned department can be assigned. Clearing the agent returns the incident to the queue.
                            </Text>
                        </Card>
                    )}

                    {/* Status workflow (FR-06) */}
                    {permissions.canChangeStatus && (
                        <Card title="Move this incident" size="small" style={{ marginTop: 16 }}>
                            <Space orientation="vertical" size={8} style={{ width: "100%" }}>
                                {allowedTransitions.map((status) => {
                                    const isReopen =
                                        TERMINAL_STATUSES.includes(incident.status) &&
                                        status === STATUS.IN_PROGRESS;

                                    return (
                                        <Button
                                            key={status}
                                            block
                                            loading={acting}
                                            danger={status === STATUS.CLOSED}
                                            type={status === STATUS.RESOLVED ? "primary" : "default"}
                                            onClick={() => handleStatusChange(status)}
                                        >
                                            {isReopen ? "Reopen" : `Move to ${STATUS_LABELS[status]}`}
                                        </Button>
                                    );
                                })}

                                {allowedTransitions.length === 0 && (
                                    <Text type="secondary">
                                        No further transitions are available.
                                    </Text>
                                )}
                            </Space>
                        </Card>
                    )}

                    {!permissions.canChangeStatus && !permissions.canAssign && (
                        <Alert
                            style={{ marginTop: 16 }}
                            type="info"
                            showIcon
                            message="You have read and comment access"
                            description="Status changes and assignment are handled by the support team."
                        />
                    )}
                </Col>
            </Row>

            {/* --- Edit modal ------------------------------------------- */}
            <Modal
                title="Edit incident"
                open={editOpen}
                onCancel={() => setEditOpen(false)}
                onOk={() => editForm.submit()}
                confirmLoading={acting}
                okText="Save changes"
                destroyOnHidden
            >
                <Form form={editForm} layout="vertical" onFinish={handleEdit} requiredMark={false}>
                    <Form.Item
                        name="title"
                        label="Title"
                        rules={[
                            { required: true, message: "A title is required" },
                            { min: 5, max: 140, message: "Between 5 and 140 characters" },
                        ]}
                    >
                        <Input />
                    </Form.Item>

                    <Form.Item
                        name="description"
                        label="Description"
                        rules={[
                            { required: true, message: "A description is required" },
                            { min: 10, max: 5000, message: "Between 10 and 5000 characters" },
                        ]}
                    >
                        <TextArea rows={5} showCount maxLength={5000} />
                    </Form.Item>

                    <Form.Item name="category" label="Category">
                        <Select
                            options={categories.map((category) => ({
                                value: category._id,
                                label: category.name,
                            }))}
                        />
                    </Form.Item>

                    {/* Re-prioritising moves the SLA deadline, so it is staff-only. */}
                    {isStaff && (
                        <Form.Item
                            name="priority"
                            label="Priority"
                            extra="Changing the priority recalculates the SLA target."
                        >
                            <Select options={PRIORITY_OPTIONS} />
                        </Form.Item>
                    )}
                </Form>
            </Modal>

            {/* --- Resolve modal ---------------------------------------- */}
            <Modal
                title="Resolve this incident"
                open={resolveOpen}
                onCancel={() => setResolveOpen(false)}
                onOk={handleResolve}
                confirmLoading={acting}
                okText="Mark as resolved"
            >
                <Text type="secondary">
                    A short note on what fixed it helps whoever sees this incident next.
                </Text>

                {correlation?.childCount > 0 && (
                    <Alert
                        type="warning"
                        showIcon
                        style={{ marginTop: 12 }}
                        message={`This major incident has ${correlation.childCount} linked child incident${correlation.childCount === 1 ? "" : "s"}.`}
                        description={<Checkbox checked={updateLinkedChildren} onChange={(event) => setUpdateLinkedChildren(event.target.checked)}>Also resolve open child incidents</Checkbox>}
                    />
                )}


                <TextArea
                    rows={4}
                    maxLength={2000}
                    showCount
                    style={{ marginTop: 12 }}
                    value={resolutionNote}
                    onChange={(event) => setResolutionNote(event.target.value)}
                    placeholder="What was the cause, and what resolved it?"
                />
            </Modal>
        </>
    );
};

export default IncidentDetailPage;
