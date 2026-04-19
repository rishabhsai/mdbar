import { defaultSettings, type AppSettings } from "./types";

const SETTINGS_KEY = "mdbar.settings.v1";

function normalizeFontFamily(fontFamily: string | undefined) {
  if (!fontFamily) {
    return defaultSettings.fontFamily;
  }

  switch (fontFamily) {
    case "editorial":
      return "Iowan Old Style";
    case "sans":
      return "Avenir Next";
    case "mono":
      return "SF Mono";
    default:
      return fontFamily;
  }
}

function normalizeShortcut(shortcut: string | undefined) {
  if (!shortcut) {
    return defaultSettings.shortcut;
  }

  return shortcut.replace(/CommandOrControl/g, "CmdOrControl");
}

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") {
    return defaultSettings;
  }

  const raw = window.localStorage.getItem(SETTINGS_KEY);
  if (!raw) {
    return defaultSettings;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      ...defaultSettings,
      ...parsed,
      fontFamily: normalizeFontFamily(parsed.fontFamily),
      shortcut: normalizeShortcut(parsed.shortcut),
    };
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: AppSettings) {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
