import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
    Alert,
    App,
    Button,
    Card,
    Col,
    Descriptions,
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
    DeleteOutlined,
    DisconnectOutlined,
    EditOutlined,
    HistoryOutlined,
    LinkOutlined,
    ReloadOutlined,
    UserSwitchOutlined,
} from "@ant-design/icons";
import { incidentApi, problemApi, userApi } from "../../api";
import PageHeader from "../../components/common/PageHeader";
import { ProblemStatusTag } from "../../components/common/Tags";
import UserBadge from "../../components/common/UserBadge";
import ActivityTimeline from "../../components/incidents/ActivityTimeline";
import ProblemRcaPanel from "../../components/problems/ProblemRcaPanel";
import KbLinkPanel from "../../components/incidents/KbLinkPanel";
import { ErrorView, LoadingView } from "../../components/common/StateViews";
import {
    PROBLEM_STATUS,
    PROBLEM_STATUS_LABELS,
    PROBLEM_STATUS_TRANSITIONS,
} from "../../utils/constants";
import { formatDateTime, fromNow } from "../../utils/format";

const { Paragraph, Text } = Typography;
const { TextArea } = Input;

const ProblemDetailPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { message, modal } = App.useApp();

    const [payload, setPayload] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [acting, setActing] = useState(false);

    const [owners, setOwners] = useState([]);
    const [linkCandidates, setLinkCandidates] = useState([]);

    const [editOpen, setEditOpen] = useState(false);
    const [editForm] = Form.useForm();
    const [linkOpen, setLinkOpen] = useState(false);
    const [selectedIncident, setSelectedIncident] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await problemApi.get(id);
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

    useEffect(() => {
        userApi
            .assignable()
            .then((response) => setOwners(response.data.users))
            .catch(() => setOwners([]));
        incidentApi
            .list({ limit: 100, status: "new,in_progress,on_hold" })
            .then((response) => setLinkCandidates(response.data.items))
            .catch(() => setLinkCandidates([]));
    }, []);

    if (loading && !payload) return <LoadingView tip="Loading problem..." height={400} />;
    if (error) return <ErrorView error={error} onRetry={load} title="Could not open this problem" />;
    if (!payload) return null;

    const { problem, incidents, rca, activity, permissions } = payload;
    const editable = Boolean(permissions.canManage);

    const linkedIds = new Set(incidents.map((incident) => incident._id));

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

    const handleStatusChange = (status) => {
        const proceed = () =>
            runAction(
                () => problemApi.updateStatus(id, status),
                `Status changed to ${PROBLEM_STATUS_LABELS[status]}`
            );

        if (status === PROBLEM_STATUS.RESOLVED) {
            modal.confirm({
                title: "Mark this problem as resolved?",
                content:
                    "A resolved problem leaves the active queue but its workaround and RCA remain in the Known Error Database.",
                okText: "Mark resolved",
                onOk: proceed,
            });
            return;
        }

        proceed();
    };

    const handleOwnerChange = (ownerId) =>
        runAction(
            () => problemApi.updateOwner(id, ownerId),
            ownerId ? "Problem owner changed" : "Owner cleared"
        );

    const handleEdit = async (values) => {
        const done = await runAction(() => problemApi.update(id, values), "Problem updated");
        if (done) setEditOpen(false);
    };

    const handleLink = async () => {
        if (!selectedIncident) return;
        const done = await runAction(
            () => problemApi.linkIncident(id, selectedIncident),
            "Incident linked to this problem"
        );
        if (done) {
            setLinkOpen(false);
            setSelectedIncident(null);
        }
    };

    const handleUnlink = (incident) => {
        modal.confirm({
            title: `Remove ${incident.incidentNumber} from this problem?`,
            content: "The incident is not deleted - it is simply no longer grouped here.",
            okText: "Remove",
            okButtonProps: { danger: true },
            onOk: () => runAction(() => problemApi.unlinkIncident(id, incident._id), "Incident removed"),
        });
    };

    const handleDelete = () => {
        modal.confirm({
            title: `Delete ${problem.problemNumber}?`,
            content:
                "This removes the problem, its RCA and its activity. Linked incidents are kept and simply detached.",
            okText: "Delete permanently",
            okButtonProps: { danger: true },
            onOk: async () => {
                try {
                    await problemApi.remove(id);
                    message.success(`${problem.problemNumber} was deleted`);
                    navigate("/problems", { replace: true });
                } catch (err) {
                    message.error(err.message);
                }
            },
        });
    };

    const openEdit = () => {
        editForm.setFieldsValue({
            title: problem.title,
            description: problem.description,
            workaround: problem.workaround,
        });
        setEditOpen(true);
    };

    const allowedTransitions = PROBLEM_STATUS_TRANSITIONS[problem.status] || [];
    const unlinkedCandidates = linkCandidates.filter((incident) => !linkedIds.has(incident._id));

    return (
        <>
            <PageHeader
                breadcrumbs={[
                    { label: "Problems", to: "/problems" },
                    { label: problem.problemNumber },
                ]}
                title={problem.title}
                subtitle={`${problem.problemNumber} - owner ${problem.ownerId?.name || "Unassigned"} - raised ${fromNow(problem.createdAt)}`}
                tags={<ProblemStatusTag status={problem.status} />}
                extra={[
                    <Button key="back" icon={<ArrowLeftOutlined />} onClick={() => navigate("/problems")}>
                        Back
                    </Button>,
                    <Button key="refresh" icon={<ReloadOutlined />} onClick={load} loading={loading}>
                        Refresh
                    </Button>,
                    editable && (
                        <Button key="edit" icon={<EditOutlined />} onClick={openEdit}>
                            Edit
                        </Button>
                    ),
                    permissions.isAdmin && (
                        <Button key="delete" danger icon={<DeleteOutlined />} onClick={handleDelete}>
                            Delete
                        </Button>
                    ),
                ].filter(Boolean)}
            />

            <Row gutter={[16, 16]}>
                <Col xs={24} lg={16}>
                    <Card title="Description">
                        <Paragraph style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>
                            {problem.description}
                        </Paragraph>
                    </Card>

                    {problem.workaround && (
                        <Card title="Workaround" size="small" style={{ marginTop: 16 }}>
                            <Paragraph style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>
                                {problem.workaround}
                            </Paragraph>
                        </Card>
                    )}

                    <Card style={{ marginTop: 16 }} styles={{ body: { paddingTop: 8 } }}>
                        <Tabs
                            items={[
                                {
                                    key: "incidents",
                                    label: (
                                        <Space size={6}>
                                            <LinkOutlined />
                                            Linked incidents
                                            {incidents.length > 0 && <Tag style={{ margin: 0 }}>{incidents.length}</Tag>}
                                        </Space>
                                    ),
                                    children: (
                                        <Space direction="vertical" size={8} style={{ width: "100%" }}>
                                            {incidents.length === 0 && (
                                                <Text type="secondary">No incidents are linked to this problem yet.</Text>
                                            )}
                                            {incidents.map((incident) => (
                                                <Card
                                                    key={incident._id}
                                                    size="small"
                                                    styles={{ body: { padding: "12px 16px" } }}
                                                >
                                                    <Row justify="space-between" align="middle">
                                                        <Col>
                                                            <Space size={8} wrap>
                                                                <Link to={`/incidents/${incident._id}`}>
                                                                    <Text strong>{incident.incidentNumber}</Text>
                                                                </Link>
                                                                <Text>{incident.title}</Text>
                                                            </Space>
                                                            <div>
                                                                <Text type="secondary" style={{ fontSize: 12 }}>
                                                                    {incident.status} - {incident.category?.name || "Uncategorised"}
                                                                </Text>
                                                            </div>
                                                        </Col>
                                                        {editable && (
                                                            <Button
                                                                size="small"
                                                                icon={<DisconnectOutlined />}
                                                                onClick={() => handleUnlink(incident)}
                                                            >
                                                                Remove
                                                            </Button>
                                                        )}
                                                    </Row>
                                                </Card>
                                            ))}
                                            {editable && (
                                                <Button
                                                    icon={<LinkOutlined />}
                                                    onClick={() => setLinkOpen(true)}
                                                >
                                                    Link an incident
                                                </Button>
                                            )}
                                        </Space>
                                    ),
                                },
                                {
                                    key: "rca",
                                    label: "Root cause analysis",
                                    children: (
                                        <ProblemRcaPanel
                                            problemId={id}
                                            rca={rca}
                                            editable={editable}
                                            onChange={load}
                                        />
                                    ),
                                },
                                {
                                    key: "kb",
                                    label: "KB Article",
                                    children: (
                                        <div>
                                            {problem.kbArticleId ? (
                                                <div style={{ padding: "8px 0" }}>
                                                    <Text strong>
                                                        <Link to={`/kb/${problem.kbArticleId._id}`}>
                                                            {problem.kbArticleId.title}
                                                        </Link>
                                                    </Text>
                                                    {editable && (
                                                        <Button
                                                            size="small"
                                                            danger
                                                            style={{ marginLeft: 12 }}
                                                            onClick={async () => {
                                                                try {
                                                                    await problemApi.unlinkKb(id);
                                                                    message.success("KB article unlinked");
                                                                    load();
                                                                } catch (err) {
                                                                    message.error(err.message || "Failed to unlink");
                                                                }
                                                            }}
                                                        >
                                                            Unlink
                                                        </Button>
                                                    )}
                                                </div>
                                            ) : editable ? (
                                                <KbLinkPanel problemId={id} onChange={load} />
                                            ) : (
                                                <Text type="secondary">
                                                    No KB article linked. Support staff can link one.
                                                </Text>
                                            )}
                                        </div>
                                    ),
                                },
                                {
                                    key: "activity",
                                    label: (
                                        <Space size={6}>
                                            <HistoryOutlined />
                                            Activity
                                            {activity.length > 0 && <Tag style={{ margin: 0 }}>{activity.length}</Tag>}
                                        </Space>
                                    ),
                                    children: <ActivityTimeline activity={activity} />,
                                },
                            ]}
                        />
                    </Card>
                </Col>

                <Col xs={24} lg={8}>
                    <Card title="Details" size="small">
                        <Descriptions column={1} size="small" bordered>
                            <Descriptions.Item label="Reference">{problem.problemNumber}</Descriptions.Item>
                            <Descriptions.Item label="Status"><ProblemStatusTag status={problem.status} /></Descriptions.Item>
                            <Descriptions.Item label="Category">{problem.category?.name || "-"}</Descriptions.Item>
                            <Descriptions.Item label="Owner"><UserBadge user={problem.ownerId} fallback="Unassigned" /></Descriptions.Item>
                            <Descriptions.Item label="Raised">{formatDateTime(problem.createdAt)}</Descriptions.Item>
                            <Descriptions.Item label="Updated">{formatDateTime(problem.updatedAt)}</Descriptions.Item>
                            {problem.resolvedAt && (
                                <Descriptions.Item label="Resolved">{formatDateTime(problem.resolvedAt)}</Descriptions.Item>
                            )}
                        </Descriptions>
                    </Card>

                    {editable && (
                        <Card
                            title={
                                <Space size={6}>
                                    <UserSwitchOutlined />
                                    Owner
                                </Space>
                            }
                            size="small"
                            style={{ marginTop: 16 }}
                        >
                            <Select
                                style={{ width: "100%" }}
                                placeholder="Change problem owner"
                                allowClear
                                showSearch
                                optionFilterProp="label"
                                loading={acting}
                                value={problem.ownerId?._id}
                                onChange={handleOwnerChange}
                                options={owners
                                    .map((owner) => ({ value: owner._id, label: owner.name }))}
                            />
                            <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 8 }}>
                                Only active admins and support agents can own a problem.
                            </Text>
                        </Card>
                    )}

                    {editable && (
                        <Card title="Move this problem" size="small" style={{ marginTop: 16 }}>
                            <Space direction="vertical" size={8} style={{ width: "100%" }}>
                                {allowedTransitions.map((status) => (
                                    <Button
                                        key={status}
                                        block
                                        loading={acting}
                                        type={status === PROBLEM_STATUS.KNOWN_ERROR ? "primary" : "default"}
                                        onClick={() => handleStatusChange(status)}
                                    >
                                        Move to {PROBLEM_STATUS_LABELS[status]}
                                    </Button>
                                ))}
                                {allowedTransitions.length === 0 && (
                                    <Text type="secondary">No further transitions are available.</Text>
                                )}
                            </Space>
                        </Card>
                    )}

                    {!editable && (
                        <Alert
                            style={{ marginTop: 16 }}
                            type="info"
                            showIcon
                            message="Read-only for you"
                            description="Status, owner and RCA changes are handled by staff."
                        />
                    )}
                </Col>
            </Row>

            <Modal
                title="Edit problem"
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
                    <Form.Item name="workaround" label="Workaround">
                        <TextArea rows={3} showCount maxLength={3000} />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title="Link an incident"
                open={linkOpen}
                onCancel={() => {
                    setLinkOpen(false);
                    setSelectedIncident(null);
                }}
                onOk={handleLink}
                confirmLoading={acting}
                okText="Link incident"
                okButtonProps={{ disabled: !selectedIncident }}
                destroyOnHidden
            >
                <Select
                    style={{ width: "100%" }}
                    placeholder="Select an incident to link"
                    showSearch
                    optionFilterProp="label"
                    value={selectedIncident}
                    onChange={setSelectedIncident}
                    options={unlinkedCandidates.map((incident) => ({
                        value: incident._id,
                        label: `${incident.incidentNumber} - ${incident.title}`,
                    }))}
                />
            </Modal>
        </>
    );
};

export default ProblemDetailPage;
