import type { AppSettings, EditorFont, ThemePreference } from "../lib/types";

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

const fontOptions: Array<{
  description: string;
  label: string;
  preview: string;
  value: EditorFont;
}> = [
  {
    description: "Editorial serif for journal-style notes.",
    label: "Editorial",
    preview: "Iowan Old Style",
    value: "editorial",
  },
  {
    description: "Clean sans for a calmer utility feel.",
    label: "Sans",
    preview: "Avenir Next",
    value: "sans",
  },
  {
    description: "Monospace for code, logs, and outlines.",
    label: "Mono",
    preview: "SF Mono",
    value: "mono",
  },
];

export function SettingsView({
  onChange,
  onChooseFolder,
  onClose,
  settings,
  shortcutStatus,
}: SettingsViewProps) {
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
              <span className="settings-sublabel">Editor font</span>
              <div className="option-grid">
                {fontOptions.map((option) => (
                  <button
                    className={`option-card option-card-${option.value}${
                      settings.fontFamily === option.value ? " is-active" : ""
                    }`}
                    key={option.value}
                    onClick={() => onChange({ fontFamily: option.value })}
                    type="button"
                  >
                    <span className="option-card-title">{option.label}</span>
                    <span className="option-card-preview">{option.preview}</span>
                    <span className="option-card-copy">{option.description}</span>
                  </button>
                ))}
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

        <details className="settings-subsection">
          <summary className="settings-subsection-trigger">
            <span className="settings-label">Shortcut</span>
            <span className="settings-subsection-chevron" aria-hidden="true">
              ›
            </span>
          </summary>
          <div className="settings-subsection-content">
            <label className="settings-sublabel" htmlFor="shortcut">
              Global shortcut
            </label>
            <input
              id="shortcut"
              onChange={(event) =>
                onChange({ shortcut: event.currentTarget.value })
              }
              placeholder="CommandOrControl+Shift+M"
              type="text"
              value={settings.shortcut}
            />
            <p className="settings-hint">
              Uses Tauri accelerator syntax like{" "}
              <code>CommandOrControl+Shift+M</code>.
            </p>
            {shortcutStatus ? (
              <p className="field-status">{shortcutStatus}</p>
            ) : null}
          </div>
        </details>

        <details className="settings-subsection">
          <summary className="settings-subsection-trigger">
            <span className="settings-label">About</span>
            <span className="settings-subsection-chevron" aria-hidden="true">
              ›
            </span>
          </summary>
          <div className="settings-subsection-content">
            <p className="settings-hint">
              mdbar is a tiny menu bar notebook for one single habit: keep a
              plain markdown note for each day.
            </p>
            <p className="settings-hint">
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
                <span>Previous day</span>
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
