import { useCallback, useEffect, useState } from "react";
import { App, Button, Card, Select, Space, Table, Tag, Typography } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { intakeApi } from "../../api";
import PageHeader from "../../components/common/PageHeader";
import { ErrorView } from "../../components/common/StateViews";
import SourceTag from "../../components/incidents/SourceTag";
import { formatDateTime } from "../../utils/format";

const { Text } = Typography;

const STATUS_OPTIONS = [
    { value: "", label: "All" },
    { value: "Flagged", label: "Failed / Flagged (needs review)" },
    { value: "Reviewed", label: "Reviewed" },
    { value: "Resolved", label: "Resolved" },
];

/**
 * IntakeFailuresPage
 * FR4-20 — Intake Failure Handling admin view.
 */
const IntakeFailuresPage = () => {
    const { message } = App.useApp();

    const [logs, setLogs] = useState([]);
    const [status, setStatus] = useState("Flagged");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [actingId, setActingId] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await intakeApi.list({ status: status || undefined, limit: 50 });
            
            // Safely extract items from backend paginated envelope: response.data.data.items
            const items = response?.data?.data?.items || response?.data?.items || [];
            setLogs(items);
        } catch (err) {
            setError(err);
        } finally {
            setLoading(false);
        }
    }, [status]);

    useEffect(() => {
        load();
    }, [load]);

    const handleResolve = async (id) => {
        setActingId(id);
        try {
            await intakeApi.resolve(id);
            message.success("Marked resolved");
            await load();
        } catch (err) {
            message.error(err.message || "Failed to resolve");
        } finally {
            setActingId(null);
        }
    };

    const handleDismiss = async (id) => {
        setActingId(id);
        try {
            await intakeApi.dismiss(id);
            message.success("Dismissed");
            await load();
        } catch (err) {
            message.error(err.message || "Failed to dismiss");
        } finally {
            setActingId(null);
        }
    };

    const columns = [
        {
            title: "Received",
            dataIndex: "createdAt",
            width: 170,
            render: (value) => (
                <Text type="secondary" style={{ fontSize: 12 }}>
                    {formatDateTime(value)}
                </Text>
            ),
        },
        {
            title: "Source",
            dataIndex: "source",
            width: 110,
            render: (source) => <SourceTag source={source} />,
        },
        {
            title: "Vendor",
            dataIndex: "vendor",
            width: 130,
            render: (vendor) => vendor || "-",
        },
        {
            title: "Reason",
            dataIndex: "errorReason",
            render: (reason) => <Text style={{ fontSize: 13 }}>{reason}</Text>,
        },
        {
            title: "Status",
            dataIndex: "status",
            width: 110,
            render: (value) => <Tag>{value}</Tag>,
        },
        {
            title: "Actions",
            key: "actions",
            width: 180,
            render: (_value, record) =>
                record.status === "Flagged" || record.status === "Failed" ? (
                    <Space>
                        <Button
                            size="small"
                            loading={actingId === record._id}
                            onClick={() => handleResolve(record._id)}
                        >
                            Resolve
                        </Button>
                        <Button
                            size="small"
                            loading={actingId === record._id}
                            onClick={() => handleDismiss(record._id)}
                        >
                            Dismiss
                        </Button>
                    </Space>
                ) : null,
        },
    ];

    if (error && !logs.length) {
        return <ErrorView error={error} onRetry={load} title="Could not load intake failures" />;
    }

    return (
        <>
            <PageHeader
                title="Intake Failures"
                subtitle="Emails and webhook alerts that could not be auto-parsed into incidents."
                extra={[
                    <Button key="refresh" icon={<ReloadOutlined />} onClick={load} loading={loading}>
                        Refresh
                    </Button>,
                ]}
            />

            <Space style={{ marginBottom: 16 }}>
                <Select
                    style={{ width: 240 }}
                    value={status}
                    onChange={setStatus}
                    options={STATUS_OPTIONS}
                />
            </Space>

            <Card styles={{ body: { padding: 0 } }}>
                <Table
                    rowKey="_id"
                    columns={columns}
                    dataSource={logs}
                    loading={loading}
                    scroll={{ x: 900 }}
                    locale={{
                        emptyText: (
                            <div style={{ padding: 32 }}>
                                <Text type="secondary">Nothing to review.</Text>
                            </div>
                        ),
                    }}
                    pagination={false}
                />
            </Card>
        </>
    );
};

export default IntakeFailuresPage;