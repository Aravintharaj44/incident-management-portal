import { useCallback, useEffect, useState } from "react";
import { App, Button, Empty, Form, List, Modal, Select, Space, Tag, Typography } from "antd";
import { DeleteOutlined, LinkOutlined, PlusOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { incidentApi } from "../../api";
import { PriorityTag, StatusTag } from "../common/Tags";

const { Text } = Typography;
const relationships = [
    { value: "Related", label: "Related" },
    { value: "Duplicate", label: "Duplicate" },
    { value: "Caused-By", label: "Caused by" },
    { value: "Child-Of", label: "Make this a child of the selected major incident" },
];

const LinkedIncidentPanel = ({ incidentId, canManageLinks, onChange }) => {
    const { message, modal } = App.useApp();
    const navigate = useNavigate();
    const [links, setLinks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [acting, setActing] = useState(false);
    const [open, setOpen] = useState(false);
    const [candidates, setCandidates] = useState([]);
    const [form] = Form.useForm();
    const [suggestions, setSuggestions] = useState([]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const response = await incidentApi.listLinks(incidentId);
            setLinks(response.data.links);
            const suggestionResponse = await incidentApi.listCorrelationSuggestions(incidentId);
            setSuggestions(suggestionResponse.data.suggestions);
        } catch (err) {
            message.error(err.message);
        } finally {
            setLoading(false);
        }
    }, [incidentId, message]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
    }, [load]);


    const openCreate = async () => {
        setOpen(true);
        try {
            const response = await incidentApi.list({ limit: 100 });
            setCandidates(response.data.items.filter((item) => item._id !== incidentId));
        } catch (err) {
            message.error(`Could not load incidents: ${err.message}`);
        }
    };

    const create = async (values) => {
        setActing(true);
        try {
            await incidentApi.createLink(incidentId, values);
            message.success("Incident linked");
            form.resetFields();
            setOpen(false);
            await load();
            onChange?.();
        } catch (err) {
            message.error(err.message);
        } finally {
            setActing(false);
        }
    };

    const reviewSuggestion = async (suggestion, action) => {
        setActing(true);
        try {
            await incidentApi.reviewCorrelationSuggestion(incidentId, suggestion._id, { action, relationshipType: "Related" });
            message.success(action === "confirm" ? "Suggested link confirmed" : "Suggestion dismissed");
            await load();
            onChange?.();
        } catch (err) { message.error(err.message); } finally { setActing(false); }
    };
    const remove = (link) => modal.confirm({
        title: `Remove link to ${link.incident.incidentNumber}?`,
        content: "The incidents will no longer be associated.",
        okText: "Remove link",
        okButtonProps: { danger: true },
        onOk: async () => {
            setActing(true);
            try {
                await incidentApi.removeLink(incidentId, link.linkId);
                message.success("Incident link removed");
                await load();
                onChange?.();
            } catch (err) {
                message.error(err.message);
            } finally {
                setActing(false);
            }
        },
    });

    return (
        <>
            {canManageLinks && <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} style={{ marginBottom: 12 }}>Link incident</Button>}
            {suggestions.length > 0 && (
                <List size="small" header="Suggested correlations — review required" style={{ marginBottom: 16 }} dataSource={suggestions} renderItem={(suggestion) => (
                    <List.Item actions={canManageLinks ? [
                        <Button key="confirm" type="link" loading={acting} onClick={() => reviewSuggestion(suggestion, "confirm")}>Confirm</Button>,
                        <Button key="dismiss" type="link" danger loading={acting} onClick={() => reviewSuggestion(suggestion, "dismiss")}>Dismiss</Button>,
                    ] : []}>
                        <Space><Text strong>{suggestion.suggestedIncidentId.incidentNumber}</Text><Text>{suggestion.suggestedIncidentId.title}</Text><Tag>{Math.round(suggestion.score * 100)}% match</Tag></Space>
                    </List.Item>
                )} />
            )}            <List loading={loading} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No linked incidents" /> }} dataSource={links} renderItem={(link) => (
                <List.Item actions={canManageLinks ? [<Button key="remove" type="text" danger icon={<DeleteOutlined />} loading={acting} onClick={() => remove(link)}>Unlink</Button>] : []}>
                    <List.Item.Meta avatar={<LinkOutlined style={{ color: "#1677ff" }} />} title={<Space wrap><Button type="link" style={{ padding: 0 }} onClick={() => navigate(`/incidents/${link.incident._id}`)}>{link.incident.incidentNumber}</Button><Text>{link.incident.title}</Text></Space>} description={<Space wrap size={6}><Tag color="blue">{link.relationshipType}</Tag><StatusTag status={link.incident.status} /><PriorityTag priority={link.incident.priority} /></Space>} />
                </List.Item>
            )} />
            <Modal title="Link an incident" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={acting} destroyOnHidden>
                <Form form={form} layout="vertical" onFinish={create} requiredMark={false}>
                    <Form.Item name="toIncidentId" label="Incident" rules={[{ required: true, message: "Choose an incident" }]}><Select showSearch optionFilterProp="label" placeholder="Search available incidents" options={candidates.map((item) => ({ value: item._id, label: `${item.incidentNumber} — ${item.title}` }))} /></Form.Item>
                    <Form.Item name="relationshipType" label="Relationship" rules={[{ required: true, message: "Choose a relationship" }]}><Select options={relationships} placeholder="Choose relationship" /></Form.Item>
                </Form>
            </Modal>
        </>
    );
};

export default LinkedIncidentPanel;
