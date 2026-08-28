import { useState } from "react";
import { App, Button, Empty, Popconfirm, Space, Typography, Upload } from "antd";
import {
    DeleteOutlined,
    DownloadOutlined,
    FileImageOutlined,
    FileOutlined,
    FilePdfOutlined,
    FileTextOutlined,
    UploadOutlined,
} from "@ant-design/icons";
import { attachmentApi } from "../../api";
import { useAuth } from "../../hooks/useAuth";
import { formatFileSize, fromNow } from "../../utils/format";

const { Text } = Typography;

/** Icon per file type, so the list is scannable without reading names. */
const iconFor = (mimeType) => {
    if (mimeType?.startsWith("image/")) return <FileImageOutlined style={{ color: "#52c41a" }} />;
    if (mimeType === "application/pdf") return <FilePdfOutlined style={{ color: "#ff4d4f" }} />;
    if (mimeType?.startsWith("text/")) return <FileTextOutlined style={{ color: "#1677ff" }} />;
    return <FileOutlined style={{ color: "#8c8c8c" }} />;
};

/**
 * Attachments on an incident (FR-08).
 *
 * Uploads go through the API (not a direct disk write) and downloads use an
 * authenticated URL, so the incident's own permissions govern the files too.
 * The size/type limits shown here mirror the server's, which rejects anything
 * that slips past this UI.
 */
const AttachmentPanel = ({ incidentId, attachments = [], canUpload, onChange }) => {
    const { user, isAdmin } = useAuth();
    const { message } = App.useApp();

    const [uploading, setUploading] = useState(false);

    const handleUpload = async ({ file, onSuccess, onError }) => {
        setUploading(true);

        try {
            await attachmentApi.upload(incidentId, [file]);

            message.success(`"${file.name}" attached`);
            onSuccess?.("ok");
            onChange?.();
        } catch (error) {
            message.error(error.message || "Upload failed");
            onError?.(error);
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (attachmentId, name) => {
        try {
            await attachmentApi.remove(attachmentId);
            message.success(`"${name}" removed`);
            onChange?.();
        } catch (error) {
            message.error(error.message);
        }
    };

    const canDelete = (attachment) =>
        isAdmin || attachment.uploadedBy?._id === user?.id;

    return (
        <Space orientation="vertical" size={16} style={{ width: "100%" }}>
            {canUpload && (
                <Upload
                    customRequest={handleUpload}
                    showUploadList={false}
                    multiple
                    // The server enforces this list as well; checking here just
                    // saves the user a failed round trip.
                    accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt"
                    beforeUpload={(file) => {
                        const withinLimit = file.size / 1024 / 1024 < 5;

                        if (!withinLimit) {
                            message.error(
                                `"${file.name}" is larger than the 5 MB limit`
                            );
                            return Upload.LIST_IGNORE;
                        }

                        return true;
                    }}
                >
                    <Button icon={<UploadOutlined />} loading={uploading}>
                        Attach a file
                    </Button>
                    <Text type="secondary" style={{ marginLeft: 12, fontSize: 12 }}>
                        PNG, JPG, GIF, WEBP, PDF or TXT - up to 5 MB each
                    </Text>
                </Upload>
            )}

            {attachments.length === 0 ? (
                <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="No files attached"
                    style={{ margin: "8px 0" }}
                />
            ) : (
                <div>
                    {attachments.map((attachment) => (
                        <div
                            key={attachment._id}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 12,
                                padding: "8px 0",
                                borderBottom: "1px solid #f0f0f0",
                            }}
                        >
                            <span style={{ fontSize: 20, flexShrink: 0 }}>
                                {iconFor(attachment.mimeType)}
                            </span>

                            <div style={{ flex: 1, minWidth: 0, lineHeight: 1.4 }}>
                                <Text style={{ fontSize: 13, display: "block" }} ellipsis>
                                    {attachment.originalName}
                                </Text>
                                <Text type="secondary" style={{ fontSize: 11 }}>
                                    {formatFileSize(attachment.size)} - uploaded by{" "}
                                    {attachment.uploadedBy?.name || "unknown"}{" "}
                                    {fromNow(attachment.uploadedAt)}
                                </Text>
                            </div>

                            <Button
                                type="text"
                                size="small"
                                icon={<DownloadOutlined />}
                                // Opened in a new tab; the token travels in the
                                // query string because a plain link cannot
                                // carry an Authorization header.
                                href={attachmentApi.downloadUrl(attachment._id)}
                                target="_blank"
                                rel="noreferrer"
                            />

                            {canDelete(attachment) && (
                                <Popconfirm
                                    title="Remove this file?"
                                    okText="Remove"
                                    okButtonProps={{ danger: true }}
                                    onConfirm={() =>
                                        handleDelete(attachment._id, attachment.originalName)
                                    }
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
                    ))}
                </div>
            )}
        </Space>
    );
};

export default AttachmentPanel;
