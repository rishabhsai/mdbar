use chrono::NaiveDate;
use serde::Serialize;
use std::{
    ffi::OsStr,
    fs,
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSummary {
    pub id: String,
    pub title: String,
    pub file_path: String,
    pub updated_at_ms: u128,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteDocument {
    pub id: String,
    pub title: String,
    pub file_path: String,
    pub kind: String,
    pub content: String,
    pub updated_at_ms: u128,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveNoteResult {
    pub persisted: bool,
    pub updated_at_ms: u128,
}

fn normalize_notebook_root(folder_path: &str) -> Result<PathBuf, String> {
    let trimmed = folder_path.trim();

    if trimmed.is_empty() {
        return Err("Choose a notebook folder before opening notes.".to_string());
    }

    let root = PathBuf::from(trimmed);
    fs::create_dir_all(&root)
        .map_err(|error| format!("Couldn't create the notebook folder: {error}"))?;

    fs::canonicalize(&root)
        .map_err(|error| format!("Couldn't resolve the notebook folder: {error}"))
}

fn library_root(root: &Path) -> PathBuf {
    root.join("notes")
}

fn daily_root(root: &Path) -> PathBuf {
    root.join("daily")
}

fn ensure_dir(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|error| format!("Couldn't prepare the folder: {error}"))
}

fn updated_at_ms(path: &Path) -> u128 {
    fs::metadata(path)
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn load_text(path: &Path) -> Result<String, String> {
    if !path.exists() {
        return Ok(String::new());
    }

    fs::read_to_string(path).map_err(|error| format!("Couldn't read the note: {error}"))
}

fn title_from_path(path: &Path) -> String {
    path.file_stem()
        .and_then(OsStr::to_str)
        .map(|stem| stem.replace('-', " "))
        .map(|stem| {
            stem.split_whitespace()
                .map(|part| {
                    let mut chars = part.chars();
                    let Some(first) = chars.next() else {
                        return String::new();
                    };

                    let mut piece = String::new();
                    piece.extend(first.to_uppercase());
                    piece.push_str(chars.as_str());
                    piece
                })
                .collect::<Vec<_>>()
                .join(" ")
        })
        .filter(|title| !title.is_empty())
        .unwrap_or_else(|| "Untitled".to_string())
}

fn build_daily_path(root: &Path, date_key: &str) -> Result<PathBuf, String> {
    NaiveDate::parse_from_str(date_key, "%Y-%m-%d")
        .map_err(|_| "That daily note date is invalid.".to_string())?;

    let folder = daily_root(root);
    ensure_dir(&folder)?;
    Ok(folder.join(format!("{date_key}.md")))
}

fn note_id_from_path(path: &Path) -> Result<String, String> {
    path.file_stem()
        .and_then(OsStr::to_str)
        .map(ToOwned::to_owned)
        .ok_or_else(|| "mdbar couldn't read that note name.".to_string())
}

fn build_document(path: &Path, kind: &str) -> Result<NoteDocument, String> {
    let content = load_text(path)?;
    let id = note_id_from_path(path)?;

    Ok(NoteDocument {
        id,
        title: title_from_path(path),
        file_path: path.to_string_lossy().into_owned(),
        kind: kind.to_string(),
        updated_at_ms: updated_at_ms(path),
        content,
    })
}

fn atomic_write(path: &Path, contents: &str) -> Result<(), String> {
    let Some(parent) = path.parent() else {
        return Err("mdbar couldn't find that note folder.".to_string());
    };

    ensure_dir(parent)?;

    let file_name = path
        .file_name()
        .and_then(OsStr::to_str)
        .ok_or_else(|| "mdbar couldn't name that file.".to_string())?;

    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let temp_path = parent.join(format!(".{file_name}.{nonce}.tmp"));

    fs::write(&temp_path, contents).map_err(|error| format!("Couldn't write the note: {error}"))?;
    fs::rename(&temp_path, path).map_err(|error| {
        let _ = fs::remove_file(&temp_path);
        format!("Couldn't finalize the note save: {error}")
    })?;

    Ok(())
}

fn slugify(title: &str) -> String {
    let mut slug = String::new();
    let mut last_was_dash = false;

    for character in title.trim().chars() {
        let lower = character.to_ascii_lowercase();

        if lower.is_ascii_alphanumeric() {
            slug.push(lower);
            last_was_dash = false;
            continue;
        }

        if !last_was_dash && !slug.is_empty() {
            slug.push('-');
            last_was_dash = true;
        }
    }

    slug.trim_matches('-').to_string()
}

fn unique_library_path(root: &Path, title: &str) -> Result<PathBuf, String> {
    let folder = library_root(root);
    ensure_dir(&folder)?;

    let base = slugify(title);
    let base = if base.is_empty() {
        "untitled".to_string()
    } else {
        base
    };

    let mut index = 1;
    loop {
        let suffix = if index == 1 {
            String::new()
        } else {
            format!("-{index}")
        };

        let candidate = folder.join(format!("{base}{suffix}.md"));
        if !candidate.exists() {
            return Ok(candidate);
        }

        index += 1;
    }
}

#[tauri::command(rename_all = "camelCase")]
pub fn open_daily_note(folder_path: String, date_key: String) -> Result<NoteDocument, String> {
    let root = normalize_notebook_root(&folder_path)?;
    let path = build_daily_path(&root, &date_key)?;
    build_document(&path, "daily")
}

#[tauri::command(rename_all = "camelCase")]
pub fn list_library_notes(folder_path: String) -> Result<Vec<NoteSummary>, String> {
    let root = normalize_notebook_root(&folder_path)?;
    let folder = library_root(&root);
    ensure_dir(&folder)?;

    let mut notes = Vec::new();
    for entry in fs::read_dir(&folder).map_err(|error| format!("Couldn't scan notes: {error}"))? {
        let Ok(entry) = entry else {
            continue;
        };
        let path = entry.path();

        if path.extension().and_then(OsStr::to_str) != Some("md") {
            continue;
        }

        let id = note_id_from_path(&path)?;
        notes.push(NoteSummary {
            id,
            title: title_from_path(&path),
            file_path: path.to_string_lossy().into_owned(),
            updated_at_ms: updated_at_ms(&path),
        });
    }

    notes.sort_by(|left, right| right.updated_at_ms.cmp(&left.updated_at_ms));
    Ok(notes)
}

#[tauri::command(rename_all = "camelCase")]
pub fn open_library_note(folder_path: String, note_id: String) -> Result<NoteDocument, String> {
    let root = normalize_notebook_root(&folder_path)?;
    let path = library_root(&root).join(format!("{note_id}.md"));
    build_document(&path, "library")
}

#[tauri::command(rename_all = "camelCase")]
pub fn create_library_note(folder_path: String, title: String) -> Result<NoteDocument, String> {
    let root = normalize_notebook_root(&folder_path)?;
    let path = unique_library_path(&root, &title)?;

    if !path.exists() {
        atomic_write(&path, "")?;
    }

    build_document(&path, "library")
}

#[tauri::command(rename_all = "camelCase")]
pub fn save_note(file_path: String, content: String) -> Result<SaveNoteResult, String> {
    let path = PathBuf::from(file_path);

    if path.extension().and_then(OsStr::to_str) != Some("md") {
        return Err("mdbar only saves markdown files.".to_string());
    }

    if content.trim().is_empty() && !path.exists() {
        return Ok(SaveNoteResult {
            persisted: false,
            updated_at_ms: 0,
        });
    }

    atomic_write(&path, &content)?;

    Ok(SaveNoteResult {
        persisted: true,
        updated_at_ms: updated_at_ms(&path),
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn reveal_note_in_finder(file_path: String) -> Result<(), String> {
    let path = PathBuf::from(file_path);
    let mut command = Command::new("open");

    if path.exists() {
        command.arg("-R").arg(path);
    } else if let Some(parent) = path.parent() {
        command.arg(parent);
    } else {
        return Err("mdbar couldn't reveal that note.".to_string());
    }

    let status = command
        .status()
        .map_err(|error| format!("Couldn't open Finder: {error}"))?;

    if status.success() {
        Ok(())
    } else {
        Err("Finder could not reveal that note.".to_string())
    }
}

#[tauri::command(rename_all = "camelCase")]
pub fn open_note_in_default_app(file_path: String) -> Result<(), String> {
    let path = PathBuf::from(file_path);
    if !path.exists() {
        return Err("That note does not exist yet.".to_string());
    }

    let status = Command::new("open")
        .arg(path)
        .status()
        .map_err(|error| format!("Couldn't open the note: {error}"))?;

    if status.success() {
        Ok(())
    } else {
        Err("mdbar couldn't open that note.".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::slugify;

    #[test]
    fn slugify_collapses_symbols() {
        assert_eq!(slugify("  Design & Daily Notes  "), "design-daily-notes");
    }

    #[test]
    fn slugify_falls_back_when_empty() {
        assert_eq!(slugify("!!!"), "");
    }
}
