import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { App, Button, Card, Form, Input, Select, Space, Typography } from "antd";
import { ArrowLeftOutlined, SaveOutlined } from "@ant-design/icons";
import { incidentApi, problemApi, userApi } from "../../api";
import PageHeader from "../../components/common/PageHeader";

const { Text } = Typography;
const { TextArea } = Input;

/**
 * Create a Problem (FR4-01) - Staff only.
 *
 * A problem may be created on its own or first, with a batch of related
 * incidents already grouped under it (FR4-04). Any selected incidents are
 * linked immediately by the API.
 */
const ProblemCreatePage = () => {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const [form] = Form.useForm();

    const [owners, setOwners] = useState([]);
    const [incidents, setIncidents] = useState([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        userApi
            .assignable()
            .then((response) => setOwners(response.data.users))
            .catch(() => setOwners([]));
        incidentApi
            .list({ limit: 100 })
            .then((response) => setIncidents(response.data.items))
            .catch(() => setIncidents([]));
    }, []);

    const handleSubmit = async (values) => {
        setSaving(true);
        try {
            const response = await problemApi.create({
                title: values.title,
                description: values.description,
                workaround: values.workaround || undefined,
                ownerId: values.ownerId || undefined,
                incidentIds: values.incidentIds || undefined,
            });
            message.success(`${response.data.problem.problemNumber} created`);
            navigate(`/problems/${response.data.problem._id}`);
        } catch (err) {
            if (err.errors?.length) {
                form.setFields(
                    err.errors.map((item) => ({ name: item.field, errors: [item.message] }))
                );
            }
            message.error(err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <PageHeader
                breadcrumbs={[
                    { label: "Problems", to: "/problems" },
                    { label: "Create problem" },
                ]}
                title="Create a problem"
                subtitle="Group related incidents and track their shared cause."
                extra={[
                    <Button
                        key="back"
                        icon={<ArrowLeftOutlined />}
                        onClick={() => navigate("/problems")}
                    >
                        Back
                    </Button>,
                ]}
            />

            <Card style={{ maxWidth: 760 }}>
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSubmit}
                    requiredMark={false}
                >
                    <Form.Item
                        name="title"
                        label="Title"
                        rules={[
                            { required: true, message: "A title is required" },
                            { min: 5, max: 140, message: "Between 5 and 140 characters" },
                        ]}
                    >
                        <Input placeholder="What problem does this group of incidents share?" />
                    </Form.Item>

                    <Form.Item
                        name="description"
                        label="Description"
                        rules={[
                            { required: true, message: "A description is required" },
                            { min: 10, max: 5000, message: "Between 10 and 5000 characters" },
                        ]}
                    >
                        <TextArea
                            rows={5}
                            showCount
                            maxLength={5000}
                            placeholder="Describe the problem and its impact."
                        />
                    </Form.Item>

                    <Form.Item name="ownerId" label="Owner">
                        <Select
                            allowClear
                            showSearch
                            optionFilterProp="label"
                            placeholder="Select an admin or support agent"
                            options={owners
                                .map((owner) => ({ value: owner._id, label: owner.name }))}
                        />
                    </Form.Item>

                    <Form.Item
                        name="workaround"
                        label="Workaround"
                        extra="A temporary workaround can be recorded now or added once one is known."
                    >
                        <TextArea rows={3} showCount maxLength={3000} placeholder="Optional" />
                    </Form.Item>

                    <Form.Item
                        name="incidentIds"
                        label="Related incidents"
                        extra="Optionally group existing incidents under this problem right away. You can link more later."
                    >
                        <Select
                            mode="multiple"
                            showSearch
                            optionFilterProp="label"
                            placeholder="Select incidents to group"
                            options={incidents.map((incident) => ({
                                value: incident._id,
                                label: `${incident.incidentNumber} - ${incident.title}`,
                            }))}
                        />
                    </Form.Item>

                    <Space>
                        <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
                            Create problem
                        </Button>
                        <Text type="secondary">Creates the problem and links the selected incidents.</Text>
                    </Space>
                </Form>
            </Card>
        </>
    );
};

export default ProblemCreatePage;
