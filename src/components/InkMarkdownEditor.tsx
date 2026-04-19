import "@mdxeditor/editor/style.css";

import { languages } from "@codemirror/language-data";
import { EditorView } from "@codemirror/view";
import {
  codeBlockPlugin,
  codeMirrorPlugin,
  headingsPlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  MDXEditor,
  type MDXEditorMethods,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  type RealmPlugin,
} from "@mdxeditor/editor";
import { useEffect, useRef, type CSSProperties } from "react";

type InkMarkdownEditorProps = {
  className?: string;
  documentKey: string;
  isLoading: boolean;
  onChange: (value: string) => void;
  style?: CSSProperties;
  value: string;
};

const codeBlockTheme = EditorView.theme({
  "&": {
    backgroundColor: "color-mix(in srgb, var(--panel) 82%, black 18%)",
    color: "var(--ink)",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "var(--mono)",
  },
  ".cm-content": {
    caretColor: "var(--ink)",
  },
  ".cm-gutters": {
    backgroundColor: "color-mix(in srgb, var(--panel) 86%, black 14%)",
    color: "var(--muted)",
    borderRight: "1px solid color-mix(in srgb, var(--panel-border) 78%, transparent)",
  },
  ".cm-activeLine, .cm-activeLineGutter": {
    backgroundColor: "transparent",
  },
  ".cm-tooltip": {
    border: "1px solid color-mix(in srgb, var(--panel-border) 92%, transparent)",
    borderRadius: "12px",
    backgroundColor: "color-mix(in srgb, var(--panel) 96%, black 4%)",
    boxShadow: "0 18px 34px rgba(0, 0, 0, 0.22)",
  },
  ".cm-cursor": {
    borderLeftColor: "var(--ink)",
    borderLeftWidth: "1.5px",
  },
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--ink) 14%, transparent)",
  },
});

const editorPlugins: RealmPlugin[] = [
  headingsPlugin(),
  listsPlugin(),
  quotePlugin(),
  thematicBreakPlugin(),
  linkPlugin(),
  linkDialogPlugin(),
  tablePlugin(),
  codeBlockPlugin({
    defaultCodeBlockLanguage: "txt",
  }),
  codeMirrorPlugin({
    codeBlockLanguages: languages,
    codeMirrorExtensions: [EditorView.lineWrapping, codeBlockTheme],
  }),
  markdownShortcutPlugin(),
];

export function InkMarkdownEditor({
  className,
  documentKey,
  isLoading,
  onChange,
  style,
  value,
}: InkMarkdownEditorProps) {
  const editorRef = useRef<MDXEditorMethods | null>(null);
  const lastAppliedValueRef = useRef(value);
  const isPushingExternalValueRef = useRef(false);

  useEffect(() => {
    lastAppliedValueRef.current = value;
  }, [documentKey]);

  useEffect(() => {
    const editor = editorRef.current;

    if (!editor || isPushingExternalValueRef.current) {
      return;
    }

    if (value === lastAppliedValueRef.current) {
      return;
    }

    isPushingExternalValueRef.current = true;
    lastAppliedValueRef.current = value;
    editor.setMarkdown(value);

    queueMicrotask(() => {
      isPushingExternalValueRef.current = false;
    });
  }, [value]);

  return (
    <div
      className={["ink-editor-shell", isLoading ? "is-loading" : "", className]
        .filter(Boolean)
        .join(" ")}
      style={style}
    >
      <div className="ink-editor-host">
        <MDXEditor
          key={documentKey}
          ref={editorRef}
          className="mdbar-editor"
          contentEditableClassName="mdbar-prose"
          markdown={value}
          onChange={(nextValue, initialMarkdownNormalize) => {
            lastAppliedValueRef.current = nextValue;

            if (isPushingExternalValueRef.current || initialMarkdownNormalize) {
              return;
            }

            onChange(nextValue);
          }}
          placeholder={
            <div className="daily-editor-placeholder">
              {isLoading
                ? "Loading note..."
                : "Start with a heading, a checklist, or whatever is on your mind."}
            </div>
          }
          plugins={editorPlugins}
          readOnly={isLoading}
          spellCheck
          toMarkdownOptions={{
            bullet: "-",
            emphasis: "*",
            fence: "`",
            listItemIndent: "one",
            rule: "-",
            ruleRepetition: 3,
            strong: "*",
          }}
        />
      </div>
    </div>
  );
}
