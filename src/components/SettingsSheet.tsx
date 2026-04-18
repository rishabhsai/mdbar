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

const fontOptions: Array<{ label: string; sample: string; value: EditorFont }> = [
  { label: "Editorial", sample: "Iowan Old Style", value: "editorial" },
  { label: "Sans", sample: "Avenir Next", value: "sans" },
  { label: "Mono", sample: "SF Mono", value: "mono" },
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
          <div>
            <p className="eyebrow">Preferences</p>
            <h2>Make mdbar feel like yours</h2>
          </div>
          <button className="ghost-button" onClick={onClose} type="button">
            Close
          </button>
        </div>

        <section className="settings-section">
          <label className="field-label">Notebook folder</label>
          <div className="folder-row">
            <code className="folder-pill">
              {settings.notebookPath ?? "No folder selected yet"}
            </code>
            <button className="secondary-button" onClick={onChooseFolder} type="button">
              Choose
            </button>
          </div>
        </section>

        <section className="settings-section">
          <label className="field-label">Theme</label>
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

        <section className="settings-section">
          <label className="field-label" htmlFor="font-family">
            Editor font
          </label>
          <select
            id="font-family"
            onChange={(event) =>
              onChange({ fontFamily: event.currentTarget.value as EditorFont })
            }
            value={settings.fontFamily}
          >
            {fontOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} ({option.sample})
              </option>
            ))}
          </select>
        </section>

        <section className="settings-section">
          <div className="range-row">
            <label className="field-label" htmlFor="font-size">
              Font size
            </label>
            <span>{settings.fontSize}px</span>
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
        </section>

        <section className="settings-section">
          <div className="range-row">
            <label className="field-label" htmlFor="line-height">
              Line height
            </label>
            <span>{settings.lineHeight.toFixed(2)}</span>
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
        </section>

        <section className="settings-section">
          <label className="field-label" htmlFor="shortcut">
            Global shortcut
          </label>
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
