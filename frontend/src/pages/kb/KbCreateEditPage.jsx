import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { App, Button, Card, Form, Input, Select, Space } from "antd";
import { kbApi, categoryApi } from "../../api";
import PageHeader from "../../components/common/PageHeader";
import { LoadingView, ErrorView } from "../../components/common/StateViews";
import { KBA_STATUS_OPTIONS } from "../../utils/constants";

const { TextArea } = Input;

const KbCreateEditPage = () => {
    const { id } = useParams();
    const isEdit = Boolean(id);
    const navigate = useNavigate();
    const { message } = App.useApp();
    const [form] = Form.useForm();

    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        categoryApi
            .list()
            .then((res) => {
                const items = res.data?.items || res.data?.categories || res.data || [];
                setCategories(Array.isArray(items) ? items.filter((c) => c.isActive !== false) : []);
            })
            .catch(() => setCategories([]));
    }, []);

    const loadArticle = useCallback(async () => {
        if (!isEdit) return;
        setLoading(true);
        setError(null);
        try {
            const response = await kbApi.get(id);
            const article = response.data.article;
            form.setFieldsValue({
                title: article.title,
                body: article.body,
                categories: article.categories?.map((c) => c._id) || [],
                tags: article.tags || [],
                status: article.status,
            });
        } catch (err) {
            setError(err);
        } finally {
            setLoading(false);
        }
    }, [id, isEdit, form]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadArticle();
    }, [loadArticle]);

    const handleSubmit = async (values) => {
        setSubmitting(true);
        try {
            const payload = {
                title: values.title,
                body: values.body,
                categories: values.categories,
                tags: values.tags || [],
                status: values.status,
            };

            if (isEdit) {
                await kbApi.update(id, payload);
                message.success("Article updated");
                navigate(`/kb/${id}`);
            } else {
                const response = await kbApi.create(payload);
                message.success("Article created");
                navigate(`/kb/${response.data.article._id}`);
            }
        } catch (err) {
            message.error(err.message || "Failed to save article");
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <LoadingView />;
    if (error) return <ErrorView error={error} onRetry={loadArticle} title="Could not load article" />;

    return (
        <>
            <PageHeader
                title={isEdit ? "Edit KB Article" : "New KB Article"}
                breadcrumbs={[
                    { label: "Knowledge Base", to: "/kb" },
                    { label: isEdit ? "Edit" : "New article" },
                ]}
            />

            <Card>
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSubmit}
                    requiredMark="optional"
                    initialValues={{ status: "draft", categories: [], tags: [] }}
                >
                    <Form.Item
                        name="title"
                        label="Title"
                        rules={[
                            { required: true, message: "Title is required" },
                            { min: 3, message: "Title must be at least 3 characters" },
                            { max: 250, message: "Title must be at most 250 characters" },
                        ]}
                    >
                        <Input placeholder="How to resolve..." />
                    </Form.Item>

                    <Form.Item
                        name="body"
                        label="Body"
                        rules={[
                            { required: true, message: "Body is required" },
                            { min: 10, message: "Body must be at least 10 characters" },
                        ]}
                    >
                        <TextArea
                            rows={12}
                            placeholder="Provide the full solution, workaround or known error description..."
                        />
                    </Form.Item>

                    <Form.Item
                        name="categories"
                        label="Categories"
                        rules={[{ required: true, message: "Select at least one category" }]}
                    >
                        <Select
                            mode="multiple"
                            placeholder="Select categories"
                            options={categories.map((c) => ({ value: c._id, label: c.name }))}
                        />
                    </Form.Item>

                    <Form.Item name="tags" label="Tags">
                        <Select
                            mode="tags"
                            placeholder="Add tags (press Enter)"
                        />
                    </Form.Item>

                    {isEdit && (
                        <Form.Item name="status" label="Status">
                            <Select options={KBA_STATUS_OPTIONS} />
                        </Form.Item>
                    )}

                    <Form.Item style={{ marginTop: 24 }}>
                        <Space>
                            <Button type="primary" htmlType="submit" loading={submitting}>
                                {isEdit ? "Update article" : "Create article"}
                            </Button>
                            <Button onClick={() => navigate(isEdit ? `/kb/${id}` : "/kb")}>
                                Cancel
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Card>
        </>
    );
};

export default KbCreateEditPage;
