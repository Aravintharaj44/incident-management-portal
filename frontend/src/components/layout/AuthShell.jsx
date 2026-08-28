import { Grid, Typography } from "antd";
import {
    CheckCircleOutlined,
    ClockCircleOutlined,
    TeamOutlined,
} from "@ant-design/icons";

const { Title, Text } = Typography;

const HIGHLIGHTS = [
    {
        icon: <ClockCircleOutlined />,
        title: "Track every incident to closure",
        text: "Priority-driven SLA targets flag work before it slips.",
    },
    {
        icon: <TeamOutlined />,
        title: "Clear ownership",
        text: "Every incident has an assignee and a full audit trail.",
    },
    {
        icon: <CheckCircleOutlined />,
        title: "Visibility for managers",
        text: "Dashboards show open, overdue and resolved at a glance.",
    },
];

/**
 * Two-panel frame shared by the sign-in and registration screens.
 * The marketing panel is hidden below the lg breakpoint so the form gets the
 * full width on a phone.
 */
const AuthShell = ({ children }) => {
    const screens = Grid.useBreakpoint();
    const showPanel = screens.lg;

    return (
        <div style={{ minHeight: "100vh", display: "flex", background: "#f5f7fa" }}>
            {showPanel && (
                <div
                    style={{
                        flex: "1 1 50%",
                        background: "linear-gradient(135deg, #0b1f3a 0%, #1677ff 100%)",
                        color: "#fff",
                        padding: "64px 56px",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                    }}
                >
                    <Title level={2} style={{ color: "#fff", marginBottom: 8 }}>
                        Incident Management Portal
                    </Title>

                    <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 15 }}>
                        Log, triage and resolve operational issues in one place.
                    </Text>

                    <div style={{ marginTop: 48, display: "grid", gap: 28 }}>
                        {HIGHLIGHTS.map((item) => (
                            <div key={item.title} style={{ display: "flex", gap: 16 }}>
                                <div
                                    style={{
                                        fontSize: 20,
                                        color: "#fff",
                                        background: "rgba(255,255,255,0.15)",
                                        width: 44,
                                        height: 44,
                                        borderRadius: 10,
                                        display: "grid",
                                        placeItems: "center",
                                        flexShrink: 0,
                                    }}
                                >
                                    {item.icon}
                                </div>
                                <div>
                                    <div style={{ fontWeight: 600, marginBottom: 2 }}>
                                        {item.title}
                                    </div>
                                    <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>
                                        {item.text}
                                    </Text>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div
                style={{
                    flex: showPanel ? "1 1 50%" : "1 1 100%",
                    display: "grid",
                    placeItems: "center",
                    padding: 24,
                }}
            >
                {children}
            </div>
        </div>
    );
};

export default AuthShell;
