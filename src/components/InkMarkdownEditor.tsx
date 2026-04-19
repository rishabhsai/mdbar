import CodeMirror from "@uiw/react-codemirror";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { EditorView, keymap } from "@codemirror/view";
import { useMemo, type CSSProperties } from "react";

import { markdownPresentationExtension } from "../lib/editor-plugins";

type InkMarkdownEditorProps = {
  className?: string;
  documentKey: string;
  isLoading: boolean;
  onChange: (value: string) => void;
  theme: "light" | "dark";
  style?: CSSProperties;
  value: string;
};

/* ── Syntax colours ── */

const markdownHighlightStyle = HighlightStyle.define([
  {
    tag: tags.heading,
    color: "var(--ink)",
    fontFamily: "var(--display)",
    fontWeight: "520",
  },
  {
    tag: tags.heading1,
    fontSize: "1.42em",
    fontWeight: "520",
  },
  {
    tag: tags.heading2,
    fontSize: "1.24em",
    fontWeight: "520",
  },
  {
    tag: tags.heading3,
    fontSize: "1.14em",
    fontWeight: "520",
  },
  { tag: tags.strong, fontWeight: "600" },
  { tag: tags.emphasis, fontStyle: "italic" },
  {
    tag: [tags.link, tags.url],
    color: "var(--ink)",
    textDecoration: "underline",
    textDecorationColor: "color-mix(in srgb, var(--ink) 18%, transparent)",
    textUnderlineOffset: "0.16em",
  },
  { tag: tags.monospace, fontFamily: "var(--mono)", fontSize: "0.94em" },
  {
    tag: tags.quote,
    color: "color-mix(in srgb, var(--ink) 72%, var(--muted))",
  },
  { tag: tags.processingInstruction, color: "var(--muted)" },
]);

/* ── CM theme (inline via EditorView.theme) ── */

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    width: "100%",
    backgroundColor: "transparent",
    color: "var(--ink)",
    fontFamily: "var(--editor-font-family, var(--sans))",
    fontSize: "var(--editor-font-size, 15px)",
  },
  ".cm-scroller": {
    overflow: "auto",
    padding: "14px 20px 40px",
  },
  ".cm-content": {
    minHeight: "100%",
    padding: "0",
    whiteSpace: "pre-wrap",
    caretColor: "var(--ink)",
    lineHeight: "var(--editor-line-height, 1.65)",
    textAlign: "left",
  },
  ".cm-line": {
    padding: "0",
    paddingBottom: "1px",
    paddingRight: "8px",
    textAlign: "left",
  },
  ".cm-focused": { outline: "none" },
  ".cm-editor": { height: "100%", width: "100%" },
  ".cm-placeholder": { color: "var(--muted)", whiteSpace: "pre-wrap" },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--ink)",
    borderLeftWidth: "1.5px",
  },
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--ink) 14%, transparent)",
  },
  ".cm-activeLine": { backgroundColor: "transparent" },
});

/* ── Component ── */

export function InkMarkdownEditor({
  className,
  documentKey,
  isLoading,
  onChange,
  style,
  value,
}: InkMarkdownEditorProps) {
  const extensions = useMemo(
    () => [
      keymap.of([...defaultKeymap, ...historyKeymap]),
      history(),
      markdown({ base: markdownLanguage }),
      EditorView.lineWrapping,
      syntaxHighlighting(markdownHighlightStyle),
      editorTheme,
      markdownPresentationExtension,
      EditorView.contentAttributes.of({
        spellcheck: "true",
        autocapitalize: "sentences",
      }),
    ],
    [],
  );

  return (
    <div
      className={["ink-editor-host", isLoading ? "is-loading" : "", className]
        .filter(Boolean)
        .join(" ")}
      style={style}
    >
      <CodeMirror
        key={documentKey}
        value={value}
        onChange={onChange}
        extensions={extensions}
        editable={!isLoading}
        placeholder="Start with a heading, a checklist, or whatever is on your mind."
        basicSetup={false}
      />
    </div>
  );
}
