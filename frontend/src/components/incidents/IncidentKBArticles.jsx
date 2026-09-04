import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
    App,
    Button,
    Empty,
    List,
    Select,
    Space,
    Spin,
    Tag,
    Typography,
} from "antd";
import { EyeOutlined } from "@ant-design/icons";
import { incidentApi } from "../../api";
import { useDebounce } from "../../hooks/useDebounce";
import {
    KBA_STATUS_LABELS,
    KBA_STATUS_COLORS,
} from "../../utils/constants";
import { fromNow } from "../../utils/format";

const { Text } = Typography;

/**
 * "KB Articles" tab for the Incident Details page (FR4-14).
 *
 * Displays all KB articles linked to an incident and lets staff add/remove
 * links. Article search is always restricted to the incident's category and to
 * published articles — enforced on the backend, never the client.
 */
const IncidentKBArticles = ({ incidentId, categoryId, canManage }) => {
    const { message } = App.useApp();

    const [articles, setArticles] = useState([]);
    const [loading, setLoading] = useState(true);

    const [searchText, setSearchText] = useState("");
    const debouncedSearch = useDebounce(searchText, 400);

    const [options, setOptions] = useState([]);
    const [searching, setSearching] = useState(false);

    const [removingId, setRemovingId] = useState(null);

    const prevCategoryRef = useRef(categoryId);

    const load = useCallback(async () => {
        if (!incidentId) return;
        setLoading(true);
        try {
            const response = await incidentApi.listKbArticles(incidentId);
            setArticles(response.data.articles || []);
        } catch (err) {
            message.error(err.message || "Failed to load linked KB articles");
        } finally {
            setLoading(false);
        }
    }, [incidentId, message]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
    }, [load]);

    useEffect(() => {
        // When the incident category changes, refresh the search scope and
        // reload the (possibly revalidated) linked list.
        if (prevCategoryRef.current !== categoryId) {
            prevCategoryRef.current = categoryId;
            setOptions([]);
            setSearchText("");
            load();
        }
    }, [categoryId, load]);

    const runSearch = useCallback(
        async (text = "") => {
            if (!incidentId || !categoryId) {
                setOptions([]);
                return;
            }

            setSearching(true);

            try {
                const response = await incidentApi.searchKbArticles(incidentId, {
                    search: text.trim(),
                    limit: 10,
                });

                const searchResults = response.data.articles || [];

                // Don't show articles that are already linked.
                const linkedIds = new Set(
                    articles.map((article) => String(article._id))
                );

                setOptions(
                    searchResults
                        .filter((article) => !linkedIds.has(String(article._id)))
                        .map((article) => ({
                            value: article._id,
                            label: article.title,
                            article,
                        }))
                );
            } catch (err) {
                console.error("KB article search failed:", err);
                setOptions([]);
            } finally {
                setSearching(false);
            }
        },
        [incidentId, categoryId, articles]
    );

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        runSearch(debouncedSearch);
    }, [debouncedSearch, runSearch]);

    const handleLink = async (value) => {
        if (!value) return;
        setSearching(true);
        try {
            await incidentApi.linkKb(incidentId, value);
            message.success("KB article linked");
            setSearchText("");
            setOptions([]);
            load();
        } catch (err) {
            message.error(err.message || "Failed to link article");
        } finally {
            setSearching(false);
        }
    };

    const handleRemove = async (articleId) => {
        setRemovingId(articleId);
        try {
            await incidentApi.unlinkKb(incidentId, articleId);
            message.success("KB article unlinked");
            load();
        } catch (err) {
            message.error(err.message || "Failed to unlink article");
        } finally {
            setRemovingId(null);
        }
    };

    return (
        <div style={{ padding: "8px 0" }}>
            {canManage && (
                <div style={{ marginBottom: 16 }}>
                    <Space.Compact style={{ width: "100%" }}>
                        <Select
                            showSearch
                            filterOption={false}
                            onOpenChange={(open) => {
                                if (open) {
                                    runSearch(searchText);
                                }
                            }}
                            onSearch={setSearchText}
                            searchValue={searchText}
                            loading={searching}
                            options={options}
                            value={null}
                            placeholder={
                                categoryId
                                    ? "Search for a KB article to link..."
                                    : "Assign a category to this incident to link KB articles"
                            }
                            disabled={!categoryId}
                            onChange={handleLink}
                            style={{ flex: 1 }}
                            notFoundContent={
                                searching ? (
                                    <Spin size="small" />
                                ) : options.length === 0 ? (
                                    "No matching articles in this category"
                                ) : null
                            }
                            optionRender={(opt) => (
                                <Space
                                    direction="vertical"
                                    size={0}
                                    style={{ padding: "2px 0" }}
                                >
                                    <Text strong>{opt.label}</Text>

                                    {opt.data?.article?.tags?.length > 0 && (
                                        <Text
                                            type="secondary"
                                            style={{ fontSize: 12 }}
                                        >
                                            {(opt.data.article.tags || []).join(", ")}
                                        </Text>
                                    )}
                                </Space>
                            )}
                        />
                    </Space.Compact>
                    <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 6 }}>
                        {categoryId
                            ? "Only published articles in this incident's category are shown."
                            : "An incident must have a category before KB articles can be linked."}
                    </Text>
                </div>
            )}

            {loading ? (
                <div style={{ display: "grid", placeItems: "center", minHeight: 120 }}>
                    <Spin />
                </div>
            ) : articles.length === 0 ? (
                <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={canManage ? "No KB articles linked yet" : "No KB articles linked"}
                />
            ) : (
                <List
                    itemLayout="horizontal"
                    dataSource={articles}
                    renderItem={(article) => (
                        <List.Item
                            actions={[
                                <Link key="view" to={`/kb/${article._id}`}>
                                    <Button size="small" icon={<EyeOutlined />}>
                                        View
                                    </Button>
                                </Link>,
                                canManage && (
                                    <Button
                                        key="remove"
                                        size="small"
                                        danger
                                        loading={removingId === article._id}
                                        onClick={() => handleRemove(article._id)}
                                    >
                                        Remove
                                    </Button>
                                ),
                            ]}
                        >
                            <List.Item.Meta
                                title={
                                    <Link to={`/kb/${article._id}`}>{article.title}</Link>
                                }
                                description={
                                    <Space wrap size={6}>
                                        <Tag color={KBA_STATUS_COLORS[article.status]}>
                                            {KBA_STATUS_LABELS[article.status] || article.status}
                                        </Tag>
                                        {(article.categories || []).map((c) => (
                                            <Tag key={c._id || c}>{c.name || "Uncategorised"}</Tag>
                                        ))}
                                        {article.authorID && (
                                            <Text type="secondary" style={{ fontSize: 12 }}>
                                                by {article.authorID.name || "Unknown"}
                                            </Text>
                                        )}
                                        {article.updatedAt && (
                                            <Text type="secondary" style={{ fontSize: 12 }}>
                                                updated {fromNow(article.updatedAt)}
                                            </Text>
                                        )}
                                    </Space>
                                }
                            />
                        </List.Item>
                    )}
                />
            )}
        </div>
    );
};

export default IncidentKBArticles;
