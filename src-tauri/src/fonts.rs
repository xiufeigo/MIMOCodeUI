//! System font enumeration for the settings "字体" picker.
//!
//! Windows (the primary desktop target) reads the two registry font keys so the
//! picker shows clean family names ("Segoe UI") rather than truncated file
//! names ("segoeui.ttf"). Other platforms fall back to scanning common font
//! directories by file name.

use std::path::Path;

/// Enumerate installed font family names, deduplicated and sorted.
#[tauri::command]
pub fn list_system_fonts() -> Result<Vec<String>, String> {
    #[cfg(windows)]
    {
        return windows_fonts();
    }
    #[cfg(not(windows))]
    {
        return Ok(scan_font_dirs());
    }
}

#[cfg(windows)]
fn windows_fonts() -> Result<Vec<String>, String> {
    use std::collections::BTreeSet;
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    let mut names = BTreeSet::new();

    for hive in [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER] {
        let key = RegKey::predef(hive);
        // 任一 hive 打不开就跳过该 hive，而不是让整个调用失败回退到兜底列表。
        let Ok(fonts) =
            key.open_subkey(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts")
        else {
            continue;
        };

        for value_name in fonts.enum_keys().filter_map(Result::ok) {
            // Registry value names look like "Arial (TrueType)" / "Segoe UI (TrueType)".
            let family = strip_font_suffix(&value_name).trim().to_string();
            if !family.is_empty() {
                names.insert(family);
            }
        }
    }

    if names.is_empty() {
        // 注册表读不到时兜底扫描字体目录，保证仍能返回字体名。
        return Ok(scan_font_dirs());
    }
    Ok(names.into_iter().collect())
}

#[cfg(windows)]
fn strip_font_suffix(name: &str) -> &str {
    for suffix in [" (TrueType)", " (OpenType)", " (All res)", " (All Res)"] {
        if let Some(stripped) = name.strip_suffix(suffix) {
            return stripped;
        }
    }
    name
}

#[cfg(not(windows))]
fn windows_fonts() -> Result<Vec<String>, String> {
    Ok(scan_font_dirs())
}

fn scan_font_dirs() -> Vec<String> {
    use std::collections::BTreeSet;

    let mut dirs: Vec<&str> = vec![];
    #[cfg(target_os = "windows")]
    {
        dirs.push(r"C:\Windows\Fonts");
    }
    #[cfg(target_os = "macos")]
    {
        dirs.extend_from_slice(&[
            "/System/Library/Fonts",
            "/Library/Fonts",
            "~/Library/Fonts",
        ]);
    }
    #[cfg(target_os = "linux")]
    {
        dirs.extend_from_slice(&["/usr/share/fonts", "/usr/local/share/fonts", "~/.fonts", "~/.local/share/fonts"]);
    }

    let mut names = BTreeSet::new();
    for dir in dirs {
        let expanded = expand_home(dir);
        collect_font_files(Path::new(&expanded), &mut names);
    }
    names.into_iter().collect()
}

fn collect_font_files(dir: &Path, names: &mut std::collections::BTreeSet<String>) {
    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };
    for entry in entries.filter_map(Result::ok) {
        let path = entry.path();
        if path.is_dir() {
            collect_font_files(&path, names);
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or_default().to_lowercase();
        if matches!(ext.as_str(), "ttf" | "otf" | "ttc" | "fon") {
            names.insert(stem.to_string());
        }
    }
}

#[cfg(not(windows))]
fn expand_home(path: &str) -> String {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = std::env::var_os("HOME") {
            return format!("{}/{}", home.to_string_lossy(), rest);
        }
    }
    path.to_string()
}

#[cfg(windows)]
fn expand_home(path: &str) -> String {
    path.to_string()
}
