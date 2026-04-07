/// 打开常用语窗口（统一入口：无论热键还是隨一 Tauri 命令，都走 phrases_inline 窗口）。
#[tauri::command]
pub fn open_phrases_window() {
    crate::phrase_inline::open_from_hotkey();
}
