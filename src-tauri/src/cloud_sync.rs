use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
};

use chrono::Utc;
use reqwest::{Client, StatusCode};
use security_framework::passwords::{delete_generic_password, get_generic_password, set_generic_password};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

const KEYCHAIN_SERVICE: &str = "run.mdbar.app.cloud-sync";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteNote {
    path: String,
    revision: u64,
    modified_at: String,
    deleted: bool,
    content: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteChange {
    sequence: u64,
    path: String,
    revision: u64,
    modified_at: String,
    deleted: bool,
    content: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChangesResponse {
    cursor: u64,
    changes: Vec<RemoteChange>,
}

#[derive(Debug, Deserialize)]
struct ErrorResponse {
    error: String,
    current: Option<RemoteNote>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileState {
    revision: u64,
    content_hash: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct SyncState {
    cursor: u64,
    files: HashMap<String, FileState>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    changed_local_files: bool,
    uploaded_files: usize,
    downloaded_files: usize,
    conflicts: usize,
}

struct SyncContext {
    root: PathBuf,
    state_path: PathBuf,
    state: SyncState,
    client: Client,
    base_url: String,
    space_id: String,
    token: String,
    result: SyncResult,
}

#[tauri::command(rename_all = "camelCase")]
pub fn configure_cloud_sync(space_id: String, token: String) -> Result<(), String> {
    validate_space_id(&space_id)?;
    let token = token.trim();
    if token.len() < 32 {
        return Err("The sync token is incomplete.".to_string());
    }
    set_generic_password(KEYCHAIN_SERVICE, space_id.trim(), token.as_bytes())
        .map_err(|error| format!("Couldn't save the sync token in Keychain: {error}"))
}

#[tauri::command(rename_all = "camelCase")]
pub fn disconnect_cloud_sync(space_id: String) -> Result<(), String> {
    validate_space_id(&space_id)?;
    match delete_generic_password(KEYCHAIN_SERVICE, space_id.trim()) {
        Ok(()) => Ok(()),
        Err(error) if error.code() == -25300 => Ok(()),
        Err(error) => Err(format!("Couldn't remove the sync token from Keychain: {error}")),
    }
}

#[tauri::command(rename_all = "camelCase")]
pub async fn sync_cloud_notebook(
    folder_path: String,
    base_url: String,
    space_id: String,
) -> Result<SyncResult, String> {
    validate_space_id(&space_id)?;
    let base_url = validate_base_url(&base_url)?;
    let root = fs::canonicalize(&folder_path)
        .map_err(|error| format!("Couldn't open the notebook for sync: {error}"))?;
    let token = get_generic_password(KEYCHAIN_SERVICE, space_id.trim())
        .map_err(|_| "Cloud sync needs its device token. Reconnect it in Settings.".to_string())?;
    let token = String::from_utf8(token).map_err(|_| "The saved sync token is invalid.".to_string())?;
    let state_path = root.join(".mdbar").join("sync-state-macos.json");
    let state = load_state(&state_path);
    let mut context = SyncContext {
        root,
        state_path,
        state,
        client: Client::new(),
        base_url,
        space_id: space_id.trim().to_string(),
        token,
        result: SyncResult {
            changed_local_files: false,
            uploaded_files: 0,
            downloaded_files: 0,
            conflicts: 0,
        },
    };
    context.synchronize().await?;
    Ok(context.result)
}

impl SyncContext {
    async fn synchronize(&mut self) -> Result<(), String> {
        loop {
            let response = self.fetch_changes().await?;
            let change_count = response.changes.len();
            let mut latest: HashMap<String, RemoteChange> = HashMap::new();
            for change in response.changes {
                let should_replace = latest
                    .get(&change.path)
                    .map(|existing| change.sequence > existing.sequence)
                    .unwrap_or(true);
                if should_replace {
                    latest.insert(change.path.clone(), change);
                }
            }
            let mut changes: Vec<_> = latest.into_values().collect();
            changes.sort_by_key(|change| change.sequence);
            for change in changes {
                self.apply_remote(change)?;
            }
            self.state.cursor = response.cursor;
            self.save_state()?;
            if change_count < 1_000 {
                break;
            }
        }

        let notes = scan_notes(&self.root)?;
        for (path, content) in &notes {
            let hash = content_hash(content);
            if self.state.files.get(path).map(|state| &state.content_hash) != Some(&hash) {
                self.upload(path, content).await?;
            }
        }

        let local_paths: HashSet<_> = notes.into_keys().collect();
        let deleted_paths: Vec<_> = self
            .state
            .files
            .iter()
            .filter(|(path, state)| !state.content_hash.is_empty() && !local_paths.contains(*path))
            .map(|(path, state)| (path.clone(), state.revision))
            .collect();
        for (path, revision) in deleted_paths {
            match self.delete_remote(&path, revision).await {
                Ok(remote) => {
                    self.state.files.insert(
                        path,
                        FileState { revision: remote.revision, content_hash: String::new() },
                    );
                }
                Err(SyncRequestError::Conflict(Some(current))) => {
                    if !current.deleted {
                        let remote = self.delete_remote(&path, current.revision).await.map_err(display_request_error)?;
                        self.state.files.insert(
                            path,
                            FileState { revision: remote.revision, content_hash: String::new() },
                        );
                    }
                }
                Err(error) => return Err(display_request_error(error)),
            }
        }
        self.save_state()
    }

    async fn fetch_changes(&self) -> Result<ChangesResponse, String> {
        let url = format!(
            "{}/v1/spaces/{}/changes?since={}",
            self.base_url, self.space_id, self.state.cursor
        );
        self.client
            .get(url)
            .bearer_auth(&self.token)
            .send()
            .await
            .map_err(network_error)?
            .error_for_status()
            .map_err(network_error)?
            .json()
            .await
            .map_err(network_error)
    }

    fn apply_remote(&mut self, change: RemoteChange) -> Result<(), String> {
        if !valid_note_path(&change.path) {
            return Err("The sync server returned an unsafe note path.".to_string());
        }
        let path = self.root.join(&change.path);
        let local_content = fs::read_to_string(&path).ok();
        let local_hash = local_content.as_deref().map(content_hash);
        let known = self.state.files.get(&change.path);
        let locally_modified = local_hash.is_some() && local_hash.as_ref() != known.map(|state| &state.content_hash);

        if change.deleted {
            if locally_modified {
                self.state.files.insert(
                    change.path,
                    FileState { revision: change.revision, content_hash: String::new() },
                );
                return Ok(());
            }
            if path.exists() {
                fs::remove_file(&path).map_err(|error| format!("Couldn't apply a synced deletion: {error}"))?;
                self.result.changed_local_files = true;
                self.result.downloaded_files += 1;
            }
            self.state.files.insert(
                change.path,
                FileState { revision: change.revision, content_hash: String::new() },
            );
            return Ok(());
        }

        let remote_content = change.content.unwrap_or_default();
        let remote_hash = content_hash(&remote_content);
        if locally_modified && local_hash.as_ref() != Some(&remote_hash) {
            self.write_conflict(&change.path, &remote_content)?;
            self.result.conflicts += 1;
            self.result.changed_local_files = true;
            self.state.files.insert(
                change.path,
                FileState { revision: change.revision, content_hash: remote_hash },
            );
            return Ok(());
        }

        if local_hash.as_ref() != Some(&remote_hash) {
            atomic_write(&path, &remote_content)?;
            self.result.changed_local_files = true;
            self.result.downloaded_files += 1;
        }
        self.state.files.insert(
            change.path,
            FileState { revision: change.revision, content_hash: remote_hash },
        );
        Ok(())
    }

    async fn upload(&mut self, path: &str, content: &str) -> Result<(), String> {
        let base_revision = self.state.files.get(path).map(|state| state.revision).unwrap_or(0);
        let remote = match self.put_remote(path, content, base_revision).await {
            Ok(remote) => remote,
            Err(SyncRequestError::Conflict(Some(current))) => {
                if !current.deleted && current.content.as_deref() != Some(content) {
                    self.write_conflict(path, current.content.as_deref().unwrap_or_default())?;
                    self.result.conflicts += 1;
                    self.result.changed_local_files = true;
                }
                self.put_remote(path, content, current.revision)
                    .await
                    .map_err(display_request_error)?
            }
            Err(error) => return Err(display_request_error(error)),
        };
        self.state.files.insert(
            path.to_string(),
            FileState { revision: remote.revision, content_hash: content_hash(content) },
        );
        self.result.uploaded_files += 1;
        Ok(())
    }

    async fn put_remote(&self, path: &str, content: &str, base_revision: u64) -> Result<RemoteNote, SyncRequestError> {
        let body = serde_json::json!({
            "baseRevision": base_revision,
            "content": content,
            "modifiedAt": Utc::now().to_rfc3339(),
            "idempotencyKey": Uuid::new_v4().to_string(),
        });
        self.send_note_request(reqwest::Method::PUT, path, body).await
    }

    async fn delete_remote(&self, path: &str, base_revision: u64) -> Result<RemoteNote, SyncRequestError> {
        let body = serde_json::json!({
            "baseRevision": base_revision,
            "modifiedAt": Utc::now().to_rfc3339(),
            "idempotencyKey": Uuid::new_v4().to_string(),
        });
        self.send_note_request(reqwest::Method::DELETE, path, body).await
    }

    async fn send_note_request(
        &self,
        method: reqwest::Method,
        path: &str,
        body: serde_json::Value,
    ) -> Result<RemoteNote, SyncRequestError> {
        let url = format!(
            "{}/v1/spaces/{}/notes/{}",
            self.base_url,
            self.space_id,
            urlencoding::encode(path)
        );
        let response = self
            .client
            .request(method, url)
            .bearer_auth(&self.token)
            .json(&body)
            .send()
            .await
            .map_err(|error| SyncRequestError::Other(network_error(error)))?;
        if response.status() == StatusCode::CONFLICT {
            let error = response
                .json::<ErrorResponse>()
                .await
                .map_err(|error| SyncRequestError::Other(network_error(error)))?;
            return Err(SyncRequestError::Conflict(error.current));
        }
        if !response.status().is_success() {
            let status = response.status();
            let message = response
                .json::<ErrorResponse>()
                .await
                .map(|body| body.error)
                .unwrap_or_else(|_| "unknown_error".to_string());
            return Err(SyncRequestError::Other(format!("Sync failed ({status}): {message}")));
        }
        response.json().await.map_err(|error| SyncRequestError::Other(network_error(error)))
    }

    fn write_conflict(&self, original_path: &str, content: &str) -> Result<(), String> {
        let original = Path::new(original_path);
        let stem = original.file_stem().and_then(|value| value.to_str()).unwrap_or("note");
        let name = format!("{stem}.conflict-cloud-{}.md", Utc::now().format("%Y%m%d-%H%M%S"));
        let conflict = self.root.join(original.parent().unwrap_or(Path::new("notes"))).join(name);
        atomic_write(&conflict, content)
    }

    fn save_state(&self) -> Result<(), String> {
        let json = serde_json::to_string_pretty(&self.state)
            .map_err(|error| format!("Couldn't encode sync state: {error}"))?;
        atomic_write(&self.state_path, &json)
    }
}

enum SyncRequestError {
    Conflict(Option<RemoteNote>),
    Other(String),
}

fn display_request_error(error: SyncRequestError) -> String {
    match error {
        SyncRequestError::Conflict(_) => "The note changed on another device during sync.".to_string(),
        SyncRequestError::Other(message) => message,
    }
}

fn network_error(error: reqwest::Error) -> String {
    if error.is_connect() || error.is_timeout() {
        "Cloud sync is offline. Local changes are safe and will retry later.".to_string()
    } else {
        format!("Cloud sync failed: {error}")
    }
}

fn validate_space_id(space_id: &str) -> Result<(), String> {
    let value = space_id.trim();
    if value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        Ok(())
    } else {
        Err("The sync space ID is invalid.".to_string())
    }
}

fn validate_base_url(base_url: &str) -> Result<String, String> {
    let value = base_url.trim().trim_end_matches('/');
    let parsed = reqwest::Url::parse(value).map_err(|_| "The sync server URL is invalid.".to_string())?;
    if parsed.scheme() != "https" && !matches!(parsed.host_str(), Some("127.0.0.1" | "localhost")) {
        return Err("Cloud sync requires HTTPS.".to_string());
    }
    Ok(value.to_string())
}

fn valid_note_path(path: &str) -> bool {
    !path.starts_with('/')
        && !path.split('/').any(|component| component == ".." || component.is_empty())
        && path.ends_with(".md")
        && (path.starts_with("daily/") || path.starts_with("notes/"))
}

fn scan_notes(root: &Path) -> Result<HashMap<String, String>, String> {
    let mut result = HashMap::new();
    for directory in ["daily", "notes"] {
        scan_directory(root, &root.join(directory), &mut result)?;
    }
    Ok(result)
}

fn scan_directory(root: &Path, directory: &Path, result: &mut HashMap<String, String>) -> Result<(), String> {
    if !directory.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(directory).map_err(|error| format!("Couldn't scan notes for sync: {error}"))? {
        let path = entry.map_err(|error| format!("Couldn't scan notes for sync: {error}"))?.path();
        if path.is_dir() {
            scan_directory(root, &path, result)?;
        } else if path.extension().and_then(|value| value.to_str()) == Some("md") {
            let relative = path
                .strip_prefix(root)
                .map_err(|_| "Couldn't resolve a note path for sync.".to_string())?
                .to_string_lossy()
                .replace('\\', "/");
            result.insert(
                relative,
                fs::read_to_string(&path).map_err(|error| format!("Couldn't read a note for sync: {error}"))?,
            );
        }
    }
    Ok(())
}

fn load_state(path: &Path) -> SyncState {
    fs::read_to_string(path)
        .ok()
        .and_then(|json| serde_json::from_str(&json).ok())
        .unwrap_or_default()
}

fn atomic_write(path: &Path, content: &str) -> Result<(), String> {
    let parent = path.parent().ok_or_else(|| "Couldn't resolve the note folder.".to_string())?;
    fs::create_dir_all(parent).map_err(|error| format!("Couldn't prepare a sync folder: {error}"))?;
    let temporary = parent.join(format!(".mdbar-sync-{}.tmp", Uuid::new_v4()));
    fs::write(&temporary, content).map_err(|error| format!("Couldn't stage a synced note: {error}"))?;
    fs::rename(&temporary, path).map_err(|error| {
        let _ = fs::remove_file(&temporary);
        format!("Couldn't save a synced note: {error}")
    })
}

fn content_hash(content: &str) -> String {
    format!("{:x}", Sha256::digest(content.as_bytes()))
}

#[cfg(test)]
mod tests {
    use super::{content_hash, valid_note_path, validate_base_url, validate_space_id};

    #[test]
    fn validates_sync_boundaries() {
        assert!(validate_space_id(&"a".repeat(64)).is_ok());
        assert!(validate_space_id("short").is_err());
        assert!(validate_base_url("https://sync.example.com/").is_ok());
        assert!(validate_base_url("http://sync.example.com").is_err());
        assert!(validate_base_url("http://127.0.0.1:8787").is_ok());
        assert!(valid_note_path("daily/2026-07-11.md"));
        assert!(valid_note_path("notes/projects/roadmap.md"));
        assert!(!valid_note_path("notes/../private.md"));
        assert!(!valid_note_path("assets/image.png"));
    }

    #[test]
    fn hashes_content_stably() {
        assert_eq!(
            content_hash("mdbar"),
            "5e3c708461bf49f6fcebc1c38cb8db08ede61a3180571374472e5c62da47e816"
        );
    }
}
