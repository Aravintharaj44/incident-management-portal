import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    Alert,
    App,
    Button,
    Card,
    Col,
    Form,
    Input,
    Row,
    Select,
    Space,
    Typography,
    Upload,
} from "antd";
import { InboxOutlined, SendOutlined } from "@ant-design/icons";
import { attachmentApi, categoryApi, incidentApi } from "../api";
import PageHeader from "../components/common/PageHeader";
import { PriorityTag } from "../components/common/Tags";
import { PRIORITY, PRIORITY_LABELS, PRIORITY_ORDER } from "../utils/constants";

const { TextArea } = Input;
const { Text, Paragraph } = Typography;
const { Dragger } = Upload;

/** The SLA promise per priority, shown so the choice is an informed one. */
const SLA_HINTS = {
    [PRIORITY.CRITICAL]: "Target resolution: 4 hours",
    [PRIORITY.HIGH]: "Target resolution: 8 hours",
    [PRIORITY.MEDIUM]: "Target resolution: 24 hours",
    [PRIORITY.LOW]: "Target resolution: 72 hours",
};

/**
 * Raise a new incident (FR-03).
 */
const IncidentCreatePage = () => {
    const [form] = Form.useForm();
    const navigate = useNavigate();
    const { message } = App.useApp();

    const [categories, setCategories] = useState([]);
    const [loadingCategories, setLoadingCategories] = useState(true);
    const [files, setFiles] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const priority = Form.useWatch("priority", form);

    useEffect(() => {
        categoryApi
            .list()
            .then((response) => setCategories(response.data.categories || response.data))
            .catch((err) => setError(err.message))
            .finally(() => setLoadingCategories(false));
    }, []);

    const handleSubmit = async (values) => {
        setSubmitting(true);
        setError(null);

        try {
            const response = await incidentApi.create(values);
            
            // SAFELY UNPACK RESPONSE (Handles both response.data.data and response.data.incident)
            const created = response.data?.data || response.data?.incident || response.data;

            if (!created || !created._id) {
                throw new Error("Invalid incident data received from server");
            }

            if (files.length) {
                try {
                    await attachmentApi.upload(created._id, files);
                } catch (uploadError) {
                    message.warning(
                        `${created.incidentNumber || 'Incident'} was created, but the attachments failed: ${uploadError.message}`
                    );
                    navigate(`/incidents/${created._id}`);
                    return;
                }
            }

            message.success(`${created.incidentNumber || 'Incident'} has been logged`);
            navigate(`/incidents/${created._id}`);
        } catch (err) {
            if (err.errors?.length) {
                form.setFields(
                    err.errors.map((item) => ({ name: item.field, errors: [item.message] }))
                );
            }
            setError(err.message || "Failed to create incident");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            <PageHeader
                breadcrumbs={[{ label: "Incidents", to: "/incidents" }, { label: "New" }]}
                title="Raise an incident"
                subtitle="Describe what is wrong. The more detail you give, the faster it gets resolved."
            />

            {error && (
                <Alert
                    type="error"
                    title={error}
                    showIcon
                    closable
                    onClose={() => setError(null)}
                    style={{ marginBottom: 16 }}
                />
            )}

            <Row gutter={[16, 16]}>
                <Col xs={24} lg={16}>
                    <Card>
                        <Form
                            form={form}
                            layout="vertical"
                            onFinish={handleSubmit}
                            requiredMark
                            initialValues={{ priority: PRIORITY.MEDIUM }}
                            size="large"
                        >
                            <Form.Item
                                name="title"
                                label="Summary"
                                rules={[
                                    { required: true, message: "Please summarise the issue" },
                                    {
                                        min: 5,
                                        max: 140,
                                        message: "Between 5 and 140 characters",
                                    },
                                ]}
                                extra="One line describing the problem, as you would say it to a colleague."
                            >
                                <Input
                                    placeholder="e.g. VPN disconnects every few minutes for the finance team"
                                    autoFocus
                                    showCount
                                    maxLength={140}
                                />
                            </Form.Item>

                            <Form.Item
                                name="description"
                                label="What is happening?"
                                rules={[
                                    { required: true, message: "Please describe the issue" },
                                    {
                                        min: 10,
                                        max: 5000,
                                        message: "Between 10 and 5000 characters",
                                    },
                                ]}
                                extra="Include what you were doing, what you expected, what happened instead, and who is affected."
                            >
                                <TextArea
                                    rows={7}
                                    showCount
                                    maxLength={5000}
                                    placeholder={
                                        "Steps to reproduce:\n1. ...\n\nExpected: ...\nActual: ...\n\nWho is affected: ..."
                                    }
                                />
                            </Form.Item>

                            <Row gutter={16}>
                                <Col xs={24} sm={12}>
                                    <Form.Item
                                        name="category"
                                        label="Category"
                                        rules={[
                                            { required: true, message: "Please pick a category" },
                                        ]}
                                    >
                                        <Select
                                            placeholder="Select a category"
                                            loading={loadingCategories}
                                            showSearch
                                            optionFilterProp="label"
                                            options={categories.map((category) => ({
                                                value: category._id,
                                                label: category.name,
                                                title: category.description,
                                            }))}
                                        />
                                    </Form.Item>
                                </Col>

                                <Col xs={24} sm={12}>
                                    <Form.Item
                                        name="priority"
                                        label="Priority"
                                        rules={[{ required: true }]}
                                        extra={SLA_HINTS[priority]}
                                    >
                                        <Select
                                            options={PRIORITY_ORDER.map((value) => ({
                                                value,
                                                label: PRIORITY_LABELS[value],
                                            }))}
                                        />
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Form.Item label="Attachments (optional)">
                                <Dragger
                                    multiple
                                    beforeUpload={(file) => {
                                        if (file.size / 1024 / 1024 >= 5) {
                                            message.error(`"${file.name}" is larger than 5 MB`);
                                            return Upload.LIST_IGNORE;
                                        }
                                        setFiles((current) => [...current, file]);
                                        return false;
                                    }}
                                    onRemove={(file) => {
                                        setFiles((current) =>
                                            current.filter((item) => item.uid !== file.uid)
                                        );
                                    }}
                                    accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt"
                                >
                                    <p className="ant-upload-drag-icon">
                                        <InboxOutlined />
                                    </p>
                                    <p className="ant-upload-text">
                                        Drop a screenshot or log file here
                                    </p>
                                    <p className="ant-upload-hint">
                                        PNG, JPG, GIF, WEBP, PDF or TXT - up to 5 MB each
                                    </p>
                                </Dragger>
                            </Form.Item>

                            <Space>
                                <Button
                                    type="primary"
                                    htmlType="submit"
                                    icon={<SendOutlined />}
                                    loading={submitting}
                                >
                                    Submit incident
                                </Button>
                                <Button onClick={() => navigate("/incidents")} disabled={submitting}>
                                    Cancel
                                </Button>
                            </Space>
                        </Form>
                    </Card>
                </Col>

                <Col xs={24} lg={8}>
                    <Card title="Choosing a priority" size="small">
                        <Space direction="vertical" size={14} style={{ width: "100%" }}>
                            <div>
                                <PriorityTag priority={PRIORITY.CRITICAL} />
                                <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 6 }}>
                                    A service is down or a security event is in progress. Many
                                    people are blocked with no workaround.
                                </Paragraph>
                            </div>
                            <div>
                                <PriorityTag priority={PRIORITY.HIGH} />
                                <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 6 }}>
                                    A team is significantly affected, or a workaround exists but is
                                    painful.
                                </Paragraph>
                            </div>
                            <div>
                                <PriorityTag priority={PRIORITY.MEDIUM} />
                                <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 6 }}>
                                    An individual is affected and can still work around it.
                                </Paragraph>
                            </div>
                            <div>
                                <PriorityTag priority={PRIORITY.LOW} />
                                <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 6 }}>
                                    A minor annoyance, a request, or something that can wait.
                                </Paragraph>
                            </div>
                        </Space>
                    </Card>

                    <Card title="What happens next" size="small" style={{ marginTop: 16 }}>
                        <ol style={{ paddingLeft: 18, margin: 0, color: "#595959", fontSize: 13 }}>
                            <li style={{ marginBottom: 8 }}>
                                Your incident gets a reference number and enters the queue as{" "}
                                <Text code>New</Text>.
                            </li>
                            <li style={{ marginBottom: 8 }}>
                                The support team assigns an owner and moves it to{" "}
                                <Text code>In Progress</Text>.
                            </li>
                            <li style={{ marginBottom: 8 }}>
                                You will be notified on every status change, and you can comment at
                                any time.
                            </li>
                            <li>
                                Once fixed it moves to <Text code>Resolved</Text>, then{" "}
                                <Text code>Closed</Text>.
                            </li>
                        </ol>
                    </Card>
                </Col>
            </Row>
        </>
    );
};

export default IncidentCreatePage;