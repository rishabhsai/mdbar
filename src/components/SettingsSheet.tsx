import { useCallback, useEffect, useState, type ReactNode } from "react";

import { listSystemFonts } from "../lib/tauri";
import { defaultSettings, type AppSettings, type ThemePreference } from "../lib/types";

type SettingsViewProps = {
  onChange: (patch: Partial<AppSettings>) => void;
  onChooseFolder: () => void;
  onClose: () => void;
  settings: AppSettings;
  shortcutStatus: string | null;
};

type SettingsIconProps = {
  children: ReactNode;
};

const themeOptions: Array<{
  description: string;
  icon: ReactNode;
  label: string;
  value: ThemePreference;
}> = [
  {
    description: "Follow macOS",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <rect x="4" y="5" width="16" height="11" rx="2" />
        <path d="M9 20h6M12 16v4" />
      </svg>
    ),
    label: "System",
    value: "system",
  },
  {
    description: "Warm paper",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="3.5" />
        <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
      </svg>
    ),
    label: "Light",
    value: "light",
  },
  {
    description: "Low-light focus",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M19.5 15.2A8 8 0 0 1 8.8 4.5a8 8 0 1 0 10.7 10.7Z" />
      </svg>
    ),
    label: "Dark",
    value: "dark",
  },
];

const fallbackFonts = [
  "Iowan Old Style",
  "Avenir Next",
  "SF Mono",
  "Helvetica Neue",
  "Menlo",
  "Georgia",
  "Times New Roman",
  "Verdana",
  "Courier New",
];

const MODIFIER_KEYS = new Set(["Meta", "Control", "Alt", "Shift"]);

const CODE_MAP: Record<string, string> = {
  Backquote: "Backquote",
  Minus: "Minus",
  Equal: "Equal",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "Backslash",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Space: "Space",
  Escape: "Escape",
  Enter: "Enter",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Delete",
  Insert: "Insert",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
};

function SettingsIcon({ children }: SettingsIconProps) {
  return <span className="settings-icon">{children}</span>;
}

function acceleratorKeyFromEvent(event: KeyboardEvent): string | null {
  if (event.code.startsWith("Key")) {
    return event.code.slice(3).toUpperCase();
  }

  if (event.code.startsWith("Digit")) {
    return event.code.slice(5);
  }

  if (event.code.startsWith("Numpad") && event.code.length > "Numpad".length) {
    return event.code;
  }

  if (/^F\d{1,2}$/.test(event.code)) {
    return event.code;
  }

  if (event.code in CODE_MAP) {
    return CODE_MAP[event.code];
  }

  if (event.key.length === 1 && /[a-z0-9]/i.test(event.key)) {
    return event.key.toUpperCase();
  }

  return null;
}

function keyEventToAccelerator(event: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(event.key) || MODIFIER_KEYS.has(event.code)) {
    return null;
  }

  const parts: string[] = [];

  if (event.metaKey) {
    parts.push("CommandOrControl");
  }

  if (event.ctrlKey && !event.metaKey) {
    parts.push("Control");
  }

  if (event.altKey) {
    parts.push("Alt");
  }

  if (event.shiftKey) {
    parts.push("Shift");
  }

  const key = acceleratorKeyFromEvent(event);
  if (!key) {
    return null;
  }

  parts.push(key);
  return parts.length < 2 ? null : parts.join("+");
}

function formatAcceleratorForDisplay(accelerator: string): string[] {
  return accelerator
    .replace(/CommandOrControl|CmdOrControl/g, "⌘")
    .replace(/Control/g, "⌃")
    .replace(/Shift/g, "⇧")
    .replace(/Alt/g, "⌥")
    .split("+");
}

export function SettingsView({
  onChange,
  onChooseFolder,
  onClose,
  settings,
  shortcutStatus,
}: SettingsViewProps) {
  const [availableFonts, setAvailableFonts] = useState<string[]>(fallbackFonts);
  const [isRecording, setIsRecording] = useState(false);

  const handleRecordingToggle = useCallback(() => {
    setIsRecording((recording) => !recording);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void listSystemFonts()
      .then((fonts) => {
        if (!cancelled && fonts.length > 0) {
          setAvailableFonts(Array.from(new Set([...fallbackFonts, ...fonts])));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAvailableFonts(fallbackFonts);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isRecording) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        setIsRecording(false);
        return;
      }

      const accelerator = keyEventToAccelerator(event);
      if (accelerator) {
        onChange({ shortcut: accelerator });
        setIsRecording(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isRecording, onChange]);

  const shortcutKeys = formatAcceleratorForDisplay(settings.shortcut);

  return (
    <section className="settings-view" aria-label="Settings">
      <div className="settings-panel">
        <header className="settings-intro">
          <div>
            <p className="settings-eyebrow">Make mdbar yours</p>
            <p className="settings-intro-copy">
              Your notebook stays local. These preferences only change how mdbar
              looks and opens.
            </p>
          </div>
          <span className="settings-version">v0.1.2</span>
        </header>

        <div className="settings-card">
          <div className="settings-card-heading">
            <SettingsIcon>
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M3.5 7.5h6l1.8 2H20a1 1 0 0 1 1 1v7.8a1.7 1.7 0 0 1-1.7 1.7H4.7A1.7 1.7 0 0 1 3 18.3V8.5a1 1 0 0 1 .5-1Z" />
              </svg>
            </SettingsIcon>
            <div>
              <h2>Notebook</h2>
              <p>Plain markdown files, always under your control.</p>
            </div>
          </div>
          <button className="notebook-path" onClick={onChooseFolder} type="button">
            <span className="notebook-path-copy">
              <span className="notebook-path-label">
                {settings.notebookPath ? "Current folder" : "No folder selected"}
              </span>
              <code>
                {settings.notebookPath ?? "Choose where mdbar should keep your notes"}
              </code>
            </span>
            <span className="notebook-path-action">
              {settings.notebookPath ? "Change" : "Choose"}
            </span>
          </button>
          <p className="settings-hint settings-card-hint">
            Daily notes go in <code>daily/</code>; everything else goes in{" "}
            <code>notes/</code>.
          </p>
        </div>

        <div className="settings-card">
          <div className="settings-card-heading">
            <SettingsIcon>
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M4 18.5 9.2 5.5h2.1l5.2 13M6.2 14h8.1M17.5 9.5h3M19 8v3" />
              </svg>
            </SettingsIcon>
            <div>
              <h2>Appearance</h2>
              <p>Choose the canvas and tune the writing rhythm.</p>
            </div>
          </div>

          <div className="theme-grid" aria-label="Theme">
            {themeOptions.map((option) => (
              <button
                aria-pressed={settings.theme === option.value}
                className={settings.theme === option.value ? "is-active" : ""}
                key={option.value}
                onClick={() => onChange({ theme: option.value })}
                type="button"
              >
                <span className="theme-option-icon">{option.icon}</span>
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </button>
            ))}
          </div>

          <div className="settings-divider" />

          <div className="type-preview" style={{ fontFamily: settings.fontFamily }}>
            <span>Aa</span>
            <p>The quick brown fox keeps a plain markdown note.</p>
          </div>

          <div className="settings-control-group">
            <label className="settings-sublabel" htmlFor="font-family">
              Editor font
            </label>
            <div className="font-select-wrap">
              <select
                className="font-select"
                id="font-family"
                onChange={(event) =>
                  onChange({ fontFamily: event.currentTarget.value })
                }
                value={settings.fontFamily}
              >
                {availableFonts.map((fontName) => (
                  <option key={fontName} value={fontName}>
                    {fontName}
                  </option>
                ))}
              </select>
              <span className="font-select-chevron" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="m7 9.5 5 5 5-5" />
                </svg>
              </span>
            </div>
          </div>

          <div className="settings-range-grid">
            <div className="settings-control-group">
              <div className="range-row">
                <label className="settings-sublabel" htmlFor="font-size">
                  Size
                </label>
                <span className="settings-value-pill">{settings.fontSize}px</span>
              </div>
              <input
                id="font-size"
                max={24}
                min={13}
                onChange={(event) =>
                  onChange({ fontSize: Number(event.currentTarget.value) })
                }
                type="range"
                value={settings.fontSize}
              />
            </div>

            <div className="settings-control-group">
              <div className="range-row">
                <label className="settings-sublabel" htmlFor="line-height">
                  Spacing
                </label>
                <span className="settings-value-pill">
                  {settings.lineHeight.toFixed(2)}
                </span>
              </div>
              <input
                id="line-height"
                max={2}
                min={1.3}
                onChange={(event) =>
                  onChange({ lineHeight: Number(event.currentTarget.value) })
                }
                step={0.05}
                type="range"
                value={settings.lineHeight}
              />
            </div>
          </div>
        </div>

        <div className="settings-card">
          <div className="settings-card-heading">
            <SettingsIcon>
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
                <path d="M7 10h2M11 10h2M15 10h2M7 14h6M15 14h2" />
              </svg>
            </SettingsIcon>
            <div>
              <h2>Global shortcut</h2>
              <p>Open or hide mdbar from anywhere on your Mac.</p>
            </div>
          </div>

          <div className={`shortcut-recorder ${isRecording ? "is-recording" : ""}`}>
            <div className="shortcut-display" aria-label={settings.shortcut}>
              {shortcutKeys.map((key, index) => (
                <kbd key={`${key}-${index}`}>{key}</kbd>
              ))}
            </div>
            <button
              aria-pressed={isRecording}
              className="shortcut-record-button"
              onClick={handleRecordingToggle}
              type="button"
            >
              {isRecording ? (
                <>
                  <span className="shortcut-record-dot" />
                  Press keys
                </>
              ) : (
                "Record new"
              )}
            </button>
          </div>

          <div className="shortcut-meta">
            <span>{isRecording ? "Press Esc to cancel" : "Requires at least one modifier"}</span>
            {settings.shortcut !== defaultSettings.shortcut ? (
              <button
                onClick={() => onChange({ shortcut: defaultSettings.shortcut })}
                type="button"
              >
                Reset
              </button>
            ) : null}
          </div>
          {shortcutStatus ? <p className="field-status">{shortcutStatus}</p> : null}
        </div>

        <details className="settings-about">
          <summary>
            <span>Keyboard shortcuts</span>
            <span className="settings-about-chevron" aria-hidden="true">⌄</span>
          </summary>
          <div className="settings-shortcuts" aria-label="Keyboard shortcuts">
            <span className="settings-shortcut"><kbd>⌘O</kbd><span>Open file</span></span>
            <span className="settings-shortcut"><kbd>⌘⇧O</kbd><span>Show in Finder</span></span>
            <span className="settings-shortcut"><kbd>←</kbd><span>Previous day</span></span>
            <span className="settings-shortcut"><kbd>→</kbd><span>Next day</span></span>
          </div>
        </details>

        <div className="settings-footer">
          <button className="secondary-button" onClick={onClose} type="button">
            Done
          </button>
        </div>
      </div>
    </section>
  );
}
