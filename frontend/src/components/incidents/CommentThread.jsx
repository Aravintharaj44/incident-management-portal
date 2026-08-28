import { useState } from "react";
import {
    App,
    Avatar,
    Button,
    Checkbox,
    Empty,
    Input,
    Popconfirm,
    Space,
    Tag,
    Tooltip,
    Typography,
} from "antd";
import { DeleteOutlined, LockOutlined, SendOutlined } from "@ant-design/icons";
import { commentApi } from "../../api";
import { useAuth } from "../../hooks/useAuth";
import { avatarColor, formatDateTime, fromNow, initials } from "../../utils/format";
import { ROLE_LABELS } from "../../utils/constants";

const { TextArea } = Input;
const { Text, Paragraph } = Typography;

/**
 * Comment thread on an incident (FR-07).
 *
 * Staff can post an internal note, which the reporter never sees - the server
 * filters those out of the response, so hiding them here is presentation only,
 * not the control.
 *
 * Comments render as plain text through antd's Typography (React escapes the
 * content), so a comment containing markup cannot inject anything.
 */
const CommentThread = ({ incidentId, comments = [], canUseInternalNotes, onChange }) => {
    const { user, isAdmin } = useAuth();
    const { message } = App.useApp();

    const [draft, setDraft] = useState("");
    const [isInternal, setIsInternal] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async () => {
        const text = draft.trim();

        if (!text) {
            message.warning("Write something before posting");
            return;
        }

        setSubmitting(true);

        try {
            await commentApi.add(incidentId, { message: text, isInternal });

            setDraft("");
            setIsInternal(false);
            message.success(isInternal ? "Internal note added" : "Comment added");

            onChange?.();
        } catch (error) {
            message.error(error.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (commentId) => {
        try {
            await commentApi.remove(commentId);
            message.success("Comment deleted");
            onChange?.();
        } catch (error) {
            message.error(error.message);
        }
    };

    return (
        <div>
            {/* --- Existing thread, oldest first ------------------------- */}
            {comments.length === 0 ? (
                <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="No comments yet - start the conversation below"
                    style={{ margin: "16px 0" }}
                />
            ) : (
                <div style={{ display: "grid", gap: 16, marginBottom: 24 }}>
                    {comments.map((comment) => {
                        const isMine = comment.author?._id === user?.id;
                        const canDelete = isMine || isAdmin;

                        return (
                            <div
                                key={comment._id}
                                style={{
                                    display: "flex",
                                    gap: 12,
                                    padding: 12,
                                    borderRadius: 8,
                                    // Internal notes get a distinct amber treatment so
                                    // staff can never mistake one for a public reply.
                                    background: comment.isInternal ? "#fffbe6" : "#fafafa",
                                    border: comment.isInternal
                                        ? "1px solid #ffe58f"
                                        : "1px solid #f0f0f0",
                                }}
                            >
                                <Avatar
                                    style={{
                                        backgroundColor: avatarColor(comment.author?.name),
                                        flexShrink: 0,
                                    }}
                                >
                                    {initials(comment.author?.name)}
                                </Avatar>

                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <Space size={8} wrap style={{ marginBottom: 4 }}>
                                        <Text strong>{comment.author?.name}</Text>

                                        <Tag style={{ margin: 0, fontSize: 11 }}>
                                            {ROLE_LABELS[comment.author?.role] || comment.author?.role}
                                        </Tag>

                                        {comment.isInternal && (
                                            <Tag
                                                color="warning"
                                                icon={<LockOutlined />}
                                                style={{ margin: 0, fontSize: 11 }}
                                            >
                                                Internal note
                                            </Tag>
                                        )}

                                        <Tooltip title={formatDateTime(comment.createdAt)}>
                                            <Text type="secondary" style={{ fontSize: 11 }}>
                                                {fromNow(comment.createdAt)}
                                            </Text>
                                        </Tooltip>
                                    </Space>

                                    <Paragraph
                                        style={{
                                            margin: 0,
                                            // Preserve the author's line breaks without
                                            // interpreting anything as markup.
                                            whiteSpace: "pre-wrap",
                                            wordBreak: "break-word",
                                        }}
                                    >
                                        {comment.message}
                                    </Paragraph>
                                </div>

                                {canDelete && (
                                    <Popconfirm
                                        title="Delete this comment?"
                                        okText="Delete"
                                        okButtonProps={{ danger: true }}
                                        onConfirm={() => handleDelete(comment._id)}
                                    >
                                        <Button
                                            type="text"
                                            size="small"
                                            danger
                                            icon={<DeleteOutlined />}
                                        />
                                    </Popconfirm>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* --- Composer --------------------------------------------- */}
            <div style={{ display: "flex", gap: 12 }}>
                <Avatar
                    style={{ backgroundColor: avatarColor(user?.name), flexShrink: 0 }}
                >
                    {initials(user?.name)}
                </Avatar>

                <div style={{ flex: 1 }}>
                    <TextArea
                        rows={3}
                        maxLength={2000}
                        showCount
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        placeholder={
                            isInternal
                                ? "Internal note - visible to admins and agents only"
                                : "Add a comment. Everyone with access to this incident will see it."
                        }
                        // Ctrl/Cmd+Enter submits, which is what people expect
                        // from a comment box.
                        onPressEnter={(event) => {
                            if (event.ctrlKey || event.metaKey) handleSubmit();
                        }}
                    />

                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginTop: 8,
                            gap: 12,
                            flexWrap: "wrap",
                        }}
                    >
                        {canUseInternalNotes ? (
                            <Checkbox
                                checked={isInternal}
                                onChange={(event) => setIsInternal(event.target.checked)}
                            >
                                <Space size={4}>
                                    <LockOutlined />
                                    Internal note
                                </Space>
                            </Checkbox>
                        ) : (
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                Ctrl + Enter to post
                            </Text>
                        )}

                        <Button
                            type="primary"
                            icon={<SendOutlined />}
                            loading={submitting}
                            onClick={handleSubmit}
                            disabled={!draft.trim()}
                        >
                            {isInternal ? "Add internal note" : "Post comment"}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CommentThread;
