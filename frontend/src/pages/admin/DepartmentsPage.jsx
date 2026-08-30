import { useCallback, useEffect, useState } from "react";
import { App, Button, Card, Form, Input, Modal, Popconfirm, Select, Space, Switch, Table, Tag, Typography } from "antd";
import { DeleteOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { categoryApi, departmentApi, userApi } from "../../api";
import PageHeader from "../../components/common/PageHeader";
import { formatDate } from "../../utils/format";

const { Text } = Typography;
const { TextArea } = Input;

const DepartmentsPage = () => {
    const { message } = App.useApp();
    const [departments, setDepartments] = useState([]);
    const [categories, setCategories] = useState([]);
    const [agents, setAgents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form] = Form.useForm();

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [departmentResult, categoryResult, userResult] = await Promise.all([
                departmentApi.list(), categoryApi.list(true), userApi.list({ role: "support_agent", isActive: true, limit: 100 }),
            ]);
            setDepartments(departmentResult.data.departments);
            setCategories(categoryResult.data.categories);
            setAgents(userResult.data.items);
        } catch (error) { message.error(error.message); } finally { setLoading(false); }
    }, [message]);

    useEffect(() => {
        // Data loading updates state only after its asynchronous requests finish.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
    }, [load]);

    const openCreate = () => {
        setEditing(null);
        form.resetFields();
        form.setFieldsValue({ isActive: true, categories: [], members: [] });
        setModalOpen(true);
    };

    const openEdit = async (record) => {
        try {
            const response = await departmentApi.get(record._id);
            const department = response.data.department;
            setEditing(department);
            form.setFieldsValue({
                title: department.title,
                description: department.description,
                isActive: department.isActive,
                headOfDepartment: department.headOfDepartment?._id,
                categories: department.categories.map((category) => category._id),
                members: department.members.map((member) => member.user._id),
            });
            setModalOpen(true);
        } catch (error) { message.error(error.message); }
    };

    const submit = async (values) => {
        setSaving(true);
        try {
            if (editing) await departmentApi.update(editing._id, values);
            else await departmentApi.create(values);
            message.success(editing ? "Department updated" : "Department created");
            setModalOpen(false);
            load();
        } catch (error) {
            if (error.errors?.length) form.setFields(error.errors.map((item) => ({ name: item.field, errors: [item.message] })));
            message.error(error.message);
        } finally { setSaving(false); }
    };

    const columns = [
        { title: "Department", dataIndex: "title", render: (title, record) => <div><Text strong>{title}</Text><Text type="secondary" style={{ display: "block", fontSize: 12 }}>{record.description}</Text></div> },
        { title: "Head", dataIndex: "headOfDepartment", render: (head) => head ? <div><Text>{head.name}</Text><Text type="secondary" style={{ display: "block", fontSize: 12 }}>{head.email}</Text></div> : <Text type="secondary">ï¿½</Text> },
        { title: "Categories", dataIndex: "categories", render: (values) => <Space size={[2, 4]} wrap>{values.map((category) => <Tag key={category._id}>{category.name}</Tag>)}</Space> },
        { title: "Members", dataIndex: "memberCount", width: 100, render: (value) => <Tag color="blue">{value}</Tag> },
        { title: "Active", dataIndex: "isActive", width: 100, render: (value) => <Tag color={value ? "green" : "default"}>{value ? "Yes" : "No"}</Tag> },
        { title: "Created", dataIndex: "createdAt", width: 120, responsive: ["lg"], render: (value) => <Text type="secondary" style={{ fontSize: 12 }}>{formatDate(value)}</Text> },
        { title: "Actions", width: 145, render: (_, record) => <Space size={4}><Button size="small" onClick={() => openEdit(record)}>Edit</Button><Popconfirm title={`Delete ${record.title}?`} description="Its member assignments will be removed." okText="Delete" okButtonProps={{ danger: true }} onConfirm={async () => { try { const response = await departmentApi.remove(record._id); message.success(response.message); load(); } catch (error) { message.error(error.message); } }}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm></Space> },
    ];

    return <>
        <PageHeader title="Departments" subtitle="Organise support agents and the incident categories they own." extra={[<Button key="refresh" icon={<ReloadOutlined />} onClick={load} loading={loading}>Refresh</Button>, <Button key="new" type="primary" icon={<PlusOutlined />} onClick={openCreate}>Add department</Button>]} />
        <Card styles={{ body: { padding: 0 } }}><Table rowKey="_id" columns={columns} dataSource={departments} loading={loading} pagination={false} scroll={{ x: 900 }} /></Card>
        <Modal title={editing ? `Edit ${editing.title}` : "Add a department"} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} confirmLoading={saving} okText={editing ? "Save changes" : "Create department"} destroyOnHidden width={680}>
            <Form form={form} layout="vertical" onFinish={submit} requiredMark={false}>
                <Form.Item name="title" label="Title" rules={[{ required: true, message: "A department title is required" }, { min: 5, max: 140, message: "Between 5 and 140 characters" }]}><Input autoFocus placeholder="e.g. Infrastructure Support" /></Form.Item>
                <Form.Item name="description" label="Description" rules={[{ required: true, message: "A description is required" }, { min: 10, max: 5000, message: "Between 10 and 5,000 characters" }]}><TextArea rows={3} showCount maxLength={5000} /></Form.Item>
                <Form.Item name="categories" label="Categories" rules={[{ required: true, message: "Select at least one category" }]}><Select mode="multiple" placeholder="Select owned categories" options={categories.map((category) => ({ value: category._id, label: `${category.name}${category.isActive ? "" : " (inactive)"}` }))} /></Form.Item>
                <Form.Item name="members" label="Members" rules={[{ required: true, message: "Select at least one support agent" }]} extra="An agent may belong to only one department."><Select mode="multiple" placeholder="Select support agents" options={agents.map((agent) => ({ value: agent._id, label: `${agent.name} (${agent.email})` }))} /></Form.Item>
                <Form.Item noStyle shouldUpdate={(previous, current) => previous.members !== current.members}>{({ getFieldValue }) => <Form.Item name="headOfDepartment" label="Head of department" dependencies={["members"]} rules={[{ required: true, message: "Select a department head" }, { validator: (_, value) => !value || getFieldValue("members")?.includes(value) ? Promise.resolve() : Promise.reject(new Error("The head must be one of the selected members")) }]}><Select placeholder="Choose a selected member" options={agents.filter((agent) => getFieldValue("members")?.includes(agent._id)).map((agent) => ({ value: agent._id, label: `${agent.name} (${agent.email})` }))} /></Form.Item>}</Form.Item>
                <Form.Item name="isActive" label="Active" valuePropName="checked" extra="Inactive departments are retained but not available for future use."><Switch checkedChildren="Yes" unCheckedChildren="No" /></Form.Item>
            </Form>
        </Modal>
    </>;
};

export default DepartmentsPage;
