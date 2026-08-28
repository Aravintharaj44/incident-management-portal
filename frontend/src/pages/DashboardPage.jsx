import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
    App,
    Card,
    Col,
    Row,
    Segmented,
    Space,
    Table,
    Tabs,
    Tag,
    Typography,
} from "antd";
import {
    AlertOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    FileTextOutlined,
    InboxOutlined,
    SyncOutlined,
    WarningOutlined,
} from "@ant-design/icons";
import { dashboardApi } from "../api";
import { useAuth } from "../hooks/useAuth";
import PageHeader from "../components/common/PageHeader";
import StatCard from "../components/dashboard/StatCard";
import {
    CategoryColumn,
    PriorityColumn,
    StatusPie,
    TrendLine,
} from "../components/dashboard/Charts";
import ErrorBoundary from "../components/common/ErrorBoundary";
import { ErrorView, LoadingView } from "../components/common/StateViews";
import { PriorityTag, SlaTag, StatusTag } from "../components/common/Tags";
import UserBadge from "../components/common/UserBadge";
import { formatDateTime, fromNow, truncate } from "../utils/format";

const { Text, Title } = Typography;

/**
 * Dashboard (FR-11).
 *
 * Every number here comes from the API's aggregation endpoints, scoped to the
 * caller's role - so an End User sees counts for their own tickets and an
 * Admin sees the whole organisation, from the same component.
 *
 * The tiles are clickable and carry their filters into the incident list, so
 * "12 overdue" always leads to exactly those twelve rows.
 */
const DashboardPage = () => {
    const { user, isAdmin, isStaff } = useAuth();
    const { message } = App.useApp();
    const navigate = useNavigate();

    const [summary, setSummary] = useState(null);
    const [charts, setCharts] = useState(null);
    const [recent, setRecent] = useState(null);
    const [workload, setWorkload] = useState([]);

    const [trendDays, setTrendDays] = useState(30);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(
        async (days = trendDays) => {
            setLoading(true);
            setError(null);

            try {
                // Fired together rather than in sequence: four short requests in
                // parallel keep the dashboard inside the 2-second target.
                const requests = [
                    dashboardApi.summary(),
                    dashboardApi.charts(days),
                    dashboardApi.recent(5),
                ];

                if (isAdmin) requests.push(dashboardApi.workload());

                const [summaryRes, chartsRes, recentRes, workloadRes] =
                    await Promise.all(requests);

                setSummary(summaryRes.data);
                setCharts(chartsRes.data);
                setRecent(recentRes.data);
                if (workloadRes) setWorkload(workloadRes.data.workload);
            } catch (err) {
                setError(err);
            } finally {
                setLoading(false);
            }
        },
        [isAdmin, trendDays]
    );

    useEffect(() => {
        // The state updates here happen after an await, so this is not the
        // synchronous cascade the rule guards against - it cannot see past
        // the async boundary.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAdmin]);

    const handleTrendChange = async (days) => {
        setTrendDays(days);

        try {
            const response = await dashboardApi.charts(days);
            setCharts(response.data);
        } catch (err) {
            message.error(err.message);
        }
    };

    if (loading && !summary) return <LoadingView tip="Building your dashboard..." height={400} />;
    if (error && !summary) return <ErrorView error={error} onRetry={() => load()} />;

    const counts = summary?.counts || {};

    /** Columns for the "needs attention" tables. */
    const incidentColumns = [
        {
            title: "Incident",
            dataIndex: "title",
            render: (title, record) => (
                <Link to={`/incidents/${record._id}`}>
                    <Text style={{ fontSize: 13 }}>{truncate(title, 60)}</Text>
                    <Text type="secondary" style={{ display: "block", fontSize: 11 }}>
                        {record.incidentNumber}
                    </Text>
                </Link>
            ),
        },
        {
            title: "Priority",
            dataIndex: "priority",
            width: 110,
            render: (priority) => <PriorityTag priority={priority} />,
        },
        {
            title: "Status",
            dataIndex: "status",
            width: 130,
            render: (status) => <StatusTag status={status} />,
        },
        {
            title: "SLA",
            key: "sla",
            width: 140,
            render: (_value, record) => <SlaTag incident={record} />,
        },
        {
            title: "Assignee",
            dataIndex: "assignedTo",
            width: 160,
            responsive: ["lg"],
            render: (assignee) => <UserBadge user={assignee} />,
        },
    ];

    const attentionTabs = [
        {
            key: "overdue",
            label: (
                <Space size={6}>
                    <WarningOutlined />
                    Overdue
                    {recent?.overdue?.length > 0 && (
                        <Tag color="red" style={{ margin: 0 }}>
                            {recent.overdue.length}
                        </Tag>
                    )}
                </Space>
            ),
            children: (
                <Table
                    rowKey="_id"
                    size="small"
                    columns={incidentColumns}
                    dataSource={recent?.overdue || []}
                    pagination={false}
                    locale={{ emptyText: "Nothing has breached its SLA target" }}
                    scroll={{ x: 700 }}
                />
            ),
        },
        {
            key: "recent",
            label: (
                <Space size={6}>
                    <ClockCircleOutlined />
                    Recently raised
                </Space>
            ),
            children: (
                <Table
                    rowKey="_id"
                    size="small"
                    columns={incidentColumns}
                    dataSource={recent?.recent || []}
                    pagination={false}
                    locale={{ emptyText: "No incidents yet" }}
                    scroll={{ x: 700 }}
                />
            ),
        },
    ];

    if (isStaff) {
        attentionTabs.unshift({
            key: "queue",
            label: (
                <Space size={6}>
                    <InboxOutlined />
                    My queue
                    {recent?.myQueue?.length > 0 && (
                        <Tag color="blue" style={{ margin: 0 }}>
                            {recent.myQueue.length}
                        </Tag>
                    )}
                </Space>
            ),
            children: (
                <Table
                    rowKey="_id"
                    size="small"
                    columns={incidentColumns}
                    dataSource={recent?.myQueue || []}
                    pagination={false}
                    locale={{ emptyText: "Nothing is assigned to you right now" }}
                    scroll={{ x: 700 }}
                />
            ),
        });
    }

    return (
        <>
            <PageHeader
                title={`Good to see you, ${user?.name?.split(" ")[0]}`}
                subtitle={
                    isStaff
                        ? "Here is where the queue stands right now."
                        : "Here is the status of the incidents you have raised."
                }
            />

            {/* --- Counts (FR-11) ------------------------------------------- */}
            <Row gutter={[16, 16]}>
                <Col xs={12} sm={12} md={8} xl={4}>
                    <StatCard
                        title="Open"
                        value={counts.open || 0}
                        icon={<FileTextOutlined />}
                        color="#1677ff"
                        loading={loading}
                        linkTo="/incidents?open=true"
                        hint="Unresolved"
                    />
                </Col>
                <Col xs={12} sm={12} md={8} xl={4}>
                    <StatCard
                        title="New"
                        value={counts.new || 0}
                        icon={<InboxOutlined />}
                        color="#722ed1"
                        loading={loading}
                        linkTo="/incidents?status=new"
                        hint="Untriaged"
                    />
                </Col>
                <Col xs={12} sm={12} md={8} xl={4}>
                    <StatCard
                        title="In Progress"
                        value={counts.inProgress || 0}
                        icon={<SyncOutlined />}
                        color="#faad14"
                        loading={loading}
                        linkTo="/incidents?status=in_progress"
                        hint="Active"
                    />
                </Col>
                <Col xs={12} sm={12} md={8} xl={4}>
                    <StatCard
                        title="Overdue"
                        value={counts.overdue || 0}
                        icon={<WarningOutlined />}
                        color="#ff4d4f"
                        loading={loading}
                        linkTo="/incidents?overdue=true"
                        hint="Past SLA"
                    />
                </Col>
                <Col xs={12} sm={12} md={8} xl={4}>
                    <StatCard
                        title="Resolved"
                        value={counts.resolved || 0}
                        icon={<CheckCircleOutlined />}
                        color="#52c41a"
                        loading={loading}
                        linkTo="/incidents?status=resolved"
                        hint="To close"
                    />
                </Col>
                <Col xs={12} sm={12} md={8} xl={4}>
                    <StatCard
                        title={isStaff ? "Unassigned" : "Raised by me"}
                        value={isStaff ? counts.unassigned || 0 : counts.reportedByMe || 0}
                        icon={<AlertOutlined />}
                        color="#13c2c2"
                        loading={loading}
                        linkTo={
                            isStaff
                                ? "/incidents?assignedTo=unassigned&open=true"
                                : "/incidents?reportedBy=me"
                        }
                        hint={isStaff ? "No owner" : "All time"}
                    />
                </Col>
            </Row>

            {/* --- Charts --------------------------------------------------- */}
            <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                <Col xs={24} lg={8}>
                    <Card title="By status" style={{ height: "100%" }}>
                        <ErrorBoundary compact fallbackTitle="Chart could not be drawn">
                            <StatusPie data={summary?.byStatus} />
                        </ErrorBoundary>
                    </Card>
                </Col>

                <Col xs={24} lg={8}>
                    <Card title="By priority" style={{ height: "100%" }}>
                        <ErrorBoundary compact fallbackTitle="Chart could not be drawn">
                            <PriorityColumn data={summary?.byPriority} />
                        </ErrorBoundary>
                    </Card>
                </Col>

                <Col xs={24} lg={8}>
                    <Card title="By category" style={{ height: "100%" }}>
                        <ErrorBoundary compact fallbackTitle="Chart could not be drawn">
                            <CategoryColumn data={charts?.byCategory} />
                        </ErrorBoundary>
                    </Card>
                </Col>
            </Row>

            <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                <Col xs={24} xl={16}>
                    <Card
                        title="Created vs resolved"
                        extra={
                            <Segmented
                                size="small"
                                value={trendDays}
                                onChange={handleTrendChange}
                                options={[
                                    { label: "7d", value: 7 },
                                    { label: "30d", value: 30 },
                                    { label: "90d", value: 90 },
                                ]}
                            />
                        }
                    >
                        <ErrorBoundary compact fallbackTitle="Chart could not be drawn">
                            <TrendLine data={charts?.trend} />
                        </ErrorBoundary>
                    </Card>
                </Col>

                <Col xs={24} xl={8}>
                    <Card title="Resolution performance" style={{ height: "100%" }}>
                        <Space orientation="vertical" size={16} style={{ width: "100%" }}>
                            <div>
                                <Text type="secondary">Average time to resolve</Text>
                                <Title level={2} style={{ margin: "4px 0 0" }}>
                                    {summary?.resolution?.averageHours || 0}
                                    <Text type="secondary" style={{ fontSize: 16 }}>
                                        {" "}
                                        hours
                                    </Text>
                                </Title>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    Across {summary?.resolution?.resolvedCount || 0} resolved
                                    incident(s)
                                </Text>
                            </div>

                            <div>
                                <Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
                                    SLA targets by priority
                                </Text>
                                {(summary?.slaTargets || []).map((target) => (
                                    <div
                                        key={target.priority}
                                        style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                            padding: "6px 0",
                                            borderBottom: "1px solid #f0f0f0",
                                        }}
                                    >
                                        <PriorityTag priority={target.priority} />
                                        <Text type="secondary">
                                            {target.hours >= 24
                                                ? `${target.hours / 24} day(s)`
                                                : `${target.hours} hours`}
                                        </Text>
                                    </div>
                                ))}
                            </div>
                        </Space>
                    </Card>
                </Col>
            </Row>

            {/* --- Needs attention ------------------------------------------ */}
            <Card style={{ marginTop: 16 }} styles={{ body: { paddingTop: 0 } }}>
                <Tabs items={attentionTabs} />
            </Card>

            {/* --- Agent workload (Admin only) ------------------------------ */}
            {isAdmin && (
                <Card title="Agent workload" style={{ marginTop: 16 }}>
                    <Table
                        rowKey="agentId"
                        size="small"
                        dataSource={workload}
                        pagination={false}
                        locale={{ emptyText: "No incidents are assigned yet" }}
                        scroll={{ x: 600 }}
                        columns={[
                            {
                                title: "Agent",
                                key: "agent",
                                render: (_value, record) => (
                                    <UserBadge
                                        user={{ name: record.name, email: record.email }}
                                        showEmail
                                    />
                                ),
                            },
                            {
                                title: "Open",
                                dataIndex: "open",
                                width: 100,
                                sorter: (a, b) => a.open - b.open,
                                render: (value) => <Tag color={value > 5 ? "orange" : "blue"}>{value}</Tag>,
                            },
                            {
                                title: "Overdue",
                                dataIndex: "overdue",
                                width: 110,
                                sorter: (a, b) => a.overdue - b.overdue,
                                render: (value) => (
                                    <Tag color={value > 0 ? "red" : "default"}>{value}</Tag>
                                ),
                            },
                            {
                                title: "Total handled",
                                dataIndex: "total",
                                width: 130,
                                sorter: (a, b) => a.total - b.total,
                            },
                            {
                                title: "",
                                key: "action",
                                width: 90,
                                render: (_value, record) => (
                                    <a
                                        onClick={() =>
                                            navigate(
                                                `/incidents?assignedTo=${record.agentId}&open=true`
                                            )
                                        }
                                    >
                                        View
                                    </a>
                                ),
                            },
                        ]}
                    />
                </Card>
            )}

            {summary && (
                <Text
                    type="secondary"
                    style={{ display: "block", textAlign: "center", marginTop: 16, fontSize: 12 }}
                >
                    Showing {counts.total || 0} incident(s) visible to you - refreshed{" "}
                    {fromNow(new Date())} at {formatDateTime(new Date())}
                </Text>
            )}
        </>
    );
};

export default DashboardPage;
