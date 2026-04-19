import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Markdown } from "tiptap-markdown";
import { useEffect, useRef, type CSSProperties } from "react";

type InkMarkdownEditorProps = {
  className?: string;
  documentKey: string;
  isLoading: boolean;
  onChange: (value: string) => void;
  theme: "light" | "dark";
  style?: CSSProperties;
  value: string;
};

export function InkMarkdownEditor({
  className,
  documentKey,
  isLoading,
  onChange,
  style,
  value,
}: InkMarkdownEditorProps) {
  const suppressUpdate = useRef(false);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3, 4, 5, 6] },
          horizontalRule: {},
          blockquote: {},
          bulletList: {},
          orderedList: {},
          codeBlock: {},
          code: {},
        }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Placeholder.configure({
          placeholder: "Start writing…",
        }),
        Markdown.configure({
          html: false,
          transformCopiedText: true,
          transformPastedText: true,
        }),
      ],
      content: value,
      editable: !isLoading,
      onUpdate: ({ editor: ed }) => {
        if (suppressUpdate.current) return;
        const md = (ed.storage as any).markdown.getMarkdown();
        onChange(md);
      },
      editorProps: {
        attributes: {
          class: "tiptap-content",
          spellcheck: "true",
        },
      },
    },
    [documentKey],
  );

  // Sync editable state
  useEffect(() => {
    if (editor) {
      editor.setEditable(!isLoading);
    }
  }, [editor, isLoading]);

  // Sync value from outside (when the parent loads a new note's content
  // but documentKey hasn't changed)
  useEffect(() => {
    if (!editor) return;
    const currentMd = (editor.storage as any).markdown.getMarkdown();
    if (currentMd !== value) {
      suppressUpdate.current = true;
      editor.commands.setContent(value);
      suppressUpdate.current = false;
    }
  }, [editor, value]);

  return (
    <div
      className={[
        "tiptap-editor-host",
        isLoading ? "is-loading" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
    >
      <EditorContent className="tiptap-scroll-shell" editor={editor} />
    </div>
  );
}
