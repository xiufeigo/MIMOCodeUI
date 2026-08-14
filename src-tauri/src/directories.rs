//! Narrow local-directory access for the new-task picker.
//!
//! A directory must first be selected with the native dialog. That selected
//! directory becomes an in-memory authorization root; all later list, complete,
//! and validation calls must resolve beneath one of those roots.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::State;

#[derive(Default)]
pub struct DirectoryAccess {
    roots: Mutex<Vec<PathBuf>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDirectoryEntry {
    pub name: String,
    pub path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDirectoryListing {
    pub path: String,
    pub parent: Option<String>,
    pub directories: Vec<LocalDirectoryEntry>,
}

fn display_path(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn canonical_directory(path: &str) -> Result<PathBuf, String> {
    let resolved = fs::canonicalize(path).map_err(|error| format!("无法访问目录：{error}"))?;
    if !resolved.is_dir() {
        return Err("请选择文件夹，而不是文件".into());
    }
    Ok(resolved)
}

fn is_authorized(access: &DirectoryAccess, path: &Path) -> Result<bool, String> {
    let roots = access.roots.lock().map_err(|_| "目录访问状态不可用".to_string())?;
    Ok(roots.iter().any(|root| path.starts_with(root)))
}

fn authorized_directory(access: &DirectoryAccess, path: &str) -> Result<PathBuf, String> {
    let resolved = canonical_directory(path)?;
    if !is_authorized(access, &resolved)? {
        return Err("请选择已授权的文件夹，或通过“浏览…”授予新的目录访问权限".into());
    }
    Ok(resolved)
}

fn list_directories(access: &DirectoryAccess, path: &Path) -> Result<LocalDirectoryListing, String> {
    let mut directories = fs::read_dir(path)
        .map_err(|error| format!("无法读取目录：{error}"))?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let candidate = fs::canonicalize(entry.path()).ok()?;
            let metadata = candidate.metadata().ok()?;
            if !metadata.is_dir() || !is_authorized(access, &candidate).ok()? {
                return None;
            }
            Some(LocalDirectoryEntry {
                name: entry.file_name().to_string_lossy().to_string(),
                path: display_path(&candidate),
            })
        })
        .collect::<Vec<_>>();
    directories.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));

    let parent = path.parent().filter(|parent| is_authorized(access, parent).unwrap_or(false));
    Ok(LocalDirectoryListing {
        path: display_path(path),
        parent: parent.map(display_path),
        directories,
    })
}

#[tauri::command]
pub fn authorize_local_directory(
    path: String,
    access: State<'_, DirectoryAccess>,
) -> Result<LocalDirectoryListing, String> {
    let root = canonical_directory(&path)?;
    let mut roots = access.roots.lock().map_err(|_| "目录访问状态不可用".to_string())?;
    if !roots.iter().any(|candidate| candidate == &root) {
        roots.push(root.clone());
    }
    drop(roots);
    list_directories(&access, &root)
}

#[tauri::command]
pub fn list_local_directories(
    path: String,
    access: State<'_, DirectoryAccess>,
) -> Result<LocalDirectoryListing, String> {
    let directory = authorized_directory(&access, &path)?;
    list_directories(&access, &directory)
}

/// 路径补全：只列举目录名（不读取文件内容），因此不要求授权根——
/// 输入 `C:\` 列出该盘全部目录，输入 `C:\sensor` 列出 sensor 前缀目录。
/// 真正使用目录时（list/validate）仍走授权校验。
#[tauri::command]
pub fn complete_local_directories(path: String) -> Result<Vec<LocalDirectoryEntry>, String> {
    let raw = PathBuf::from(&path);
    let (base, prefix) = if raw.is_dir() {
        (raw, String::new())
    } else {
        let parent = raw
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
            .map(|parent| parent.to_path_buf())
            .unwrap_or_else(|| PathBuf::from("."));
        let prefix = raw
            .file_name()
            .map(|part| part.to_string_lossy().to_string())
            .unwrap_or_default();
        (parent, prefix)
    };
    let base = canonical_directory(&display_path(&base))?;
    let needle = prefix.to_lowercase();
    let mut matches = fs::read_dir(&base)
        .map_err(|error| format!("无法读取目录：{error}"))?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let candidate = fs::canonicalize(entry.path()).ok()?;
            let name = entry.file_name().to_string_lossy().to_string();
            let metadata = candidate.metadata().ok()?;
            if !metadata.is_dir() || !name.to_lowercase().starts_with(&needle) {
                return None;
            }
            Some(LocalDirectoryEntry { name, path: display_path(&candidate) })
        })
        .collect::<Vec<_>>();
    matches.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
    matches.truncate(24);
    Ok(matches)
}

#[tauri::command]
pub fn validate_local_directory(path: String, access: State<'_, DirectoryAccess>) -> Result<String, String> {
    Ok(display_path(&authorized_directory(&access, &path)?))
}
