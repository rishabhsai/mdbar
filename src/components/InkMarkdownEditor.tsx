import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  keymap,
  placeholder as placeholderExtension,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import {
  useEffect,
  useEffectEvent,
  useRef,
  type CSSProperties,
} from "react";

import { markdownPresentationExtension } from "../lib/editor-plugins";

type InkMarkdownEditorProps = {
  className?: string;
  documentKey: string;
  isLoading: boolean;
  onChange: (value: string) => void;
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
    textDecorationColor: "rgba(24, 24, 24, 0.14)",
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
    padding: "8px 14px 18px",
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
    lineHeight: "var(--editor-line-height, 1.65)",
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
  },
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "rgba(24, 24, 24, 0.12)",
  },
});

function createPlaceholder(loading: boolean) {
  const placeholder = document.createElement("div");
  placeholder.className = "daily-editor-placeholder";
  placeholder.textContent = loading
    ? "Loading note..."
    : "Start with a heading, a checklist, or whatever is on your mind.";
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
    placeholderCompartment.of(placeholderExtension(createPlaceholder(isLoading))),
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
  const activeDocumentKeyRef = useRef(documentKey);
  const latestValueRef = useRef(value);

  const handleChange = useEffectEvent((nextValue: string) => {
    latestValueRef.current = nextValue;
    onChange(nextValue);
  });

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
      extensions: buildExtensions(initialLoadingRef.current, handleChange),
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
  }, [handleChange]);

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

    const isDocumentSwitch = activeDocumentKeyRef.current !== documentKey;

    if (!isDocumentSwitch && latestValueRef.current === value) {
      return;
    }

    const currentValue = view.state.doc.toString();
    if (currentValue !== value) {
      const hadFocus = view.hasFocus;
      const currentSelection = view.state.selection;

      view.dispatch({
        changes: {
          from: 0,
          to: currentValue.length,
          insert: value,
        },
        selection: isDocumentSwitch ? undefined : currentSelection,
      });

      if (hadFocus && !isLoading) {
        view.focus();
      }
    }

    activeDocumentKeyRef.current = documentKey;
    latestValueRef.current = value;
  }, [documentKey, value]);

  return (
    <div
      className={["ink-editor-shell", isLoading ? "is-loading" : "", className]
        .filter(Boolean)
        .join(" ")}
      style={style}
    >
      <div className="ink-editor-host" ref={hostRef} />
    </div>
  );
}
