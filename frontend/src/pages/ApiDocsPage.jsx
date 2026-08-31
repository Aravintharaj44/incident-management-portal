import { Button, Card, Result, Space, Typography } from "antd";
import {
    ApiOutlined,
    ExportOutlined,
    BookOutlined,
    LockOutlined,
} from "@ant-design/icons";
import PageHeader from "../components/common/PageHeader";

const { Paragraph, Text } = Typography;


const buildApiDocsUrl = () => {
    const base = import.meta.env.VITE_API_URL || "http://localhost:5000/api/v1";

    let origin;
    if (base.startsWith("http://") || base.startsWith("https://")) {
        try {
            origin = new URL(base).origin;
        } catch {
            origin = window.location.origin;
        }
    } else {
        // Relative (e.g. "/api/v1" routed through the Vite proxy): the backend
        // is served from the same origin as the app.
        origin = window.location.origin;
    }

    return `${origin}/api-docs`;
};

const ApiDocsPage = () => {
    const docsUrl = buildApiDocsUrl();

    const openInTab = () => {
        window.open(docsUrl, "_blank", "noopener,noreferrer");
    };

    return (
        <div>
            <PageHeader
                title="API Documentation"
                subtitle="Swagger UI describing every backend endpoint, with JWT authorization for testing protected routes."
            />

            <Card>
                <Result
                    icon={<ApiOutlined />}
                    title="Swagger UI"
                    subTitle={docsUrl}
                    extra={
                        <Button
                            type="primary"
                            size="large"
                            icon={<ExportOutlined />}
                            onClick={openInTab}
                        >
                            Open API Documentation
                        </Button>
                    }
                />

                <Space
                    direction="vertical"
                    size={16}
                    style={{ width: "100%", maxWidth: 720, display: "flex" }}
                >
                    <Paragraph>
                        The full API reference opens in a new browser tab (as a separate
                        host it cannot be embedded in this app).
                    </Paragraph>

                    <div>
                        <Text strong style={{ display: "block", marginBottom: 8 }}>
                            <BookOutlined /> How to test protected endpoints
                        </Text>
                        <ol style={{ margin: 0, paddingLeft: 20 }}>
                            <li>
                                Call <Text code>POST /api/v1/auth/login</Text> with an existing
                                account to obtain a JWT.
                            </li>
                            <li>Copy the token from <Text code>data.token</Text>.</li>
                            <li>
                                Click <Text code>Authorize</Text> in Swagger UI and paste the
                                token (no <Text code>Bearer</Text> prefix).
                            </li>
                            <li>Test the protected endpoints.</li>
                        </ol>
                    </div>

                    <div>
                        <Text strong style={{ display: "block", marginBottom: 8 }}>
                            <LockOutlined /> Authentication
                        </Text>
                        <Text type="secondary">
                            Tokens are sent as an <Text code>Authorization: Bearer
                            &lt;token&gt;</Text> header. Roles are <Text code>admin</Text>,{" "}
                            <Text code>support_agent</Text> and <Text code>user</Text>; the
                            role required by each endpoint is noted in its documentation.
                        </Text>
                    </div>
                </Space>
            </Card>
        </div>
    );
};

export default ApiDocsPage;
