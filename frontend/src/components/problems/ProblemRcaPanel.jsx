import { useEffect, useState } from "react";
import { App, Alert, Button, Divider, Form, Input, Select, Space, Tag, Typography } from "antd";
import { problemApi } from "../../api";
import { useAuth } from "../../hooks/useAuth";
import ActionItemsPanel from "../actionItems/ActionItemsPanel";

const { TextArea } = Input;
const { Text } = Typography;
const categories = ["people", "process", "technology", "vendor", "security", "other"].map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }));
const prompts = ["why1", "why2", "why3", "why4", "why5"];

/**
 * Problem-level RCA (FR4-06) - Staff only.
 *
 * Reuses the same RootCauseAnalysis structure and workflow as incidents, so
 * the RCA here behaves exactly like an incident's RCA. `editable` is passed in
 * from the parent, which derives it from the problem's canManage permission.
 * Once the RCA is approved, the Action Items tracker appears (FR4-07..10).
 */
const ProblemRcaPanel = ({ problemId, rca, editable, onChange }) => {
    const { message } = App.useApp();
    const { isAdmin } = useAuth();
    const [form] = Form.useForm();
    const [saving, setSaving] = useState(false);
    const [reviewComment, setReviewComment] = useState("");
    const canEdit = editable && rca?.status !== "approved";

    useEffect(() => { form.setFieldsValue(rca || {}); }, [form, rca]);

    const save = async (values) => {
        setSaving(true);
        try { await problemApi.saveRca(problemId, values); message.success("RCA saved"); onChange(); }
        catch (err) { message.error(err.message); }
        finally { setSaving(false); }
    };
    const submit = async () => {
        try { await problemApi.submitRca(problemId); message.success("RCA submitted for review"); onChange(); }
        catch (err) { message.error(err.message); }
    };
    const review = async (status) => {
        try { await problemApi.reviewRca(problemId, { status, reviewComment }); message.success(status === "approved" ? "RCA approved" : "RCA returned"); onChange(); }
        catch (err) { message.error(err.message); }
    };

    if (!rca && !editable) return <Alert type="info" showIcon message="No RCA has been recorded for this problem." />;
    return <>
        {rca && <Space style={{ marginBottom: 12 }}><Text strong>RCA status</Text><Tag color={rca.status === "approved" ? "green" : rca.status === "returned" ? "red" : "blue"}>{rca.status.replace("_", " ")}</Tag></Space>}
        {rca?.reviewComment && <Alert type={rca.status === "returned" ? "warning" : "success"} message="Reviewer comment" description={rca.reviewComment} style={{ marginBottom: 12 }} />}
        <Form form={form} layout="vertical" onFinish={save} disabled={!canEdit} requiredMark={false}>
            <Form.Item name="rootCauseCategory" label="Root cause category" rules={[{ required: true }]}><Select options={categories} /></Form.Item>
            <Form.Item name="rootCauseDescription" label="Root cause" rules={[{ required: true }]}><TextArea rows={3} placeholder="What is the underlying cause?" /></Form.Item>
            <Divider orientation="left">5 Whys</Divider>
            {prompts.map((field, index) => <Form.Item key={field} name={field} label={`Why ${index + 1}`}><Input placeholder={`Why did this happen? (${index + 1})`} /></Form.Item>)}
            <Form.Item name="contributingFactors" label="Contributing factors"><TextArea rows={2} /></Form.Item>
            <Form.Item name="correctiveActions" label="Corrective actions" rules={[{ required: true }]}><TextArea rows={2} /></Form.Item>
            <Form.Item name="preventiveActions" label="Preventive actions" rules={[{ required: true }]}><TextArea rows={2} /></Form.Item>
            {canEdit && <Space><Button type="primary" htmlType="submit" loading={saving}>Save draft</Button>{rca && <Button onClick={submit}>Submit for review</Button>}</Space>}
        </Form>
        {isAdmin && rca?.status === "in_review" && <Space style={{ marginTop: 16 }}><Input value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} placeholder="Comment required when returning" /><Button danger onClick={() => review("returned")}>Return</Button><Button type="primary" onClick={() => review("approved")}>Approve</Button></Space>}
        {rca?.status === "approved" && <><Divider /><ActionItemsPanel rcaId={rca._id} /></>}
    </>;
};
export default ProblemRcaPanel;
