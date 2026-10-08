import { useState } from "react";
import { Avatar, Button, Drawer, Flex, Input, Spin, Typography, Upload } from "antd";
import { SendOutlined, RobotOutlined, UserOutlined, WarningOutlined, PaperClipOutlined, DeleteOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { chatbotApi } from "../../api/chatbot";

const { Text, Paragraph } = Typography;

/** Pastel accent palettes the bot bubbles cycle through, so the chat list feels colorful. */
const BOT_ACCENTS = [
    { border: "#722ed1", bg: "#f9f0ff", chip: "#722ed1" },
    { border: "#13c2c2", bg: "#e6fffb", chip: "#08979c" },
    { border: "#fa8c16", bg: "#fff7e6", chip: "#d46b08" },
    { border: "#eb2f96", bg: "#fff0f6", chip: "#c41d7f" },
    { border: "#52c41a", bg: "#f6ffed", chip: "#389e0d" },
    { border: "#2f54eb", bg: "#f0f5ff", chip: "#1d39c4" },
];

const USER_GRADIENT = { background: "linear-gradient(135deg, #1677ff 0%, #722ed1 100%)", color: "#fff" };
const ERROR_STYLE = { border: "#ff4d4f", bg: "#fff1f0", chip: "#cf1322" };

/** Cute robot image (inline SVG - no external asset needed). */
const BotImage = ({ size = 56 }) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <rect x="22" y="4" width="4" height="8" rx="2" fill="#1677ff" />
        <circle cx="24" cy="3" r="2.5" fill="#eb2f96" />
        <rect x="12" y="12" width="40" height="32" rx="10" fill="#1677ff" />
        <rect x="12" y="12" width="40" height="32" rx="10" fill="url(#botGrad)" />
        <defs>
            <linearGradient id="botGrad" x1="12" y1="12" x2="52" y2="44">
                <stop stopColor="#4096ff" />
                <stop offset="1" stopColor="#722ed1" />
            </linearGradient>
        </defs>
        <rect x="19" y="22" width="9" height="10" rx="4.5" fill="#fff" />
        <rect x="36" y="22" width="9" height="10" rx="4.5" fill="#fff" />
        <circle cx="23.5" cy="27" r="2.5" fill="#001529" />
        <circle cx="40.5" cy="27" r="2.5" fill="#001529" />
        <rect x="24" y="35" width="16" height="4" rx="2" fill="#fff" opacity="0.9" />
        <rect x="18" y="44" width="6" height="8" rx="3" fill="#1677ff" />
        <rect x="40" y="44" width="6" height="8" rx="3" fill="#1677ff" />
        <rect x="20" y="52" width="24" height="4" rx="2" fill="#13c2c2" />
    </svg>
);

const ChatbotAssistant = () => {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [conversationId, setConversationId] = useState();
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [image, setImage] = useState(null);
    const [descriptionDraft, setDescriptionDraft] = useState("");
    const navigate = useNavigate();

    const send = async (payload) => {
        setLoading(true);
        try {
            // The shared client returns the API envelope, so the chatbot payload is response.data.
            const response = await chatbotApi.sendMessage({ ...payload, ...(conversationId ? { conversationId } : {}) });
            const data = response?.data;
            if (!data || typeof data !== "object") throw new Error("The assistant returned an invalid response.");
            if (data.conversationId) setConversationId(data.conversationId);
            if (data.type === "image_analysis") setDescriptionDraft(data.description || "");
            setMessages((current) => [...current, { bot: true, ...data }]);
        } catch (error) {
            setMessages((current) => [...current, { bot: true, type: "error", message: error.message || "Something went wrong. Please try again." }]);
        } finally {
            setLoading(false);
        }
    };

    const openChat = () => {
        setOpen(true);
        if (!messages.length) send({ action: "SHOW_MAIN_MENU" });
    };

    const submit = () => {
        const message = input.trim();
        if (loading || (!message && !image)) return;
        setMessages((current) => [...current, { bot: false, message: message || image.name, imagePreview: image?.preview }]);
        setInput("");
        if (image) { const form = new FormData(); if (message) form.append("message", message); form.append("image", image.file); if (conversationId) form.append("conversationId", conversationId); setImage(null); send({ form }); }
        else send({ message });
    };
    const useEditedDescription = () => { if (!descriptionDraft.trim() || loading) return; setMessages((current) => [...current, { bot: false, message: descriptionDraft.trim() }]); send({ message: descriptionDraft.trim() }); };
    const chooseImage = (file) => { if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return Upload.LIST_IGNORE; const reader = new FileReader(); reader.onload = () => setImage({ file, name: file.name, preview: reader.result }); reader.readAsDataURL(file); return false; };

    const selectOption = (option) => {
        if (option.id.startsWith("VIEW_INCIDENT:")) {
            navigate(`/incidents/${option.id.slice(14)}`);
            setOpen(false);
            return;
        }
        setMessages((current) => [...current, { bot: false, message: option.label }]);
        send({ action: option.id });
    };

    /** Each bot message picks a stable accent from the palette based on its index. */
    const accentFor = (item, index) =>
        item.type === "error" ? ERROR_STYLE : BOT_ACCENTS[index % BOT_ACCENTS.length];

    const bubble = (item, index) => {
        if (!item.bot) {
            return (
                <div key={index} style={{ display: "flex", alignItems: "flex-end", gap: 8, alignSelf: "flex-end", maxWidth: "92%" }}>
                    <div style={{ ...USER_GRADIENT, borderRadius: "14px 14px 4px 14px", padding: "10px 14px", boxShadow: "0 4px 14px rgba(22,119,255,0.25)" }}>
                        <Paragraph style={{ whiteSpace: "pre-line", marginBottom: 0, color: "#fff" }}>{item.message}</Paragraph>{item.imagePreview && <img src={item.imagePreview} alt="Selected upload" style={{ maxWidth: 180, maxHeight: 120, display: "block", marginTop: 8, borderRadius: 8 }} />}
                    </div>
                    <Avatar size={28} style={{ background: USER_GRADIENT.background, flexShrink: 0 }} icon={<UserOutlined />} />
                </div>
            );
        }

        const accent = accentFor(item, index);
        return (
            <div key={index} style={{ display: "flex", alignItems: "flex-start", gap: 8, alignSelf: "flex-start", maxWidth: "92%" }}>
                <Avatar size={28} style={{ background: accent.border, flexShrink: 0 }} icon={item.type === "error" ? <WarningOutlined /> : <RobotOutlined />} />
                <div style={{ background: accent.bg, border: `1px solid ${accent.border}33`, borderLeft: `3px solid ${accent.border}`, borderRadius: "4px 14px 14px 14px", padding: "10px 14px", boxShadow: "0 2px 10px rgba(0,0,0,0.06)" }}>
                    <Paragraph style={{ whiteSpace: "pre-line", marginBottom: item.options?.length ? 10 : 0 }}>{item.message}</Paragraph>
                    {item.image && <Text type="secondary">Attachment: {item.image.filename}</Text>}
                    {item.type === "image_analysis" && <div style={{ marginTop: 10 }}><Text strong>AI-generated description</Text><Input.TextArea aria-label="AI-generated description" value={descriptionDraft} onChange={(event) => setDescriptionDraft(event.target.value)} rows={4} disabled={loading} style={{ marginTop: 6 }} /><Flex gap={6} style={{ marginTop: 6 }}><Button size="small" type="primary" onClick={useEditedDescription} disabled={loading}>Use Description</Button><Button size="small" onClick={() => setDescriptionDraft(item.description || "")} disabled={loading}>Reset</Button></Flex></div>}
                    {item.profile && <Text>{item.profile.name}<br />{item.profile.email}<br />{item.profile.role}</Text>}
                    {item.incident && <Text>{item.incident.incidentNumber}<br />{item.incident.title}<br />Status: {item.incident.status}</Text>}
                    {item.items?.map((row) => (
                        <div key={row.id} style={{ marginTop: 8 }}>
                            <Text strong>{row.incidentNumber || row.title}</Text><br />
                            <Text type="secondary">{row.status ? `${row.title} — ${row.status}` : row.excerpt}</Text>
                        </div>
                    ))}
                    {item.options?.length > 0 && (
                        <Flex wrap gap={6} style={{ marginTop: 8 }}>
                            {item.options.map((option) => (
                                <Button key={option.id} size="small" style={{ borderColor: accent.chip, color: accent.chip }} onClick={() => selectOption(option)}>
                                    {option.label}
                                </Button>
                            ))}
                        </Flex>
                    )}
                </div>
            </div>
        );
    };

    return (
        <>
            {/* The bot sits in the corner and shakes gently to catch attention. */}
            <style>{`
                @keyframes bot-shake {
                    0%, 100% { transform: rotate(0deg); }
                    20%      { transform: rotate(-6deg); }
                    40%      { transform: rotate(6deg); }
                    60%      { transform: rotate(-4deg); }
                    80%      { transform: rotate(4deg); }
                }
                .shaking-bot { animation: bot-shake 1.6s ease-in-out infinite; transform-origin: bottom center; }
                .shaking-bot:hover { animation-play-state: paused; }
                @keyframes bot-glow {
                    0%, 100% { box-shadow: 0 6px 20px rgba(22,119,255,0.40); }
                    50%      { box-shadow: 0 6px 28px rgba(114,46,209,0.55); }
                }
                .bot-glow { animation: bot-glow 2s ease-in-out infinite; }
            `}</style>

            <div
                className={open ? "" : "shaking-bot bot-glow"}
                role="button"
                aria-label="Open Incident Assistant"
                onClick={openChat}
                style={{
                    position: "fixed",
                    right: 28,
                    bottom: 28,
                    zIndex: 20,
                    width: 64,
                    height: 64,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg,#e6f4ff,#f9f0ff)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    border: "2px solid #1677ff",
                }}
            >
                <BotImage size={50} />
            </div>

            <Drawer
                title={
                    <Flex align="center" gap={8}>
                        <BotImage size={32} />
                        <div>
                            <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.2 }}>Incident Assistant</div>
                            <Text type="secondary" style={{ fontSize: 11 }}>Online — replies instantly</Text>
                        </div>
                    </Flex>
                }
                open={open}
                onClose={() => setOpen(false)}
                width={400}
                styles={{ body: { padding: 16, display: "flex", flexDirection: "column", background: "linear-gradient(180deg,#f8faff 0%,#fdf7ff 100%)" } }}
            >
                <Flex vertical gap={12} style={{ flex: 1, overflowY: "auto" }}>
                    {messages.map(bubble)}
                    {loading && (
                        <Flex align="center" gap={8} style={{ alignSelf: "flex-start" }}>
                            <Avatar size={24} style={{ background: "#1677ff" }} icon={<RobotOutlined />} />
                            <Spin size="small" />
                        </Flex>
                    )}
                </Flex>
                {image && <Flex align="center" gap={8} style={{ marginTop: 10 }}><img src={image.preview} alt="Selected image preview" style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 6 }} /><Text ellipsis style={{ maxWidth: 230 }}>{image.name}</Text><Button aria-label="Remove image" size="small" icon={<DeleteOutlined />} onClick={() => setImage(null)} disabled={loading} /></Flex>}
                <Flex gap={8} style={{ marginTop: 12 }}>
                    <Upload accept="image/jpeg,image/png,image/webp" showUploadList={false} beforeUpload={chooseImage} disabled={loading}><Button aria-label="Attach image" shape="circle" icon={<PaperClipOutlined />} disabled={loading} /></Upload>
                    <Input aria-label="Type your message" value={input} onChange={(event) => setInput(event.target.value)} onPressEnter={submit} placeholder="Type your message..." disabled={loading} style={{ borderRadius: 20 }} />
                    <Button type="primary" shape="circle" icon={<SendOutlined />} onClick={submit} loading={loading} aria-label="Send message" style={{ background: "linear-gradient(135deg,#1677ff,#722ed1)", border: "none" }} />
                </Flex>
            </Drawer>
        </>
    );
};

export default ChatbotAssistant;