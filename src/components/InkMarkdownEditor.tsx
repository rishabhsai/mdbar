import { convertFileSrc } from "@tauri-apps/api/core";
import {
  InputRule,
  mergeAttributes,
  nodeInputRule,
  type Editor as TiptapEditor,
} from "@tiptap/core";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { EditorContent, useEditor } from "@tiptap/react";
import { Markdown } from "tiptap-markdown";
import { useEffect, useRef, type CSSProperties } from "react";

import { savePastedImage } from "../lib/tauri";

const MARKDOWN_IMAGE_INPUT =
  /(?:^|\s)(!\[(.+|:?)]\((\S+)(?:(?:\s+)["'](\S+)["'])?\))$/;
const MARKDOWN_LINK_INPUT = /(?:^|\s)\[([^\]]+)]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)$/;

type InkMarkdownEditorProps = {
  className?: string;
  documentKey: string;
  focusToken?: number;
  isLoading: boolean;
  onChange: (value: string) => void;
  onError: (message: string | null) => void;
  noteFilePath: string;
  theme: "light" | "dark";
  style?: CSSProperties;
  value: string;
};

function isExternalUrl(value: string) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value);
}

function directoryName(filePath: string) {
  const normalized = filePath.replace(/\\/g, "/");
  const boundary = normalized.lastIndexOf("/");
  return boundary >= 0 ? normalized.slice(0, boundary) : normalized;
}

function resolveRelativePath(baseFilePath: string, relativePath: string) {
  const root = directoryName(baseFilePath);
  const stack = root.split("/").filter(Boolean);

  for (const segment of relativePath.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      stack.pop();
      continue;
    }
    stack.push(segment);
  }

  return `/${stack.join("/")}`;
}

function resolveImageSource(noteFilePath: string, source: string) {
  if (!source || isExternalUrl(source)) {
    return source;
  }

  return convertFileSrc(resolveRelativePath(noteFilePath, source));
}

function createMarkdownImageExtension(noteFilePath: string) {
  return Image.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        markdownSrc: {
          default: null,
          parseHTML: (element) => element.getAttribute("data-markdown-src"),
          renderHTML: (attributes) =>
            attributes.markdownSrc
              ? { "data-markdown-src": attributes.markdownSrc }
              : {},
        },
      };
    },

    renderHTML({ HTMLAttributes }) {
      return ["img", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)];
    },

    parseMarkdown: (token, helpers) =>
      helpers.createNode("image", {
        src: resolveImageSource(noteFilePath, token.href),
        markdownSrc: token.href,
        title: token.title,
        alt: token.text,
      }),

    renderMarkdown: (node) => {
      const src = node.attrs?.markdownSrc ?? node.attrs?.src ?? "";
      const alt = node.attrs?.alt ?? "";
      const title = node.attrs?.title ?? "";

      return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`;
    },

    addInputRules() {
      return [
        nodeInputRule({
          find: MARKDOWN_IMAGE_INPUT,
          type: this.type,
          getAttributes: (match) => {
            const [, , alt, src, title] = match;

            return {
              src: resolveImageSource(noteFilePath, src),
              markdownSrc: src,
              alt,
              title,
            };
          },
        }),
      ];
    },
  }).configure({
    allowBase64: false,
    inline: false,
    HTMLAttributes: {
      class: "tiptap-image",
      draggable: "false",
      loading: "lazy",
    },
  });
}

function createMarkdownLinkExtension() {
  return Link.configure({
    autolink: true,
    linkOnPaste: true,
    openOnClick: true,
    HTMLAttributes: {
      class: "tiptap-link",
      target: "_blank",
      rel: "noopener noreferrer nofollow",
    },
  }).extend({
    addInputRules() {
      return [
        new InputRule({
          find: MARKDOWN_LINK_INPUT,
          handler: ({ state, range, match }) => {
            const text = match[1];
            const href = match[2];
            const fullMatch = match[0];
            const textStart = range.from + fullMatch.indexOf("[") + 1;
            const textEnd = textStart + text.length;
            const tr = state.tr;

            tr.delete(textEnd, range.to);
            tr.delete(textStart - 1, textStart);
            tr.addMark(textStart - 1, textStart - 1 + text.length, this.type.create({ href }));
            tr.removeStoredMark(this.type);
          },
        }),
      ];
    },
  });
}

export function InkMarkdownEditor({
  className,
  documentKey,
  focusToken = 0,
  isLoading,
  onChange,
  onError,
  noteFilePath,
  style,
  value,
}: InkMarkdownEditorProps) {
  const suppressUpdate = useRef(false);
  const editorRef = useRef<TiptapEditor | null>(null);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          link: false,
          heading: { levels: [1, 2, 3, 4, 5, 6] },
          horizontalRule: {},
          blockquote: {},
          bulletList: {},
          orderedList: {},
          codeBlock: {},
          code: {},
        }),
        createMarkdownLinkExtension(),
        createMarkdownImageExtension(noteFilePath),
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
        handlePaste: (_view, event) => {
          const imageItem = Array.from(event.clipboardData?.items ?? []).find((item) =>
            item.type.startsWith("image/"),
          );

          if (!imageItem) {
            return false;
          }

          const file = imageItem.getAsFile();
          if (!file) {
            return false;
          }

          event.preventDefault();

          void (async () => {
            try {
              const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
              const savedAsset = await savePastedImage(noteFilePath, bytes, file.type);

              editorRef.current
                ?.chain()
                .focus()
                .setImage({
                  src: convertFileSrc(savedAsset.filePath),
                  alt: file.name?.replace(/\.[^.]+$/, "") || "image",
                  title: null,
                  markdownSrc: savedAsset.markdownPath,
                } as never)
                .run();

              onError(null);
            } catch (error) {
              onError(error instanceof Error ? error.message : String(error));
            }
          })();

          return true;
        },
      },
    },
    [documentKey, noteFilePath],
  );

  // Sync editable state
  useEffect(() => {
    if (editor) {
      editorRef.current = editor;
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

  useEffect(() => {
    if (!editor || isLoading) {
      return;
    }

    const focusTimer = window.setTimeout(() => {
      editor.commands.focus("end");
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
    };
  }, [documentKey, editor, focusToken, isLoading]);

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
