use crate::window::{save_foreground_window, vault_window};
use crate::APP;
use std::sync::Mutex;
use tauri::Manager;

/// 用于在 Rust 与 React 之间传递待触发模式（quick_add / quick_fill）
pub struct VaultModeWrapper(pub Mutex<String>);

/// 快速录入：存储模式并打开密码本窗口
pub fn vault_quick_add_window() {
    let app = APP.get().unwrap();
    // 存储模式（给新窗口在 mount 时读取）
    {
        let state: tauri::State<VaultModeWrapper> = app.state();
        *state.0.lock().unwrap() = "quick_add".to_string();
    }
    vault_window();
    // 已开窗口可直接通过事件接收模式
    if let Some(w) = app.get_window("vault") {
        w.emit("vault_mode", "quick_add").unwrap_or_default();
    }
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
