mod directories;
mod fonts;
mod fs;
mod serve;

use serve::{LocalServeSpec, ServeHandle, ServeManager, ServeStatus};
use tauri::{AppHandle, State};

#[tauri::command]
fn start_local_serve(app: AppHandle, manager: State<'_, ServeManager>, spec: Option<LocalServeSpec>) -> Result<ServeHandle, String> {
    let spec = spec.unwrap_or_default();
    // The bundled resource binary is a mimo build; the opencode kind always
    // resolves from PATH (or WSL).
    let binary = if spec.kind.as_deref() == Some("opencode") {
        None
    } else {
        manager.resolve_binary(&app)
    };
    manager.start(spec, binary)
}

#[tauri::command]
fn stop_local_serve(manager: State<'_, ServeManager>) -> Result<(), String> {
    manager.stop();
    Ok(())
}

#[tauri::command]
fn local_serve_status(manager: State<'_, ServeManager>) -> Result<ServeStatus, String> {
    Ok(manager.status())
}

/// 在系统资源管理器中打开指定目录（Windows 下调用 explorer）。
#[tauri::command]
fn open_in_explorer(dir: String) -> Result<(), String> {
    let path = std::path::Path::new(&dir);
    if !path.is_dir() {
        return Err(format!("目录不存在: {dir}"));
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("打开资源管理器失败: {e}"))?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = path; // 非 Windows 暂不实现
        return Err("仅支持 Windows".into());
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(ServeManager::default())
        .manage(directories::DirectoryAccess::default())
        .invoke_handler(tauri::generate_handler![
            start_local_serve,
            stop_local_serve,
            local_serve_status,
            open_in_explorer,
            fs::fs_create_file,
            fs::fs_create_dir,
            fs::fs_read_file_base64,
            fonts::list_system_fonts,
            directories::authorize_local_directory,
            directories::list_local_directories,
            directories::complete_local_directories,
            directories::validate_local_directory
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
