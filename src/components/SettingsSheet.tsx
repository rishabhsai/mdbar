import type { AppSettings, EditorFont, ThemePreference } from "../lib/types";

type SettingsSheetProps = {
  onChange: (patch: Partial<AppSettings>) => void;
  onChooseFolder: () => void;
  onClose: () => void;
  open: boolean;
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

export function SettingsSheet({
  onChange,
  onChooseFolder,
  onClose,
  open,
  settings,
  shortcutStatus,
}: SettingsSheetProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <aside
        aria-label="Settings"
        className="settings-sheet"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-head">
          <div className="sheet-title-block">
            <p className="eyebrow">Preferences</p>
            <h2>Make mdbar feel like yours</h2>
            <p className="sheet-subcopy">
              Tweak the notebook location, theme, typography, and shortcut without changing your
              markdown files.
            </p>
          </div>
          <button aria-label="Close settings" className="sheet-close-button" onClick={onClose} type="button">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path
                d="m7 7 10 10M17 7 7 17"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.6"
              />
            </svg>
          </button>
        </div>

        <section className="settings-card">
          <div className="settings-card-head">
            <label className="field-label">Notebook folder</label>
            <button className="secondary-button" onClick={onChooseFolder} type="button">
              Choose folder
            </button>
          </div>
          <code className="folder-pill">
            {settings.notebookPath ?? "Choose a notebook folder to start using mdbar."}
          </code>
          <p className="field-hint">
            mdbar keeps your files plain on disk with a <code>daily/</code> folder for dated notes
            and a <code>notes/</code> folder for everything else.
          </p>
        </section>

        <section className="settings-card">
          <div className="settings-card-head">
            <label className="field-label">Theme</label>
            <p className="field-hint">Use system appearance or pin a mode.</p>
          </div>
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
        </section>

        <section className="settings-card">
          <div className="settings-card-head">
            <label className="field-label">Editor font</label>
            <p className="field-hint">Pick the voice of the editor without relying on a native dropdown.</p>
          </div>
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
        </section>

        <section className="settings-card">
          <div className="range-row">
            <label className="field-label" htmlFor="font-size">
              Font size
            </label>
            <span className="settings-value-pill">{settings.fontSize}px</span>
          </div>
          <input
            id="font-size"
            max={24}
            min={13}
            onChange={(event) => onChange({ fontSize: Number(event.currentTarget.value) })}
            type="range"
            value={settings.fontSize}
          />
          <p className="field-hint">Scale the markdown canvas without changing the stored files.</p>
        </section>

        <section className="settings-card">
          <div className="range-row">
            <label className="field-label" htmlFor="line-height">
              Line height
            </label>
            <span className="settings-value-pill">{settings.lineHeight.toFixed(2)}</span>
          </div>
          <input
            id="line-height"
            max={2}
            min={1.3}
            onChange={(event) => onChange({ lineHeight: Number(event.currentTarget.value) })}
            step={0.05}
            type="range"
            value={settings.lineHeight}
          />
          <p className="field-hint">More air for journaling, tighter spacing for lists and plans.</p>
        </section>

        <section className="settings-card">
          <div className="settings-card-head">
            <label className="field-label" htmlFor="shortcut">
              Global shortcut
            </label>
            <span className="settings-value-pill">Toggle panel</span>
          </div>
          <input
            id="shortcut"
            onChange={(event) => onChange({ shortcut: event.currentTarget.value })}
            placeholder="CommandOrControl+Shift+M"
            type="text"
            value={settings.shortcut}
          />
          <p className="field-hint">
            Uses Tauri accelerator syntax like <code>CommandOrControl+Shift+M</code>.
          </p>
          {shortcutStatus ? <p className="field-status">{shortcutStatus}</p> : null}
        </section>
      </aside>
    </div>
  );
}
