use crate::config::get;
use crate::window::{light_ai_window, text_translate};
use crate::StringWrapper;
use std::sync::Mutex;
use tauri::{ClipboardManager, Manager};

pub struct ClipboardMonitorEnableWrapper(pub Mutex<String>);

pub fn start_clipboard_monitor(app_handle: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut pre_text = "".to_string();
        loop {
            let handle = app_handle.app_handle();
            let state = handle.state::<ClipboardMonitorEnableWrapper>();
            if let Ok(clipboard_monitor) = state.0.try_lock() {
                if clipboard_monitor.contains("true") {
                    if let Ok(result) = app_handle.clipboard_manager().read_text() {
                        match result {
                            Some(v) => {
                                if v != pre_text {
                                    // Check if # trigger is enabled and text ends with #
                                    let hash_trigger = match get("light_ai_hash_trigger") {
                                        Some(val) => val.as_bool().unwrap_or(false),
                                        None => false,
                                    };
                                    if hash_trigger && v.trim_end().ends_with('#') {
                                        // Strip trailing #, store text, open LightAI window
                                        let clean = v.trim_end().trim_end_matches('#').trim().to_string();
                                        if !clean.is_empty() {
                                            let str_state: tauri::State<StringWrapper> = handle.state();
                                            str_state.0.lock().unwrap().replace_range(.., &clean);
                                            light_ai_window();
                                        }
                                    } else {
                                        text_translate(v.clone());
                                    }
                                    pre_text = v;
                                }
                            }
                            None => {}
                        }
                    }
                } else {
                    break;
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
    });
}
