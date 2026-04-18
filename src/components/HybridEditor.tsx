import { useEffect, useEffectEvent, useRef } from "react";
import ink, { type Instance, type Options } from "ink-mde";

type HybridEditorProps = {
  appearance: "auto" | "light" | "dark";
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  onChange: (value: string) => void;
  placeholder: string;
  readOnly?: boolean;
  value: string;
};

export function HybridEditor({
  appearance,
  fontFamily,
  fontSize,
  lineHeight,
  onChange,
  placeholder,
  readOnly = false,
  value,
}: HybridEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<Instance | null>(null);
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
    if (!host || editorRef.current) {
      return;
    }

    const options: Options = {
      doc: latestValueRef.current,
      placeholder,
      interface: {
        appearance,
        attribution: false,
        autocomplete: false,
        images: true,
        lists: true,
        readonly: readOnly,
        spellcheck: true,
        toolbar: false,
      },
      keybindings: {
        shiftTab: true,
        tab: true,
      },
      lists: {
        bullet: true,
        number: true,
        task: true,
      },
      hooks: {
        afterUpdate: handleChange,
      },
      readability: false,
      search: false,
      trapTab: false,
    };

    editorRef.current = ink(host, options);

    return () => {
      editorRef.current?.destroy();
      editorRef.current = null;
    };
  }, [appearance, handleChange, placeholder, readOnly]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    editor.reconfigure({
      interface: {
        appearance,
        readonly: readOnly,
      },
      placeholder,
    });
  }, [appearance, placeholder, readOnly]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    if (editor.getDoc() !== value) {
      editor.update(value);
    }
  }, [value]);

  return (
    <div
      className="editor-surface"
      ref={hostRef}
      style={
        {
          "--editor-font-family": fontFamily,
          "--editor-font-size": `${fontSize}px`,
          "--editor-line-height": `${lineHeight}`,
        } as React.CSSProperties
      }
    />
  );
}
