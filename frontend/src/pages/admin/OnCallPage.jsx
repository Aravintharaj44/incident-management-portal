import { useState, useEffect } from "react";
import { 
    App, Card, Table, Tag, Button, Modal, Form, 
    Select, DatePicker, InputNumber, Space, Typography, 
    Calendar, Badge, Tabs 
} from "antd";
import { PlusOutlined, TableOutlined, CalendarOutlined } from "@ant-design/icons";
import PageHeader from "../../components/common/PageHeader";
import { getOnCallCalendar, createOnCallRoster } from "../../api/onCallApi";
import { userApi } from "../../api/users";
import { departmentApi } from "../../api/departments";

const { RangePicker } = DatePicker;
const { Text } = Typography;

const OnCallPage = () => {
    const [schedules, setSchedules] = useState([]);
    const [users, setUsers] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [form] = Form.useForm();

    const { message } = App.useApp();

    const fetchCalendar = async () => {
        setLoading(true);
        try {
            const res = await getOnCallCalendar();
            const rawData = res?.data !== undefined ? res.data : res;
            const data = Array.isArray(rawData) 
                ? rawData 
                : (rawData?.schedules || rawData?.data || rawData?.rosters || []);

            setSchedules(data);
        } catch (err) {
            message.error("Failed to load on-call schedules");
        } finally {
            setLoading(false);
        }
    };

    const fetchUsers = async () => {
        try {
            const res = await userApi.assignable();
            const rawData = res?.data !== undefined ? res.data : res;
            const userList = Array.isArray(rawData) 
                ? rawData 
                : (rawData?.data || rawData?.users || []);
            setUsers(userList);
        } catch (err) {
            message.error("Failed to load users list");
        }
    };

    const fetchDepartments = async () => {
        try {
            const res = await departmentApi.list();
            const rawData = res?.data !== undefined ? res.data : res;
            const deptList = Array.isArray(rawData) 
                ? rawData 
                : (rawData?.data || rawData?.departments || []);
            setDepartments(deptList);
        } catch (err) {
            message.error("Failed to load departments list");
        }
    };

    useEffect(() => {
        fetchCalendar();
        fetchUsers();
        fetchDepartments();
    }, []);

    const handleCreate = async (values) => {
        try {
            const payload = {
                department: values.department,
                startTime: values.dateRange[0].toISOString(),
                endTime: values.dateRange[1].toISOString(),
                ackWindowMinutes: values.ackWindowMinutes,
                escalationChain: values.escalationChain.map((userId, idx) => ({
                    step: idx + 1,
                    user: userId
                }))
            };
            await createOnCallRoster(payload);
            message.success("On-call roster created successfully");
            setIsModalOpen(false);
            form.resetFields();
            fetchCalendar();
        } catch (err) {
            message.error(err.response?.data?.message || "Failed to create roster");
        }
    };

    const columns = [
        {
            title: "Department",
            dataIndex: "department",
            key: "department",
            render: (dept) => {
                if (dept?.title) return dept.title;
                if (dept?.name) return dept.name;
                const deptId = typeof dept === "object" ? dept?._id : dept;
                const found = departments.find((d) => d._id === deptId);
                return found?.title || found?.name || "All Departments";
            }
        },
        {
            title: "Start Time",
            dataIndex: "startTime",
            key: "startTime",
            render: (d) => (d ? new Date(d).toLocaleString() : "-")
        },
        {
            title: "End Time",
            dataIndex: "endTime",
            key: "endTime",
            render: (d) => (d ? new Date(d).toLocaleString() : "-")
        },
        {
            title: "Ack Window",
            dataIndex: "ackWindowMinutes",
            key: "ackWindowMinutes",
            render: (m) => <Tag color="blue">{m} mins</Tag>
        },
        {
            title: "Escalation Chain",
            dataIndex: "escalationChain",
            key: "escalationChain",
            render: (chain) => (
                <Space direction="vertical" size="small">
                    {chain?.map((c) => {
                        const userId = typeof c.user === "object" ? c.user?._id : c.user;
                        const userObj = users.find((u) => u._id === userId);
                        const displayName = c.user?.name || userObj?.name || c.user?.email || userObj?.email || userId;
                        return (
                            <Text key={c.step} type="secondary">
                                Level {c.step}: <Tag>{displayName}</Tag>
                            </Text>
                        );
                    })}
                </Space>
            )
        }
    ];

    const cellRender = (currentDate) => {
        const cellDate = currentDate.startOf("day").toDate();

        const activeShifts = schedules.filter((s) => {
            const start = new Date(s.startTime);
            const end = new Date(s.endTime);
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);
            return cellDate >= start && cellDate <= end;
        });

        if (activeShifts.length === 0) return null;

        return (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {activeShifts.map((item) => {
                    const deptId = typeof item.department === "object" ? item.department?._id : item.department;
                    const deptObj = departments.find((d) => d._id === deptId);
                    const deptTitle = item.department?.title || deptObj?.title || deptObj?.name || "Shift";

                    const primary = item.escalationChain?.[0]?.user;
                    const primaryId = typeof primary === "object" ? primary?._id : primary;
                    const userObj = users.find((u) => u._id === primaryId);
                    const primaryName = primary?.name || userObj?.name || primary?.email?.split("@")[0] || userObj?.email?.split("@")[0] || "Assigned";

                    return (
                        <li 
                            key={item._id} 
                            style={{ 
                                marginBottom: 4, 
                                backgroundColor: "#e6f4ff", 
                                borderRadius: 4, 
                                padding: "2px 4px", 
                                borderLeft: "3px solid #1677ff" 
                            }}
                        >
                            <Text strong style={{ fontSize: 11, display: "block", color: "#0958d9" }}>
                                {deptTitle}
                            </Text>
                            <Text style={{ fontSize: 11, color: "#595959" }}>
                                👤 {primaryName}
                            </Text>
                        </li>
                    );
                })}
            </ul>
        );
    };

    return (
        <div>
            <PageHeader 
                title="On-Call & Escalation Management" 
                subtitle="Configure shift rosters and view active response chains"
                extra={
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
                        Create Roster
                    </Button>
                }
            />

            <Card style={{ marginTop: 16 }}>
                <Tabs 
                    defaultActiveKey="table"
                    items={[
                        {
                            key: "table",
                            label: (
                                <span>
                                    <TableOutlined /> Table View
                                </span>
                            ),
                            children: (
                                <Table 
                                    columns={columns} 
                                    dataSource={schedules} 
                                    rowKey={(record) => record._id || record.id} 
                                    loading={loading} 
                                />
                            )
                        },
                        {
                            key: "calendar",
                            label: (
                                <span>
                                    <CalendarOutlined /> Calendar View
                                </span>
                            ),
                            children: (
                                <Calendar cellRender={cellRender} />
                            )
                        }
                    ]}
                />
            </Card>

            <Modal
                title="Create On-Call Roster"
                open={isModalOpen}
                onCancel={() => setIsModalOpen(false)}
                onOk={() => form.submit()}
            >
                <Form form={form} layout="vertical" onFinish={handleCreate}>
                    <Form.Item 
                        name="department" 
                        label="Department" 
                        rules={[{ required: true, message: "Please select a department" }]}
                    >
                        <Select 
                            placeholder="Select Department"
                            options={(Array.isArray(departments) ? departments : []).map((d) => ({
                                label: d.title || d.name,
                                value: d._id
                            }))}
                        />
                    </Form.Item>

                    <Form.Item 
                        name="dateRange" 
                        label="Shift Window" 
                        rules={[{ required: true, message: "Please select shift date & time range" }]}
                    >
                        <RangePicker showTime style={{ width: "100%" }} />
                    </Form.Item>

                    <Form.Item 
                        name="ackWindowMinutes" 
                        label="Acknowledgement Timeout (Minutes)" 
                        initialValue={15} 
                        rules={[{ required: true }]}
                    >
                        <InputNumber min={1} max={120} style={{ width: "100%" }} />
                    </Form.Item>

                    <Form.Item 
                        name="escalationChain" 
                        label="Escalation Chain (Select Responders in Order)" 
                        rules={[{ required: true, message: "Please select at least one responder" }]}
                    >
                        <Select 
                            mode="multiple" 
                            placeholder="Select users in sequence" 
                            style={{ width: "100%" }}
                            options={(Array.isArray(users) ? users : []).map((u) => ({
                                label: u.name ? `${u.name} (${u.email})` : u.email || u._id,
                                value: u._id
                            }))}
                            filterOption={(input, option) =>
                                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                            }
                        />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default OnCallPage;