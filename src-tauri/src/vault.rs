use crate::window::{save_foreground_window, vault_window};
use crate::APP;
use log::info;
use once_cell::sync::Lazy;
use std::sync::Mutex;
use tauri::api::notification::Notification;
use tauri::Manager;

/// 用于在 Rust 与 React 之间传递待触发模式（quick_fill）
pub struct VaultModeWrapper(pub Mutex<String>);

/// 两步划词捕获状态：(step, captured_account)
/// step 0 = 空闲, 1 = 等待账号, 2 = 等待密码
static QUICK_ADD_CAPTURE: Lazy<Mutex<(u8, String)>> = Lazy::new(|| Mutex::new((0, String::new())));

/// 快速录入：进入两步划词捕获模式，不立即打开密码本窗口。
/// 第一次划词 → 账号；第二次划词 → 密码 → 自动弹出预填窗口。
pub fn vault_quick_add_window() {
    {
        let mut cap = QUICK_ADD_CAPTURE.lock().unwrap_or_else(|e| e.into_inner());
        cap.0 = 1;
        cap.1 = String::new();
    }
    if let Some(app) = APP.get() {
        let _ = Notification::new(&app.config().tauri.bundle.identifier)
            .title("密码本快速新增")
            .body("请划词选择「账号」")
            .icon("immersive-input")
            .show();
    }
    info!("Vault quick add: capture mode started (step 1 – waiting for account)");
}

/// 由 mouse_hook 在每次划词获得文字后调用。
/// 若当前处于捕获模式则消费此次选中文字，返回 true（调用方应跳过正常工具栏逻辑）。
pub fn handle_quick_add_capture(text: &str) -> bool {
    if text.is_empty() {
        return false;
    }
    let mut cap = QUICK_ADD_CAPTURE.lock().unwrap_or_else(|e| e.into_inner());
    match cap.0 {
        1 => {
            cap.1 = text.to_string();
            cap.0 = 2;
            drop(cap);
            if let Some(app) = APP.get() {
                let _ = Notification::new(&app.config().tauri.bundle.identifier)
                    .title("账号已记录")
                    .body("请划词选择「密码」")
                    .icon("immersive-input")
                    .show();
            }
            info!("Vault quick add: account captured, waiting for password");
            true
        }
        2 => {
            let account = cap.1.clone();
            let password = text.to_string();
            cap.0 = 0;
            cap.1 = String::new();
            drop(cap);
            info!("Vault quick add: password captured, opening vault window");
            open_vault_with_prefilled(account, password);
            true
        }
        _ => false,
    }
}

/// 打开密码本窗口并在 React 挂载后发送预填数据事件。
fn open_vault_with_prefilled(account: String, password: String) {
    vault_window();
    std::thread::spawn(move || {
        // 给 React 组件留出挂载时间，再发事件
        std::thread::sleep(std::time::Duration::from_millis(200));
        if let Some(app) = APP.get() {
            if let Some(w) = app.get_window("vault") {
                let _ = w.emit(
                    "vault_quick_add_prefilled",
                    serde_json::json!({ "account": account, "password": password }),
                );
            }
        }
    });
}

/// 快速填写：先保存目标应用窗口句柄，再开密码本
pub fn vault_quick_fill_window() {
    // 必须在密码本窗口弹出前保存当前前台窗口（用户的目标输入框所在的窗口）
    save_foreground_window();
    let app = APP.get().unwrap();
    {
        let state: tauri::State<VaultModeWrapper> = app.state();
        *state.0.lock().unwrap() = "quick_fill".to_string();
    }
    vault_window();
    if let Some(w) = app.get_window("vault") {
        w.emit("vault_mode", "quick_fill").unwrap_or_default();
    }
}

// ─── Tauri 命令 ───

#[tauri::command]
pub fn open_vault_window() {
    // Save the foreground window so “一键填写” can restore focus correctly
    save_foreground_window();
    vault_window();
}

#[tauri::command]
pub fn open_vault_quick_add() {
    vault_quick_add_window();
}

#[tauri::command]
pub fn open_vault_quick_fill() {
    vault_quick_fill_window();
}

/// React 组件挂载时读取待触发模式，读后自动清空
#[tauri::command]
pub fn get_vault_mode(state: tauri::State<VaultModeWrapper>) -> String {
    let mut mode = state.0.lock().unwrap();
    let val = mode.clone();
    *mode = String::new();
    val
}

/// 保存当前前台窗口句柄（为兼容保留）
#[tauri::command]
pub fn save_prev_window() {
    save_foreground_window();
}
