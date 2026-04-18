use chrono::NaiveDate;
use serde::Serialize;
use std::{
    ffi::OsStr,
    fs,
    path::{Component, Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSummary {
    pub id: String,
    pub title: String,
    pub file_path: String,
    pub relative_path: String,
    pub directory: String,
    pub updated_at_ms: u128,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteDocument {
    pub id: String,
    pub title: String,
    pub file_path: String,
    pub relative_path: String,
    pub directory: String,
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

fn normalize_path_string(path: &Path) -> String {
    path.components()
        .filter_map(|component| match component {
            Component::Normal(segment) => segment.to_str().map(ToOwned::to_owned),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

fn strip_markdown_extension(path: &Path) -> PathBuf {
    if path.extension().and_then(OsStr::to_str) == Some("md") {
        path.with_extension("")
    } else {
        path.to_path_buf()
    }
}

fn daily_note_id(path: &Path) -> Result<String, String> {
    path.file_stem()
        .and_then(OsStr::to_str)
        .map(ToOwned::to_owned)
        .ok_or_else(|| "mdbar couldn't read that note name.".to_string())
}

fn library_note_id(notes_root: &Path, path: &Path) -> Result<String, String> {
    let relative = path
        .strip_prefix(notes_root)
        .map_err(|_| "mdbar couldn't map that note into your notes folder.".to_string())?;
    let without_extension = strip_markdown_extension(relative);
    let id = normalize_path_string(&without_extension);

    if id.is_empty() {
        Err("mdbar couldn't read that note path.".to_string())
    } else {
        Ok(id)
    }
}

fn library_relative_path(notes_root: &Path, path: &Path) -> Result<String, String> {
    let relative = path
        .strip_prefix(notes_root)
        .map_err(|_| "mdbar couldn't map that note into your notes folder.".to_string())?;
    let normalized = normalize_path_string(relative);

    if normalized.is_empty() {
        Err("mdbar couldn't read that note path.".to_string())
    } else {
        Ok(normalized)
    }
}

fn library_directory(notes_root: &Path, path: &Path) -> String {
    let Some(parent) = path.parent() else {
        return String::new();
    };

    let Ok(relative) = parent.strip_prefix(notes_root) else {
        return String::new();
    };

    normalize_path_string(relative)
}

fn build_daily_document(path: &Path) -> Result<NoteDocument, String> {
    Ok(NoteDocument {
        id: daily_note_id(path)?,
        title: title_from_path(path),
        file_path: path.to_string_lossy().into_owned(),
        relative_path: path
            .file_name()
            .and_then(OsStr::to_str)
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| "Untitled.md".to_string()),
        directory: "daily".to_string(),
        kind: "daily".to_string(),
        content: load_text(path)?,
        updated_at_ms: updated_at_ms(path),
    })
}

fn build_library_summary(notes_root: &Path, path: &Path) -> Result<NoteSummary, String> {
    Ok(NoteSummary {
        id: library_note_id(notes_root, path)?,
        title: title_from_path(path),
        file_path: path.to_string_lossy().into_owned(),
        relative_path: library_relative_path(notes_root, path)?,
        directory: library_directory(notes_root, path),
        updated_at_ms: updated_at_ms(path),
    })
}

fn build_library_document(notes_root: &Path, path: &Path) -> Result<NoteDocument, String> {
    if !path.exists() {
        return Err("That note could not be found. It may have been moved or deleted.".to_string());
    }

    Ok(NoteDocument {
        id: library_note_id(notes_root, path)?,
        title: title_from_path(path),
        file_path: path.to_string_lossy().into_owned(),
        relative_path: library_relative_path(notes_root, path)?,
        directory: library_directory(notes_root, path),
        kind: "library".to_string(),
        content: load_text(path)?,
        updated_at_ms: updated_at_ms(path),
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

fn normalize_library_note_relative_path(note_id: &str) -> Result<PathBuf, String> {
    let trimmed = note_id.trim().trim_matches('/');
    if trimmed.is_empty() {
        return Err("Choose a note before trying to open it.".to_string());
    }

    let mut relative = PathBuf::new();

    for component in Path::new(trimmed).components() {
        match component {
            Component::Normal(segment) => relative.push(segment),
            _ => return Err("That note path is invalid.".to_string()),
        }
    }

    if relative.as_os_str().is_empty() {
        return Err("That note path is invalid.".to_string());
    }

    if relative.extension().and_then(OsStr::to_str) != Some("md") {
        relative.set_extension("md");
    }

    Ok(relative)
}

fn collect_library_notes(
    notes_root: &Path,
    folder: &Path,
    notes: &mut Vec<NoteSummary>,
) -> Result<(), String> {
    let entries =
        fs::read_dir(folder).map_err(|error| format!("Couldn't scan notes: {error}"))?;

    for entry in entries {
        let entry = entry.map_err(|error| format!("Couldn't scan notes: {error}"))?;
        let path = entry.path();

        if path.is_dir() {
            collect_library_notes(notes_root, &path, notes)?;
            continue;
        }

        if path.extension().and_then(OsStr::to_str) != Some("md") {
            continue;
        }

        notes.push(build_library_summary(notes_root, &path)?);
    }

    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub fn open_daily_note(folder_path: String, date_key: String) -> Result<NoteDocument, String> {
    let root = normalize_notebook_root(&folder_path)?;
    let path = build_daily_path(&root, &date_key)?;

    if !path.exists() {
        atomic_write(&path, "")?;
    }

    build_daily_document(&path)
}

#[tauri::command(rename_all = "camelCase")]
pub fn list_library_notes(folder_path: String) -> Result<Vec<NoteSummary>, String> {
    let root = normalize_notebook_root(&folder_path)?;
    let folder = library_root(&root);
    ensure_dir(&folder)?;

    let mut notes = Vec::new();
    collect_library_notes(&folder, &folder, &mut notes)?;
    notes.sort_by(|left, right| {
        right
            .updated_at_ms
            .cmp(&left.updated_at_ms)
            .then_with(|| left.relative_path.cmp(&right.relative_path))
    });

    Ok(notes)
}

#[tauri::command(rename_all = "camelCase")]
pub fn open_library_note(folder_path: String, note_id: String) -> Result<NoteDocument, String> {
    let root = normalize_notebook_root(&folder_path)?;
    let notes_root = library_root(&root);
    let relative = normalize_library_note_relative_path(&note_id)?;
    let path = notes_root.join(relative);
    build_library_document(&notes_root, &path)
}

#[tauri::command(rename_all = "camelCase")]
pub fn create_library_note(folder_path: String, title: String) -> Result<NoteDocument, String> {
    let root = normalize_notebook_root(&folder_path)?;
    let notes_root = library_root(&root);
    let path = unique_library_path(&root, &title)?;

    if !path.exists() {
        atomic_write(&path, "")?;
    }

    build_library_document(&notes_root, &path)
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
    use super::{list_library_notes, normalize_library_note_relative_path, slugify};
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn temporary_root(label: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        let path = std::env::temp_dir().join(format!("mdbar-tests-{label}-{nonce}"));
        fs::create_dir_all(&path).expect("temporary root should be created");
        path
    }

    #[test]
    fn slugify_collapses_symbols() {
        assert_eq!(slugify("  Design & Daily Notes  "), "design-daily-notes");
    }

    #[test]
    fn slugify_falls_back_when_empty() {
        assert_eq!(slugify("!!!"), "");
    }

    #[test]
    fn normalize_library_note_relative_path_rejects_parent_segments() {
        let result = normalize_library_note_relative_path("../secrets");
        assert!(result.is_err());
    }

    #[test]
    fn list_library_notes_walks_nested_folders() {
        let root = temporary_root("nested");
        let nested_folder = root.join("notes/projects/client");
        fs::create_dir_all(&nested_folder).expect("nested folder should exist");
        fs::write(nested_folder.join("roadmap.md"), "# roadmap").expect("note should exist");

        let notes = list_library_notes(root.to_string_lossy().into_owned())
            .expect("notes should be listed");

        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].id, "projects/client/roadmap");
        assert_eq!(notes[0].relative_path, "projects/client/roadmap.md");
        assert_eq!(notes[0].directory, "projects/client");

        let _ = fs::remove_dir_all(root);
    }
}
