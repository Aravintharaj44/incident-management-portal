import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
    Button,
    Card,
    Input,
    Select,
    Space,
    Table,
    Tag,
    Tooltip,
    Typography,
} from "antd";
import { PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { kbApi } from "../../api";
import { useDebounce } from "../../hooks/useDebounce";
import { useAuth } from "../../hooks/useAuth";
import PageHeader from "../../components/common/PageHeader";
import { ErrorView } from "../../components/common/StateViews";
import {
    KBA_STATUS_OPTIONS,
    KBA_STATUS_LABELS,
    KBA_STATUS_COLORS,
} from "../../utils/constants";
import { formatDateTime, fromNow } from "../../utils/format";

const { Text } = Typography;

const KbListPage = () => {
    const { isStaff } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();

    const statusParam = searchParams.get("status") || undefined;
    const searchParam = searchParams.get("search") || "";
    const pageParam = Number(searchParams.get("page")) || 1;
    const limitParam = Number(searchParams.get("limit")) || 10;

    const [articles, setArticles] = useState([]);
    const [pagination, setPagination] = useState({ page: pageParam, limit: limitParam, total: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [search, setSearch] = useState(searchParam);
    const debouncedSearch = useDebounce(search, 400);

    const params = useMemo(
        () => ({
            page: pagination.page,
            limit: pagination.limit,
            search: debouncedSearch || undefined,
            status: statusParam,
        }),
        [pagination.page, pagination.limit, debouncedSearch, statusParam]
    );

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await kbApi.list(params);
            setArticles(response.data.items);
            setPagination(response.data.pagination);
        } catch (err) {
            setError(err);
        } finally {
            setLoading(false);
        }
    }, [params]);

    useEffect(() => {
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
            title: "Title",
            dataIndex: "title",
            render: (title, record) => (
                <Link to={`/kb/${record._id}`}>
                    <div style={{ fontWeight: 500 }}>{title}</div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {record.categories?.map((c) => c.name).join(", ") || "Uncategorised"} -{" "}
                        {fromNow(record.createdAt)}
                    </Text>
                </Link>
            ),
        },
        {
            title: "Status",
            dataIndex: "status",
            width: 120,
            render: (status) => (
                <Tag color={KBA_STATUS_COLORS[status]} style={{ margin: 0 }}>
                    {KBA_STATUS_LABELS[status] || status}
                </Tag>
            ),
        },
        {
            title: "Author",
            dataIndex: "authorID",
            width: 160,
            responsive: ["lg"],
            render: (author) => (
                <Text type="secondary" style={{ fontSize: 13 }}>
                    {author?.name || "Unknown"}
                </Text>
            ),
        },
        {
            title: "Rating",
            width: 120,
            responsive: ["md"],
            render: (_, record) => (
                <Text type="secondary" style={{ fontSize: 13 }}>
                    {record.helpfulnessRatio || "0%"}
                </Text>
            ),
        },
        {
            title: "Created",
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

    if (error && !articles.length) {
        return <ErrorView error={error} onRetry={load} title="Could not load KB articles" />;
    }

    return (
        <>
            <PageHeader
                title="Knowledge Base"
                subtitle="Solutions and workarounds your team can search and reuse."
                extra={[
                    <Button key="refresh" icon={<ReloadOutlined />} onClick={load} loading={loading}>
                        Refresh
                    </Button>,
                    isStaff && (
                        <Button
                            key="new"
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() => navigate("/kb/new")}
                        >
                            New article
                        </Button>
                    ),
                ]}
            />

            <Card size="small" style={{ marginBottom: 16 }}>
                <Space wrap size={12}>
                    <Input
                        allowClear
                        prefix={<SearchOutlined style={{ color: "#bfbfbf" }} />}
                        placeholder="Search title, body or tags"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        style={{ width: 280 }}
                    />

                    {isStaff && (
                        <Select
                            allowClear
                            placeholder="Status"
                            style={{ width: 160 }}
                            options={KBA_STATUS_OPTIONS}
                            value={statusParam}
                            onChange={(value) =>
                                pushParams({ status: value || undefined, page: 1 })
                            }
                        />
                    )}

                    <Text type="secondary">
                        Page {pagination.page} of{" "}
                        {Math.max(1, Math.ceil(pagination.total / pagination.limit))}
                    </Text>
                </Space>
            </Card>

            <Card styles={{ body: { padding: 0 } }}>
                <Table
                    rowKey="_id"
                    columns={columns}
                    dataSource={articles}
                    loading={loading}
                    scroll={{ x: 900 }}
                    onChange={handleTableChange}
                    pagination={{
                        current: pagination.page,
                        pageSize: pagination.limit,
                        total: pagination.total,
                        showSizeChanger: true,
                        pageSizeOptions: [10, 20, 50],
                        showTotal: (total) => `${total} article(s)`,
                        style: { padding: "0 16px" },
                    }}
                />
            </Card>
        </>
    );
};

export default KbListPage;
