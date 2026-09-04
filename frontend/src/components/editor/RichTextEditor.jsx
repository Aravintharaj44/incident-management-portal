import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { useEffect } from "react";
import {
    BoldOutlined,
    ItalicOutlined,
    UnderlineOutlined,
    StrikethroughOutlined,
    OrderedListOutlined,
    UnorderedListOutlined,
    CodeOutlined,
    LinkOutlined,
    UndoOutlined,
    RedoOutlined,
} from "@ant-design/icons";
import { Button, Space, Tooltip } from "antd";
import "./RichTextEditor.css";

const RichTextEditor = ({
    value = "",
    onChange,
    placeholder = "Write your article...",
}) => {
    const editor = useEditor({
        extensions: [
            StarterKit,
            Link.configure({
                openOnClick: false,
                autolink: true,
                linkOnPaste: true,
            }),
        ],
        content: value || "<p></p>",
        immediatelyRender: false,

        onUpdate: ({ editor }) => {
            onChange?.(editor.getHTML());
        },
    });

    // Important for edit mode:
    // Update editor content when the API data arrives.
    useEffect(() => {
        if (!editor) return;

        const newContent = value || "<p></p>";

        if (editor.getHTML() !== newContent) {
            editor.commands.setContent(newContent, {
                emitUpdate: false,
            });
        }
    }, [editor, value]);

    if (!editor) {
        return null;
    }

    const setLink = () => {
        const previousUrl = editor.getAttributes("link").href;

        const url = window.prompt(
            "Enter URL",
            previousUrl || "https://"
        );

        if (url === null) {
            return;
        }

        if (url === "") {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
            return;
        }

        editor
            .chain()
            .focus()
            .extendMarkRange("link")
            .setLink({ href: url })
            .run();
    };

    return (
        <div className="rich-text-editor">
            <div className="editor-toolbar">
                <Space wrap size={4}>
                    <Tooltip title="Heading 1">
                        <Button
                            size="small"
                            type={
                                editor.isActive("heading", { level: 1 })
                                    ? "primary"
                                    : "default"
                            }
                            onClick={() =>
                                editor
                                    .chain()
                                    .focus()
                                    .toggleHeading({ level: 1 })
                                    .run()
                            }
                        >
                            H1
                        </Button>
                    </Tooltip>

                    <Tooltip title="Heading 2">
                        <Button
                            size="small"
                            type={
                                editor.isActive("heading", { level: 2 })
                                    ? "primary"
                                    : "default"
                            }
                            onClick={() =>
                                editor
                                    .chain()
                                    .focus()
                                    .toggleHeading({ level: 2 })
                                    .run()
                            }
                        >
                            H2
                        </Button>
                    </Tooltip>

                    <Tooltip title="Bold">
                        <Button
                            size="small"
                            icon={<BoldOutlined />}
                            type={
                                editor.isActive("bold")
                                    ? "primary"
                                    : "default"
                            }
                            onClick={() =>
                                editor
                                    .chain()
                                    .focus()
                                    .toggleBold()
                                    .run()
                            }
                        />
                    </Tooltip>

                    <Tooltip title="Italic">
                        <Button
                            size="small"
                            icon={<ItalicOutlined />}
                            type={
                                editor.isActive("italic")
                                    ? "primary"
                                    : "default"
                            }
                            onClick={() =>
                                editor
                                    .chain()
                                    .focus()
                                    .toggleItalic()
                                    .run()
                            }
                        />
                    </Tooltip>

                    <Tooltip title="Underline">
                        <Button
                            size="small"
                            icon={<UnderlineOutlined />}
                            type={
                                editor.isActive("underline")
                                    ? "primary"
                                    : "default"
                            }
                            onClick={() =>
                                editor
                                    .chain()
                                    .focus()
                                    .toggleUnderline()
                                    .run()
                            }
                        />
                    </Tooltip>

                    <Tooltip title="Strike">
                        <Button
                            size="small"
                            icon={<StrikethroughOutlined />}
                            type={
                                editor.isActive("strike")
                                    ? "primary"
                                    : "default"
                            }
                            onClick={() =>
                                editor
                                    .chain()
                                    .focus()
                                    .toggleStrike()
                                    .run()
                            }
                        />
                    </Tooltip>

                    <Tooltip title="Bullet List">
                        <Button
                            size="small"
                            icon={<UnorderedListOutlined />}
                            type={
                                editor.isActive("bulletList")
                                    ? "primary"
                                    : "default"
                            }
                            onClick={() =>
                                editor
                                    .chain()
                                    .focus()
                                    .toggleBulletList()
                                    .run()
                            }
                        />
                    </Tooltip>

                    <Tooltip title="Numbered List">
                        <Button
                            size="small"
                            icon={<OrderedListOutlined />}
                            type={
                                editor.isActive("orderedList")
                                    ? "primary"
                                    : "default"
                            }
                            onClick={() =>
                                editor
                                    .chain()
                                    .focus()
                                    .toggleOrderedList()
                                    .run()
                            }
                        />
                    </Tooltip>

                    <Tooltip title="Code Block">
                        <Button
                            size="small"
                            icon={<CodeOutlined />}
                            type={
                                editor.isActive("codeBlock")
                                    ? "primary"
                                    : "default"
                            }
                            onClick={() =>
                                editor
                                    .chain()
                                    .focus()
                                    .toggleCodeBlock()
                                    .run()
                            }
                        />
                    </Tooltip>

                    <Tooltip title="Link">
                        <Button
                            size="small"
                            icon={<LinkOutlined />}
                            type={
                                editor.isActive("link")
                                    ? "primary"
                                    : "default"
                            }
                            onClick={setLink}
                        />
                    </Tooltip>

                    <Tooltip title="Blockquote">
                        <Button
                            size="small"
                            onClick={() =>
                                editor
                                    .chain()
                                    .focus()
                                    .toggleBlockquote()
                                    .run()
                            }
                        >
                            Quote
                        </Button>
                    </Tooltip>

                    <Tooltip title="Undo">
                        <Button
                            size="small"
                            icon={<UndoOutlined />}
                            onClick={() =>
                                editor.chain().focus().undo().run()
                            }
                            disabled={!editor.can().undo()}
                        />
                    </Tooltip>

                    <Tooltip title="Redo">
                        <Button
                            size="small"
                            icon={<RedoOutlined />}
                            onClick={() =>
                                editor.chain().focus().redo().run()
                            }
                            disabled={!editor.can().redo()}
                        />
                    </Tooltip>
                </Space>
            </div>

            <div className="editor-content-wrapper">
                <EditorContent
                    editor={editor}
                    className="editor-content"
                />

                {!editor.getText().trim() && (
                    <div className="editor-placeholder">
                        {placeholder}
                    </div>
                )}
            </div>
        </div>
    );
};

export default RichTextEditor;