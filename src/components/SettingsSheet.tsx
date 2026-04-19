import { useCallback, useEffect, useRef, useState } from "react";

import { listSystemFonts } from "../lib/tauri";
import type { AppSettings, ThemePreference } from "../lib/types";

type SettingsViewProps = {
  onChange: (patch: Partial<AppSettings>) => void;
  onChooseFolder: () => void;
  onClose: () => void;
  settings: AppSettings;
  shortcutStatus: string | null;
};

const themeOptions: Array<{ label: string; value: ThemePreference }> = [
  { label: "System", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
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

/* ── Shortcut recorder helpers ── */

const MODIFIER_KEYS = new Set([
  "Meta",
  "Control",
  "Alt",
  "Shift",
]);

function keyEventToAccelerator(event: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(event.key)) {
    return null; // only modifiers pressed, wait for a real key
  }

  const parts: string[] = [];

  if (event.metaKey || event.ctrlKey) {
    parts.push("CmdOrControl");
  }

  if (event.altKey) {
    parts.push("Alt");
  }

  if (event.shiftKey) {
    parts.push("Shift");
  }

  // Normalize key name
  let key = event.key;

  if (key.length === 1) {
    key = key.toUpperCase();
  } else {
    // Map some common keys to Tauri accelerator names
    const keyMap: Record<string, string> = {
      ArrowUp: "Up",
      ArrowDown: "Down",
      ArrowLeft: "Left",
      ArrowRight: "Right",
      " ": "Space",
      Escape: "Escape",
      Enter: "Enter",
      Backspace: "Backspace",
      Delete: "Delete",
      Tab: "Tab",
    };

    key = keyMap[key] ?? key;
  }

  parts.push(key);

  if (parts.length < 2) {
    return null;
  }

  return parts.join("+");
}

function formatAcceleratorForDisplay(accelerator: string): string {
  return accelerator
    .replace(/CmdOrControl/g, "⌘")
    .replace(/CommandOrControl/g, "⌘")
    .replace(/Shift/g, "⇧")
    .replace(/Alt/g, "⌥")
    .replace(/\+/g, " ");
}

/* ── Component ── */

export function SettingsView({
  onChange,
  onChooseFolder,
  onClose,
  settings,
  shortcutStatus,
}: SettingsViewProps) {
  const [availableFonts, setAvailableFonts] = useState<string[]>(fallbackFonts);
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef<HTMLButtonElement | null>(null);

  const handleStartRecording = useCallback(() => {
    setIsRecording(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void listSystemFonts()
      .then((fonts) => {
        if (cancelled || fonts.length === 0) {
          return;
        }

        const merged = Array.from(new Set([...fallbackFonts, ...fonts]));
        setAvailableFonts(merged);
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
    if (!isRecording) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      // Escape cancels recording
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

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isRecording, onChange]);

  return (
    <section className="settings-view" aria-label="Settings">
      <div className="settings-panel">
        <div className="settings-section" aria-label="Notebook">
          <div className="settings-section-header">
            <span className="settings-label">Notebook</span>
            <button
              className="settings-link-button"
              onClick={onChooseFolder}
              type="button"
            >
              Choose folder
            </button>
          </div>
          <div className="settings-section-body">
            <code className="folder-pill">
              {settings.notebookPath ?? "Choose a notebook folder to start using mdbar."}
            </code>
            <p className="settings-hint">
              mdbar keeps your files plain on disk — <code>daily/</code> for
              dated notes, <code>notes/</code> for everything else.
            </p>
          </div>
        </div>

        <div className="settings-section" aria-label="Theme">
          <div className="settings-section-header">
            <span className="settings-label">Theme</span>
          </div>
          <div className="settings-section-body">
            <div className="segmented-control">
              {themeOptions.map((option) => (
                <button
                  className={settings.theme === option.value ? "is-active" : ""}
                  key={option.value}
                  onClick={() => onChange({ theme: option.value })}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <details className="settings-subsection">
          <summary className="settings-subsection-trigger">
            <span className="settings-label">Typography</span>
            <span className="settings-subsection-chevron" aria-hidden="true">
              ›
            </span>
          </summary>
          <div className="settings-subsection-content">
            <div className="settings-subsection-group">
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
                    <path
                      d="m6 9 6 6 6-6"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.8"
                    />
                  </svg>
                </span>
              </div>
              <div
                className="font-preview-card"
                style={{ fontFamily: `"${settings.fontFamily.replace(/"/g, '\\"')}", var(--sans)` }}
              >
                <span className="font-preview-label">{settings.fontFamily}</span>
                <span className="font-preview-sample">
                  The quick brown fox jumps over the lazy dog.
                </span>
              </div>
            </div>

            <div className="settings-subsection-group">
              <div className="range-row">
                <label className="settings-sublabel" htmlFor="font-size">
                  Font size
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

            <div className="settings-subsection-group">
              <div className="range-row">
                <label className="settings-sublabel" htmlFor="line-height">
                  Line height
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
        </details>

        <div className="settings-section" aria-label="Shortcut">
          <div className="settings-section-header">
            <span className="settings-label">Global shortcut</span>
          </div>
          <div className="settings-section-body">
            <p className="settings-hint" style={{ margin: "0 0 10px" }}>
              Press the button, then type the key combo you want.
            </p>
            <div className="shortcut-recorder">
              <div className="shortcut-display">
                <span className="shortcut-keys">
                  {formatAcceleratorForDisplay(settings.shortcut)}
                </span>
                <span className="shortcut-raw">{settings.shortcut}</span>
              </div>
              <button
                ref={recorderRef}
                className={`shortcut-record-button ${isRecording ? "is-recording" : ""}`}
                onClick={handleStartRecording}
                type="button"
              >
                {isRecording ? (
                  <>
                    <span className="shortcut-record-dot" />
                    Press keys…
                  </>
                ) : (
                  "Record"
                )}
              </button>
            </div>
            {shortcutStatus ? (
              <p className="field-status">{shortcutStatus}</p>
            ) : null}
          </div>
        </div>

        <details className="settings-subsection">
          <summary className="settings-subsection-trigger">
            <span className="settings-label">About</span>
            <span className="settings-subsection-chevron" aria-hidden="true">
              ›
            </span>
          </summary>
          <div className="settings-subsection-content">
            <p className="settings-hint" style={{ margin: 0 }}>
              mdbar is a tiny menu bar notebook for one simple habit: keep a
              plain markdown note for each day.
            </p>
            <p className="settings-hint" style={{ margin: 0 }}>
              Everything saves automatically to normal <code>.md</code> files,
              so your notes stay easy to browse in Finder and edit anywhere.
            </p>
            <div
              className="settings-shortcuts"
              aria-label="Keyboard shortcuts"
            >
              <span className="settings-shortcut">
                <kbd>⌘O</kbd>
                <span>Open file</span>
              </span>
              <span className="settings-shortcut">
                <kbd>⌘⇧O</kbd>
                <span>In Finder</span>
              </span>
              <span className="settings-shortcut">
                <kbd>←</kbd>
                <span>Prev day</span>
              </span>
              <span className="settings-shortcut">
                <kbd>→</kbd>
                <span>Next day</span>
              </span>
            </div>
          </div>
        </details>

        <div className="settings-footer">
          <button
            className="secondary-button"
            onClick={onClose}
            type="button"
          >
            Back to note
          </button>
        </div>
      </div>
    </section>
  );
}
