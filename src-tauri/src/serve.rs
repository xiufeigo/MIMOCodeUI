// Local `mimo serve` / `opencode serve` lifecycle manager.
//
// Starts `<binary> serve --port 0` as a child process with a fresh random
// password (MIMOCODE_SERVER_PASSWORD for mimo, OPENCODE_SERVER_PASSWORD for
// opencode — never persisted), parses the "listening on" line from stdout to
// discover the bound URL, and keeps the handle for stop/status queries.
// Port 0 lets the OS pick a free port, so concurrent instances never collide.
//
// Optional WSL mode: `wsl.exe -d <distro> <binary> serve --port 0`. The
// listening line still arrives on the wsl.exe stdout, and WSL2 forwards
// 127.0.0.1:PORT to the Windows host.
//
// Android: local serve is unavailable (no desktop binary), so the manager is
// a stub that always reports an error / not running.

#[cfg(not(target_os = "android"))]
use std::io::{BufRead, BufReader};
#[cfg(not(target_os = "android"))]
use std::process::{Child, Command, Stdio};
#[cfg(not(target_os = "android"))]
use std::sync::mpsc;
use std::sync::Mutex;
#[cfg(not(target_os = "android"))]
use std::time::Duration;

use serde::{Deserialize, Serialize};
#[cfg(not(target_os = "android"))]
use rand::Rng;
#[cfg(not(target_os = "android"))]
use tauri::Manager;

/// 安卓版不提供本地 serve 的提示文案。
#[cfg(target_os = "android")]
const ANDROID_UNSUPPORTED: &str = "安卓版不支持本地服务器，请在设置中添加云端服务器地址。";

/// Local serve launch spec sent from the frontend settings UI.
#[derive(Deserialize, Clone, Default)]
pub struct LocalServeSpec {
    /// "mimo" (default) or "opencode".
    pub kind: Option<String>,
    /// WSL distro name; when non-empty the serve is launched inside WSL.
    #[cfg_attr(target_os = "android", allow(dead_code))]
    pub wsl: Option<String>,
}

pub struct ServeManager(Mutex<Option<RunningServe>>);

#[cfg(not(target_os = "android"))]
pub struct RunningServe {
    child: Child,
    url: String,
    kind: String,
    #[allow(dead_code)] // kept for future status/debug output
    password: String,
}

#[cfg(target_os = "android")]
#[allow(dead_code)]
pub struct RunningServe;

#[derive(Serialize, Clone)]
pub struct ServeHandle {
    pub url: String,
    pub port: u16,
    pub pid: Option<u32>,
    pub password: String,
    pub username: String,
    pub kind: String,
}

#[derive(Serialize)]
pub struct ServeStatus {
    pub running: bool,
    pub url: Option<String>,
    pub kind: Option<String>,
}

#[cfg(not(target_os = "android"))]
pub const DEFAULT_MIMO_USERNAME: &str = "mimocode";
#[cfg(not(target_os = "android"))]
const START_TIMEOUT: Duration = Duration::from_secs(20);

#[cfg(not(target_os = "android"))]
struct ServeKind {
    binary: &'static str,
    env_var: &'static str,
    username: &'static str,
    label: &'static str,
}

#[cfg(not(target_os = "android"))]
fn serve_kind(spec: &LocalServeSpec) -> ServeKind {
    match spec.kind.as_deref() {
        Some("opencode") => ServeKind {
            binary: "opencode",
            env_var: "OPENCODE_SERVER_PASSWORD",
            username: "opencode",
            label: "opencode serve",
        },
        _ => ServeKind {
            binary: "mimo",
            env_var: "MIMOCODE_SERVER_PASSWORD",
            username: DEFAULT_MIMO_USERNAME,
            label: "mimo serve",
        },
    }
}

impl Default for ServeManager {
    fn default() -> Self {
        Self(Mutex::new(None))
    }
}

impl Drop for ServeManager {
    fn drop(&mut self) {
        self.stop();
    }
}

impl ServeManager {
    /// `binary`: absolute path to a bundled mimo executable (only used for the
    /// mimo kind), or None to resolve the command from PATH / WSL.
    pub fn start(&self, spec: LocalServeSpec, binary: Option<String>) -> Result<ServeHandle, String> {
        #[cfg(target_os = "android")]
        {
            // 安卓版不携带本地 serve：移动端无法运行桌面二进制，
            // 统一通过「连接设置」对接远端 mimo serve。
            let _ = (spec, binary);
            return Err(ANDROID_UNSUPPORTED.into());
        }
        #[cfg(not(target_os = "android"))]
        {
            self.start_impl(spec, binary)
        }
    }

    #[cfg(not(target_os = "android"))]
    fn start_impl(&self, spec: LocalServeSpec, binary: Option<String>) -> Result<ServeHandle, String> {
        self.stop();

        let password = random_password();
        let kind = serve_kind(&spec);
        let wsl = spec.wsl.as_deref().map(str::trim).filter(|d| !d.is_empty());

        let mut child = serve_command(&kind, wsl, binary)
            .env(kind.env_var, &password)
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| {
                format!(
                    "无法启动 {label}：{e}。请确认已安装 {label}（mimo: npm install -g @mimo-ai/cli；opencode: npm install -g opencode-ai）",
                    label = kind.label
                )
            })?;

        // Drain stdout on a background thread; the listening line carries the URL.
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| format!("无法读取 {} 输出", kind.label))?;
        let (tx, rx) = mpsc::channel::<String>();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                if line.contains("listening on") {
                    let _ = tx.send(line);
                }
            }
        });

        let url = match rx.recv_timeout(START_TIMEOUT) {
            Ok(line) => extract_url(&line).ok_or_else(|| format!("无法解析 serve 地址：{line}"))?,
            Err(_) => {
                let _ = child.kill();
                return Err(format!(
                    "{} 启动超时（20s）。请检查 {} 是否正确安装{}。",
                    kind.label,
                    kind.binary,
                    wsl.map(|d| format!("（WSL 发行版 {d}）")).unwrap_or_default()
                ));
            }
        };

        let port = parse_port(&url).unwrap_or(0);
        let pid = child.id();
        let handle = ServeHandle {
            url: url.clone(),
            port,
            pid: Some(pid),
            password: password.clone(),
            username: kind.username.to_string(),
            kind: kind.binary.to_string(),
        };

        let mut guard = self.0.lock().unwrap();
        *guard = Some(RunningServe {
            child,
            url,
            kind: kind.binary.to_string(),
            password,
        });

        Ok(handle)
    }

    pub fn stop(&self) {
        #[cfg(not(target_os = "android"))]
        if let Some(mut r) = self.0.lock().unwrap().take() {
            let _ = r.child.kill();
        }
        #[cfg(target_os = "android")]
        {
            let _ = self.0.lock().unwrap().take();
        }
    }

    pub fn status(&self) -> ServeStatus {
        let guard = self.0.lock().unwrap();
        match guard.as_ref() {
            #[cfg(not(target_os = "android"))]
            Some(r) => ServeStatus {
                running: true,
                url: Some(r.url.clone()),
                kind: Some(r.kind.clone()),
            },
            #[cfg(target_os = "android")]
            Some(_) => ServeStatus {
                running: true,
                url: None,
                kind: None,
            },
            None => ServeStatus {
                running: false,
                url: None,
                kind: None,
            },
        }
    }

    /// Prefer the bundled resource binary (mimo.exe), falling back to the
    /// system PATH `mimo` (which covers npm-global installs and `mimo serve`).
    #[cfg(not(target_os = "android"))]
    pub fn resolve_binary(&self, app: &tauri::AppHandle) -> Option<String> {
        let bundled = app
            .path()
            .resource_dir()
            .ok()?
            .join("mimo.exe");
        if bundled.exists() {
            return Some(bundled.to_string_lossy().into_owned());
        }
        // Fall back to PATH resolution.
        None
    }

    /// Android 版没有资源目录中的桌面二进制，直接返回 None。
    #[cfg(target_os = "android")]
    pub fn resolve_binary(&self, _app: &tauri::AppHandle) -> Option<String> {
        None
    }
}

#[cfg(not(target_os = "android"))]
fn random_password() -> String {
    rand::thread_rng()
        .sample_iter(&rand::distributions::Alphanumeric)
        .take(24)
        .map(char::from)
        .collect()
}

/// Build the command that launches `<binary> serve --port 0`.
///
/// `kind`: mimo or opencode (binary, env var and username).
/// `wsl`: WSL distro name — when set, route through `wsl.exe -d <distro>`.
/// `bundled`: absolute path to a bundled mimo executable (mimo kind only),
/// or None to resolve the binary name from PATH.
///
/// On Windows the npm global shim is a `<binary>.cmd` wrapper, which
/// CreateProcess cannot execute directly; route through cmd.exe. All
/// arguments are fixed literals, so there is no injection surface.
///
/// Windows: CREATE_NO_WINDOW (0x08000000) is set on the child so no cmd /
/// powershell console window pops up when launching serve.
#[cfg(not(target_os = "android"))]
fn serve_command(kind: &ServeKind, wsl: Option<&str>, bundled: Option<String>) -> Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let mut cmd = match wsl {
            Some(distro) => {
                let mut c = Command::new("wsl.exe");
                c.args(["-d", distro, kind.binary, "serve", "--port", "0"]);
                c
            }
            None => {
                let exe = bundled.unwrap_or_else(|| kind.binary.to_string());
                let mut c = Command::new("cmd");
                c.args(["/C", &exe, "serve", "--port", "0"]);
                c
            }
        };
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd
    }
    #[cfg(not(windows))]
    {
        match wsl {
            Some(distro) => {
                let mut c = Command::new("wsl");
                c.args(["-d", distro, kind.binary, "serve", "--port", "0"]);
                c
            }
            None => {
                let mut c = Command::new(kind.binary);
                c.args(["serve", "--port", "0"]);
                c
            }
        }
    }
}

/// Extract the http(s):// URL from the listening line, e.g.
/// "mimocode server listening on http://127.0.0.1:PORT" or
/// "opencode server listening on http://127.0.0.1:PORT".
#[cfg(not(target_os = "android"))]
fn extract_url(line: &str) -> Option<String> {
    let start = line.find("http://").or_else(|| line.find("https://"))?;
    let rest = line[start..].trim();
    let end = rest
        .find(char::is_whitespace)
        .unwrap_or(rest.len());
    Some(rest[..end].to_string())
}

#[cfg(not(target_os = "android"))]
fn parse_port(url: &str) -> Option<u16> {
    let rest = url.rsplit(':').next()?;
    rest.parse::<u16>().ok()
}
