import { Card, Statistic, Typography } from "antd";
import { useNavigate } from "react-router-dom";

const { Text } = Typography;

/**
 * One tile on the dashboard (FR-11).
 *
 * When `linkTo` is supplied the whole card navigates to the incident list with
 * the matching filters pre-applied, so a count is always one click from the
 * rows behind it.
 */
const StatCard = ({
    title,
    value,
    icon,
    color = "#1677ff",
    suffix,
    loading,
    linkTo,
    hint,
}) => {
    const navigate = useNavigate();

    const clickable = Boolean(linkTo);

    return (
        <Card
            hoverable={clickable}
            onClick={clickable ? () => navigate(linkTo) : undefined}
            style={{
                height: "100%",
                cursor: clickable ? "pointer" : "default",
                borderTop: `3px solid ${color}`,
            }}
            styles={{ body: { padding: 20 } }}
        >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                    <Statistic
                        title={<Text type="secondary">{title}</Text>}
                        value={value}
                        suffix={suffix}
                        loading={loading}
                        styles={{ content: { color, fontWeight: 600 } }}
                    />
                    {hint && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {hint}
                        </Text>
                    )}
                </div>

                <div
                    style={{
                        fontSize: 22,
                        color,
                        background: `${color}14`,
                        width: 44,
                        height: 44,
                        borderRadius: 10,
                        display: "grid",
                        placeItems: "center",
                        flexShrink: 0,
                    }}
                >
                    {icon}
                </div>
            </div>
        </Card>
    );
};

export default StatCard;
