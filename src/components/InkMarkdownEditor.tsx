import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import {
  EditorView,
  keymap,
  placeholder as placeholderExtension,
} from "@codemirror/view";
import { useEffect, useRef, type CSSProperties } from "react";

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

const editableCompartment = new Compartment();
const placeholderCompartment = new Compartment();

const markdownHighlightStyle = HighlightStyle.define([
  {
    tag: tags.heading,
    color: "var(--ink)",
    fontFamily: "var(--display)",
    fontWeight: "520",
  },
  {
    tag: tags.heading1,
    color: "var(--ink)",
    fontFamily: "var(--display)",
    fontSize: "1.42em",
    fontWeight: "520",
  },
  {
    tag: tags.heading2,
    color: "var(--ink)",
    fontFamily: "var(--display)",
    fontSize: "1.24em",
    fontWeight: "520",
  },
  {
    tag: tags.heading3,
    color: "var(--ink)",
    fontFamily: "var(--display)",
    fontSize: "1.14em",
    fontWeight: "520",
  },
  {
    tag: tags.strong,
    fontWeight: "600",
  },
  {
    tag: tags.emphasis,
    fontStyle: "italic",
  },
  {
    tag: [tags.link, tags.url],
    color: "var(--ink)",
    textDecoration: "underline",
    textDecorationColor: "color-mix(in srgb, var(--ink) 18%, transparent)",
    textUnderlineOffset: "0.16em",
  },
  {
    tag: tags.monospace,
    fontFamily: "var(--mono)",
    fontSize: "0.94em",
  },
  {
    tag: tags.quote,
    color: "color-mix(in srgb, var(--ink) 72%, var(--muted))",
  },
  {
    tag: tags.processingInstruction,
    color: "var(--muted)",
  },
]);

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "transparent",
    color: "var(--ink)",
    fontFamily: "var(--editor-font-family, var(--sans))",
    fontSize: "var(--editor-font-size, 15px)",
  },
  ".cm-scroller": {
    overflow: "auto",
    padding: "14px 18px 28px",
  },
  ".cm-content": {
    minHeight: "100%",
    padding: "0",
    whiteSpace: "pre-wrap",
    caretColor: "var(--ink)",
    lineHeight: "var(--editor-line-height, 1.65)",
  },
  ".cm-line": {
    padding: "0",
    paddingBottom: "1px",
    paddingRight: "8px",
  },
  ".cm-focused": {
    outline: "none",
  },
  ".cm-editor": {
    height: "100%",
  },
  ".cm-placeholder": {
    color: "var(--muted)",
    whiteSpace: "pre-wrap",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--ink)",
    borderLeftWidth: "1.5px",
  },
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--ink) 14%, transparent)",
  },
  ".cm-activeLine": {
    backgroundColor: "transparent",
  },
  ".cm-tooltip": {
    border: "1px solid var(--panel-border)",
    borderRadius: "12px",
    boxShadow: "0 12px 24px rgba(24, 24, 24, 0.08)",
  },
});

function createPlaceholder(loading: boolean) {
  const placeholder = document.createElement("div");
  placeholder.className = "daily-editor-placeholder";

  if (loading) {
    placeholder.textContent = "Loading note…";
    return placeholder;
  }

  placeholder.textContent =
    "Start with a heading, a checklist, or whatever is on your mind.";
  return placeholder;
}

function buildExtensions(
  isLoading: boolean,
  onChange: (value: string) => void,
): Extension[] {
  return [
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
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChange(update.state.doc.toString());
      }
    }),
    editableCompartment.of(EditorView.editable.of(!isLoading)),
    placeholderCompartment.of(
      placeholderExtension(createPlaceholder(isLoading)),
    ),
  ];
}

export function InkMarkdownEditor({
  className,
  documentKey,
  isLoading,
  onChange,
  style,
  value,
}: InkMarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const initialLoadingRef = useRef(isLoading);
  const latestValueRef = useRef(value);
  const onChangeRef = useRef(onChange);

  onChangeRef.current = onChange;

  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);

  useEffect(() => {
    const host = hostRef.current;

    if (!host || editorViewRef.current) {
      return;
    }

    const state = EditorState.create({
      doc: latestValueRef.current,
      extensions: buildExtensions(initialLoadingRef.current, (nextValue) => {
        latestValueRef.current = nextValue;
        onChangeRef.current(nextValue);
      }),
    });

    const view = new EditorView({
      parent: host,
      state,
    });

    editorViewRef.current = view;

    return () => {
      view.destroy();
      editorViewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = editorViewRef.current;

    if (!view) {
      return;
    }

    view.dispatch({
      effects: [
        editableCompartment.reconfigure(EditorView.editable.of(!isLoading)),
        placeholderCompartment.reconfigure(
          placeholderExtension(createPlaceholder(isLoading)),
        ),
      ],
    });
  }, [isLoading]);

  useEffect(() => {
    const view = editorViewRef.current;

    if (!view) {
      return;
    }

    const currentValue = view.state.doc.toString();

    if (currentValue === value) {
      return;
    }

    view.dispatch({
      changes: {
        from: 0,
        to: currentValue.length,
        insert: value,
      },
    });
  }, [documentKey, value]);

  return (
    <div
      ref={hostRef}
      className={["ink-editor-shell", isLoading ? "is-loading" : "", className]
        .filter(Boolean)
        .join(" ")}
      style={style}
    >
      <div className="ink-editor-host" />
    </div>
  );
}
