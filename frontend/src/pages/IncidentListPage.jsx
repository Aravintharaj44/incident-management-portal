import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { App, Button, Card, Space, Table, Tooltip, Typography } from "antd";
import {
    DownloadOutlined,
    PlusOutlined,
    ReloadOutlined,
} from "@ant-design/icons";
import { categoryApi, incidentApi, userApi } from "../api";
import { useAuth } from "../hooks/useAuth";
import PageHeader from "../components/common/PageHeader";
import IncidentFilters from "../components/incidents/IncidentFilters";
import { PriorityTag, SlaTag, StatusTag } from "../components/common/Tags";
import UserBadge from "../components/common/UserBadge";
import { ErrorView } from "../components/common/StateViews";
import { formatDateTime, fromNow, truncate } from "../utils/format";
import SourceTag from "../components/incidents/SourceTag";  
const { Text } = Typography;

/** Filters that are lists in the API and arrays in component state. */
const ARRAY_FILTERS = ["status", "priority", "category"];
const EMPTY_FIXED_FILTERS = Object.freeze({});

/** Reads the filter state out of the URL so a filtered view is shareable. */
const parseSearchParams = (params) => {
    const filters = {};

    params.forEach((value, key) => {
        if (ARRAY_FILTERS.includes(key)) {
            filters[key] = value.split(",").filter(Boolean);
        } else if (key === "page" || key === "limit") {
            filters[key] = Number(value) || undefined;
        } else if (key === "overdue" || key === "open") {
            filters[key] = value === "true";
        } else {
            filters[key] = value;
        }
    });

    return filters;
};

const toSearchParams = (filters) => {
    const params = {};

    Object.entries(filters).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "" || value === false) return;
        if (Array.isArray(value)) {
            if (value.length) params[key] = value.join(",");
            return;
        }
        params[key] = String(value);
    });

    return params;
};

/**
 * Incident list (FR-10).
 *
 * Filter state lives in the URL rather than in component state alone, which
 * means the browser back button works, a filtered view can be shared, and the
 * dashboard tiles can deep-link straight into a filtered list.
 */
const IncidentListPage = ({ fixedFilters = EMPTY_FIXED_FILTERS, pageTitle = "Incidents" }) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const { isStaff } = useAuth();
    const { message } = App.useApp();
    const navigate = useNavigate();

    const filters = useMemo(() => ({ ...fixedFilters, ...parseSearchParams(searchParams) }), [fixedFilters, searchParams]);

    const [incidents, setIncidents] = useState([]);
    const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0 });
    const [categories, setCategories] = useState([]);
    const [assignees, setAssignees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState(null);

    // Reference data for the filter dropdowns - loaded once.
    useEffect(() => {
        categoryApi
            .list()
            .then((response) => setCategories(response.data.categories))
            .catch(() => setCategories([]));

        if (isStaff) {
            userApi
                .assignable()
                .then((response) => setAssignees(response.data.users))
                .catch(() => setAssignees([]));
        }
    }, [isStaff]);

    const loadIncidents = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await incidentApi.list({
                ...filters,
                page: filters.page || 1,
                limit: filters.limit || 10,
            });

            setIncidents(response.data.items);
            setPagination(response.data.pagination);
        } catch (err) {
            setError(err);
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        // The state updates here happen after an await, so this is not the
        // synchronous cascade the rule guards against - it cannot see past
        // the async boundary.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadIncidents();
    }, [loadIncidents]);

    /** Merges a partial change into the URL-backed filter state. */
    const updateFilters = useCallback(
        (changes) => {
            setSearchParams(toSearchParams({ ...filters, ...changes }), { replace: true });
        },
        [filters, setSearchParams]
    );

    const resetFilters = () => setSearchParams({}, { replace: true });

    const handleTableChange = (tablePagination, _tableFilters, sorter) => {
        const changes = {
            page: tablePagination.current,
            limit: tablePagination.pageSize,
        };

        if (sorter?.field && sorter.order) {
            changes.sortBy = sorter.field;
            changes.sortOrder = sorter.order === "ascend" ? "asc" : "desc";
        } else {
            changes.sortBy = undefined;
            changes.sortOrder = undefined;
        }

        updateFilters(changes);
    };

    const handleExport = async () => {
        setExporting(true);

        try {
            // Exports exactly what is on screen, filters included (FR-12).
            await incidentApi.exportCsv(filters);
            message.success("Export downloaded");
        } catch (err) {
            message.error(err.message || "Export failed");
        } finally {
            setExporting(false);
        }
    };

    const columns = [
        {
            title: "Reference",
            dataIndex: "incidentNumber",
            width: 130,
            sorter: true,
            render: (value, record) => (
                <Link to={`/incidents/${record._id}`}>
                    <Text strong style={{ fontSize: 13 }}>
                        {value}
                    </Text>
                </Link>
            ),
        },
        {
            title: "Title",
            dataIndex: "title",
            sorter: true,
            render: (title, record) => (
                <Link to={`/incidents/${record._id}`}>
                    <div style={{ fontWeight: 500 }}>{truncate(title, 70)}</div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {record.category?.name} - raised {fromNow(record.createdAt)}
                    </Text>
                </Link>
            ),
        },
        {
            title: "Priority",
            dataIndex: "priority",
            width: 110,
            sorter: true,
            render: (priority) => <PriorityTag priority={priority} />,
        },
        {
            title: "Status",
            dataIndex: "status",
            width: 140,
            sorter: true,
            render: (status) => <StatusTag status={status} />,
        },
          {
            title: "Source",
            dataIndex: "intakeSource",
            width: 110,
            responsive: ["lg"],
            render: (source) => <SourceTag source={source} />,
        },
        {
            title: "SLA",
            key: "dueBy",
            dataIndex: "dueBy",
            width: 150,
            sorter: true,
            render: (_value, record) => <SlaTag incident={record} />,
        },
        {
            title: "Assigned to",
            dataIndex: "assignedTo",
            width: 170,
            responsive: ["lg"],
            render: (assignee) => <UserBadge user={assignee} />,
        },
        {
            title: "Reported by",
            dataIndex: "reportedBy",
            width: 170,
            responsive: ["xl"],
            render: (reporter) => <UserBadge user={reporter} />,
        },
        {
            title: "Raised",
            dataIndex: "createdAt",
            width: 160,
            sorter: true,
            responsive: ["xl"],
            render: (value) => (
                <Tooltip title={formatDateTime(value)}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {fromNow(value)}
                    </Text>
                </Tooltip>
            ),
        },
    ];

    if (error && !incidents.length) {
        return <ErrorView error={error} onRetry={loadIncidents} />;
    }

    return (
        <>
            <PageHeader
                title={pageTitle}
                subtitle={
                    isStaff
                        ? "Every incident you have visibility of."
                        : "The incidents you have raised."
                }
                extra={[
                    <Button
                        key="refresh"
                        icon={<ReloadOutlined />}
                        onClick={loadIncidents}
                        loading={loading}
                    >
                        Refresh
                    </Button>,
                    <Button
                        key="export"
                        icon={<DownloadOutlined />}
                        onClick={handleExport}
                        loading={exporting}
                        disabled={!pagination.total}
                    >
                        Export CSV
                    </Button>,
                    <Button
                        key="new"
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => navigate("/incidents/new")}
                    >
                        Raise incident
                    </Button>,
                ]}
            />

            <IncidentFilters
                filters={filters}
                onChange={updateFilters}
                onReset={resetFilters}
                categories={categories}
                assignees={assignees}
                isStaff={isStaff}
                loading={loading}
            />

            <Card styles={{ body: { padding: 0 } }}>
                <Table
                    rowKey="_id"
                    columns={columns}
                    dataSource={incidents}
                    loading={loading}
                    onChange={handleTableChange}
                    scroll={{ x: 1000 }}
                    // Overdue rows are tinted so they stand out while scanning.
                    rowClassName={(record) => (record.isOverdue ? "row-overdue" : "")}
                    locale={{
                        emptyText: (
                            <div style={{ padding: 32 }}>
                                <Text type="secondary">
                                    No incidents match these filters.
                                </Text>
                                <div style={{ marginTop: 12 }}>
                                    <Space>
                                        <Button size="small" onClick={resetFilters}>
                                            Clear filters
                                        </Button>
                                        <Button
                                            size="small"
                                            type="primary"
                                            onClick={() => navigate("/incidents/new")}
                                        >
                                            Raise an incident
                                        </Button>
                                    </Space>
                                </div>
                            </div>
                        ),
                    }}
                    pagination={{
                        current: pagination.page,
                        pageSize: pagination.limit,
                        total: pagination.total,
                        showSizeChanger: true,
                        pageSizeOptions: [10, 20, 50, 100],
                        showTotal: (total, range) =>
                            `${range[0]}-${range[1]} of ${total} incident(s)`,
                        style: { padding: "0 16px" },
                    }}
                />
            </Card>
        </>
    );
};

export default IncidentListPage;
