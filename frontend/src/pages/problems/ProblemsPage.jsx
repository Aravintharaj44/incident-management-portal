import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
    Button,
    Card,
    Input,
    Select,
    Space,
    Table,
    Tooltip,
    Typography,
} from "antd";
import { PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { problemApi, userApi } from "../../api";
import { useDebounce } from "../../hooks/useDebounce";
import PageHeader from "../../components/common/PageHeader";
import { ProblemStatusTag } from "../../components/common/Tags";
import UserBadge from "../../components/common/UserBadge";
import { ErrorView } from "../../components/common/StateViews";
import { PROBLEM_STATUS_OPTIONS } from "../../utils/constants";
import { formatDateTime, fromNow } from "../../utils/format";

const { Text } = Typography;

/**
 * Problem queue (FR4-01) - Staff only.
 *
 * Search and status/owner filters live in the URL so a filtered view is
 * shareable, matching how the incident list behaves.
 */
const ProblemsPage = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();

    const statusParam = searchParams.get("status") || undefined;
    const ownerParam = searchParams.get("ownerId") || undefined;
    const searchParam = searchParams.get("search") || "";
    const pageParam = Number(searchParams.get("page")) || 1;
    const limitParam = Number(searchParams.get("limit")) || 10;

    const [problems, setProblems] = useState([]);
    const [pagination, setPagination] = useState({ page: pageParam, limit: limitParam, total: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [search, setSearch] = useState(searchParam);
    const debouncedSearch = useDebounce(search, 400);

    const [owners, setOwners] = useState([]);

    useEffect(() => {
        userApi
            .assignable()
            .then((response) => setOwners(response.data.users))
            .catch(() => setOwners([]));
    }, []);

    const params = useMemo(
        () => ({
            page: pagination.page,
            limit: pagination.limit,
            search: debouncedSearch || undefined,
            status: statusParam,
            ownerId: ownerParam,
        }),
        [pagination.page, pagination.limit, debouncedSearch, statusParam, ownerParam]
    );

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await problemApi.list(params);
            setProblems(response.data.items);
            setPagination(response.data.pagination);
        } catch (err) {
            setError(err);
        } finally {
            setLoading(false);
        }
    }, [params]);

    useEffect(() => {
        // The state updates here happen after an await, so this is not the
        // synchronous cascade the rule guards against - it cannot see past
        // the async boundary.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
    }, [load]);

    const pushParams = (changes) => {
        const next = new URLSearchParams(searchParams);
        Object.entries(changes).forEach(([key, value]) => {
            if (value === undefined || value === null || value === "") next.delete(key);
            else next.set(key, String(value));
        });
        setSearchParams(next, { replace: true });
    };

    useEffect(() => {
        if (debouncedSearch !== searchParam) pushParams({ search: debouncedSearch || undefined });
        // Only react to the (debounced) text, not to the URL echoing it back.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedSearch]);

    const handleTableChange = (tablePagination) => {
        setPagination((prev) => ({
            ...prev,
            page: tablePagination.current,
            limit: tablePagination.pageSize,
        }));
        pushParams({ page: tablePagination.current, limit: tablePagination.pageSize });
    };

    const columns = [
        {
            title: "Reference",
            dataIndex: "problemNumber",
            width: 130,
            render: (value, record) => (
                <Link to={`/problems/${record._id}`}>
                    <Text strong style={{ fontSize: 13 }}>
                        {value}
                    </Text>
                </Link>
            ),
        },
        {
            title: "Title",
            dataIndex: "title",
            render: (title, record) => (
                <Link to={`/problems/${record._id}`}>
                    <div style={{ fontWeight: 500 }}>{title}</div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {record.category?.name || "Uncategorised"} - raised{" "}
                        {fromNow(record.createdAt)}
                    </Text>
                </Link>
            ),
        },
        {
            title: "Status",
            dataIndex: "status",
            width: 140,
            render: (status) => <ProblemStatusTag status={status} />,
        },
        {
            title: "Owner",
            dataIndex: "ownerId",
            width: 180,
            responsive: ["lg"],
            render: (owner) => <UserBadge user={owner} fallback="Unassigned" />,
        },
        {
            title: "Raised",
            dataIndex: "createdAt",
            width: 160,
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

    if (error && !problems.length) {
        return <ErrorView error={error} onRetry={load} title="Could not load problems" />;
    }

    return (
        <>
            <PageHeader
                title="Problems"
                subtitle="Group related incidents, track root causes and build a known error knowledge base."
                extra={[
                    <Button key="refresh" icon={<ReloadOutlined />} onClick={load} loading={loading}>
                        Refresh
                    </Button>,
                    <Button
                        key="new"
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => navigate("/problems/new")}
                    >
                        Create problem
                    </Button>,
                ]}
            />

            <Card size="small" style={{ marginBottom: 16 }}>
                <Space wrap size={12}>
                    <Input
                        allowClear
                        prefix={<SearchOutlined style={{ color: "#bfbfbf" }} />}
                        placeholder="Search title, reference or workaround"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        style={{ width: 280 }}
                    />

                    <Select
                        allowClear
                        placeholder="Status"
                        style={{ width: 180 }}
                        options={PROBLEM_STATUS_OPTIONS}
                        value={statusParam}
                        onChange={(value) =>
                            pushParams({ status: value || undefined, page: 1 })
                        }
                    />

                    <Select
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        placeholder="Owner"
                        style={{ width: 200 }}
                        value={ownerParam}
                        onChange={(value) =>
                            pushParams({ ownerId: value || undefined, page: 1 })
                        }
                        options={owners
                            // .filter((owner) => owner.isActive === true)
                            .map((owner) => ({
                                value: owner._id,
                                label: owner.name,
                            }))}
                    />

                    <Text type="secondary">
                        Page {pagination.page} of {Math.max(1, Math.ceil(pagination.total / pagination.limit))}
                    </Text>
                </Space>
            </Card>

            <Card styles={{ body: { padding: 0 } }}>
                <Table
                    rowKey="_id"
                    columns={columns}
                    dataSource={problems}
                    loading={loading}
                    scroll={{ x: 900 }}
                    onChange={handleTableChange}
                    pagination={{
                        current: pagination.page,
                        pageSize: pagination.limit,
                        total: pagination.total,
                        showSizeChanger: true,
                        pageSizeOptions: [10, 20, 50],
                        showTotal: (total) => `${total} problem(s)`,
                        style: { padding: "0 16px" },
                    }}
                />
            </Card>
        </>
    );
};

export default ProblemsPage;
