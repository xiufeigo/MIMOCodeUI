//! Local filesystem commands. The MiMo serve exposes no HTTP write endpoints
//! for files; because the desktop app runs on the same machine as the local
//! sidecar, file/folder creation is done directly via std::fs. These are only
//! wired up for the Tauri (local) backend — the external-server backend leaves
//! the buttons disabled.

use std::fs;
use std::io::Read;
use std::path::Path;

#[tauri::command]
pub fn fs_create_file(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.exists() {
        return Err(format!("已存在：{}", path));
    }
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建父目录失败：{e}"))?;
    }
    fs::File::create(p).map_err(|e| format!("创建文件失败：{e}"))?;
    Ok(())
}

#[tauri::command]
pub fn fs_create_dir(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.exists() {
        return Err(format!("已存在：{}", path));
    }
    fs::create_dir_all(p).map_err(|e| format!("创建文件夹失败：{e}"))?;
    Ok(())
}

/// 读取本地文件内容并返回 base64（用于图片附件以 data URL 进入 prompt）。
#[tauri::command]
pub fn fs_read_file_base64(path: String) -> Result<String, String> {
    let mut file = fs::File::open(Path::new(&path)).map_err(|e| format!("读取文件失败：{e}"))?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf).map_err(|e| format!("读取文件失败：{e}"))?;
    Ok(base64_encode(&buf))
}

/// 极简标准 base64 编码，避免为单个命令引入额外依赖。
fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = chunk.get(1).copied().unwrap_or(0) as u32;
        let b2 = chunk.get(2).copied().unwrap_or(0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[(n >> 18) as usize & 63] as char);
        out.push(TABLE[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { TABLE[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { TABLE[n as usize & 63] as char } else { '=' });
    }
    out
}
