import { useEffect, useEffectEvent, useRef, useState, type CSSProperties } from "react";

type InkModule = typeof import("ink-mde");
type InkInstance = import("ink-mde").Instance;
type InkOptions = import("ink-mde").Options;

type HybridEditorProps = {
  appearance: "auto" | "light" | "dark";
  documentKey: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  onChange: (value: string) => void;
  onReadyChange?: (ready: boolean) => void;
  placeholder: string;
  readOnly?: boolean;
  value: string;
};

export function HybridEditor({
  appearance,
  documentKey,
  fontFamily,
  fontSize,
  lineHeight,
  onChange,
  onReadyChange,
  placeholder,
  readOnly = false,
  value,
}: HybridEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<InkInstance | null>(null);
  const activeDocumentKeyRef = useRef(documentKey);
  const latestValueRef = useRef(value);
  const inkModuleRef = useRef<InkModule | null>(null);
  const [editorStatus, setEditorStatus] = useState<"loading" | "ready" | "error">("loading");
  const [editorError, setEditorError] = useState<string | null>(null);

  const handleChange = useEffectEvent((nextValue: string) => {
    latestValueRef.current = nextValue;
    onChange(nextValue);
  });

  const handleReadyChange = useEffectEvent((ready: boolean) => {
    onReadyChange?.(ready);
  });

  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const buildOptions = (): InkOptions => ({
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
    });

    const mountEditor = async () => {
      try {
        setEditorStatus("loading");
        setEditorError(null);
        handleReadyChange(false);

        const inkModule = inkModuleRef.current ?? (await import("ink-mde"));
        if (cancelled) {
          return;
        }

        inkModuleRef.current = inkModule;
        editorRef.current?.destroy();
        editorRef.current = await inkModule.default(host, buildOptions());
        activeDocumentKeyRef.current = documentKey;

        if (cancelled) {
          editorRef.current?.destroy();
          editorRef.current = null;
          return;
        }

        setEditorStatus("ready");
        handleReadyChange(true);
      } catch (error) {
        if (cancelled) {
          return;
        }

        editorRef.current = null;
        setEditorStatus("error");
        setEditorError(error instanceof Error ? error.message : "Could not load the markdown editor.");
        handleReadyChange(false);
      }
    };

    void mountEditor();

    return () => {
      cancelled = true;
      editorRef.current?.destroy();
      editorRef.current = null;
      handleReadyChange(false);
    };
  }, [handleChange, handleReadyChange]);

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
      if (activeDocumentKeyRef.current !== documentKey) {
        editor.load(value);
        activeDocumentKeyRef.current = documentKey;
        return;
      }

      editor.update(value);
    }
  }, [documentKey, value]);

  return (
    <div
      className={`editor-surface${editorStatus === "ready" ? " is-ready" : ""}`}
      style={
        {
          "--editor-font-family": fontFamily,
          "--editor-font-size": `${fontSize}px`,
          "--editor-line-height": `${lineHeight}`,
        } as CSSProperties
      }
    >
      <div className="editor-host" ref={hostRef} />
      {editorStatus !== "ready" ? (
        <div className="editor-overlay" role="status">
          <p className="editor-overlay-title">
            {editorStatus === "error" ? "Editor failed to load" : "Loading the markdown editor"}
          </p>
          <p className="editor-overlay-copy">
            {editorStatus === "error"
              ? editorError ?? "Reload the app and try again."
              : "Preparing ink-mde for this note."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
