import { useEffect, useState } from "react";
import {
    Alert,
    App,
    Button,
    Card,
    Input,
    Rate,
    Result,
    Space,
    Spin,
    Typography,
} from "antd";
import {
    CheckCircleOutlined,
    SendOutlined,
    StarFilled,
} from "@ant-design/icons";
import { useParams } from "react-router-dom";
import { surveyApi } from "../../api";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const SurveyPage = () => {
    const { token } = useParams();
    const { message } = App.useApp();

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const [survey, setSurvey] = useState(null);
    const [rating, setRating] = useState(0);
    const [comments, setComments] = useState("");

    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        const loadSurvey = async () => {
            if (!token) {
                setError("Invalid survey link.");
                setLoading(false);
                return;
            }

            try {
                const response = await surveyApi.get(token);

                const data = response.data?.survey;

                if (!data) {
                    setError("Survey not found.");
                    return;
                }

                setSurvey(data);

                if (data.status === "completed") {
                    setSubmitted(true);
                }
            } catch (err) {
                setError(
                    err?.response?.data?.message ||
                    err?.message ||
                    "Unable to load the survey."
                );
            } finally {
                setLoading(false);
            }
        };

        loadSurvey();
    }, [token]);

    const handleSubmit = async () => {
        if (!rating) {
            message.warning("Please select a rating from 1 to 5.");
            return;
        }

        setSubmitting(true);

        try {
            await surveyApi.submit(token, {
                rating,
                comments: comments.trim(),
            });

            setSubmitted(true);

            message.success("Thank you for your feedback!");
        } catch (err) {
            message.error(
                err?.response?.data?.message ||
                err?.message ||
                "Failed to submit your feedback."
            );
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div
                style={{
                    minHeight: "100vh",
                    display: "grid",
                    placeItems: "center",
                    background: "#f5f5f5",
                }}
            >
                <Spin size="large" />
            </div>
        );
    }

    if (error) {
        return (
            <div
                style={{
                    minHeight: "100vh",
                    display: "grid",
                    placeItems: "center",
                    padding: 24,
                    background: "#f5f5f5",
                }}
            >
                <Card style={{ maxWidth: 560, width: "100%" }}>
                    <Result
                        status="404"
                        title="Survey unavailable"
                        subTitle={error}
                    />
                </Card>
            </div>
        );
    }

    if (submitted) {
        return (
            <div
                style={{
                    minHeight: "100vh",
                    display: "grid",
                    placeItems: "center",
                    padding: 24,
                    background: "#f5f5f5",
                }}
            >
                <Card
                    style={{
                        maxWidth: 600,
                        width: "100%",
                        textAlign: "center",
                    }}
                >
                    <Result
                        icon={<CheckCircleOutlined />}
                        status="success"
                        title="Thank you for your feedback!"
                        subTitle="Your feedback has been successfully submitted."
                    />
                </Card>
            </div>
        );
    }

    const incident = survey?.incident;

    return (
        <div
            style={{
                minHeight: "100vh",
                background: "#f5f5f5",
                padding: "48px 20px",
            }}
        >
            <div
                style={{
                    maxWidth: 650,
                    margin: "0 auto",
                }}
            >
                <Card
                    bordered={false}
                    style={{
                        borderRadius: 12,
                    }}
                >
                    <Space
                        direction="vertical"
                        size={24}
                        style={{ width: "100%" }}
                    >
                        <div style={{ textAlign: "center" }}>
                            <Title level={2} style={{ marginBottom: 8 }}>
                                How was your support experience?
                            </Title>

                            <Paragraph type="secondary">
                                Your incident has been resolved. Please take a
                                moment to tell us how we did.
                            </Paragraph>
                        </div>

                        {incident && (
                            <Alert
                                message="Incident resolved"
                                description={
                                    <Space direction="vertical" size={2}>
                                        <Text strong>
                                            {incident.incidentNumber}
                                        </Text>

                                        <Text>
                                            {incident.title}
                                        </Text>
                                    </Space>
                                }
                                type="info"
                                showIcon
                            />
                        )}

                        <div style={{ textAlign: "center" }}>
                            <Text strong style={{ display: "block", marginBottom: 12 }}>
                                How satisfied are you with the resolution?
                            </Text>

                            <Rate
                                value={rating}
                                onChange={setRating}
                                count={5}
                                character={<StarFilled />}
                                style={{ fontSize: 40 }}
                            />

                            <div style={{ marginTop: 8 }}>
                                <Text type="secondary">
                                    {rating === 0
                                        ? "Please select a rating"
                                        : `${rating} out of 5`}
                                </Text>
                            </div>
                        </div>

                        <div>
                            <Text strong>
                                Additional comments
                            </Text>

                            <Text
                                type="secondary"
                                style={{
                                    display: "block",
                                    marginBottom: 8,
                                }}
                            >
                                Optional
                            </Text>

                            <TextArea
                                value={comments}
                                onChange={(event) =>
                                    setComments(event.target.value)
                                }
                                placeholder="Tell us about your experience..."
                                rows={5}
                                maxLength={5000}
                                showCount
                            />
                        </div>

                        <Button
                            type="primary"
                            size="large"
                            icon={<SendOutlined />}
                            loading={submitting}
                            disabled={!rating}
                            onClick={handleSubmit}
                            block
                        >
                            Submit Feedback
                        </Button>

                        <Text
                            type="secondary"
                            style={{
                                textAlign: "center",
                                display: "block",
                                fontSize: 12,
                            }}
                        >
                            Your feedback helps us improve our support service.
                        </Text>
                    </Space>
                </Card>
            </div>
        </div>
    );
};

export default SurveyPage;