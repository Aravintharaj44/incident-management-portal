import { Breadcrumb, Space, Typography } from "antd";
import { Link } from "react-router-dom";

const { Title, Text } = Typography;

/**
 * Consistent page title block.
 *
 * antd removed its own PageHeader in v5, so this is the project's small
 * replacement rather than a dependency on a deprecated component.
 */
const PageHeader = ({ title, subtitle, extra, breadcrumbs = [], tags }) => (
    <div style={{ marginBottom: 24 }}>
        {breadcrumbs.length > 0 && (
            <Breadcrumb
                style={{ marginBottom: 12 }}
                items={breadcrumbs.map((crumb) => ({
                    title: crumb.to ? <Link to={crumb.to}>{crumb.label}</Link> : crumb.label,
                }))}
            />
        )}

        <div
            style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 16,
                flexWrap: "wrap",
            }}
        >
            <div style={{ minWidth: 0 }}>
                <Space align="center" wrap size={12}>
                    <Title level={3} style={{ margin: 0 }}>
                        {title}
                    </Title>
                    {tags}
                </Space>

                {subtitle && (
                    <Text type="secondary" style={{ display: "block", marginTop: 4 }}>
                        {subtitle}
                    </Text>
                )}
            </div>

            {extra && <Space wrap>{extra}</Space>}
        </div>
    </div>
);

export default PageHeader;
