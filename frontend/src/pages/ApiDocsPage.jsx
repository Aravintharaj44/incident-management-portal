import { useEffect, useState } from "react";
import { Alert, Button, Card, Space, Spin, Typography } from "antd";
import { BookOutlined, LockOutlined, ReloadOutlined } from "@ant-design/icons";
import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";
import PageHeader from "../components/common/PageHeader";

const { Paragraph, Text } = Typography;

const buildApiOrigin = () => {
    const base = import.meta.env.VITE_API_URL || "http://localhost:5000/api/v1";
    if (base.startsWith("http://") || base.startsWith("https://")) {
        try {
            return new URL(base).origin;
        } catch {
            return window.location.origin;
        }
    }
    return window.location.origin;
};

// swagger-ui-express (swaggerUi.serve + swaggerUi.setup) only serves the
// rendered HTML page at /api-docs by default. swagger-ui-react needs the raw
// OpenAPI JSON instead, so the server must also expose it - see the error
// panel below for the one-line route to add if this 404s.
const buildSpecUrl = () => `${buildApiOrigin()}/api-docs.json`;

/**
 * API Documentation (FR5-xx docs surface).
 *
 * Renders Swagger UI directly inside the app shell - the sidebar and header
 * from AppLayout stay visible, this component only fills the <Outlet />
 * content area. No redirect and no new tab: swagger-ui-react turns the
 * OpenAPI JSON spec into the same interactive UI (Authorize, "Try it out",
 * schemas) as the standalone Swagger page would show.
 */
const ApiDocsPage = () => {
    const [specUrl, setSpecUrl] = useState(buildSpecUrl());
    const [spec, setSpec] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = async (url) => {
        setLoading(true);
        setError(null);
        setSpec(null);
        try {
            const res = await fetch(url, { headers: { Accept: "application/json" } });
            if (!res.ok) throw new Error(`Server responded ${res.status}`);

            const contentType = res.headers.get("content-type") || "";
            if (!contentType.includes("application/json")) {
                throw new Error(
                    "That endpoint didn't return JSON - it's probably serving the HTML Swagger page instead of the raw spec."
                );
            }
            setSpec(await res.json());
        } catch (err) {
            setError(err.message || "Could not load the OpenAPI document");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load(specUrl);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const reload = () => {
        const fresh = `${buildSpecUrl()}?_=${Date.now()}`;
        setSpecUrl(fresh);
        load(fresh);
    };

    return (
        <div>
            <PageHeader
                title="API Documentation"
                subtitle="Every backend endpoint, with JWT authorization for testing protected routes."
                extra={[
                    <Button key="reload" icon={<ReloadOutlined />} onClick={reload}>
                        Reload
                    </Button>,
                ]}
            />

            {/* <Card style={{ marginBottom: 16 }}>
                <Space direction="vertical" size={16} style={{ width: "100%", maxWidth: 720, display: "flex" }}>
                    <div>
                        <Text strong style={{ display: "block", marginBottom: 8 }}>
                            <BookOutlined /> How to test protected endpoints
                        </Text>
                        <ol style={{ margin: 0, paddingLeft: 20 }}>
                            <li>
                                Call <Text code>POST /api/v1/auth/login</Text> with an existing account to obtain a
                                JWT.
                            </li>
                            <li>
                                Copy the token from <Text code>data.token</Text>.
                            </li>
                            <li>
                                Click <Text code>Authorize</Text> below and paste the token (no{" "}
                                <Text code>Bearer</Text> prefix).
                            </li>
                            <li>Test the protected endpoints.</li>
                        </ol>
                    </div>

                    <div>
                        <Text strong style={{ display: "block", marginBottom: 8 }}>
                            <LockOutlined /> Authentication
                        </Text>
                        <Text type="secondary">
                            Tokens are sent as an <Text code>Authorization: Bearer &lt;token&gt;</Text> header. Roles
                            are <Text code>admin</Text>, <Text code>support_agent</Text> and <Text code>user</Text>;
                            the role required by each endpoint is noted in its documentation below.
                        </Text>
                    </div>
                </Space>
            </Card> */}

            <Card styles={{ body: { padding: loading || error ? 24 : 0, minHeight: 300 } }}>
                {loading && (
                    <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
                        <Spin tip="Loading API documentation..." size="large" />
                    </div>
                )}

                {!loading && error && (
                    <Alert
                        type="warning"
                        showIcon
                        message="Could not load the OpenAPI document"
                        description={
                            <>
                                <Paragraph style={{ marginBottom: 8 }}>{error}</Paragraph>
                                <Paragraph style={{ marginBottom: 4 }}>
                                    Tried: <Text code>{specUrl}</Text>. If that route doesn't exist yet, add it next
                                    to your existing <Text code>swaggerUi.setup()</Text> call in your Express app
                                    entry point:
                                </Paragraph>
                                <pre
                                    style={{
                                        background: "#f5f5f5",
                                        padding: 8,
                                        borderRadius: 4,
                                        marginTop: 8,
                                        overflowX: "auto",
                                    }}
                                >
{`app.get("/api-docs.json", (req, res) => res.json(swaggerSpec));`}
                                </pre>
                            </>
                        }
                        action={
                            <Button size="small" onClick={reload}>
                                Retry
                            </Button>
                        }
                    />
                )}

                {!loading && !error && spec && (
                    <div className="embedded-swagger">
                        <SwaggerUI
                            spec={spec}
                            docExpansion="list"
                            defaultModelsExpandDepth={-1}
                            persistAuthorization
                        />
                    </div>
                )}
            </Card>

            {/* swagger-ui-react ships its own topbar/logo which is redundant
                inside your app shell (you already have a header/sidebar) -
                hide it and blend the typography with the rest of the app. */}
            <style>{`
                .embedded-swagger .swagger-ui .topbar {
                    display: none;
                }
                .embedded-swagger .swagger-ui {
                    font-family: inherit;
                }
                .embedded-swagger .swagger-ui .info {
                    margin: 20px 0;
                }
            `}</style>
        </div>
    );
};

export default ApiDocsPage;
