import { Button, Empty, Result, Spin } from "antd";
import { ReloadOutlined } from "@ant-design/icons";

/**
 * The three states every data-driven screen needs: loading, failed, empty.
 * Having them here keeps that handling consistent instead of each page
 * inventing its own spinner and error text.
 */

export const LoadingView = ({ tip = "Loading...", height = 240 }) => (
    <div style={{ display: "grid", placeItems: "center", minHeight: height }}>
        <Spin size="large" description={tip}>
            <div style={{ padding: 24 }} />
        </Spin>
    </div>
);

export const ErrorView = ({ error, onRetry, title = "Could not load this data" }) => (
    <Result
        status={error?.status === 403 ? "403" : "error"}
        title={title}
        subTitle={error?.message}
        extra={
            onRetry && (
                <Button type="primary" icon={<ReloadOutlined />} onClick={onRetry}>
                    Try again
                </Button>
            )
        }
    />
);

export const EmptyView = ({ description = "Nothing to show yet", action, height = 200 }) => (
    <div style={{ display: "grid", placeItems: "center", minHeight: height }}>
        <Empty description={description} image={Empty.PRESENTED_IMAGE_SIMPLE}>
            {action}
        </Empty>
    </div>
);
