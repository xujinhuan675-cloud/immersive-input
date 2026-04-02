use crate::window::{phrases_window, save_foreground_window};

/// 打开常用语窗口。
/// 打开前保存当前前台窗口句柄，发送时 paste_result 会自动恢复焦点。
#[tauri::command]
pub fn open_phrases_window() {
    save_foreground_window();
    phrases_window();
}
