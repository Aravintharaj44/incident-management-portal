import { useCallback, useEffect, useState } from "react";
import {
    Button,
    Card,
    Descriptions,
    Divider,
    Empty,
    Input,
    Modal,
    Space,
    Table,
    Tag,
    Tooltip,
    Typography,
} from "antd";
import { BulbOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { knownErrorApi } from "../../api";
import { useDebounce } from "../../hooks/useDebounce";
import PageHeader from "../../components/common/PageHeader";
import { ProblemStatusTag } from "../../components/common/Tags";
import { ErrorView } from "../../components/common/StateViews";
import { formatDateTime, fromNow } from "../../utils/format";

const { Paragraph, Text } = Typography;

/**
 * Known Error Database (FR4-03) - Staff only.
 *
 * Read-only catalogue of problems in "Known Error" status: their workaround,
 * linked incidents and any approved root cause. The API only ever returns
 * Known Error problems here, on purpose.
 */
const KnownErrorsPage = () => {
    const [items, setItems] = useState([]);
    const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [search, setSearch] = useState("");
    const debouncedSearch = useDebounce(search, 400);

    const [detail, setDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);

    const load = useCallback(
        async (page = 1, limit = 10) => {
            setLoading(true);
            setError(null);
            try {
                const response = await knownErrorApi.list({
                    page,
                    limit,
                    search: debouncedSearch || undefined,
                });
                setItems(response.data.items);
                setPagination(response.data.pagination);
            } catch (err) {
                setError(err);
            } finally {
                setLoading(false);
            }
        },
        [debouncedSearch]
    );

    useEffect(() => {
        // The state updates here happen after an await, so this is not the
        // synchronous cascade the rule guards against - it cannot see past
        // the async boundary.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load(1, pagination.limit);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]);

    const openDetail = async (record) => {
        setDetailLoading(true);
        try {
            const response = await knownErrorApi.get(record._id);
            setDetail(response.data);
        } catch (err) {
            setError(err);
        } finally {
            setDetailLoading(false);
        }
    };

    const columns = [
        {
            title: "Reference",
            dataIndex: "problemNumber",
            width: 130,
            render: (value, record) => (
                <Button type="link" style={{ padding: 0 }} onClick={() => openDetail(record)}>
                    <Text strong>{value}</Text>
                </Button>
            ),
        },
        // {
        //     title: "Known error",
        //     dataIndex: "title",
        //     render: (title, record) => (
        //         <Button type="link" style={{ padding: 0, height: "auto" }} onClick={() => openDetail(record)}>
        //             <div style={{ textAlign: "left", fontWeight: 500 }}>{title}</div>
        //             <Text type="secondary" style={{ fontSize: 12 }}>
        //                 {record.category?.name || "Uncategorised"}
        //             </Text>
        //         </Button>
        //     ),
        // },
        {
            title: "Known error",
            dataIndex: "title",
            ellipsis: true,
            width: 250,
            render: (title, record) => (
                <Button
                    type="link"
                    style={{
                        padding: 0,
                        height: "auto",
                        width: "100%",
                        textAlign: "left",
                    }}
                    onClick={() => openDetail(record)}
                >
                    <Tooltip title={title}>
                        <div
                            style={{
                                fontWeight: 500,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {title}
                        </div>
                    </Tooltip>
                    <ProblemStatusTag status={record.category?.name || "Uncategorised"} />
                </Button>
            ),
        },
        {
            title: "Workaround",
            dataIndex: "workaround",
            ellipsis: true,
            render: (value) => value || <Text type="secondary">None</Text>,
        },
        {
            title: "Status",
            dataIndex: "status",
            width: 140,
            render: (status) => <ProblemStatusTag status={status} />,
        },
        {
            title: "Updated",
            dataIndex: "updatedAt",
            width: 160,
            responsive: ["lg"],
            render: (value) => (
                <Tooltip title={formatDateTime(value)}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {fromNow(value)}
                    </Text>
                </Tooltip>
            ),
        },
    ];

    if (error && !items.length) {
        return <ErrorView error={error} onRetry={() => load(1)} title="Could not load known errors" />;
    }

    return (
        <>
            <PageHeader
                title="Known Error Database"
                subtitle="Approved problems with a documented workaround - searchable so the support team can resolve incidents faster."
                extra={[
                    <Button key="refresh" icon={<ReloadOutlined />} onClick={() => load(pagination.page)} loading={loading}>
                        Refresh
                    </Button>,
                ]}
            />

            <Card size="small" style={{ marginBottom: 16 }}>
                <Input
                    allowClear
                    prefix={<SearchOutlined style={{ color: "#bfbfbf" }} />}
                    placeholder="Search known errors, references or workarounds"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    style={{ width: 320 }}
                />
            </Card>

            <Card styles={{ body: { padding: 0 } }}>
                <Table
                    rowKey="_id"
                    columns={columns}
                    dataSource={items}
                    loading={loading}
                    scroll={{ x: 800 }}
                    pagination={{
                        current: pagination.page,
                        pageSize: pagination.limit,
                        total: pagination.total,
                        showSizeChanger: true,
                        pageSizeOptions: [10, 20, 50],
                        showTotal: (total) => `${total} known error(s)`,
                        style: { padding: "0 16px" },
                    }}
                    onChange={(tablePagination) => load(tablePagination.current, tablePagination.pageSize)}
                />
            </Card>

            <Modal
                title={
                    detail && (
                        <Space size={8}>
                            <BulbOutlined />
                            {detail.problem.problemNumber}
                        </Space>
                    )
                }
                open={Boolean(detail)}
                onCancel={() => setDetail(null)}
                footer={[
                    <Button key="close" type="primary" onClick={() => setDetail(null)}>
                        Close
                    </Button>,
                ]}
                width={720}
            >
                {detailLoading && !detail && <Empty description="Loading..." />}
                {detail && (
                    <Space direction="vertical" size={14} style={{ width: "100%" }}>
                        <div>
                            <Text strong style={{ fontSize: 16 }}>{detail.problem.title}</Text>
                            <div style={{ marginTop: 6 }}>
                                <Space size={6}>
                                    <ProblemStatusTag status={detail.problem.status} />
                                    <Text type="secondary">Owner {detail.problem.ownerId?.name || "Unassigned"}</Text>
                                </Space>
                            </div>
                        </div>

                        <Descriptions column={1} size="small" bordered>
                            <Descriptions.Item label="Category">{detail.problem.category?.name || "-"}</Descriptions.Item>
                            <Descriptions.Item label="Root cause">
                                {detail.rca ? (
                                    <Space>
                                        <Tag color={detail.rca.status === "approved" ? "green" : "blue"}>
                                            {detail.rca.status.replace("_", " ")}
                                        </Tag>
                                        <Text>{detail.rca.rootCauseDescription}</Text>
                                    </Space>
                                ) : (
                                    "No RCA recorded"
                                )}
                            </Descriptions.Item>
                            <Descriptions.Item label="Linked incidents">
                                {detail.incidents.length
                                    ? detail.incidents.map((incident) => (
                                        <Tag key={incident._id} style={{ marginBottom: 4 }}>
                                            {incident.incidentNumber}
                                        </Tag>
                                    ))
                                    : "None"}
                            </Descriptions.Item>
                        </Descriptions>

                        <div>
                            <Text strong>Workaround</Text>
                            <Divider style={{ margin: "8px 0" }} />
                            {detail.problem.workaround ? (
                                <Paragraph style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>
                                    {detail.problem.workaround}
                                </Paragraph>
                            ) : (
                                <Text type="secondary">No workaround recorded.</Text>
                            )}
                        </div>

                        {detail.rca && (
                            <div>
                                <Text strong>Corrective actions</Text>
                                <Divider style={{ margin: "8px 0" }} />
                                <Paragraph style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>
                                    {detail.rca.correctiveActions}
                                </Paragraph>
                            </div>
                        )}
                    </Space>
                )}
            </Modal>
        </>
    );
};

export default KnownErrorsPage;
