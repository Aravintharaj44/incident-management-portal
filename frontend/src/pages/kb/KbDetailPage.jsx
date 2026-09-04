import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "../../components/editor/KbArticleContent.css";
import {
    App,
    Button,
    Card,
    Descriptions,
    Space,
    Tag,
    Typography,
} from "antd";
import {
    EditOutlined,
    DeleteOutlined,
    DislikeOutlined,
    LikeOutlined,
} from "@ant-design/icons";
import { kbApi } from "../../api";
import PageHeader from "../../components/common/PageHeader";
import { LoadingView, ErrorView } from "../../components/common/StateViews";
import {
    KBA_STATUS_LABELS,
    KBA_STATUS_COLORS,
} from "../../utils/constants";
import { formatDateTime } from "../../utils/format";

const { Text } = Typography;

const KbDetailPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { message, modal } = App.useApp();

    const [article, setArticle] = useState(null);
    const [userFeedback, setUserFeedback] = useState(null);
    const [canEdit, setCanEdit] = useState(false);
    const [canManage, setCanManage] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [feedbackLoading, setFeedbackLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await kbApi.get(id);
            setArticle(response.data.article);
            setUserFeedback(response.data.userFeedback);
            setCanEdit(response.data.permissions?.canEdit || false);
            setCanManage(response.data.permissions?.canManage || false);
        } catch (err) {
            setError(err);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
    }, [load]);

    const handleFeedback = async (value) => {
        setFeedbackLoading(true);
        try {
            const response = await kbApi.feedback(id, value);
            setArticle(response.data.article);
            setUserFeedback(response.data.userFeedback);
            message.success("Feedback recorded");
        } catch (err) {
            message.error(err.message || "Failed to record feedback");
        } finally {
            setFeedbackLoading(false);
        }
    };

    const handleDelete = () => {
        modal.confirm({
            title: "Archive this article?",
            content: "The article will be moved to the archived state and removed from search results.",
            okText: "Archive",
            okButtonProps: { danger: true },
            onOk: async () => {
                try {
                    await kbApi.remove(id);
                    message.success("Article archived");
                    navigate("/kb");
                } catch (err) {
                    message.error(err.message || "Failed to archive article");
                }
            },
        });
    };

    if (loading) return <LoadingView />;
    if (error) return <ErrorView error={error} onRetry={load} title="Could not load article" />;
    if (!article) return <ErrorView error={{ message: "Article not found" }} />;

    return (
        <>
            <PageHeader
                title={article.title}
                subtitle={`Created ${formatDateTime(article.createdAt)}`}
                breadcrumbs={[
                    { label: "Knowledge Base", to: "/kb" },
                    { label: article.title },
                ]}
                tags={
                    <Tag color={KBA_STATUS_COLORS[article.status]}>
                        {KBA_STATUS_LABELS[article.status] || article.status}
                    </Tag>
                }
                extra={
                    <Space wrap>
                        {(canEdit || canManage) && (
                            <Button
                                icon={<EditOutlined />}
                                onClick={() => navigate(`/kb/${id}/edit`)}
                            >
                                Edit
                            </Button>
                        )}
                        {canManage && (
                            <Button
                                danger
                                icon={<DeleteOutlined />}
                                onClick={handleDelete}
                            >
                                Archive
                            </Button>
                        )}
                    </Space>
                }
            />

            {/* <Card style={{ marginBottom: 16 }}>
                <div
                    style={{ fontSize: 15, lineHeight: 1.8, whiteSpace: "pre-wrap" }}
                >
                    {article.body}
                </div>
            </Card>
             */}
            <Card style={{ marginBottom: 16 }}>
                <div
                    className="kb-article-content"
                    dangerouslySetInnerHTML={{
                        __html: article.body || "",
                    }}
                />
            </Card>

            <Card size="small" style={{ marginBottom: 16 }}>
                <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small">
                    <Descriptions.Item label="Author">
                        {article.authorID?.name || "Unknown"}
                    </Descriptions.Item>
                    <Descriptions.Item label="Categories">
                        {article.categories?.length
                            ? article.categories.map((c) => (
                                <Tag key={c._id}>{c.name}</Tag>
                            ))
                            : "None"}
                    </Descriptions.Item>
                    <Descriptions.Item label="Tags">
                        {article.tags?.length
                            ? article.tags.map((t) => <Tag key={t}>{t}</Tag>)
                            : "None"}
                    </Descriptions.Item>
                    <Descriptions.Item label="Helpful">
                        {article.helpfulCount || 0}
                    </Descriptions.Item>
                    <Descriptions.Item label="Not Helpful">
                        {article.notHelpfulCount || 0}
                    </Descriptions.Item>
                    <Descriptions.Item label="Rating">
                        {article.helpfulnessRatio || "0%"}
                    </Descriptions.Item>
                </Descriptions>
            </Card>

            <Card size="small" title="Was this article helpful?">
                <Space size={12}>
                    <Button
                        type={userFeedback === "helpful" ? "primary" : "default"}
                        icon={<LikeOutlined />}
                        loading={feedbackLoading}
                        onClick={() => handleFeedback("helpful")}
                    >
                        Helpful
                    </Button>
                    <Button
                        type={userFeedback === "not_helpful" ? "primary" : "default"}
                        icon={<DislikeOutlined />}
                        danger={userFeedback === "not_helpful"}
                        loading={feedbackLoading}
                        onClick={() => handleFeedback("not_helpful")}
                    >
                        Not helpful
                    </Button>
                    {userFeedback && (
                        <Text type="secondary">
                            Your feedback: {userFeedback === "helpful" ? "Helpful" : "Not helpful"}
                        </Text>
                    )}
                </Space>
            </Card>
        </>
    );
};

export default KbDetailPage;
