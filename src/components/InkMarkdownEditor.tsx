import "@mdxeditor/editor/style.css";

import { languages } from "@codemirror/language-data";
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
