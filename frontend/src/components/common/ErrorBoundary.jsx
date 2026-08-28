import { Component } from "react";
import { Button, Result } from "antd";

/**
 * Catches render-time crashes so one broken widget cannot blank the whole app.
 *
 * Used around the dashboard charts in particular: a charting library throwing
 * on unexpected data should cost the user a chart, not the page.
 */
class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, info) {
        // In V2 this is where a reporting service (Sentry and friends) hooks in.
        console.error("Render error caught by boundary:", error, info);
    }

    handleReset = () => this.setState({ hasError: false, error: null });

    render() {
        const { hasError, error } = this.state;
        const { children, fallbackTitle = "Something went wrong", compact } = this.props;

        if (!hasError) return children;

        if (compact) {
            return (
                <div style={{ padding: 24, textAlign: "center", color: "#8c8c8c" }}>
                    <p>{fallbackTitle}</p>
                    <Button size="small" onClick={this.handleReset}>
                        Retry
                    </Button>
                </div>
            );
        }

        return (
            <Result
                status="error"
                title={fallbackTitle}
                subTitle={error?.message}
                extra={[
                    <Button key="retry" type="primary" onClick={this.handleReset}>
                        Try again
                    </Button>,
                    <Button key="reload" onClick={() => window.location.reload()}>
                        Reload page
                    </Button>,
                ]}
            />
        );
    }
}

export default ErrorBoundary;
